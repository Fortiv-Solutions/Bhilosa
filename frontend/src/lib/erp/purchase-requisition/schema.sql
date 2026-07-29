-- ============================================================================
-- PRODUCTION PURCHASE REQUISITION (PR) SCHEMA MIGRATION FOR SUPABASE
-- Module: Supply Chain Management (SCM) - Purchase Requisition Subsystem
-- ----------------------------------------------------------------------------
-- This migration is IDEMPOTENT and SAFE to run multiple times.
-- It extends the existing `purchase_requisitions` and `purchase_requisition_lines`
-- tables, adds MR->PR partial-conversion tracking on `material_request_lines`,
-- and introduces a first-class PR audit trail + revision support.
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) BEFORE using
-- the redesigned Purchase Requisition workspace. It assumes these tables already
-- exist in your project: purchase_requisitions, purchase_requisition_lines,
-- material_requests, material_request_lines, projects, project_sites, profiles,
-- budget_heads, cost_codes, vendors.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PURCHASE_REQUISITIONS — new columns (Sections A / B / C / delivery / totals)
-- ----------------------------------------------------------------------------
alter table public.purchase_requisitions
  -- Section A: Identification
  add column if not exists company_name       text,
  add column if not exists pr_type            text    not null default 'material',
  add column if not exists priority           text    not null default 'normal',
  add column if not exists pr_release_date    date,
  -- Section B: Budget & Activity
  add column if not exists budget_applicable  boolean not null default true,
  add column if not exists budget_head_id     uuid    references public.budget_heads(id) on delete set null,
  add column if not exists cost_code_id       uuid    references public.cost_codes(id)   on delete set null,
  add column if not exists cost_centre        text,
  add column if not exists activity_name      text,
  add column if not exists activity_code      text,
  add column if not exists wbs_code           text,
  add column if not exists over_budget_justification text,
  add column if not exists budget_status      text,
  -- Section C: Contractor / Service Provider
  add column if not exists contractor_applicable boolean not null default false,
  add column if not exists contractor_name    text,
  add column if not exists vendor_code        text,
  add column if not exists contract_reference text,
  add column if not exists scope_of_service   text,
  add column if not exists contact_person     text,
  add column if not exists contact_number     text,
  -- Delivery & additional information
  add column if not exists delivery_address     text,
  add column if not exists site_contact_person  text,
  add column if not exists site_contact_number  text,
  add column if not exists delivery_instructions text,
  add column if not exists general_remarks    text,
  add column if not exists internal_notes     text,
  add column if not exists terms_and_conditions text,
  add column if not exists department         text,
  add column if not exists prepared_by        uuid references public.profiles(id) on delete set null,
  add column if not exists prepared_on        timestamptz,
  -- Cost summary (header level)
  add column if not exists subtotal_amount    numeric(16, 2) not null default 0,
  add column if not exists service_subtotal   numeric(16, 2) not null default 0,
  add column if not exists discount_amount    numeric(16, 2) not null default 0,
  add column if not exists tax_amount         numeric(16, 2) not null default 0,
  add column if not exists freight_amount     numeric(16, 2) not null default 0,
  add column if not exists other_charges      numeric(16, 2) not null default 0,
  add column if not exists contingency_amount numeric(16, 2) not null default 0,
  add column if not exists total_amount       numeric(16, 2) not null default 0,
  -- Revision / versioning
  add column if not exists revision_number    integer not null default 0,
  add column if not exists revision_reason    text,
  add column if not exists original_pr_id     uuid references public.purchase_requisitions(id) on delete set null,
  add column if not exists is_current_revision boolean not null default true,
  -- Workflow bookkeeping
  add column if not exists status_changed_at  timestamptz,
  add column if not exists assigned_to        uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by        uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at        timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists deleted_at         timestamptz;

