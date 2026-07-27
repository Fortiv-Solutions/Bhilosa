-- ============================================================================
-- PROCUREMENT RECONCILIATION — bring the LIVE Supabase schema into sync with
-- the redesigned frontend (MR, PR, RFQ, PO, GRN, Bills).
-- ----------------------------------------------------------------------------
-- WHY: the live database (see supabase/migrations/current.sql) is the
-- pre-redesign schema. The frontend now writes columns / tables / RPCs that do
-- not exist live, causing:
--   • listProcurementDashboard() to throw    (vendor_bills / three_way_matches missing)
--   • the MR list to throw                    (search_material_requests RPC missing)
--   • savePurchaseRequisition() to fail       (PR / PR-line columns missing)
--   • enum write errors 22P02                 (extended workflow statuses not in the enums)
--
-- This migration is IDEMPOTENT and tailored to the ENUM-based live schema
-- (status columns are erp_* enums, NOT text+CHECK). Run it in the Supabase SQL
-- editor. Safe to re-run.
--
-- NOTE ON ENUMS: `ALTER TYPE ... ADD VALUE` cannot run inside a DO block and,
-- on some setups, not inside a txn that also USES the value. This file only
-- ADDS values (never uses them), so it is safe as a plain script.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. ENUM VALUE ADDITIONS  (every status the frontend writes)
-- ----------------------------------------------------------------------------
-- 1a. erp_procurement_status  (material_requests, purchase_requisitions, rfqs)
alter type public.erp_procurement_status add value if not exists 'draft';
alter type public.erp_procurement_status add value if not exists 'submitted';
alter type public.erp_procurement_status add value if not exists 'in_review';
alter type public.erp_procurement_status add value if not exists 'under_verification';
alter type public.erp_procurement_status add value if not exists 'awaiting_assignment';
alter type public.erp_procurement_status add value if not exists 'assigned';
alter type public.erp_procurement_status add value if not exists 'pending_approval';
alter type public.erp_procurement_status add value if not exists 'approved';
alter type public.erp_procurement_status add value if not exists 'pending_procurement';
alter type public.erp_procurement_status add value if not exists 'returned_to_draft';
alter type public.erp_procurement_status add value if not exists 'revision_required';
alter type public.erp_procurement_status add value if not exists 'on_hold';
alter type public.erp_procurement_status add value if not exists 'rejected';
alter type public.erp_procurement_status add value if not exists 'cancelled';
alter type public.erp_procurement_status add value if not exists 'closed';
alter type public.erp_procurement_status add value if not exists 'auto_draft_pr';
alter type public.erp_procurement_status add value if not exists 'rfq_sent';
alter type public.erp_procurement_status add value if not exists 'vendor_selected';
alter type public.erp_procurement_status add value if not exists 'po_issued';
alter type public.erp_procurement_status add value if not exists 'delivered';

-- 1b. erp_po_status  (purchase_orders)
alter type public.erp_po_status add value if not exists 'pending_approval';
alter type public.erp_po_status add value if not exists 'approved';
alter type public.erp_po_status add value if not exists 'rejected';
alter type public.erp_po_status add value if not exists 'sent_to_vendor';
alter type public.erp_po_status add value if not exists 'acknowledged';
alter type public.erp_po_status add value if not exists 'partially_delivered';
alter type public.erp_po_status add value if not exists 'delivered';
alter type public.erp_po_status add value if not exists 'closed';
alter type public.erp_po_status add value if not exists 'cancelled';

-- 1c. erp_grn_status  (goods_receipt_notes)
alter type public.erp_grn_status add value if not exists 'received';
alter type public.erp_grn_status add value if not exists 'under_inspection';
alter type public.erp_grn_status add value if not exists 'posted';
alter type public.erp_grn_status add value if not exists 'cancelled';

-- 1d. erp_delivery_status  (delivery_trackings.transit_status)
alter type public.erp_delivery_status add value if not exists 'dispatched';
alter type public.erp_delivery_status add value if not exists 'in_transit';
alter type public.erp_delivery_status add value if not exists 'delayed';
alter type public.erp_delivery_status add value if not exists 'reached_site';
alter type public.erp_delivery_status add value if not exists 'delivered';

