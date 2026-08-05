# Phase 2 — Work Order Budget Integration

`migrations/20260805100200_work_order_budget_integration.sql`

Turns the Work Order from a financially inert document into a real **encumbrance**:
issuing one reserves budget, varying one adjusts the reservation, closing one releases
what is left.

Idempotent and non-destructive — safe to re-run.

---

## 1. Apply order

`supabase db push` handles this automatically. Applied in filename order:

| # | Migration | Status before this work |
|---|---|---|
| 1 | `20260801000000_service_bills_schema` | **not applied in prod** |
| 2 | `20260803000000_work_order_module_enhancement` | **not applied in prod** |
| 3 | `20260805100000_budget_ledger_txn_types` | Phase 1 |
| 4 | `20260805100100_budget_ledger_gross_basis_and_derived_counters` | Phase 1 |
| 5 | `20260805100200_work_order_budget_integration` | **Phase 2 — this file** |

Migrations 1 and 2 are pre-existing tracked work that had never been applied — verified
against `uanazwednpluwllhfzlh` (`service_bills` → 404, no `wo_templates`, no
`work_orders.wo_status`). They are deliberately **not rewritten**: a tracked migration is
never edited after the fact, so Phase 2 moves forward on top of them instead.

§0 of Phase 2 asserts all four prerequisites and aborts with a message naming the
missing migration rather than half-applying.

> **Note on `service_bills`.** Migration 1 creates the thin version of that table.
> Phase 3 brings it to structural parity (allocation link, master budget link,
> retention block, approval audit columns, `deleted_at`) and wires it to the ledger.
> Phase 2 only corrects the Work Order side of the relationship.

---

## 2. What changes

### 2.1 Work Orders now encumber budget

```
wo_status -> issued/active   =>  ledger 'commitment'  =>  allocations.committed_amount
total_amount varied          =>  ledger 'commitment'  (delta, may be negative)
wo_status -> closed/cancelled=>  ledger 'release'     (residual)
```

`budget_allocations.committed_amount` previously reflected purchase orders only, so
available budget was overstated by the entire open subcontract book — typically 40–60%
of project cost. Counters are derived from the ledger (Phase 1), so nothing is
incremented by hand.

Variations use Phase 1's `revision_seq`: the delta is posted as an additional
commitment row rather than needing to overwrite the original.

### 2.2 The budget head becomes resolvable, then mandatory

`work_orders.budget_allocation_id` existed and was never populated — the create form had
no field for it. Resolution order, most explicit first:

1. an allocation set directly on the Work Order
2. `master_budget_item_id` → its category → that category's allocation
3. `activity_id` → `activity_budget_category_map` (the durable cache the PR module
   already populates)

Steps 1–2 reuse `fn_resolve_budget_allocation`, so Work Orders and Purchase Orders can
never disagree about which allocation a Master Budget line belongs to.

`fn_normalize_activity_key` is the SQL twin of `normalizeActivityKey()` in
`activity-mapping.ts`. **If one is edited the other must be too** — divergence makes
every cache lookup silently miss. §11 verifies they agree.

At issue the resolution is **frozen onto the row**, so ledger, alerts and UI all
reference the same head even if the mapping cache later changes.

### 2.3 Enforcement at issue

| Condition | Behaviour | Controlled by |
|---|---|---|
| No resolvable budget head | Blocked | `budget_config.wo_unbudgeted_enforcement` (default `block`) |
| Would breach the hard limit | Blocked, or alert | `budget_config.hard_limit_enforcement` (default `block`) |

`hard_limit_enforcement` has been configurable since the budget hardening migration and
was **enforced by nothing**. A Work Order is the first document large enough to matter,
so it is enforced here.

> **Decision made without your input** — you asked to proceed with Phase 2 before
> answering my question about unbudgeted Work Orders. I chose **block by default, with a
> per-project opt-out**, mirroring the existing `hard_limit_enforcement` pattern.
> Rationale: silently posting nothing is exactly the invisible-spend defect Phase 2
> exists to close. To restore permissive behaviour:
> ```sql
> UPDATE budget_config SET wo_unbudgeted_enforcement = 'allow_unbudgeted'
> WHERE project_id = '<uuid>';
> ```

