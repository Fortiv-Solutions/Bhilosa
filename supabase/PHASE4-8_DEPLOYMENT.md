# Phases 4–8 — Deployment Runbook

Four migrations, applied in filename order after Phase 3.

| # | File | Phase |
|---|---|---|
| 1 | `20260805100400_bill_ledger_union_mv.sql` | 4 — Unified bill ledger + keyset RPCs + retention release |
| 2 | `20260805100500_attachment_verification.sql` | 6 — Attachment integrity & verification |
| 3 | `20260805100600_budget_change_documents.sql` | 7 — Budget change documents (A + C) |
| 4 | `20260805100700_budget_category_hierarchy.sql` | 8 — Sub-category hierarchy |

Phase 5 (Bill Details drawer) is frontend-only and rides on Phase 4's `rpc_bill_detail`.

All four are idempotent, non-destructive, take their table locks up front in a fixed
order, and set `lock_timeout` — the same discipline added after the Phase 3 deadlock.

```bash
supabase db push
```

---

## Phase 4 — Unified bill ledger

### What changes

`budget_bill_ledger_view` read `vendor_bills` only, so contractor RA bills were invisible
in the module that exists to answer *"what has this project spent"*. It also could not be
paginated: `running_available_budget` is a window over the entire allocation partition, so
Postgres had to materialise and order the whole partition before any `LIMIT` applied.
`fetchBillLedger` therefore pulled every row and sliced client-side.

Now:

- **`budget_bill_ledger_mv`** — one materialized view over both spines, certified bills
  only, one row per billed line. The running balance is computed **above** the union;
  inside each branch the two spines would each keep their own running total against the
  same head and the number would be meaningless.
- **`budget_bill_ledger_view`** survives as a thin compatibility view over the MV, so
  nothing that already reads it breaks — and it now sees service bills too.
- **`rpc_bill_ledger`** — keyset-paginated. Keyset rather than `OFFSET`, because the ledger
  only grows and `OFFSET` degrades linearly as it does.
- **`rpc_bill_ledger_summary`** — totals across the whole filtered set. Without it the KPI
  cards would silently become page totals. Money columns are header figures repeated
  across a bill's lines, so it dedupes to one row per bill before summing.
- **`rpc_bill_ledger_export`** — the full filtered set for CSV, with an explicit
  `truncated` flag rather than a quietly partial file.
- **`search_tsv` + GIN index** replaces a nine-column `ILIKE OR` chain that could not use
  an index at all.
- **`retention_releases`** — the document that finally emits `retention_released`.
  `budget_allocations.retention_held` could previously only ever grow.

> **The filter predicate is written inline in all three RPCs, deliberately.** A shared
> helper taking the whole MV row is opaque to the planner: it degenerates to a sequential
> scan with a per-row function call, and the GIN index — the entire point of building one
> — is never used. The three copies must stay in step.

### Consistency model

The MV refreshes `CONCURRENTLY`, so readers never block, but the ledger is **eventually
consistent by design**. That is the right trade for a ledger of *certified* bills:
certification is a low-frequency, deliberate act.

- The tab calls `rpc_refresh_bill_ledger(60)` on load — a no-op if the snapshot is under a
  minute old, so it is safe to call every time.
- A manual **Refresh** button forces it.
- `pg_cron` refreshes every 5 minutes if the extension is installed; the migration says so
  in a `NOTICE` either way.

### Verification

```sql
-- 4a. Both spines present
SELECT bill_source, COUNT(*) FROM budget_bill_ledger_mv GROUP BY 1;

-- 4b. REFRESH CONCURRENTLY is possible (needs the unique index)
SELECT indexname FROM pg_indexes WHERE indexname = 'uq_bill_ledger_mv_id';
SELECT public.rpc_refresh_bill_ledger(0);

-- 4c. Search uses the GIN index, not a seq scan
EXPLAIN SELECT * FROM budget_bill_ledger_mv
WHERE search_tsv @@ plainto_tsquery('simple', 'cement');
-- expect a Bitmap Index Scan on idx_bill_ledger_mv_search

-- 4d. Keyset page + totals
SELECT public.rpc_bill_ledger(NULL, '{}'::jsonb, 10, NULL);
SELECT public.rpc_bill_ledger_summary(NULL, '{}'::jsonb);
```

Retention release smoke test:

```sql
INSERT INTO retention_releases (project_id, service_bill_id, release_number, amount, status)
SELECT project_id, id, 'RR-SMOKE-1', retention_amount, 'approved'
FROM service_bills WHERE retention_amount > 0 LIMIT 1;

SELECT transaction_type, amount FROM budget_ledger WHERE source_table = 'retention_releases';
-- expect: retention_released, equal to the withheld amount
-- and budget_allocations.retention_held falls by the same figure

-- Over-release must be rejected:
INSERT INTO retention_releases (project_id, service_bill_id, release_number, amount, status)
SELECT project_id, id, 'RR-SMOKE-2', 999999, 'approved' FROM service_bills LIMIT 1;
-- expect: ERROR ... exceeds what this bill withheld
```

