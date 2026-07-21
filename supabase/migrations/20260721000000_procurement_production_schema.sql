-- ============================================================================
-- PRAMUKH GROUP ERP — PROCUREMENT MODULE · MR & PR SUPABASE SCHEMA
-- ----------------------------------------------------------------------------
-- Single, authoritative, IDEMPOTENT schema for Material Request (MR) &
-- Purchase Requisition (PR) features.
--
-- SAFE TO RE-RUN. Uses `create table if not exists`, `add column if not exists`,
-- guarded constraints/policies, and `create or replace function`.
--
-- Run in the Supabase SQL editor, or `supabase db push`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS & SHARED HELPERS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Auto-maintain updated_at on any table that has the column.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 1. CORE REFERENCE TABLES (Created BEFORE helper functions that query them)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key,
  name text,
  email text,
  role text,
  project_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.project_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 2. PROJECT ACCESS RLS HELPER FUNCTION
-- ----------------------------------------------------------------------------
create or replace function public.can_access_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    exists (
      select 1 from public.project_members
      where project_id = p_project_id and user_id = auth.uid() and coalesce(is_active, true) = true
    )
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
        and lower(coalesce(role, '')) in
            ('upper_management','pr_team','project_manager','project_director','admin','administrator','super_admin')
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. ITEM & ITEM CATEGORY MASTERS
-- ----------------------------------------------------------------------------
create table if not exists public.item_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.item_categories(id) on delete set null,
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.unit_of_measurements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.item_master (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.item_categories(id) on delete set null,
  uom_id uuid references public.unit_of_measurements(id),
  sku text unique,
  name text not null,
  description text,
  specification text,
  default_rate numeric(16,2) not null default 0,
  gst_rate numeric(6,2) not null default 0,
  min_stock_level numeric(14,4) not null default 0,
  is_stock_item boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  item_id uuid not null references public.item_master(id),
  available_qty numeric(16,4) not null default 0,
  reserved_qty numeric(16,4) not null default 0,
  consumed_qty numeric(16,4) not null default 0,
  rejected_qty numeric(16,4) not null default 0,
  stock_value numeric(18,2) not null default 0,
  average_rate numeric(16,4) not null default 0,
  last_transaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. MATERIAL REQUEST (MR) SCHEMA
-- ============================================================================
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  mr_number text not null unique,
  source text not null default 'site_engineer',
  raised_by uuid references public.profiles(id),
  title text,
  justification text,
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status text not null default 'submitted'
    check (status in ('draft','submitted','in_review','approved','rejected','closed','cancelled')),
  work_activity text,
  site_block text,
  company_name text,
  activity_code text,
  required_date date not null,
  stock_decision text check (stock_decision in ('available','shortage','partially_available')),
  clarification_text text,
  clarification_by uuid references public.profiles(id),
  clarification_at timestamptz,
  clarification_reply text,
  clarification_replied_at timestamptz,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  management_comment text,
  management_comment_by uuid references public.profiles(id),
  management_comment_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);

create table if not exists public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  material_request_id uuid not null references public.material_requests(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  item_id uuid references public.item_master(id),
  item_code text,
  item_group text,
  item_description text not null,
  specification text,
  quantity numeric(14,4) not null check (quantity > 0),
  unit text not null default 'nos',
  estimated_rate numeric(16,2) not null default 0,
  reserved_quantity numeric(14,4) not null default 0,
  issued_quantity numeric(14,4) not null default 0,
  converted_qty numeric(14,4) not null default 0,   -- running total pulled into PRs
  line_status text not null default 'pending'
    check (line_status in ('pending','approved_for_pr','fulfilled_from_stock','rejected')),
  line_rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Generated remaining-to-convert balance for MR lines.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='material_request_lines' and column_name='pending_pr_qty') then
    alter table public.material_request_lines
      add column pending_pr_qty numeric(14,4)
      generated always as (greatest(quantity - coalesce(converted_qty,0), 0)) stored;
  end if;
end $$;

-- ============================================================================
-- 5. PURCHASE REQUISITION (PR) SCHEMA
-- ============================================================================
create table if not exists public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  material_request_id uuid references public.material_requests(id) on delete set null,
  pr_number text not null unique,
  pr_date date not null default current_date,
  pr_release_date date,
  company_name text,
  department text,             -- Prepared By text / role
  prepared_by uuid references public.profiles(id),
  pr_type text not null default 'material'
    check (pr_type in ('material','service','labour_contract','equipment_hire','mixed')),
  priority text not null default 'normal' check (priority in ('normal','urgent','critical')),
  required_date date,
  budget_applicable boolean not null default true,
  contractor_name text,
  contract_reference text,    -- Work Order No.
  activity_name text,
  activity_code text,
  wbs_code text,
  delivery_address text,
  site_contact_person text,
  site_contact_number text,
  general_remarks text,
  total_amount numeric(16,2) not null default 0,
  estimated_cost numeric(16,2) not null default 0,
  status text not null default 'draft'
    check (status in (
      'draft','under_verification','awaiting_assignment','pending_approval',
      'approved','pending_procurement','closed','submitted','in_review','assigned','rejected','cancelled','on_hold'
    )),
  assigned_to uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  deleted_at timestamptz
);

