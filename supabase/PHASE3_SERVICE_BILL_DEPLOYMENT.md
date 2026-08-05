# Phase 3 — Service Bill Structural Parity + Budget Posting

`migrations/20260805100300_service_bill_budget_integration.sql`

Closes the loop: a contractor RA bill now becomes project cost, holds retention as a
liability, releases the Work Order's commitment, feeds the variance sheet, and can be
paid.

Idempotent and non-destructive — safe to re-run.

---

## 1. Apply order

`supabase db push` handles this. Full chain:

| # | Migration | Phase |
|---|---|---|
| 1 | `20260801000000_service_bills_schema` | pre-existing, was unapplied |
| 2 | `20260803000000_work_order_module_enhancement` | pre-existing, was unapplied |
| 3 | `20260805100000_budget_ledger_txn_types` | 1 |
| 4 | `20260805100100_budget_ledger_gross_basis_and_derived_counters` | 1 |
| 5 | `20260805100200_work_order_budget_integration` | 2 |
| 6 | `20260805100300_service_bill_budget_integration` | **3 — this file** |

§0 asserts its prerequisites and aborts naming the missing migration rather than
half-applying.

---

## 2. What changes

### 2.1 Structural parity with `vendor_bills`

`service_bills` was a header-only table. It now carries what the material bill desk
always had:

```
budget_allocation_id · master_budget_item_id
retention_percent · retention_amount · advance_adjusted · other_deductions
net_payable_amount · ledger_remarks
verified_by/at · approved_by/at · rejected_by/at · rejection_reason
created_by · updated_by · deleted_at
supplier_bill_no · supplier_bill_date
```

Plus `service_bill_lines`, symmetric with `vendor_bill_lines`, so Phase 4's UNION ledger
emits line-level rows on both branches.

`status` and `payment_status` were free text with no constraint — a typo created a
status no query would ever match again. Both now have CHECK constraints, and there is a
unique index on `(vendor_id, bill_number)`.

### 2.2 RA (Running Account) billing

Every one of the 15 Work Order templates specifies RA billing — *"RA shall be raised only
for activity which is 100% Complete"*, *"Retention @ 5% will be kept in all RA bills"*.
A flat header amount could not express that.

```
ra_sequence · previous_certified_amount · cumulative_certified_amount   (header)
cumulative_quantity · previous_quantity · quantity                      (line)
```

`quantity` on a line is the **difference** — cumulative measured to date minus what
earlier bills already certified. That is what actually gets paid.

`fn_resequence_service_bills` renumbers a Work Order's bills as a set on every change,
rather than trying to keep a counter correct through edits, rejections and deletions.

### 2.3 Budget posting

On certification (`approved` / `paid`):

```
ledger 'actual'          = GROSS certified value      → spent_amount ↑
ledger 'retention_held'  = withheld portion           → retention_held ↑
ledger 'release'         = min(gross, WO open commitment) → committed_amount ↓
```

**Accounting rule enforced here:** a service bill posts to the *same budget head its Work
Order committed against*. Anything else would relieve commitment in one head while
booking cost in another, corrupting both. Since "no WO, no bill" is enforced at the
database level, that head always exists — unless the Work Order was explicitly permitted
to be unbudgeted, in which case nothing posts at all.

Amending or de-certifying a certified bill **reverses and re-posts**, the same guarantee
vendor bills got in Phase 1. `budget_ledger` can never silently disagree with the
document it represents.

### 2.4 Variance sheet

`fn_rollup_variance_for_master_item` previously read only `purchase_orders` and
`vendor_bills`, so every `service` / `labour` / `subcontract` Master Budget line showed a
baseline with permanently zero committed and actual figures. It now also reads
`work_orders` (committed) and `service_bills` (actual), line-level where lines exist and
header-level otherwise.

### 2.5 Payments

`payments.vendor_bill_id` was `NOT NULL` — **a service bill could never be paid.** Now:

```sql
service_bill_id  uuid REFERENCES service_bills(id)
vendor_bill_id   nullable
CHECK (num_nonnulls(vendor_bill_id, service_bill_id) = 1)
```

Existing rows all carry `vendor_bill_id`, so the constraint is satisfied on day one and
every existing insert path keeps working unchanged. `service_bills.payment_status` is now
maintained by a trigger off actual payments rather than being relabelled by hand.

### 2.6 QC gate INSERT bypass

