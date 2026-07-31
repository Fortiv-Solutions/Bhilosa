# Procurement + Vendor module — production deployment

Closes the findings of the 2026-07-30 production-readiness audit. Two of them
are **exploitable against the live database until these migrations are
applied**, so treat this as urgent rather than routine.

## What has to be applied

Two migrations, strictly in this order:

| # | File | Why it is separate |
|---|------|--------------------|
| 1 | `migrations/20260731090000_procurement_status_enums.sql` | Adds the workflow labels the UI writes (`pending_verification`, `pending_approval`, …). `ALTER TYPE … ADD VALUE` cannot be *used* in the transaction that adds it, so these must land first. |
| 2 | `migrations/20260731090100_procurement_production_hardening.sql` | RLS, approval guards, document numbering, schema completion, and the nine RPCs the frontend calls. |

```bash
supabase db push
```

Or paste each file into the dashboard SQL editor, in order. Both are idempotent
and non-destructive — re-running is safe, nothing is dropped or retyped.

## What they change

**1. Row Level Security (critical).** Before this, anonymous callers holding the
publishable key — which ships in the browser bundle — could `SELECT` **and
`UPDATE`** `vendors`, `purchase_orders`, `goods_receipt_notes` and
`vendor_bills`. Verified: a zero-match `PATCH` on each returned `204`. RLS is
now enabled on 27 procurement/vendor/inventory tables, policies are scoped
`TO authenticated` with a recognised procurement role, and `anon`'s table
grants are revoked outright.

> After applying, **rotate the anon key**. It was valid for writes for as long
> as the project has been deployed.

**2. Approval authority moves into the database.** `requireUpperManagementProfile()`
only checked that *some* profile existed — it never checked a role, despite the
name. `updateGrnStatus` / `updateVendorBillStatus` accepted any status string
with no role check and no transition validation. Now:

- `BEFORE` triggers on `purchase_orders`, `goods_receipt_notes` and
  `vendor_bills` reject privileged transitions unless the caller qualifies, and
  stamp `approved_by` / `approved_at` / `verified_by` server-side.
- Bill approval and payment release are `upper_management` only.
- A bill whose three-way match is `mismatch` cannot be approved at all.
- A GRN or bill cannot be *created* already approved.

**3. Document numbering.** `next_document_number()` allocates from
`document_number_sequences` in a single atomic upsert. Unique indexes now exist
on `mr_number`, `pr_number`, `rfq_number`, `po_number`, `grn_number` and
`bill_number`. The old client-side generator used the last five digits of
`Date.now()`, which repeats every 100 seconds.

**4. The nine RPCs.** All five the frontend called returned **HTTP 404** in
production — MR creation, MR inventory review, PO approve-and-send, GRN posting
and vendor-bill creation were dead, and three reported success anyway. Created:

`submit_mobile_material_request` · `review_material_request_inventory` ·
`approve_and_send_purchase_order` · `post_goods_receipt_note` ·
`submit_vendor_bill_from_grn` · `save_goods_receipt_note` ·
`save_purchase_bill` · `save_purchase_order` ·
`set_goods_receipt_note_status` · `set_vendor_bill_status`

**5. Schema completion.** Purchase-bill fields (the form collected ten sections
and persisted only `status`), `vendor_bill_lines` commercial columns,
`goods_receipt_notes.supplier_name`, and the `three_way_matches` table the
Bills UI referenced but which never existed.

## Roles

`app_normalize_role()` mirrors `frontend/src/lib/roles.ts` and recognises:

| profiles.role (any case/spacing) | Normalised | Write | Approve PO/GRN | Approve bills |
|---|---|---|---|---|
| `upper_management`, `admin`, `director`, `management`, … | `upper_management` | ✅ | ✅ | ✅ |
| `project_manager` | `project_manager` | ✅ | ✅ | ❌ |
| `pr_team`, `procurement`, `purchase`, … | `pr_team` | ✅ | ❌ | ❌ |
| `Site Engineer`, `engineer`, `storekeeper`, … | `site_engineer` | ✅ | ❌ | ❌ |
| anything else | `NULL` | ❌ | ❌ | ❌ |

**Unrecognised roles fail closed and lose all procurement access.** The live
`profiles` table currently holds `upper_management` and `Site Engineer`, both
handled. If you add a new role string, extend `app_normalize_role()` — a
one-line change plus a `NOTIFY pgrst, 'reload schema'`.

