# Phase 1 — Budget Ledger: Gross-Certified Basis + Derived Counters

Two migrations, applied **in order**:

| # | File | Contents |
|---|---|---|
| 1 | `migrations/20260805100000_budget_ledger_txn_types.sql` | Four new `erp_budget_txn_type` labels |
| 2 | `migrations/20260805100100_budget_ledger_gross_basis_and_derived_counters.sql` | Everything else |

They **must** be separate files and applied in this order: PostgreSQL will not let a
new enum label be used inside the transaction that adds it. This matches the existing
precedent in `20260731090000_procurement_status_enums.sql`.

Both are idempotent and non-destructive — safe to re-run.

---

## 1. What changes

### 1.1 Budget "Spent" becomes gross certified value

`fn_auto_post_bill_to_budget` posted `net_payable_amount` — the bill total after
retention, advance recovery and other deductions. Retention is a withholding of
**payment**, not a reduction of **cost**. Posting net understated cost-to-date by the
retention percentage (5% default in `budget_config`, 10% on several Work Order
templates) on every project, permanently.

The module already contradicted itself here, which is what makes this a defect rather
than a policy choice:

| Consumer | Old basis |
|---|---|
| `budget_allocations.spent_amount` | net_payable |
| `budget_variance_items.actual_*` | gross line totals |

Two different "actuals" for the same bill, in the same module. Both are now gross.

Retention posts its own `retention_held` row, so the withheld balance is a tracked
liability that can go **down** as well as up — the old `retention_held` counter could
only ever grow, because nothing released it.

### 1.2 Allocation counters are now derived, not accumulated

`committed_amount` / `spent_amount` / `retention_held` / `advance_amount` were
incremented in place by the posting triggers **and** separately rebuilt by a backfill
query — two sources of truth that had already drifted once. They are now recomputed
from `budget_ledger` on every ledger write.

This also removes a latent double-count: the old PO trigger guarded its increment with
`IF FOUND` after `INSERT ... ON CONFLICT DO NOTHING`, and `FOUND` is not a reliable
signal that the insert actually happened.

### 1.3 Signed amounts + reversal linkage

`CHECK (amount >= 0)` made credit notes, debit notes, retention release and
mis-posting corrections unrepresentable — a correction had to be an `UPDATE` of posted
history. Amounts are now signed, and a correction is a reversal row pointing at what it
reverses. History stays append-only.

### 1.4 `revision_seq` — one column, two structural fixes

`uq_budget_ledger_source_txn` allowed exactly one row per
`(source_table, source_id, transaction_type)`. That blocked **both** reverse-and-repost
*and* a Work Order variation posting a second commitment. Adding `revision_seq` to the
key solves both — the second is what Phase 2 needs.

### 1.5 Post-approval edits now re-post

Editing retention/advance/deductions on an approved bill recomputed
`net_payable_amount`, but the posting trigger fired only on `UPDATE OF status` and was
`ON CONFLICT DO NOTHING`. `budget_ledger` silently diverged from the bill it claimed to
represent, with no reconciliation path. Amount edits on a posted bill now reverse and
re-post.

### 1.6 Cash-flow view reports cost, on economic time

`budget_monthly_cashflow_view` read `transaction_type = 'actual'` — which was
`net_payable`: neither cost (gross) nor cash (`payments`). Now that `actual` is gross,
it is a true cost curve, and it groups on `document_date` (when the cost was incurred)
falling back to `posted_at`, so a correction lands in the month it belongs to.

---

## 2. This is NOT a restatement

Verified against production (`uanazwednpluwllhfzlh`) immediately before writing:

```
budget_ledger      0 rows      work_orders     0 rows
vendor_bills       1 row       payments        0 rows
vendor_bill_lines  0 rows      budget_alerts   0 rows
```

Zero allocations carry any `committed_amount` or `spent_amount` movement. The single
`vendor_bills` row is `status='draft'` with no PO, no allocation and no master budget
item — a test row that has never posted.

**The posting engine has never run in production.** So this is a change of basis going
forward, not a restatement of history: no reversal rows to write, no before/after delta
report, no alert storm, no finance sign-off.

The reversal machinery is still built, because it is required for future corrections
and it is what makes §1.4 and §1.5 possible.

§8 of the migration rebuilds every allocation counter from the ledger anyway. That is a
no-op on this dataset, and it is what makes the migration safe to apply to an
environment that *does* have rows.

---

## 3. Applying

### Option A — Supabase CLI (preferred)

```bash
supabase link --project-ref uanazwednpluwllhfzlh
supabase db push
```