`fn_service_bill_qc_gate` was `BEFORE UPDATE OF status` only — inserting a bill directly
at `status='approved'` skipped the QC check entirely. Now `BEFORE INSERT OR UPDATE`.

### 2.7 Recursion fix

`trg_service_bill_wo_balance` was declared with **no column list**, so it fired on every
column change. That becomes a feedback loop once `fn_resequence_service_bills` writes
`ra_sequence` back and the payment trigger writes `payment_status`. It is now scoped to
the columns that genuinely affect the Work Order balance, breaking the loop at the
declaration rather than relying on the write-back happening to be a no-op.

---

## 3. Frontend changes

Typecheck clean (`npx tsc --noEmit` from `frontend/`).

| File | Change |
|---|---|
| `lib/service-bills.ts` | Rewritten: lines, retention block, RA fields, pagination (was a hard 100-row cap), soft delete, `verifyServiceBill`, approval audit, `recordServiceBillPayment`, `listBillableVendors`, `getPreviouslyCertifiedQuantities` |
| `components/service-bills/create-service-bill-modal.tsx` | Rewritten: **vendor dropdown replaces the free-text uuid field**, measured (RA) vs lump-sum modes, measurement grid pre-filled from Work Order scope and prior certifications, retention/advance/deductions with a settlement preview |
| `app/service-bills/page.tsx` | RA sequence, gross / retention / net payable columns, Verify step, "Certified (in budget)" and "Retention Held" metrics, server errors surfaced verbatim |
| `lib/work-orders.ts` | `getBillableWorkOrders` returns the fields the bill form needs |

**The free-text vendor field was unusable.** It was a plain text input placeholdered
`"e.g. VEND-1001"` posted into a `uuid` FK — any real entry failed at the database. It is
now a proper vendor picker, defaulted to whoever holds the Work Order.

The modal's settlement preview mirrors `fn_compute_service_bill_net` exactly
(`ROUND(subtotal × pct / 100, 2)`); header totals for a measured bill are rolled up by a
database trigger, so what is shown is a preview of what the server will compute, never an
independent calculation that could disagree with it.

---

## 4. Verification

§14 self-verifies and raises on any missing object. Independently:

```sql
-- 4a. Parity columns
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='service_bills'
  AND column_name IN ('budget_allocation_id','master_budget_item_id','retention_amount',
                      'net_payable_amount','ra_sequence','cumulative_certified_amount',
                      'approved_by','deleted_at');
-- expect 8 rows

-- 4b. Payments generalised
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='payments'
  AND column_name IN ('vendor_bill_id','service_bill_id');
-- expect vendor_bill_id = YES (nullable), service_bill_id present

-- 4c. QC gate now covers INSERT (tgtype bit 2 = INSERT)
SELECT tgname, (tgtype & 4) = 4 AS fires_on_insert
FROM pg_trigger WHERE tgname = 'trg_service_bill_qc_gate';
-- expect true

-- 4d. WO balance trigger is column-scoped (the recursion fix)
SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname='trg_service_bill_wo_balance';
-- expect: UPDATE OF work_order_id, status, subtotal_amount, total_amount, bill_date, deleted_at
```

### End-to-end smoke test

Run **after** the Phase 2 smoke test, or create a fresh issued Work Order.

