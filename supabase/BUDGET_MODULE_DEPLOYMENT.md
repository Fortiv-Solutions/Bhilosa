# Budget Module — Deployment Runbook

The Budget module application code is complete and builds, but it **requires
`migrations/20260730120000_budget_module_production_hardening.sql` to be applied**
before it will function. Until then every Budget tab renders an explicit error state
(it will not silently fall back to seed data — that behaviour was removed on purpose).

---

## 1. Why the migration is mandatory

These objects do not exist in the live database yet:

| Object | Used by |
|---|---|
| `budget_config` | Config tab, alert thresholds, budget lock |
| `budget_bill_ledger_view` | Bill-Wise Ledger tab |
| `budget_monthly_cashflow_view` | Cash Flow S-Curve tab |
| `portfolio_budget_summary` (new columns) | Executive KPI cards, Overview |
| `rpc_save_master_budget_revision` | Master Budget save |
| `rpc_save_variance_reconciliation` | Variance save |
| `rpc_import_master_budget` | Excel import |
| RLS policies on all budget tables | Security — see §4 |

The migration is **idempotent and non-destructive**: it never deletes budget rows,
and it can be re-run safely.

---

## 2. Applying it

### Option A — Supabase CLI (preferred)

```bash
supabase link --project-ref uanazwednpluwllhfzlh
supabase db push
```

### Option B — Supabase Dashboard

SQL Editor → paste the full contents of
`supabase/migrations/20260730120000_budget_module_production_hardening.sql` → Run.

### Option C — psql

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260730120000_budget_module_production_hardening.sql
```

**Take a database backup first.** The migration alters `vendor_bills`,
`purchase_orders` triggers and `budget_allocations`, and backfills the ledger from
existing approved documents.

### Expected output

The final block raises a notice like:

```
NOTICE:  Budget hardening OK: 24 categories, 24 allocations, baseline 1453638820.00
```

If it raises an **exception** instead, nothing is committed — read the message, fix
the underlying data, and re-run. A `WARNING` about
`uq_master_budget_items_project_cat_desc` is non-fatal: it means duplicate line items
exist and the uniqueness guarantee was skipped; deduplicate, then re-run.

---

## 3. Post-apply verification

```sql
-- 1. Allocations provisioned, one per budget category, summing to the baseline.
SELECT count(*) AS allocations, sum(allocated_amount) AS allocated
FROM budget_allocations WHERE category_id IS NOT NULL AND deleted_at IS NULL;
-- expect: 24 allocations, allocated = 1453638820.00

SELECT sum(budgeted_cost) AS baseline
FROM master_budget_items WHERE is_active AND deleted_at IS NULL;
-- expect: identical to `allocated` above

-- 2. Executive KPIs are no longer zero.
SELECT project_name, baseline_amount, allocated_amount, committed_amount,
       spent_amount, remaining_amount, utilization_percent, line_item_count
FROM portfolio_budget_summary;

-- 3. Existing approved POs / bills were backfilled into the ledger.
SELECT transaction_type, count(*), sum(amount)
FROM budget_ledger GROUP BY transaction_type;

-- 4. Bill ledger view resolves (project-wise).
SELECT count(*) FROM budget_bill_ledger_view
WHERE project_id = '00000000-0000-0000-0000-000000000001';

-- 5. Variance stored columns are computed, not stale zeros.
SELECT count(*) AS rows_with_variance
FROM budget_variance_items WHERE cost_variance_amount <> 0;

-- 6. The corrected PO trigger uses the real enum.
SELECT unnest(enum_range(NULL::erp_budget_txn_type));
-- expect: allocation, commitment, release, actual, adjustment
```

---

## 4. Security check — this is the important one

Before the migration, the browser-shipped anon key had full `SELECT`, `UPDATE` and
`DELETE` on every budget table. Verify that is closed:

```bash
# Replace <ANON_KEY> with NEXT_PUBLIC_SUPABASE_ANON_KEY.
# The filter matches zero rows, so nothing is modified either way.
URL=https://uanazwednpluwllhfzlh.supabase.co
ANON=<ANON_KEY>

# Expect 401 or empty result, NOT 200 with rows:
curl -s -o /dev/null -w "select  -> %{http_code}\n" \
  "$URL/rest/v1/master_budget_items?select=id&limit=1" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"

# Expect 401/403, NOT 204:
curl -s -o /dev/null -w "delete  -> %{http_code}\n" -X DELETE \
  "$URL/rest/v1/master_budget_items?id=eq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

`select -> 200` with rows, or `delete -> 204`, means RLS did not take effect —
stop and investigate before deploying.

> **Consequence of enabling RLS:** the Budget module now requires an authenticated
> Supabase session. Users must sign in at `/login` (the app already uses
> `supabase.auth.signInWithPassword`). Unauthenticated visitors see a "Sign in
> required" panel rather than zeroed figures.

---

## 5. Rolling back

The migration adds objects and corrects logic; it does not drop budget data. To
revert behaviour without losing data:

```sql
-- Re-open access (NOT recommended — this restores the anon-key exposure):
ALTER TABLE public.master_budget_items DISABLE ROW LEVEL SECURITY;
-- ...repeat per table.

-- Detach the cross-module posting triggers:
DROP TRIGGER IF EXISTS trg_po_budget_commitment ON public.purchase_orders;
DROP TRIGGER IF EXISTS trg_bill_budget_actual ON public.vendor_bills;

-- Remove the backfilled ledger rows and reset counters:
DELETE FROM public.budget_ledger WHERE description LIKE 'Backfilled%';
UPDATE public.budget_allocations SET committed_amount = 0, spent_amount = 0;
```

---

## 6. What still needs a product decision

These are documented gaps, not defects — the code is explicit about each:

1. **Planned S-curve** is a straight-line spread of the baseline across months that
   have ledger activity. A true planned curve needs a project schedule
   (`project_phases` / `construction_activities` with planned dates and values)
   wired into `budget_monthly_cashflow_view`.
2. **PO → master budget line mapping.** Cross-module posting resolves an allocation
   from `purchase_orders.master_budget_item_id`, falling back to the budget category.
   POs raised without `master_budget_item_id` post to no allocation and are reported
   as `head_activity = 'Unallocated'` in the ledger. Making that field mandatory in
   the PR/PO flow is a procurement-side change.
3. **Approval workflow for revisions.** `budget_revisions.status` supports
   `draft / submitted / approved / rejected`, and the RPCs currently write `approved`
   directly. A maker-checker step would set `submitted` and require a second role to
   approve.
4. **Retention release.** Retention is accumulated on
   `budget_allocations.retention_held`; releasing it at end of DLP is not yet a
   workflow.