### Option B — Dashboard SQL editor

Run the two files **in filename order**, as two separate executions. Do not paste them
into one editor tab — the enum labels must be committed before the second file
references them.

---

## 4. Verification

§10 of the second migration self-verifies and raises an exception if anything is
missing, so a clean apply is already meaningful. To confirm independently, paste this
into the SQL editor:

```sql
-- 4a. New transaction types present
SELECT e.enumlabel
FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'erp_budget_txn_type'
ORDER BY e.enumsortorder;
-- expect: allocation, commitment, release, actual, adjustment,
--         retention_held, retention_released, advance_paid, advance_recovered

-- 4b. Non-negative amount constraint is gone
SELECT c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'budget_ledger' AND c.contype = 'c';
-- expect: no row whose definition mentions amount >= 0

-- 4c. Uniqueness key includes revision_seq
SELECT indexdef FROM pg_indexes
WHERE indexname = 'uq_budget_ledger_source_txn';
-- expect: ... (source_table, source_id, transaction_type, revision_seq) ...

-- 4d. Triggers in place
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_ledger_recompute_allocation',
                 'trg_bill_budget_repost',
                 'trg_bill_budget_actual',
                 'trg_po_budget_commitment');
-- expect: 4 rows

-- 4e. Counters agree with the ledger (must return zero rows)
SELECT ba.id, ba.allocation_name, ba.spent_amount, led.actual
FROM budget_allocations ba
LEFT JOIN (
  SELECT budget_allocation_id,
         COALESCE(SUM(amount) FILTER (WHERE transaction_type='actual'), 0) AS actual
  FROM budget_ledger GROUP BY budget_allocation_id
) led ON led.budget_allocation_id = ba.id
WHERE ba.deleted_at IS NULL
  AND ba.spent_amount IS DISTINCT FROM GREATEST(0, COALESCE(led.actual, 0));
```

### Live smoke test

The cheapest end-to-end proof, using the existing junk bill:

```sql
-- Point the test bill at a real allocation, then certify it.
UPDATE vendor_bills
SET budget_allocation_id = (SELECT id FROM budget_allocations LIMIT 1),
    status = 'approved'
WHERE bill_number = 'INV-BHAGAVAT-8901';

SELECT transaction_type, amount, gross_amount, retention_amount, revision_seq
FROM budget_ledger WHERE source_table = 'vendor_bills';
-- expect TWO rows:
--   actual         amount = 475540.00  (GROSS — not the old 275390.00 net)
--   retention_held amount = 200150.00

-- Now prove the re-post path (§1.5): amend retention on the certified bill.
UPDATE vendor_bills SET retention_amount = 100000
WHERE bill_number = 'INV-BHAGAVAT-8901';

SELECT transaction_type, amount, revision_seq, reverses_ledger_id IS NOT NULL AS is_reversal
FROM budget_ledger WHERE source_table = 'vendor_bills'
ORDER BY transaction_type, revision_seq;
-- expect the original rows, their negative mirrors, and fresh rows at a higher
-- revision_seq. spent_amount stays 475540.00 because retention no longer
-- touches cost; retention_held moves 200150 -> 100000.
```

Roll the smoke test back with:

```sql
UPDATE vendor_bills SET status = 'draft', budget_allocation_id = NULL,
       retention_amount = 200150 WHERE bill_number = 'INV-BHAGAVAT-8901';
DELETE FROM budget_ledger WHERE source_table = 'vendor_bills';
-- the ledger trigger rebuilds the allocation counters back to zero
```

---

## 5. Frontend impact

**None required to apply.** No TypeScript changes ship with Phase 1.

Two things will start reading differently once bills are certified:

- Overview KPIs and `portfolio_budget_summary.spent_amount` rise by the retention
  percentage versus the old basis. This is the intended correction.
- `budget_monthly_cashflow_view` gains a `retention_movement` column.
  `fetchMonthlyCashflow` maps named fields and ignores extras, so it is additive and
  safe.

`BudgetTotals.spent` in `budget-data-context.tsx` is documented as "Verified vendor
bills" — still accurate, but the basis is now gross. Worth a comment update when Phase 4
touches that file.

---

## 6. Known gaps deliberately left for later phases

| Gap | Phase |
|---|---|
| Work Orders post no commitment | 2 |
| `service_bills` table does not exist in production | 3 |
| Service bills invisible to ledger / variance / payments | 3–4 |
| No retention **release** document (the txn type now exists, nothing emits it) | 4 |
| No advance **payment** document (ditto) | later |
| `budget_categories` has no `parent_id` (sub-categories) | 8 |