### 2.4 Drawdown arithmetic fixed

`fn_recompute_wo_billed_to_date` summed `service_bills.total_amount` for every bill with
`status <> 'rejected'`. Two defects:

- **Tax basis.** WO value is `Sum(qty x rate)`; bill total is `subtotal + tax`. Comparing
  them made a fully-billed WO read ~118% billed and drove `remaining_balance` negative.
  The 15 seeded templates disagree on whether GST is included, so the basis is now
  **declared per Work Order** via `tax_inclusive` rather than assumed globally.
- **Certified vs claimed.** Draft and submitted claims drew down the balance before
  anyone certified them. Now split: `billed_to_date` (approved/paid only) drives
  `remaining_balance`; `claimed_to_date` carries submitted/verified.

Over-billing raises `has_billing_overrun` plus a deduplicated alert. It is **surfaced,
not blocked** — a genuine variation is legitimate and belongs in an approval queue, not
in a failed INSERT the site team cannot interpret.

### 2.5 Scope-overrun alerts repaired

They carried `budget_allocation_id = NULL`, so `uq_budget_alerts_open_per_type` could not
deduplicate them (NULLs are never equal) and `fn_check_budget_overrun_alert` could not
close them. They multiplied on every edit and stayed open forever. Now they carry a real
head, dedupe via `ON CONFLICT`, and auto-close when every line is back within scope.

### 2.6 Two pre-existing defects fixed in passing

- `approveWorkOrder(id, 'current-user')` passed a literal string into a `uuid` FK —
  **Approve & Issue could never have worked.** Now resolved from the session.
- `rejectWorkOrder` demanded a mandatory reason and discarded it; there was no column.
  Added `work_orders.rejection_reason`, mirroring `purchase_orders`.

### 2.7 RLS

`work_orders` and `work_order_lines` predated the hardening work and were still reachable
by the browser-shipped anon key. Now: anon revoked, authenticated policies, RLS enabled.

**`FORCE ROW LEVEL SECURITY` is deliberately NOT used** — the `SECURITY DEFINER` budget
functions execute as the table owner and must keep bypassing RLS. Forcing it subjects
them to policies scoped `TO authenticated`, which match nothing, and every function
silently sees zero rows.

---

## 3. Frontend changes

Typecheck clean (`npx tsc --noEmit` from `frontend/`, exit 0).

| File | Change |
|---|---|
| `lib/work-orders.ts` | `masterBudgetItemId` + `taxInclusive` on create; `listBudgetHeads`, `listMasterBudgetLines`, `getWorkOrderBudget`, `updateWorkOrderBudgetHead`, `isBudgetHeadRequiredForIssue`; `approveWorkOrder` resolves the real profile id; `rejectWorkOrder` persists the reason; `getDbSiteId` applied consistently |
| `components/work-orders/create-work-order-modal.tsx` | Budget section: Master Budget line + Budget Head pickers with live headroom, over-budget warning, GST-inclusive toggle |
| `app/work-orders/[id]/page.tsx` | Budget Position panel (head, master line, committed, open commitment) read from `work_order_budget_view`; certified vs claimed split; billing-overrun banner |

Selecting a Master Budget line pre-fills the Budget Head, resolving it the same way the
database will at issue time — so the form cannot imply a head that differs from the one
actually charged.

`work_order_budget_view` reads commitment from `budget_ledger` rather than storing a
counter on `work_orders`, so there is no second number that can drift from the journal.

---

## 4. Verification

§11 self-verifies and raises on any missing object. To confirm independently:

```sql
-- 4a. Columns
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='work_orders'
  AND column_name IN ('master_budget_item_id','tax_inclusive','claimed_to_date',
                      'has_billing_overrun','rejection_reason');
-- expect 5 rows

-- 4b. Triggers
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_wo_budget_gate','trg_wo_budget_sync',
                 'trg_wo_line_variance_alert','trg_service_bill_wo_balance');
-- expect 4 rows

-- 4c. Normaliser agrees with the frontend
SELECT fn_normalize_activity_key('Masonry / Brickwork  Phase-2');
-- expect: masonry brickwork phase 2

-- 4d. anon locked out
SELECT relname, relrowsecurity FROM pg_class
WHERE relname IN ('work_orders','work_order_lines');
-- expect relrowsecurity = true for both
```