-- 1e. erp_qc_status  (goods_receipt_notes.quality_decision)
alter type public.erp_qc_status add value if not exists 'accepted';
alter type public.erp_qc_status add value if not exists 'partially_accepted';
alter type public.erp_qc_status add value if not exists 'rejected';

-- ----------------------------------------------------------------------------
-- 2. MATERIAL_REQUEST_LINES — MR->PR conversion tracking
-- ----------------------------------------------------------------------------
alter table public.material_request_lines
  add column if not exists unit text default 'nos',
  add column if not exists converted_qty numeric(14,4) not null default 0,
  add column if not exists line_number integer;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='material_request_lines' and column_name='pending_pr_qty') then
    alter table public.material_request_lines
      add column pending_pr_qty numeric(14,4)
      generated always as (greatest(quantity - coalesce(converted_qty,0), 0)) stored;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. PURCHASE_REQUISITIONS — full redesigned header column set
-- ----------------------------------------------------------------------------
alter table public.purchase_requisitions
  add column if not exists pr_release_date date,
  add column if not exists budget_applicable boolean not null default true,
  add column if not exists budget_head_id uuid,
  add column if not exists cost_code_id uuid,
  add column if not exists cost_centre text,
  add column if not exists activity_code text,
  add column if not exists over_budget_justification text,
  add column if not exists budget_status text,
  add column if not exists contractor_applicable boolean not null default false,
  add column if not exists vendor_code text,
  add column if not exists scope_of_service text,
  add column if not exists contact_person text,
  add column if not exists contact_number text,
  add column if not exists delivery_instructions text,
  add column if not exists internal_notes text,
  add column if not exists terms_and_conditions text,
  add column if not exists prepared_by uuid references public.profiles(id),
  add column if not exists prepared_on timestamptz,
  add column if not exists subtotal_amount numeric(16,2) not null default 0,
  add column if not exists service_subtotal numeric(16,2) not null default 0,
  add column if not exists discount_amount numeric(16,2) not null default 0,
  add column if not exists tax_amount numeric(16,2) not null default 0,
  add column if not exists freight_amount numeric(16,2) not null default 0,
  add column if not exists other_charges numeric(16,2) not null default 0,
  add column if not exists contingency_amount numeric(16,2) not null default 0,
  add column if not exists status_changed_at timestamptz,
  add column if not exists assigned_to uuid references public.profiles(id),
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists revision_number integer not null default 0,
  add column if not exists revision_reason text,
  add column if not exists original_pr_id uuid,
  add column if not exists is_current_revision boolean not null default true;

-- FK for budget_head_id / cost_code_id only if those tables exist (they may not).
do $$
begin
  if to_regclass('public.budget_heads') is not null
     and not exists (select 1 from pg_constraint where conname='pr_budget_head_fk') then
    alter table public.purchase_requisitions
      add constraint pr_budget_head_fk foreign key (budget_head_id) references public.budget_heads(id) on delete set null;
  end if;
  if to_regclass('public.cost_codes') is not null
     and not exists (select 1 from pg_constraint where conname='pr_cost_code_fk') then
    alter table public.purchase_requisitions
      add constraint pr_cost_code_fk foreign key (cost_code_id) references public.cost_codes(id) on delete set null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. PURCHASE_REQUISITION_LINES — MR lineage + non-MR + estimation columns
--    (current.sql already has resource_type/item_code/tax_*/line_total/est_qty
--     etc.; these are the ones still missing)
-- ----------------------------------------------------------------------------
alter table public.purchase_requisition_lines
  add column if not exists source_mr_id uuid references public.material_requests(id) on delete set null,
  add column if not exists source_mr_number text,
  add column if not exists mr_line_number integer,
  add column if not exists approved_mr_qty numeric(14,4),
  add column if not exists prev_pr_qty numeric(14,4) not null default 0,
  add column if not exists remaining_mr_qty numeric(14,4),
  add column if not exists unit text default 'nos',
  add column if not exists required_date date,
  add column if not exists is_non_mr_item boolean not null default false,
  add column if not exists non_mr_justification text,
  add column if not exists is_modified boolean not null default false,
  add column if not exists removal_reason text,
  -- denormalised display columns written by convertMaterialRequestToPr
  add column if not exists priority text,
  add column if not exists stock_audit text,
  add column if not exists project_and_block text,
  add column if not exists work_activity text,
  add column if not exists raised_by text,
  add column if not exists submitted_at timestamptz;