---

## Phase 6 — Attachments

### What changes

`entity_attachments` was well designed and badly used — `document_hash`, `status`,
`is_required`, `deleted_at` and `uploaded_by` all existed and were all unused. The client:

- **swallowed storage upload failures** with `console.warn`, then inserted the metadata row
  anyway and reported success — producing attachment records pointing at objects that do
  not exist;
- **fell back to a hardcoded user id** and, if no matching profile existed, *inserted one
  with role `project_manager`* — a privileged row written from an unauthenticated path;
- **uploaded to two buckets**, so one logical document could live in either;
- had no delete, no multi-file, no validation, no dedupe.

All of that is gone. The migration adds RLS (anon revoked), the verification workflow via
`rpc_set_attachment_status`, hash-based duplicate detection scoped to an entity,
`fn_required_documents_present` so bill approval can be gated on evidence, and provisions
a single private bucket with a 25 MB limit.

> **`erp_document_status` uses `approved`, not `verified`** — verified against the live
> enum before writing the migration, which asserts all three labels up front.

If the storage policy block reports `insufficient_privilege`, `storage.objects` is owned by
`supabase_storage_admin`; set the three policies in **Storage → project-documents →
Policies**. Everything else still applies.

---

## Phase 7 — Budget change documents (A + C)

### The design

A and C are **orthogonal axes, not competing options**:

- **A is a lifecycle** — draft → submitted → approved → applied. *When does this take
  effect, and who signed it off?*
- **C is a taxonomy** — original / supplement / return / transfer / revision. *What kind of
  money movement is this, and where did the money come from?*

Combined: every budget change is a typed movement document under a staged approval
lifecycle. `budget_revision_items` already stored `old_*`/`new_*` per line — it was the
staging table all along, simply written *after* the fact instead of before.

### The behaviour that changes

**Both write RPCs previously hardcoded `status='approved'` and rewrote the live baseline in
the same transaction.** An Excel import instantly changed the Master Budget, cascaded to
allocations and re-fired every alert. The only brake was `budget_lock_enabled`, a
self-service toggle in the same module.

| Action | Before | After |
|---|---|---|
| Master Budget save | applied immediately | raises a **Revision**, awaits approval |
| First Excel import | applied immediately | raises the **Original** sanction |
| Later Excel import | wholesale overwrite | raises a **Revision** diffed against current |
| `p_archive_missing` | silent `is_active = false` | explicit **retire** lines in the document |

Function signatures and return shapes are unchanged, so nothing breaks — but the UI now
says *"awaiting approval"* rather than *"saved"*, because the baseline genuinely has not
moved yet.

### Controls enforced

| Control | Enforcement |
|---|---|
| Transfers are net-zero | `RAISE` at propose + table CHECK at approve |
| A supplement must increase; a return must decrease | `RAISE` at propose |
| A supplement must state its funding source | `RAISE` at propose |
| One Original per project, immutable once approved | `RAISE` at propose |
| A reduction cannot strand committed/spent money | checked at approve, per head |
| Concurrent proposals cannot overwrite each other | optimistic lock on `version_number`, per line |

The staleness check is the one that matters most. Between propose and approve another
document may have moved the same lines; without it, approvals silently overwrite each
other. It refuses and **names the conflicting lines** so the UI can offer a rebase.

### Approval tiers

`fn_budget_change_tier` reads thresholds from `budget_config`:

- `original`, `supplement`, or any movement ≥ `board_approval_percent` (default 10%) of the
  sanctioned total → **board**
- transfer within one head under `pm_transfer_limit` (default 0, i.e. disabled) → **pm**
- everything else → **management**

`budget-permissions.ts` gains `canProposeBudgetChange` / `canApproveBudgetChange` /
`canApproveSupplement`. **A PM may raise a change but never approve one** — that separation
is the point.

`budget_config.require_change_approval` (default `true`) is an escape hatch for a project
mid-setup: set it `false` and proposals auto-approve on submit. Leaving it `true` is the
production posture.

### Verification