create table if not exists public.purchase_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  line_number integer,
  -- Source MR lineage
  material_request_line_id uuid references public.material_request_lines(id) on delete set null,
  source_mr_id uuid references public.material_requests(id) on delete set null,
  source_mr_number text,
  mr_line_number integer,
  -- Item & Specs
  resource_type text not null default 'material',
  item_id uuid references public.item_master(id),
  item_code text,
  item_group text,
  item_description text not null,
  specification text,
  unit text not null default 'nos',
  required_date date,
  preferred_brand text,
  suggested_vendor text,
  delivery_location text,
  remarks text,
  -- Quantities & Pricing
  approved_mr_qty numeric(14,4),
  prev_pr_qty numeric(14,4) not null default 0,
  remaining_mr_qty numeric(14,4),
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  estimated_rate numeric(16,2) not null default 0,
  tax_rate numeric(6,2) not null default 0,
  tax_amount numeric(16,2) not null default 0,
  line_total numeric(16,2) not null default 0,
  -- Rich 25-column Display metrics
  est_qty numeric(14,4),
  ind_qty numeric(14,4),
  iss_qty numeric(14,4),
  extra_rec_qty numeric(14,4),
  extra_adj_qty numeric(14,4),
  pr_bal_qty numeric(14,4),
  lead_period_days integer,
  lead_period_date date,
  project_stock numeric(14,4),
  other_project_stock numeric(14,4),
  relation_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);

-- Audit log for PR transitions
create table if not exists public.pr_activity_log (
  id uuid primary key default gen_random_uuid(),
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  action text not null,
  previous_status text,
  new_status text,
  comment text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Attachments table for MR and PR
create table if not exists public.entity_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  entity_table text not null, -- 'material_requests' or 'purchase_requisitions'
  entity_id uuid not null,
  document_type text,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 6. INDEXES FOR FAST QUERYING
-- ============================================================================
create index if not exists idx_mr_project_status   on public.material_requests(project_id, status);
create index if not exists idx_mrl_mr_id            on public.material_request_lines(material_request_id);
create index if not exists idx_pr_project_status    on public.purchase_requisitions(project_id, status);
create index if not exists idx_pr_material_request  on public.purchase_requisitions(material_request_id);
create index if not exists idx_prl_pr_id            on public.purchase_requisition_lines(purchase_requisition_id);
create index if not exists idx_prl_source_mr        on public.purchase_requisition_lines(source_mr_id);
create index if not exists idx_entity_attachments_entity on public.entity_attachments(entity_table, entity_id);

-- ============================================================================
-- 7. AUTOMATION TRIGGERS
-- ============================================================================

-- Function to recompute MR line conversion when PR lines are inserted/updated.
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
      and pr.status not in ('cancelled','rejected')
  ), 0)
  where mrl.id = p_mr_line_id;
end $$;

-- Keep PR estimated_cost synced with total_amount
create or replace function public.sync_pr_estimated_cost()
returns trigger language plpgsql as $$
begin
  new.estimated_cost := coalesce(new.total_amount, new.estimated_cost, 0);
  return new;
end $$;
drop trigger if exists trg_pr_sync_estimated_cost on public.purchase_requisitions;
create trigger trg_pr_sync_estimated_cost
  before insert or update on public.purchase_requisitions
  for each row execute function public.sync_pr_estimated_cost();

-- Updated_at triggers
do $$
declare t text;
  tables text[] := array[
    'item_categories','item_master','stock_balances',
    'material_requests','material_request_lines',
    'purchase_requisitions','purchase_requisition_lines','entity_attachments'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
      execute format('create trigger trg_%s_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- ============================================================================
do $$
declare t text;
  scoped text[] := array[
    'material_requests','purchase_requisitions','pr_activity_log','stock_balances','entity_attachments'
  ];
begin
  foreach t in array scoped loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_read', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_write', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_update', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_delete', t);
    execute format('create policy %I on public.%I for select using (public.can_access_project(project_id))', 'p_'||t||'_read', t);
    execute format('create policy %I on public.%I for insert with check (public.can_access_project(project_id))', 'p_'||t||'_write', t);
    execute format('create policy %I on public.%I for update using (public.can_access_project(project_id)) with check (public.can_access_project(project_id))', 'p_'||t||'_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_access_project(project_id))', 'p_'||t||'_delete', t);
  end loop;
end $$;

do $$
declare t text;
  child text[] := array['material_request_lines','purchase_requisition_lines'];
begin
  foreach t in array child loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_all', t);
    execute format('create policy %I on public.%I for all using (project_id is null or public.can_access_project(project_id)) with check (project_id is null or public.can_access_project(project_id))', 'p_'||t||'_all', t);
  end loop;
end $$;

-- Master tables read policies
do $$
declare t text;
  masters text[] := array['profiles','projects','project_sites','project_members','item_categories','unit_of_measurements','item_master'];
begin
  foreach t in array masters loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_read', t);
    execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', 'p_'||t||'_read', t);
    execute format('drop policy if exists %I on public.%I', 'p_'||t||'_write', t);
    execute format('create policy %I on public.%I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', 'p_'||t||'_write', t);
  end loop;
end $$;