create index if not exists idx_prl_source_mr on public.purchase_requisition_lines(source_mr_id);

-- ----------------------------------------------------------------------------
-- 5. PR ACTIVITY LOG (approval / audit trail)
-- ----------------------------------------------------------------------------
create table if not exists public.pr_activity_log (
  id uuid primary key default gen_random_uuid(),
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  project_id uuid,
  action text not null,
  previous_status text,
  new_status text,
  comment text,
  changed_values jsonb,
  actor_id uuid references public.profiles(id),
  actor_role text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pr_activity_pr on public.pr_activity_log(purchase_requisition_id, created_at desc);
alter table public.pr_activity_log enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pr_activity_log' and policyname='pr_activity_read') then
    create policy pr_activity_read on public.pr_activity_log for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pr_activity_log' and policyname='pr_activity_write') then
    create policy pr_activity_write on public.pr_activity_log for insert with check (auth.uid() is not null);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. VENDOR BILLS + 3-WAY MATCH (unblocks the whole procurement dashboard,
--    which SELECTs vendor_bills with an embedded three_way_matches)
-- ----------------------------------------------------------------------------
create table if not exists public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  vendor_id uuid references public.vendors(id),
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  grn_id uuid references public.goods_receipt_notes(id) on delete set null,
  budget_allocation_id uuid,
  bill_number text not null,
  bill_book_number text,
  bill_date date not null default current_date,
  subtotal_amount numeric(16,2) not null default 0,
  tax_amount numeric(16,2) not null default 0,
  total_amount numeric(16,2) not null default 0,
  duplicate_detected boolean not null default false,
  required_documents_received boolean not null default false,
  work_completion_verified boolean not null default false,
  qc_approval_verified boolean not null default false,
  payment_status text not null default 'unpaid',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.vendor_bill_lines (
  id uuid primary key default gen_random_uuid(),
  vendor_bill_id uuid not null references public.vendor_bills(id) on delete cascade,
  project_id uuid,
  item_id uuid,
  item_description text,
  quantity numeric(14,4) not null default 0,
  unit_rate numeric(16,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  line_total numeric(16,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.three_way_matches (
  id uuid primary key default gen_random_uuid(),
  vendor_bill_id uuid references public.vendor_bills(id) on delete cascade,
  project_id uuid,
  match_status text not null default 'pending',
  po_value numeric(16,2) not null default 0,
  grn_value numeric(16,2) not null default 0,
  invoice_value numeric(16,2) not null default 0,
  remarks text,
  created_at timestamptz not null default now()
);
create index if not exists idx_twm_bill on public.three_way_matches(vendor_bill_id);

do $$
declare t text;
begin
  foreach t in array array['vendor_bills','vendor_bill_lines','three_way_matches'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_rw', t);
    execute format('create policy %I on public.%I for all using (auth.uid() is not null) with check (auth.uid() is not null)', t||'_rw', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 7. RPCs the redesigned frontend calls that are NOT in the live DB
-- ----------------------------------------------------------------------------

-- 7a. Recompute an MR line's converted balance from live PR lines.
create or replace function public.recompute_mr_line_conversion(p_mr_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.material_request_lines mrl
  set converted_qty = coalesce((
    select sum(prl.quantity)
    from public.purchase_requisition_lines prl
    join public.purchase_requisitions pr on pr.id = prl.purchase_requisition_id
    where prl.material_request_line_id = p_mr_line_id
      and pr.deleted_at is null
      and pr.status::text not in ('cancelled','rejected')
  ), 0)
  where mrl.id = p_mr_line_id;
end $$;

-- 7b. Server-side MR list: search + filter + sort + paginate + count.
create or replace function public.search_material_requests(
  p_project_id uuid default null, p_status text default null, p_priority text default null,
  p_assigned_reviewer uuid default null, p_my_requests boolean default false,
  p_pending_my_approval boolean default false, p_search text default null,
  p_date_from date default null, p_date_to date default null,
  p_sort text default 'newest', p_limit integer default 15, p_offset integer default 0
) returns jsonb language sql stable as $$
  with base as (
    select mr.* from public.material_requests mr
    where mr.deleted_at is null
      and (p_project_id is null or mr.project_id = p_project_id)
      and (p_status is null or mr.status::text = p_status)
      and (p_priority is null or mr.priority::text = p_priority)
      and (p_assigned_reviewer is null or mr.reviewed_by = p_assigned_reviewer)
      and (not p_my_requests or mr.raised_by = auth.uid())
      and (not p_pending_my_approval or (mr.status::text in ('submitted','in_review') and (mr.reviewed_by = auth.uid() or mr.reviewed_by is null)))
      and (p_date_from is null or mr.created_at::date >= p_date_from)
      and (p_date_to is null or mr.created_at::date <= p_date_to)
      and (p_search is null or p_search = '' or mr.mr_number ilike '%'||p_search||'%'
           or exists (select 1 from public.material_request_lines l where l.material_request_id = mr.id and l.item_description ilike '%'||p_search||'%')
           or exists (select 1 from public.profiles pf where pf.id = mr.raised_by and pf.name ilike '%'||p_search||'%'))
  ),
  paged as (
    select b.*, row_number() over (order by
      case when p_sort='oldest' then b.created_at end asc nulls last,
      case when p_sort='updated' then b.updated_at end desc nulls last,
      case when p_sort='priority' then (case b.priority::text when 'critical' then 4 when 'high' then 3 when 'medium' then 2 when 'low' then 1 else 0 end) end desc nulls last,
      case when p_sort='status' then b.status::text end asc nulls last,
      b.created_at desc) as rn
    from base b order by rn limit greatest(p_limit,1) offset greatest(p_offset,0)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'rows', coalesce((select jsonb_agg((to_jsonb(pg) - 'rn') || jsonb_build_object(
        'material_request_lines', coalesce((select jsonb_agg(to_jsonb(l)) from public.material_request_lines l where l.material_request_id = pg.id), '[]'::jsonb),
        'profiles', (select jsonb_build_object('name', p.name, 'email', p.email) from public.profiles p where p.id = pg.raised_by),
        'projects', (select jsonb_build_object('name', pr.name) from public.projects pr where pr.id = pg.project_id),
        'project_sites', (select jsonb_build_object('name', ps.name) from public.project_sites ps where ps.id = pg.site_id),
        'reviewer', (select jsonb_build_object('name', rp.name) from public.profiles rp where rp.id = pg.reviewed_by)
      ) order by pg.rn) from paged pg), '[]'::jsonb)
  );
$$;

-- 7c. MR KPI roll-up.
create or replace function public.material_request_stats(p_project_id uuid default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status::text='submitted'),
    'underReview', count(*) filter (where status::text='in_review'),
    'clarification', count(*) filter (where status::text='draft'),
    'converted', count(*) filter (where status::text='approved'),
    'fulfilled', count(*) filter (where status::text='closed'),
    'critical', count(*) filter (where priority::text='critical' and status::text not in ('closed','rejected','cancelled')),
    'overdue', count(*) filter (where required_date < current_date and status::text not in ('closed','rejected','cancelled'))
  ) from public.material_requests where deleted_at is null and (p_project_id is null or project_id = p_project_id);
$$;

create index if not exists idx_mr_number_trgm on public.material_requests using gin (mr_number gin_trgm_ops);
create index if not exists idx_mrl_desc_trgm  on public.material_request_lines using gin (item_description gin_trgm_ops);

-- ============================================================================
-- 8. PIPELINE RPCs STILL REQUIRED (verify these exist in the live DB; if the
--    corresponding features error with PGRST202 "Could not find the function",
--    they must be implemented server-side — they contain real business logic
--    (stock movement, budget commitment, 3-way match) and are intentionally
--    NOT stubbed here:
--       submit_mobile_material_request, review_material_request_inventory,
--       issue_material_from_stock, approve_purchase_requisition,
--       approve_and_send_purchase_order, post_goods_receipt_note,
--       submit_vendor_bill_from_grn
-- ============================================================================

-- ============================================================================
-- END OF RECONCILIATION
-- ============================================================================