```sql
-- Propose a net-zero transfer; it must NOT touch master_budget_items.
SELECT public.rpc_propose_budget_change(
  (SELECT id FROM projects LIMIT 1), 'transfer', 'Smoke test',
  jsonb_build_array(
    jsonb_build_object('id', (SELECT id FROM master_budget_items LIMIT 1),
                       'budgeted_cost', (SELECT budgeted_cost - 1000 FROM master_budget_items LIMIT 1)),
    jsonb_build_object('id', (SELECT id FROM master_budget_items OFFSET 1 LIMIT 1),
                       'budgeted_cost', (SELECT budgeted_cost + 1000 FROM master_budget_items OFFSET 1 LIMIT 1))
  ),
  NULL, NULL,
  (SELECT id FROM budget_categories LIMIT 1),
  (SELECT id FROM budget_categories OFFSET 1 LIMIT 1),
  true);

SELECT document_number, movement_type, status, net_diff_amount FROM budget_movement_register
ORDER BY created_at DESC LIMIT 1;
-- expect: status 'submitted', net_diff_amount 0

-- A non-zero "transfer" must be rejected outright:
-- ERROR ... A transfer must be net-zero across heads

-- Approve, and only now does the baseline move:
SELECT public.rpc_approve_budget_change(
  (SELECT id FROM budget_revisions ORDER BY created_at DESC LIMIT 1), 'Smoke approved');
```

---

## Phase 8 — Sub-category hierarchy

Option **(i)**: `parent_id` on `budget_categories`, self-referencing, mirroring the pattern
`cost_codes` already uses. Applied **before any sub-category data exists**, so there is no
backfill ambiguity — every existing category becomes a root.

### The three consequences, handled

1. **Allocations provision at the leaf.** `fn_resolve_budget_allocation` now *climbs*: a
   line on a sub-category resolves to that sub-category's allocation, falling back to the
   nearest ancestor that has one. Documents booked before the hierarchy existed keep
   working unchanged.
2. **Name uniqueness is per parent.** The project-wide constraint is dropped **by
   definition, not by name** — it was created implicitly and its generated name is not
   guaranteed across environments. Leaving it would block two sibling heads each having a
   "Flooring" child, which is the whole point.
3. **`budget_category_tree`** exposes each node's own baseline *and* the rollup of
   everything beneath it, so `fetchMasterBudgetCategories` and the Excel parser never have
   to walk the hierarchy themselves.

`depth` and `path_label` ("Finishes › Flooring › Vitrified") are maintained by trigger with
a cycle guard and a three-level cap. Inline creation is supported but guarded:
`rpc_similar_budget_categories` flags near-duplicates using the *same normalisation as the
activity resolver*, and every node records `created_via` so taxonomy sprawl is auditable.

---

## Frontend changes

`npx tsc --noEmit` from `frontend/` — clean.

| File | Change |
|---|---|
| `lib/supabase-budget.ts` | Ledger read path replaced with the RPCs; `BillLedgerRow` gains `bill_source`/`ra_sequence`/retention lifecycle; change-document and category-tree APIs added |
| `components/budget/bill-wise-ledger-tab.tsx` | Rewritten: 11 columns, **read-only**, server pagination, freshness indicator, server-side export |
| `components/budget/bill-detail-drawer.tsx` | New — 8 sections including **Budget Impact** |
| `components/budget/budget-movements-tab.tsx` | New — the Movement Register with approve/reject/withdraw |
| `lib/documents.ts` | Rewritten (see Phase 6) |
| `lib/budget-permissions.ts` | Propose/approve separation; the budget lock now disables both |
| `app/budget/page.tsx` | New **Budget Changes** tab |
| `master-sheet-tab.tsx`, `excel-importer-modal.tsx` | Say "awaiting approval", not "saved" |

**The ledger tab is read-only now, deliberately.** It used to write retention/advance/
deductions straight back to `vendor_bills`, which is what produced ledger drift: the posting
trigger fired only on status changes, so `budget_ledger` kept the stale figure forever. A
report that mutates the documents it reports on is the anti-pattern. Settlement edits moved
into the drawer, where the database reverses and re-posts.

---

## Behavioural changes to expect

1. **Saving the Master Budget or importing Excel no longer changes anything immediately.**
   It raises a document under **Budget Changes** for approval. This is the largest UX shift
   in the whole programme — tell the people who use the importer before you apply it.
2. **The Bill-Wise Ledger is read-only** and shows service bills alongside material bills.
3. **The ledger lags by up to 5 minutes** (or one manual refresh) after a certification.
4. **A PM can no longer approve their own budget change.**
5. **Attachment uploads now fail loudly** where they previously failed silently — expect
   genuine errors to surface that were always happening.

## Known gaps deliberately left

| Gap | Note |
|---|---|
| Advance payment document (`advance_paid` exists, nothing emits it) | The ledger model supports it; the document is not built |
| Master Sheet does not yet render the category tree | `budget_category_tree` + `buildCategoryTree` are ready; the tab still renders two levels |
| Excel parser detects one level of category header | Sub-categories must be created in the UI or via `rpc_upsert_budget_category` |
| Work Order variation as an approved document | Still a direct amount edit (Phase 2 posts the delta commitment) |