## Verification

Paste after applying. Every check should report `PASS`.

```sql
-- 1. All ten RPCs exist.
SELECT CASE WHEN count(*) = 10 THEN 'PASS' ELSE 'FAIL: only ' || count(*) END AS rpcs
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'submit_mobile_material_request','review_material_request_inventory',
  'approve_and_send_purchase_order','post_goods_receipt_note',
  'submit_vendor_bill_from_grn','save_goods_receipt_note','save_purchase_bill',
  'save_purchase_order','set_goods_receipt_note_status','set_vendor_bill_status');

-- 2. RLS is on for every procurement table.
SELECT CASE WHEN count(*) = 0 THEN 'PASS'
            ELSE 'FAIL: RLS off on ' || string_agg(relname, ', ') END AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT c.relrowsecurity
  AND c.relname IN ('vendors','material_requests','purchase_requisitions',
    'purchase_orders','goods_receipt_notes','vendor_bills','vendor_bill_lines',
    'rfqs','vendor_quotations','three_way_matches');

-- 3. anon holds no write grant on the sensitive tables.
SELECT CASE WHEN count(*) = 0 THEN 'PASS'
            ELSE 'FAIL: anon can still write ' || string_agg(DISTINCT table_name, ', ') END AS anon_writes
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  AND table_name IN ('vendors','purchase_orders','goods_receipt_notes','vendor_bills');

-- 4. Document numbers are unique.
SELECT CASE WHEN count(*) = 6 THEN 'PASS' ELSE 'FAIL: only ' || count(*) || ' of 6' END AS unique_doc_numbers
FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
  'ux_material_requests_mr_number','ux_purchase_requisitions_pr_number',
  'ux_rfqs_rfq_number','ux_purchase_orders_po_number',
  'ux_goods_receipt_notes_grn_number','ux_vendor_bills_bill_number');

-- 5. Approval guards are installed.
SELECT CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL: only ' || count(*) END AS approval_triggers
FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
  'guard_purchase_order_approval','guard_grn_approval','guard_vendor_bill_approval');

-- 6. Numbering is atomic and formatted.
SELECT CASE WHEN public.next_document_number('TEST') ~ '^TEST-\d{8}-\d{4}$'
            THEN 'PASS' ELSE 'FAIL' END AS numbering;
DELETE FROM public.document_number_sequences WHERE prefix = 'TEST';

-- 7. Inventory receipt label resolved (expect 'inward').
SELECT CASE WHEN public.app_stock_receipt_txn_type() IS NOT NULL
            THEN 'PASS: ' || public.app_stock_receipt_txn_type()
            ELSE 'FAIL: no usable stock_ledger.transaction_type label' END AS stock_txn_type;

-- 8. Every live profile resolves to a role (NULL = locked out).
SELECT CASE WHEN count(*) = 0 THEN 'PASS'
            ELSE 'FAIL: unmapped roles -> ' || string_agg(DISTINCT role, ', ') END AS role_coverage
FROM public.profiles
WHERE is_active AND deleted_at IS NULL AND public.app_normalize_role(role) IS NULL;
```

### Then re-run the exploit probe

It must now return `401`/`403`, not `204`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH \
  "$SUPABASE_URL/rest/v1/purchase_orders?id=eq.00000000-0000-0000-0000-000000000000" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"updated_at":"2026-07-31T00:00:00Z"}'
```

## Known follow-ups

- **`normalizeDatabaseRole()` still defaults unrecognised roles to
  `PROJECT_MANAGER`** in the frontend (`lib/roles.ts`). That is fail-open, but it
  is used app-wide for login routing and other modules, so changing the default
  was out of scope here. The database now fails closed regardless, so the
  practical effect is a clear permission error rather than unauthorised access.
  Worth aligning in a dedicated change.
- **`createMaterialRequest` / `convertMaterialRequestToPr` retain non-live mock
  branches** (`mockMaterialRequestsStore`), still consumed by
  `lib/erp/material-request/service.ts`. They only run when Supabase is
  unconfigured, so they are dev-only, but they return synthetic success.
- **The procurement schema is still not fully reproducible.** ~40 tables exist
  only in the hand-maintained dump `schemma/current_schemma.sql`. These two
  migrations are tracked, but a fresh environment cannot yet be provisioned from
  `migrations/` alone.