### End-to-end smoke test

```sql
-- Pick a head with headroom.
SELECT id, allocation_name, allocated_amount, committed_amount, spent_amount
FROM budget_allocations WHERE deleted_at IS NULL ORDER BY allocated_amount DESC LIMIT 3;

-- 1. Unbudgeted issue must be REJECTED.
INSERT INTO work_orders (project_id, agency_id, work_order_number, scope_of_work,
                         wo_type, wo_status, status, total_amount)
SELECT p.id, a.id, 'WO-SMOKE-1', 'Phase 2 smoke test', 'fixed_scope', 'draft', 'draft', 500000
FROM projects p, site_agencies a WHERE p.deleted_at IS NULL LIMIT 1;

UPDATE work_orders SET wo_status='issued' WHERE work_order_number='WO-SMOKE-1';
-- expect: ERROR ... no budget head could be resolved

-- 2. With a head, issue must POST A COMMITMENT.
UPDATE work_orders
SET budget_allocation_id = (SELECT id FROM budget_allocations
                            WHERE deleted_at IS NULL ORDER BY allocated_amount DESC LIMIT 1)
WHERE work_order_number='WO-SMOKE-1';

UPDATE work_orders SET wo_status='issued' WHERE work_order_number='WO-SMOKE-1';

SELECT transaction_type, amount, revision_seq, description
FROM budget_ledger WHERE source_table='work_orders';
-- expect: commitment  500000  seq 0

-- 3. Vary the value -> DELTA commitment, not a duplicate.
UPDATE work_orders SET total_amount = 650000 WHERE work_order_number='WO-SMOKE-1';
SELECT transaction_type, amount, revision_seq FROM budget_ledger
WHERE source_table='work_orders' ORDER BY revision_seq;
-- expect: 500000 seq 0, then 150000 seq 1  (net committed = 650000)

-- 4. Close -> residual RELEASED.
UPDATE work_orders SET wo_status='closed' WHERE work_order_number='WO-SMOKE-1';
SELECT transaction_type, SUM(amount) FROM budget_ledger
WHERE source_table='work_orders' GROUP BY 1;
-- expect: commitment 650000, release 650000  => committed_amount back to 0

SELECT allocation_name, committed_amount FROM budget_allocations
WHERE id = (SELECT budget_allocation_id FROM work_orders WHERE work_order_number='WO-SMOKE-1');
-- expect: committed_amount = 0
```

Rollback:

```sql
DELETE FROM budget_ledger WHERE source_table='work_orders'
  AND source_id = (SELECT id FROM work_orders WHERE work_order_number='WO-SMOKE-1');
DELETE FROM work_order_lines WHERE work_order_id =
  (SELECT id FROM work_orders WHERE work_order_number='WO-SMOKE-1');
DELETE FROM work_orders WHERE work_order_number='WO-SMOKE-1';
-- the ledger trigger rebuilds allocation counters automatically
```

---

## 5. Behavioural changes to expect

1. **Issuing a Work Order without a budget head now fails.** Intended — see §2.3 for the
   opt-out.
2. **Available budget will drop** once Work Orders are issued. That is the hole Phase 2
   closes, not a regression.
3. **`work_orders` reads now require authentication.** Consistent with every budget
   table since the hardening migration.
4. **`remaining_balance` will differ from before** on any WO with bills — it is now
   certified-only and on a matched tax basis.

## 6. Deliberately left for later phases

| Gap | Phase |
|---|---|
| Service bills post no `actual` and no commitment release | 3 |
| `service_bills` still lacks allocation / master-item / retention / audit columns | 3 |
| Service bills absent from the Bill-Wise Ledger | 4 |
| Retention release document (`retention_released` exists, nothing emits it) | 4 |
| Work Order variation as an **approved document** rather than a direct amount edit | 7 |