```sql
-- Setup: an issued WO with a budget head, worth 10,00,000 ex-GST.
INSERT INTO work_orders (project_id, agency_id, work_order_number, scope_of_work,
                         wo_type, wo_status, status, total_amount, tax_inclusive,
                         budget_allocation_id)
SELECT p.id, a.id, 'WO-SMOKE-3', 'Phase 3 smoke test', 'fixed_scope', 'draft', 'draft',
       1000000, false,
       (SELECT id FROM budget_allocations WHERE deleted_at IS NULL
        ORDER BY allocated_amount DESC LIMIT 1)
FROM projects p, site_agencies a WHERE p.deleted_at IS NULL LIMIT 1;

UPDATE work_orders SET wo_status='issued' WHERE work_order_number='WO-SMOKE-3';
-- commitment 10,00,000 posted (Phase 2)

-- 1. Raise a bill: 4,00,000 + 18% GST, 5% retention.
INSERT INTO service_bills (project_id, work_order_id, vendor_id, bill_number, bill_date,
                           subtotal_amount, tax_amount, total_amount,
                           retention_percent, status, payment_status)
SELECT wo.project_id, wo.id, (SELECT id FROM vendors LIMIT 1), 'SB-SMOKE-1', CURRENT_DATE,
       400000, 72000, 472000, 5, 'submitted', 'pending'
FROM work_orders wo WHERE wo.work_order_number='WO-SMOKE-3';

SELECT billed_to_date, claimed_to_date, remaining_balance
FROM work_orders WHERE work_order_number='WO-SMOKE-3';
-- expect: billed 0 (not certified), claimed 400000 (NET of tax — WO is tax_inclusive=false),
--         remaining 1000000

-- 2. Certify it.
UPDATE service_bills SET status='approved' WHERE bill_number='SB-SMOKE-1';

SELECT transaction_type, amount FROM budget_ledger
WHERE source_table='service_bills' ORDER BY transaction_type;
-- expect: actual 472000 (GROSS, not the 452000 net)
--         release 472000  (capped at the WO's open commitment)
--         retention_held 20000  (5% of the 400000 ex-tax base)

SELECT billed_to_date, remaining_balance FROM work_orders WHERE work_order_number='WO-SMOKE-3';
-- expect: billed 400000, remaining 600000

SELECT committed_amount, spent_amount, retention_held FROM budget_allocations
WHERE id = (SELECT budget_allocation_id FROM work_orders WHERE work_order_number='WO-SMOKE-3');
-- expect: committed 528000 (1000000 - 472000), spent 472000, retention_held 20000

-- 3. Pay it — impossible before this migration.
INSERT INTO payments (project_id, service_bill_id, payment_reference, payment_date, amount, status)
SELECT project_id, id, 'PAY-SMOKE-1', CURRENT_DATE, net_payable_amount, 'paid'
FROM service_bills WHERE bill_number='SB-SMOKE-1';

SELECT payment_status, net_payable_amount FROM service_bills WHERE bill_number='SB-SMOKE-1';
-- expect: paid, 452000  (472000 gross - 20000 retention)

-- 4. Amend retention on the certified bill -> reverse and re-post.
UPDATE service_bills SET retention_amount = 40000 WHERE bill_number='SB-SMOKE-1';

SELECT transaction_type, amount, revision_seq, reverses_ledger_id IS NOT NULL AS is_reversal
FROM budget_ledger WHERE source_table='service_bills' ORDER BY transaction_type, revision_seq;
-- expect original rows, their negative mirrors, and fresh rows at a higher revision_seq.
-- spent_amount stays 472000 (retention never reduces cost); retention_held 20000 -> 40000.
```

Rollback:

```sql
DELETE FROM payments WHERE payment_reference='PAY-SMOKE-1';
DELETE FROM budget_ledger WHERE source_table='service_bills'
  AND source_id IN (SELECT id FROM service_bills WHERE bill_number='SB-SMOKE-1');
DELETE FROM service_bill_lines WHERE service_bill_id IN
  (SELECT id FROM service_bills WHERE bill_number='SB-SMOKE-1');
DELETE FROM service_bills WHERE bill_number='SB-SMOKE-1';
DELETE FROM budget_ledger WHERE source_table='work_orders'
  AND source_id IN (SELECT id FROM work_orders WHERE work_order_number='WO-SMOKE-3');
DELETE FROM work_orders WHERE work_order_number='WO-SMOKE-3';
-- allocation counters rebuild automatically from the ledger
```

---

## 5. Behavioural changes to expect

1. **Certifying a service bill now moves the budget.** Spend rises by the gross value;
   the Work Order's commitment falls by the same amount. Net effect on *available* budget
   is zero when a bill is within the commitment — which is exactly right, because the
   money was already reserved at issue.
2. **`billed_to_date` counts certified bills only.** A submitted claim sits in
   `claimed_to_date` until someone certifies it.
3. **The QC gate now applies on insert**, so a bill created directly as approved is
   rejected if QC has not passed.
4. **`service_bills` reads require authentication** — anon was never revoked before.
5. Bills raised through the old modal with a free-text vendor never persisted; there is
   nothing to migrate.

## 6. Deliberately left for later phases

| Gap | Phase |
|---|---|
| Service bills absent from the Bill-Wise Ledger (the UNION MV + keyset RPC) | 4 |
| Bill Details drawer with the Budget Impact section | 5 |
| Retention **release** document (`retention_released` exists, nothing emits it) | 4 |
| Advance **payment** document (`advance_paid` exists, nothing emits it) | later |
| Attachments rebuild — multi-file, hash dedupe, verification status | 6 |
| Work Order variation as an approved document rather than a direct amount edit | 7 |