-- PR type / priority guards
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_requisitions_pr_type_check') then
    alter table public.purchase_requisitions
      add constraint purchase_requisitions_pr_type_check
      check (pr_type in ('material', 'service', 'labour_contract', 'equipment_hire', 'mixed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_requisitions_priority_check') then
    alter table public.purchase_requisitions
      add constraint purchase_requisitions_priority_check
      check (priority in ('normal', 'urgent', 'critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_requisitions_budget_status_check') then
    alter table public.purchase_requisitions
      add constraint purchase_requisitions_budget_status_check
      check (budget_status is null or budget_status in ('within_budget', 'near_limit', 'over_budget', 'not_applicable'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. PURCHASE_REQUISITIONS — expand the workflow status CHECK constraint
-- Dynamically drops ANY existing check constraint that references the status
-- column, then installs the full production workflow set.
-- ----------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'purchase_requisitions'
      and nsp.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.purchase_requisitions drop constraint %I', c.conname);
  end loop;

  alter table public.purchase_requisitions
    add constraint purchase_requisitions_status_check
    check (status in (
      'draft',
      'under_verification',
      'awaiting_assignment',
      'pending_approval',
      'approved',
      'pending_procurement',
      'closed',
      -- exception / legacy states
      'submitted',
      'in_review',
      'assigned',
      'returned_to_draft',
      'revision_required',
      'rejected',
      'cancelled',
      'on_hold',
      'rfq_sent',
      'vendor_selected',
      'po_issued'
    ));
end $$;

-- ----------------------------------------------------------------------------
-- 3. PURCHASE_REQUISITION_LINES — source-MR lineage + estimation columns
-- ----------------------------------------------------------------------------
alter table public.purchase_requisition_lines
  add column if not exists line_number        integer,
  add column if not exists source_mr_id       uuid references public.material_requests(id) on delete set null,
  add column if not exists source_mr_number   text,
  add column if not exists mr_line_number     integer,
  add column if not exists resource_type      text,
  add column if not exists item_code          text,
  add column if not exists item_group         text,
  add column if not exists specification      text,
  add column if not exists approved_mr_qty    numeric(14, 4),
  add column if not exists prev_pr_qty        numeric(14, 4) not null default 0,
  add column if not exists remaining_mr_qty   numeric(14, 4),
  add column if not exists unit               text default 'nos',
  add column if not exists tax_rate           numeric(6, 2)  not null default 0,
  add column if not exists tax_amount         numeric(16, 2) not null default 0,
  add column if not exists line_total         numeric(16, 2) not null default 0,
  add column if not exists required_date      date,
  add column if not exists preferred_brand    text,
  add column if not exists suggested_vendor   text,
  add column if not exists delivery_location  text,
  add column if not exists remarks            text,
  add column if not exists is_non_mr_item     boolean not null default false,
  add column if not exists non_mr_justification text,
  add column if not exists is_modified        boolean not null default false,
  add column if not exists removal_reason     text;

-- material_request_line_id back-reference (already used by the app; ensure it exists)
alter table public.purchase_requisition_lines
  add column if not exists material_request_line_id uuid references public.material_request_lines(id) on delete set null;

create index if not exists idx_prl_source_mr on public.purchase_requisition_lines(source_mr_id);
create index if not exists idx_prl_mr_line on public.purchase_requisition_lines(material_request_line_id);

-- ----------------------------------------------------------------------------
-- 4. MATERIAL_REQUEST_LINES — persisted MR->PR conversion tracking
-- `converted_qty` is the running total already pulled into PRs. `pending_pr_qty`
-- is a generated remaining-to-convert balance.
-- ----------------------------------------------------------------------------
alter table public.material_request_lines
  add column if not exists converted_qty numeric(14, 4) not null default 0;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'material_request_lines'
      and column_name = 'pending_pr_qty'
  ) then
    alter table public.material_request_lines
      add column pending_pr_qty numeric(14, 4)
      generated always as (greatest(quantity - coalesce(converted_qty, 0), 0)) stored;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. PR AUDIT TRAIL — append-only activity/history log
-- ----------------------------------------------------------------------------
create table if not exists public.pr_activity_log (
  id uuid primary key default gen_random_uuid(),
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
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

-- ----------------------------------------------------------------------------
-- 6. HELPER RPC — recompute a material request line's converted balance from
-- all non-cancelled PR lines that reference it. Called after PR create/save.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_mr_line_conversion(p_mr_line_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update public.material_request_lines mrl
  set converted_qty = coalesce((
    select sum(prl.quantity)
    from public.purchase_requisition_lines prl
    join public.purchase_requisitions pr on pr.id = prl.purchase_requisition_id
    where prl.material_request_line_id = p_mr_line_id
      and coalesce(pr.deleted_at, null) is null
      and pr.status not in ('cancelled', 'rejected')
  ), 0)
  where mrl.id = p_mr_line_id;
end $$;

-- ----------------------------------------------------------------------------
-- 7. INDEXES for PR list / workspace query speed
-- ----------------------------------------------------------------------------
create index if not exists idx_pr_project_status on public.purchase_requisitions(project_id, status);
create index if not exists idx_pr_material_request on public.purchase_requisitions(material_request_id);
create index if not exists idx_pr_current_revision on public.purchase_requisitions(is_current_revision) where is_current_revision = true;

-- ----------------------------------------------------------------------------
-- 8. RLS for the new audit table (mirror the MR module conventions)
-- ----------------------------------------------------------------------------
alter table public.pr_activity_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pr_activity_log' and policyname = 'Read PR activity of assigned projects'
  ) then
    create policy "Read PR activity of assigned projects"
      on public.pr_activity_log for select
      using (
        project_id in (
          select project_id from public.project_members where user_id = auth.uid() and is_active = true
        )
        or exists (
          select 1 from public.profiles where id = auth.uid() and role in ('upper_management', 'pr_team', 'project_manager')
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pr_activity_log' and policyname = 'Authenticated users can append PR activity'
  ) then
    create policy "Authenticated users can append PR activity"
      on public.pr_activity_log for insert
      with check (auth.uid() is not null);
  end if;
end $$;

-- ============================================================================
-- END OF PURCHASE REQUISITION MIGRATION
-- ============================================================================
