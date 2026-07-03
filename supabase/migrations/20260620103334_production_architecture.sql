-- Production Supabase architecture for Pramukh construction project management.
-- Safe additive migration: preserves existing tables and adds normalized ERP modules.
-- Execute in Supabase SQL Editor after testing in a staging project.

create extension if not exists pgcrypto;

create schema if not exists app_private;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erp_priority') then
    create type public.erp_priority as enum ('low', 'medium', 'high', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_workflow_status') then
    create type public.erp_workflow_status as enum ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled', 'completed', 'pending', 'blocked', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_activity_status') then
    create type public.erp_activity_status as enum ('planned', 'ready', 'in_progress', 'on_hold', 'completed', 'delayed', 'cancelled', 'deleted');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_delay_status') then
    create type public.erp_delay_status as enum ('open', 'under_review', 'resolved', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_procurement_status') then
    create type public.erp_procurement_status as enum ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'assigned', 'rfq_sent', 'vendor_selected', 'po_issued', 'delivered', 'closed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_po_status') then
    create type public.erp_po_status as enum ('draft', 'pending_approval', 'approved', 'sent_to_vendor', 'acknowledged', 'partially_delivered', 'delivered', 'closed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_delivery_status') then
    create type public.erp_delivery_status as enum ('planned', 'dispatched', 'in_transit', 'delayed', 'reached_site', 'received', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_grn_status') then
    create type public.erp_grn_status as enum ('draft', 'received', 'inspection_pending', 'accepted', 'partially_accepted', 'rejected', 'posted', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_qc_status') then
    create type public.erp_qc_status as enum ('pending', 'in_progress', 'passed', 'failed', 'approved', 'rejected', 'rework_required', 'waived');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_billing_status') then
    create type public.erp_billing_status as enum ('draft', 'submitted', 'under_verification', 'verified', 'approved', 'rejected', 'blocked', 'paid', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_payment_status') then
    create type public.erp_payment_status as enum ('pending', 'approved', 'paid', 'failed', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_inventory_txn_type') then
    create type public.erp_inventory_txn_type as enum ('opening', 'inward', 'outward', 'transfer_in', 'transfer_out', 'reservation', 'release', 'adjustment', 'consumption', 'rejection');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_budget_txn_type') then
    create type public.erp_budget_txn_type as enum ('allocation', 'commitment', 'release', 'actual', 'adjustment');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_notification_status') then
    create type public.erp_notification_status as enum ('queued', 'sent', 'read', 'failed', 'dismissed');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_document_status') then
    create type public.erp_document_status as enum ('draft', 'pending', 'approved', 'rejected', 'superseded', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_report_status') then
    create type public.erp_report_status as enum ('queued', 'running', 'completed', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_equipment_status') then
    create type public.erp_equipment_status as enum ('active', 'idle', 'maintenance', 'retired');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_message_direction') then
    create type public.erp_message_direction as enum ('inbound', 'outbound');
  end if;
  if not exists (select 1 from pg_type where typname = 'erp_source_system') then
    create type public.erp_source_system as enum ('dashboard', 'android', 'whatsapp', 'n8n', 'system');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role::text in (
        'super_admin', 'project_director', 'project_manager',
        'SUPER_ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER',
        'admin', 'administrator'
      )
  );
$$;

create or replace function app_private.is_project_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = (select auth.uid())
      and pm.is_active = true
  );
$$;

create or replace function app_private.can_access_project(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and ((select app_private.is_admin()) or (select app_private.is_project_member(target_project)));
$$;

create or replace function app_private.can_edit_project(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and ((select app_private.is_admin()) or (select app_private.is_project_member(target_project)));
$$;

-- ---------------------------------------------------------------------------
-- Core organization, RBAC, compatibility user model
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  gst_number text,
  pan_number text,
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_role text not null default 'member',
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (organization_id, user_id)
);

create table if not exists public.rbac_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table if not exists public.rbac_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.rbac_role_permissions (
  role_id uuid not null references public.rbac_roles(id) on delete cascade,
  permission_id uuid not null references public.rbac_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (role_id, permission_id)
);

create table if not exists public.rbac_user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.rbac_roles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- Compatibility table for current communication code that queries public.users.
create table if not exists public.users (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  email text,
  role text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists designation text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists deleted_at timestamptz;

alter table public.projects add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.projects add column if not exists client_name text;
alter table public.projects add column if not exists location text;
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists project_value numeric(16,2);
alter table public.projects add column if not exists budget_amount numeric(16,2) not null default 0;
alter table public.projects add column if not exists actual_spend_amount numeric(16,2) not null default 0;
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists target_end_date date;
alter table public.projects add column if not exists completed_at timestamptz;
alter table public.projects add column if not exists current_phase text;
alter table public.projects add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.projects add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Audit, activity, attachments, workflow, notifications
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  source public.erp_source_system not null default 'dashboard',
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.entity_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  document_type text,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  document_hash text,
  is_required boolean not null default false,
  status public.erp_document_status not null default 'pending',
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  entity_table text,
  entity_id uuid,
  title text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  module text not null,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table if not exists public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  name text not null,
  required_role_code text,
  required_permission_code text,
  is_finance_step boolean not null default false,
  min_amount numeric(16,2),
  max_amount numeric(16,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (workflow_id, step_order)
);

create table if not exists public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  entity_table text not null,
  entity_id uuid not null,
  current_step_id uuid references public.workflow_steps(id) on delete set null,
  status public.erp_workflow_status not null default 'pending',
  submitted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.workflow_actions (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  workflow_step_id uuid references public.workflow_steps(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action public.erp_workflow_status not null,
  remarks text,
  acted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  workflow_instance_id uuid references public.workflow_instances(id) on delete set null,
  entity_table text not null,
  entity_id uuid not null,
  requested_to uuid references public.profiles(id) on delete set null,
  requested_role text,
  status public.erp_workflow_status not null default 'pending',
  due_at timestamptz,
  decided_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null,
  priority public.erp_priority not null default 'medium',
  status public.erp_notification_status not null default 'queued',
  entity_table text,
  entity_id uuid,
  action_url text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_type)
);

create table if not exists public.system_config (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  config_key text not null,
  config_value jsonb not null,
  description text,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (organization_id, config_key)
);

-- ---------------------------------------------------------------------------
-- Project baseline, sites, documents, budgets, BOQ
-- ---------------------------------------------------------------------------
create table if not exists public.project_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  site_manager_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, code)
);

create table if not exists public.project_phases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  sequence_no integer not null check (sequence_no > 0),
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  status public.erp_activity_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, sequence_no)
);

create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  document_no text,
  name text not null,
  category text not null,
  status public.erp_document_status not null default 'pending',
  current_version text not null default '1.0.0',
  storage_bucket text,
  storage_path text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.project_documents(id) on delete cascade,
  version text not null,
  storage_bucket text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  change_notes text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version)
);

create table if not exists public.cost_codes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.cost_codes(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, code)
);

create table if not exists public.budget_heads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_code_id uuid references public.cost_codes(id) on delete set null,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, code)
);

create table if not exists public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  budget_head_id uuid not null references public.budget_heads(id) on delete restrict,
  activity_id uuid,
  vendor_id uuid,
  allocation_name text not null,
  allocated_amount numeric(16,2) not null default 0 check (allocated_amount >= 0),
  committed_amount numeric(16,2) not null default 0 check (committed_amount >= 0),
  spent_amount numeric(16,2) not null default 0 check (spent_amount >= 0),
  warning_threshold_percent numeric(5,2) not null default 80 check (warning_threshold_percent >= 0 and warning_threshold_percent <= 100),
  hard_limit_percent numeric(5,2) not null default 100 check (hard_limit_percent >= 0),
  status public.erp_workflow_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.budget_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_allocation_id uuid not null references public.budget_allocations(id) on delete cascade,
  transaction_type public.erp_budget_txn_type not null,
  source_table text,
  source_id uuid,
  amount numeric(16,2) not null check (amount >= 0),
  description text,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.budget_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  budget_allocation_id uuid references public.budget_allocations(id) on delete cascade,
  alert_type text not null,
  threshold_percent numeric(5,2),
  actual_percent numeric(5,2),
  message text not null,
  status public.erp_workflow_status not null default 'pending',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_code_id uuid references public.cost_codes(id) on delete set null,
  code text not null,
  description text not null,
  unit text not null,
  rate numeric(16,4) not null check (rate >= 0),
  estimated_qty numeric(16,4) not null default 0 check (estimated_qty >= 0),
  consumed_qty numeric(16,4) not null default 0 check (consumed_qty >= 0),
  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, code)
);

-- ---------------------------------------------------------------------------
-- Item, vendor, inventory master data
-- ---------------------------------------------------------------------------
create table if not exists public.unit_of_measurements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.item_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.item_categories(id) on delete set null,
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.item_master (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.item_categories(id) on delete set null,
  uom_id uuid references public.unit_of_measurements(id) on delete restrict,
  sku text unique,
  name text not null,
  description text,
  specification text,
  default_rate numeric(16,4) not null default 0 check (default_rate >= 0),
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0),
  min_stock_level numeric(16,4) not null default 0 check (min_stock_level >= 0),
  is_stock_item boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  vendor_code text unique,
  legal_name text not null,
  display_name text,
  gst_number text,
  pan_number text,
  email text,
  phone text,
  address text,
  compliance_status public.erp_workflow_status not null default 'pending',
  rating numeric(5,2) not null default 0 check (rating >= 0 and rating <= 100),
  duplicate_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  designation text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.vendor_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  document_type text not null,
  document_no text,
  storage_bucket text,
  storage_path text,
  status public.erp_document_status not null default 'pending',
  valid_from date,
  valid_until date,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.vendor_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_category_map (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  category_id uuid not null references public.vendor_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (vendor_id, category_id)
);

create table if not exists public.vendor_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  source_table text,
  source_id uuid,
  delivery_score numeric(5,2) not null default 0 check (delivery_score >= 0 and delivery_score <= 100),
  quality_score numeric(5,2) not null default 0 check (quality_score >= 0 and quality_score <= 100),
  price_score numeric(5,2) not null default 0 check (price_score >= 0 and price_score <= 100),
  response_score numeric(5,2) not null default 0 check (response_score >= 0 and response_score <= 100),
  overall_score numeric(5,2) not null default 0 check (overall_score >= 0 and overall_score <= 100),
  remarks text,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete cascade,
  code text not null,
  name text not null,
  location_type text not null default 'store',
  manager_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, code)
);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete cascade,
  location_id uuid references public.inventory_locations(id) on delete cascade,
  item_id uuid not null references public.item_master(id) on delete restrict,
  available_qty numeric(16,4) not null default 0 check (available_qty >= 0),
  reserved_qty numeric(16,4) not null default 0 check (reserved_qty >= 0),
  consumed_qty numeric(16,4) not null default 0 check (consumed_qty >= 0),
  rejected_qty numeric(16,4) not null default 0 check (rejected_qty >= 0),
  average_rate numeric(16,4) not null default 0 check (average_rate >= 0),
  stock_value numeric(16,2) not null default 0 check (stock_value >= 0),
  reorder_level numeric(16,4) not null default 0 check (reorder_level >= 0),
  last_transaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (project_id, site_id, location_id, item_id)
);

create table if not exists public.stock_ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  item_id uuid not null references public.item_master(id) on delete restrict,
  transaction_type public.erp_inventory_txn_type not null,
  quantity numeric(16,4) not null check (quantity >= 0),
  rate numeric(16,4) not null default 0 check (rate >= 0),
  amount numeric(16,2) not null default 0 check (amount >= 0),
  source_table text,
  source_id uuid,
  source_line_id uuid,
  reference_no text,
  transaction_date date not null default current_date,
  remarks text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

-- Compatibility additions for current material ledger.
alter table public.materials add column if not exists item_master_id uuid references public.item_master(id) on delete set null;
alter table public.materials add column if not exists site_id uuid references public.project_sites(id) on delete set null;
alter table public.materials add column if not exists location_id uuid references public.inventory_locations(id) on delete set null;
alter table public.materials add column if not exists reserved_quantity numeric not null default 0;
alter table public.materials add column if not exists consumed_quantity numeric not null default 0;
alter table public.materials add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.materials add column if not exists updated_by uuid references public.profiles(id) on delete set null;
alter table public.materials add column if not exists deleted_at timestamptz;
alter table public.material_transactions add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.material_transactions add column if not exists site_id uuid references public.project_sites(id) on delete set null;
alter table public.material_transactions add column if not exists location_id uuid references public.inventory_locations(id) on delete set null;
alter table public.material_transactions add column if not exists activity_id uuid;
alter table public.material_transactions add column if not exists grn_id uuid;
alter table public.material_transactions add column if not exists issue_slip_id uuid;
alter table public.material_transactions add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.material_transactions add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Execution, DPR, delays, demand forecast
-- ---------------------------------------------------------------------------
create table if not exists public.construction_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  phase_id uuid references public.project_phases(id) on delete set null,
  boq_item_id uuid references public.boq_items(id) on delete set null,
  cost_code_id uuid references public.cost_codes(id) on delete set null,
  parent_activity_id uuid references public.construction_activities(id) on delete set null,
  activity_code text,
  title text not null,
  description text,
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  planned_qty numeric(16,4) not null default 0 check (planned_qty >= 0),
  completed_qty numeric(16,4) not null default 0 check (completed_qty >= 0),
  unit text,
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  priority public.erp_priority not null default 'medium',
  status public.erp_activity_status not null default 'planned',
  assigned_to uuid references public.profiles(id) on delete set null,
  is_critical_path boolean not null default false,
  billing_allowed boolean not null default false,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, activity_code)
);

create table if not exists public.activity_dependencies (
  activity_id uuid not null references public.construction_activities(id) on delete cascade,
  depends_on_activity_id uuid not null references public.construction_activities(id) on delete cascade,
  dependency_type text not null default 'finish_to_start',
  lag_days integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (activity_id, depends_on_activity_id),
  check (activity_id <> depends_on_activity_id)
);

create table if not exists public.activity_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.construction_activities(id) on delete cascade,
  update_date date not null default current_date,
  completed_qty numeric(16,4) not null default 0 check (completed_qty >= 0),
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  work_completed text,
  pending_work text,
  required_material text,
  labour_requirement text,
  site_issue text,
  engineer_remarks text,
  status public.erp_activity_status not null default 'in_progress',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.daily_progress_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  report_no text not null,
  report_date date not null default current_date,
  weather text,
  activities_planned text,
  activities_completed text,
  pending_activities text,
  delays text,
  delay_reason text,
  site_limitations text,
  engineer_remarks text,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  status public.erp_workflow_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, report_no),
  unique (project_id, site_id, report_date)
);

create table if not exists public.dpr_activity_lines (
  id uuid primary key default gen_random_uuid(),
  dpr_id uuid not null references public.daily_progress_reports(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.construction_activities(id) on delete set null,
  planned_work text,
  completed_work text,
  pending_work text,
  work_done_qty numeric(16,4) not null default 0 check (work_done_qty >= 0),
  delay_minutes integer not null default 0 check (delay_minutes >= 0),
  delay_reason text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.delay_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  dpr_id uuid references public.daily_progress_reports(id) on delete set null,
  planned_date date,
  actual_date date,
  delay_days integer not null default 0 check (delay_days >= 0),
  reason_code text not null,
  reason_details text,
  responsible_team text,
  responsible_user_id uuid references public.profiles(id) on delete set null,
  impact_on_timeline text,
  corrective_action text,
  status public.erp_delay_status not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.activity_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid not null references public.construction_activities(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  reason text not null,
  previous_data jsonb not null,
  status public.erp_workflow_status not null default 'pending',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  item_id uuid references public.item_master(id) on delete restrict,
  forecast_no text not null,
  expected_quantity numeric(16,4) not null check (expected_quantity > 0),
  current_stock numeric(16,4) not null default 0 check (current_stock >= 0),
  required_stock numeric(16,4) not null default 0 check (required_stock >= 0),
  expected_requirement_date date not null,
  estimated_rate numeric(16,4) not null default 0 check (estimated_rate >= 0),
  vendor_preference_id uuid references public.vendors(id) on delete set null,
  priority public.erp_priority not null default 'medium',
  status public.erp_workflow_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, forecast_no)
);

-- Compatibility checklist tables used by the current project detail page.
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.construction_activities(id) on delete set null,
  title text not null,
  status public.erp_qc_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Procurement, PO, GRN
-- ---------------------------------------------------------------------------
create table if not exists public.material_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  forecast_id uuid references public.demand_forecasts(id) on delete set null,
  mr_number text not null,
  source text not null default 'onsite_requirement',
  justification text,
  required_date date not null,
  priority public.erp_priority not null default 'medium',
  stock_decision text,
  status public.erp_procurement_status not null default 'draft',
  raised_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, mr_number)
);

create table if not exists public.material_request_lines (
  id uuid primary key default gen_random_uuid(),
  material_request_id uuid not null references public.material_requests(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete restrict,
  item_description text not null,
  quantity numeric(16,4) not null check (quantity > 0),
  uom_id uuid references public.unit_of_measurements(id) on delete restrict,
  estimated_rate numeric(16,4) not null default 0 check (estimated_rate >= 0),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  material_request_id uuid references public.material_requests(id) on delete set null,
  budget_allocation_id uuid references public.budget_allocations(id) on delete set null,
  pr_number text not null,
  title text not null,
  estimated_cost numeric(16,2) not null default 0 check (estimated_cost >= 0),
  finance_required boolean not null default false,
  status public.erp_procurement_status not null default 'draft',
  current_approval_stage text,
  requested_date date not null default current_date,
  required_date date,
  assigned_team_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, pr_number)
);

create table if not exists public.purchase_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  material_request_line_id uuid references public.material_request_lines(id) on delete set null,
  item_id uuid references public.item_master(id) on delete restrict,
  item_description text not null,
  quantity numeric(16,4) not null check (quantity > 0),
  uom_id uuid references public.unit_of_measurements(id) on delete restrict,
  estimated_rate numeric(16,4) not null default 0 check (estimated_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.purchase_requisition_assignments (
  id uuid primary key default gen_random_uuid(),
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assigned_to uuid not null references public.profiles(id) on delete cascade,
  assignment_role text not null default 'processor',
  status public.erp_workflow_status not null default 'pending',
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  rfq_number text not null,
  title text not null,
  issue_date date not null default current_date,
  due_date date,
  status public.erp_procurement_status not null default 'draft',
  terms text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, rfq_number)
);

create table if not exists public.rfq_vendors (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  sent_at timestamptz,
  response_status public.erp_workflow_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (rfq_id, vendor_id)
);

create table if not exists public.vendor_quotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  quotation_number text,
  quotation_date date not null default current_date,
  subtotal_amount numeric(16,2) not null default 0 check (subtotal_amount >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  delivery_terms text,
  payment_terms text,
  gst_details text,
  status public.erp_workflow_status not null default 'submitted',
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.vendor_quotations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete restrict,
  item_description text not null,
  quantity numeric(16,4) not null check (quantity > 0),
  uom_id uuid references public.unit_of_measurements(id) on delete restrict,
  unit_rate numeric(16,4) not null check (unit_rate >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0),
  line_total numeric(16,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.quotation_scores (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.vendor_quotations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  price_score numeric(5,2) not null default 0 check (price_score >= 0 and price_score <= 100),
  quality_score numeric(5,2) not null default 0 check (quality_score >= 0 and quality_score <= 100),
  delivery_score numeric(5,2) not null default 0 check (delivery_score >= 0 and delivery_score <= 100),
  performance_score numeric(5,2) not null default 0 check (performance_score >= 0 and performance_score <= 100),
  weighted_score numeric(5,2) not null default 0 check (weighted_score >= 0 and weighted_score <= 100),
  rank integer check (rank is null or rank > 0),
  scoring_weights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (quotation_id)
);

create table if not exists public.vendor_selections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  purchase_requisition_id uuid not null references public.purchase_requisitions(id) on delete cascade,
  rfq_id uuid references public.rfqs(id) on delete set null,
  selected_quotation_id uuid not null references public.vendor_quotations(id) on delete restrict,
  selected_vendor_id uuid not null references public.vendors(id) on delete restrict,
  final_amount numeric(16,2) not null default 0 check (final_amount >= 0),
  reason_for_selection text,
  status public.erp_workflow_status not null default 'pending',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  purchase_requisition_id uuid references public.purchase_requisitions(id) on delete set null,
  vendor_selection_id uuid references public.vendor_selections(id) on delete set null,
  budget_allocation_id uuid references public.budget_allocations(id) on delete set null,
  po_number text not null,
  po_date date not null default current_date,
  delivery_location text,
  delivery_date date,
  payment_terms text,
  terms_and_conditions text,
  subtotal_amount numeric(16,2) not null default 0 check (subtotal_amount >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  template_code text,
  pdf_storage_path text,
  status public.erp_po_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, po_number)
);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete restrict,
  item_description text not null,
  quantity numeric(16,4) not null check (quantity > 0),
  uom_id uuid references public.unit_of_measurements(id) on delete restrict,
  unit_rate numeric(16,4) not null check (unit_rate >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0),
  line_total numeric(16,2) not null check (line_total >= 0),
  received_qty numeric(16,4) not null default 0 check (received_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.delivery_trackings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  dispatch_date date,
  expected_arrival_date date,
  actual_arrival_date date,
  transit_status public.erp_delivery_status not null default 'planned',
  carrier_name text,
  tracking_reference text,
  alert_message text,
  documents jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.goods_receipt_notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete restrict,
  grn_number text not null,
  receipt_date date not null default current_date,
  received_by uuid references public.profiles(id) on delete set null,
  quantity_verification text,
  physical_inspection text,
  damage_check text,
  quality_decision public.erp_qc_status not null default 'pending',
  status public.erp_grn_status not null default 'draft',
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, grn_number)
);

create table if not exists public.goods_receipt_note_lines (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.goods_receipt_notes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  purchase_order_line_id uuid references public.purchase_order_lines(id) on delete set null,
  item_id uuid not null references public.item_master(id) on delete restrict,
  received_qty numeric(16,4) not null default 0 check (received_qty >= 0),
  accepted_qty numeric(16,4) not null default 0 check (accepted_qty >= 0),
  rejected_qty numeric(16,4) not null default 0 check (rejected_qty >= 0),
  unit_rate numeric(16,4) not null default 0 check (unit_rate >= 0),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  check (accepted_qty + rejected_qty <= received_qty)
);

-- ---------------------------------------------------------------------------
-- Stock issue, transfers, variance
-- ---------------------------------------------------------------------------
create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.construction_activities(id) on delete set null,
  item_id uuid not null references public.item_master(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete set null,
  reserved_qty numeric(16,4) not null check (reserved_qty > 0),
  status public.erp_workflow_status not null default 'pending',
  required_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  transfer_number text not null,
  from_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  to_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  transfer_date date not null default current_date,
  status public.erp_workflow_status not null default 'draft',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, transfer_number),
  check (from_location_id <> to_location_id)
);

create table if not exists public.stock_transfer_lines (
  id uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid not null references public.item_master(id) on delete restrict,
  quantity numeric(16,4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.material_issue_slips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  location_id uuid references public.inventory_locations(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  issue_number text not null,
  issued_to text not null,
  activity_team text,
  issue_date date not null default current_date,
  status public.erp_workflow_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, issue_number)
);

create table if not exists public.material_issue_lines (
  id uuid primary key default gen_random_uuid(),
  issue_slip_id uuid not null references public.material_issue_slips(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid not null references public.item_master(id) on delete restrict,
  quantity numeric(16,4) not null check (quantity > 0),
  rate numeric(16,4) not null default 0 check (rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.consumption_variances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  activity_id uuid references public.construction_activities(id) on delete set null,
  item_id uuid references public.item_master(id) on delete restrict,
  planned_qty numeric(16,4) not null default 0 check (planned_qty >= 0),
  actual_qty numeric(16,4) not null default 0 check (actual_qty >= 0),
  variance_qty numeric(16,4) generated always as (actual_qty - planned_qty) stored,
  variance_reason text,
  status public.erp_workflow_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Work orders, labour, equipment
-- ---------------------------------------------------------------------------
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete set null,
  contractor_code text unique,
  name text not null,
  contact_name text,
  phone text,
  email text,
  labour_category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete restrict,
  contractor_id uuid references public.contractors(id) on delete set null,
  budget_allocation_id uuid references public.budget_allocations(id) on delete set null,
  work_order_number text not null,
  scope_of_work text not null,
  start_date date,
  end_date date,
  terms_and_conditions text,
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  status public.erp_workflow_status not null default 'draft',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, work_order_number)
);

create table if not exists public.work_order_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null,
  quantity numeric(16,4) not null default 0 check (quantity >= 0),
  unit text,
  rate numeric(16,4) not null default 0 check (rate >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.work_order_activities (
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  activity_id uuid not null references public.construction_activities(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  primary key (work_order_id, activity_id)
);

create table if not exists public.labour_attendance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  contractor_id uuid references public.contractors(id) on delete set null,
  attendance_date date not null,
  present_count integer not null default 0 check (present_count >= 0),
  absent_count integer not null default 0 check (absent_count >= 0),
  overtime_hours numeric(8,2) not null default 0 check (overtime_hours >= 0),
  productivity_percent numeric(5,2) not null default 100 check (productivity_percent >= 0 and productivity_percent <= 200),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  asset_code text unique,
  name text not null,
  equipment_type text,
  owner_vendor_id uuid references public.vendors(id) on delete set null,
  status public.erp_equipment_status not null default 'active',
  total_usage_hours numeric(12,2) not null default 0 check (total_usage_hours >= 0),
  total_fuel_consumed numeric(12,2) not null default 0 check (total_fuel_consumed >= 0),
  last_maintenance_date date,
  next_maintenance_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.equipment_usage_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  equipment_id uuid not null references public.equipment_assets(id) on delete cascade,
  usage_date date not null default current_date,
  usage_hours numeric(8,2) not null default 0 check (usage_hours >= 0),
  fuel_consumed numeric(10,2) not null default 0 check (fuel_consumed >= 0),
  activity_id uuid references public.construction_activities(id) on delete set null,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.equipment_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  equipment_id uuid not null references public.equipment_assets(id) on delete cascade,
  maintenance_date date not null,
  maintenance_type text not null,
  description text,
  cost numeric(16,2) not null default 0 check (cost >= 0),
  next_due_date date,
  performed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- QC, NCR, billing, payments
-- ---------------------------------------------------------------------------
create table if not exists public.qc_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  category text not null,
  version text not null default '1.0.0',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (organization_id, name, version)
);

create table if not exists public.qc_checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.qc_checklist_templates(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  description text not null,
  acceptance_criteria text,
  is_mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (template_id, sequence_no)
);

create table if not exists public.qc_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  grn_id uuid references public.goods_receipt_notes(id) on delete set null,
  template_id uuid references public.qc_checklist_templates(id) on delete set null,
  inspection_number text not null,
  inspection_date date not null default current_date,
  status public.erp_qc_status not null default 'pending',
  remarks text,
  rework_required boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  unique (project_id, inspection_number)
);

create table if not exists public.qc_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qc_inspections(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  template_item_id uuid references public.qc_checklist_template_items(id) on delete set null,
  description text not null,
  result public.erp_qc_status not null default 'pending',
  remarks text,
  image_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.non_conformance_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  qc_inspection_id uuid references public.qc_inspections(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  ncr_number text not null,
  description text not null,
  severity public.erp_priority not null default 'medium',
  corrective_action text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.erp_workflow_status not null default 'pending',
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (project_id, ncr_number)
);

create table if not exists public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  site_id uuid references public.project_sites(id) on delete set null,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  grn_id uuid references public.goods_receipt_notes(id) on delete set null,
  activity_id uuid references public.construction_activities(id) on delete set null,
  qc_inspection_id uuid references public.qc_inspections(id) on delete set null,
  budget_allocation_id uuid references public.budget_allocations(id) on delete set null,
  bill_number text not null,
  bill_date date not null,
  bill_book_number text,
  subtotal_amount numeric(16,2) not null default 0 check (subtotal_amount >= 0),
  tax_amount numeric(16,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(16,2) not null default 0 check (total_amount >= 0),
  duplicate_detected boolean not null default false,
  required_documents_received boolean not null default false,
  work_completion_verified boolean not null default false,
  qc_approval_verified boolean not null default false,
  payment_status public.erp_payment_status not null default 'pending',
  status public.erp_billing_status not null default 'draft',
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.vendor_bill_lines (
  id uuid primary key default gen_random_uuid(),
  vendor_bill_id uuid not null references public.vendor_bills(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_id uuid references public.item_master(id) on delete set null,
  work_order_line_id uuid references public.work_order_lines(id) on delete set null,
  purchase_order_line_id uuid references public.purchase_order_lines(id) on delete set null,
  description text not null,
  quantity numeric(16,4) not null default 1 check (quantity > 0),
  unit text,
  rate numeric(16,4) not null default 0 check (rate >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate >= 0),
  line_total numeric(16,2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.bill_documents (
  id uuid primary key default gen_random_uuid(),
  vendor_bill_id uuid not null references public.vendor_bills(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  document_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.three_way_matches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_bill_id uuid not null references public.vendor_bills(id) on delete cascade,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  grn_id uuid references public.goods_receipt_notes(id) on delete set null,
  po_value numeric(16,2) not null default 0 check (po_value >= 0),
  grn_value numeric(16,2) not null default 0 check (grn_value >= 0),
  invoice_value numeric(16,2) not null default 0 check (invoice_value >= 0),
  tolerance_amount numeric(16,2) not null default 0 check (tolerance_amount >= 0),
  match_status text not null default 'pending',
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (vendor_bill_id)
);

create table if not exists public.payment_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_bill_id uuid not null references public.vendor_bills(id) on delete cascade,
  approver_id uuid references public.profiles(id) on delete set null,
  approval_order integer not null default 1 check (approval_order > 0),
  status public.erp_workflow_status not null default 'pending',
  remarks text,
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  vendor_bill_id uuid not null references public.vendor_bills(id) on delete restrict,
  payment_reference text not null,
  payment_date date,
  amount numeric(16,2) not null check (amount > 0),
  status public.erp_payment_status not null default 'pending',
  payment_mode text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (project_id, payment_reference)
);

-- ---------------------------------------------------------------------------
-- Communication compatibility and WhatsApp integration tables
-- ---------------------------------------------------------------------------
create table if not exists public.user_site_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  site_id uuid not null references public.projects(id) on delete cascade,
  assignment_role text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (user_id, site_id)
);

create table if not exists public.whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete cascade,
  phone_number text not null unique,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references public.projects(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  phone_number text,
  group_jid text,
  display_name text,
  thread_type text not null default 'direct',
  last_activity_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.raw_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  thread_id uuid references public.message_threads(id) on delete set null,
  from_number text,
  group_jid text,
  message_type text not null default 'text',
  direction public.erp_message_direction not null default 'inbound',
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clean_messages (
  id uuid primary key default gen_random_uuid(),
  raw_message_id uuid not null references public.raw_messages(id) on delete cascade,
  clean_text text,
  media_url text,
  classification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (raw_message_id)
);

create table if not exists public.media_files (
  id uuid primary key default gen_random_uuid(),
  raw_message_id uuid references public.raw_messages(id) on delete cascade,
  storage_bucket text,
  storage_path text,
  original_url text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  raw_message_id uuid not null references public.raw_messages(id) on delete cascade,
  clean_transcript text,
  language_code text,
  confidence numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (raw_message_id)
);

create table if not exists public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  site_id uuid references public.projects(id) on delete set null,
  thread_id uuid references public.message_threads(id) on delete set null,
  to_user_id uuid references public.users(id) on delete set null,
  to_phone text not null,
  message_text text not null,
  message_type text not null default 'text',
  status text not null default 'queued',
  source public.erp_source_system not null default 'dashboard',
  sent_by uuid references public.profiles(id) on delete set null,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Reporting and automation
-- ---------------------------------------------------------------------------
create table if not exists public.report_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  module text not null,
  parameters_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  unique (organization_id, code)
);

create table if not exists public.report_runs (
  id uuid primary key default gen_random_uuid(),
  report_definition_id uuid not null references public.report_definitions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  parameters jsonb not null default '{}'::jsonb,
  status public.erp_report_status not null default 'queued',
  result_storage_path text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  module text not null,
  trigger_event text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  automation_rule_id uuid references public.automation_rules(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  entity_table text,
  entity_id uuid,
  status public.erp_workflow_status not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  run_after timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Existing table compatibility additions
-- ---------------------------------------------------------------------------
alter table public.tasks add column if not exists activity_id uuid references public.construction_activities(id) on delete set null;
alter table public.tasks add column if not exists work_order_id uuid references public.work_orders(id) on delete set null;
alter table public.tasks add column if not exists actual_start_date date;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists deleted_at timestamptz;

alter table public.daily_logs add column if not exists site_id uuid references public.project_sites(id) on delete set null;
alter table public.daily_logs add column if not exists dpr_id uuid references public.daily_progress_reports(id) on delete set null;
alter table public.daily_logs add column if not exists activity_id uuid references public.construction_activities(id) on delete set null;
alter table public.daily_logs add column if not exists delay_id uuid references public.delay_events(id) on delete set null;
alter table public.daily_logs add column if not exists weather text;
alter table public.daily_logs add column if not exists progress_delta numeric(8,2);
alter table public.daily_logs add column if not exists site_limitations text;
alter table public.daily_logs add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'budget_allocations_activity_id_fkey'
      and conrelid = 'public.budget_allocations'::regclass
  ) then
    alter table public.budget_allocations
      add constraint budget_allocations_activity_id_fkey
      foreign key (activity_id) references public.construction_activities(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'budget_allocations_vendor_id_fkey'
      and conrelid = 'public.budget_allocations'::regclass
  ) then
    alter table public.budget_allocations
      add constraint budget_allocations_vendor_id_fkey
      foreign key (vendor_id) references public.vendors(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'material_transactions_activity_id_fkey'
      and conrelid = 'public.material_transactions'::regclass
  ) then
    alter table public.material_transactions
      add constraint material_transactions_activity_id_fkey
      foreign key (activity_id) references public.construction_activities(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'material_transactions_grn_id_fkey'
      and conrelid = 'public.material_transactions'::regclass
  ) then
    alter table public.material_transactions
      add constraint material_transactions_grn_id_fkey
      foreign key (grn_id) references public.goods_receipt_notes(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'material_transactions_issue_slip_id_fkey'
      and conrelid = 'public.material_transactions'::regclass
  ) then
    alter table public.material_transactions
      add constraint material_transactions_issue_slip_id_fkey
      foreign key (issue_slip_id) references public.material_issue_slips(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Business rule triggers
-- ---------------------------------------------------------------------------
create or replace function app_private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  row_project_id uuid;
  row_org_id uuid;
  row_id text;
begin
  row_project_id := coalesce((to_jsonb(coalesce(new, old))->>'project_id')::uuid, null);
  row_org_id := coalesce((to_jsonb(coalesce(new, old))->>'organization_id')::uuid, null);
  row_id := coalesce(to_jsonb(coalesce(new, old))->>'id', to_jsonb(coalesce(new, old))->>'project_id', 'unknown');

  insert into public.audit_logs (
    organization_id, project_id, actor_id, action, table_name, record_id, old_data, new_data
  )
  values (
    row_org_id,
    row_project_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_schema || '.' || tg_table_name,
    row_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create or replace function app_private.enforce_vendor_bill_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_activity_status text;
  linked_qc_status text;
begin
  if new.status in ('verified', 'approved', 'paid') then
    if new.duplicate_detected then
      raise exception 'Vendor bill % is blocked because duplicate_detected is true', new.bill_number;
    end if;

    if not new.required_documents_received then
      raise exception 'Vendor bill % is blocked because required documents are missing', new.bill_number;
    end if;

    if new.activity_id is not null then
      select status::text into linked_activity_status
      from public.construction_activities
      where id = new.activity_id;

      if linked_activity_status is distinct from 'completed' then
        raise exception 'Vendor bill % is blocked because linked activity is not completed', new.bill_number;
      end if;
    end if;

    if new.qc_inspection_id is not null then
      select status::text into linked_qc_status
      from public.qc_inspections
      where id = new.qc_inspection_id;

      if linked_qc_status not in ('approved', 'passed', 'waived') then
        raise exception 'Vendor bill % is blocked because QC is not approved', new.bill_number;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function app_private.post_bill_budget_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.budget_allocation_id is not null then
    insert into public.budget_ledger (
      project_id, budget_allocation_id, transaction_type, source_table, source_id, amount, description, created_by
    )
    values (
      new.project_id, new.budget_allocation_id, 'actual', 'vendor_bills', new.id, new.total_amount,
      'Approved vendor bill ' || new.bill_number, (select auth.uid())
    )
    on conflict do nothing;

    update public.budget_allocations
    set spent_amount = spent_amount + new.total_amount,
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = new.budget_allocation_id;
  end if;
  return new;
end;
$$;

create or replace function app_private.post_grn_stock()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  line record;
  inserted_count integer;
begin
  if new.status = 'posted' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    for line in
      select *
      from public.goods_receipt_note_lines
      where grn_id = new.id and accepted_qty > 0
    loop
      insert into public.stock_ledger (
        project_id, site_id, item_id, transaction_type, quantity, rate, amount,
        source_table, source_id, source_line_id, reference_no, transaction_date, created_by
      )
      values (
        new.project_id, new.site_id, line.item_id, 'inward', line.accepted_qty, line.unit_rate,
        round((line.accepted_qty * line.unit_rate)::numeric, 2),
        'goods_receipt_notes', new.id, line.id, new.grn_number, new.receipt_date, (select auth.uid())
      )
      on conflict do nothing;

      get diagnostics inserted_count = row_count;

      if inserted_count > 0 then
        insert into public.stock_balances (
          project_id, site_id, item_id, available_qty, average_rate, stock_value, last_transaction_at, created_by
        )
        values (
          new.project_id, new.site_id, line.item_id, line.accepted_qty, line.unit_rate,
          round((line.accepted_qty * line.unit_rate)::numeric, 2), now(), (select auth.uid())
        )
        on conflict (project_id, site_id, location_id, item_id)
        do update set
          available_qty = public.stock_balances.available_qty + excluded.available_qty,
          stock_value = public.stock_balances.stock_value + excluded.stock_value,
          average_rate = case
            when (public.stock_balances.available_qty + excluded.available_qty) > 0
            then round(((public.stock_balances.stock_value + excluded.stock_value) / (public.stock_balances.available_qty + excluded.available_qty))::numeric, 4)
            else 0
          end,
          last_transaction_at = now(),
          updated_at = now(),
          updated_by = (select auth.uid());
      end if;
    end loop;
    new.posted_at := coalesce(new.posted_at, now());
  end if;
  return new;
end;
$$;

create or replace function app_private.post_issue_stock()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  line record;
  inserted_count integer;
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    for line in
      select *
      from public.material_issue_lines
      where issue_slip_id = new.id
    loop
      insert into public.stock_ledger (
        project_id, site_id, location_id, item_id, transaction_type, quantity, rate, amount,
        source_table, source_id, source_line_id, reference_no, transaction_date, created_by
      )
      values (
        new.project_id, new.site_id, new.location_id, line.item_id, 'consumption', line.quantity, line.rate,
        round((line.quantity * line.rate)::numeric, 2),
        'material_issue_slips', new.id, line.id, new.issue_number, new.issue_date, (select auth.uid())
      )
      on conflict do nothing;

      get diagnostics inserted_count = row_count;

      if inserted_count > 0 then
        update public.stock_balances
        set available_qty = greatest(0, available_qty - line.quantity),
            consumed_qty = consumed_qty + line.quantity,
            stock_value = greatest(0, stock_value - round((line.quantity * line.rate)::numeric, 2)),
            last_transaction_at = now(),
            updated_at = now(),
            updated_by = (select auth.uid())
        where project_id = new.project_id
          and item_id = line.item_id
          and (new.site_id is null or site_id = new.site_id)
          and (new.location_id is null or location_id = new.location_id);
      end if;
    end loop;
  end if;
  return new;
end;
$$;

create unique index if not exists stock_ledger_source_unique_idx
  on public.stock_ledger (source_table, source_id, source_line_id)
  where source_table is not null and source_id is not null and source_line_id is not null;

create unique index if not exists budget_ledger_source_unique_idx
  on public.budget_ledger (source_table, source_id, transaction_type)
  where source_table is not null and source_id is not null;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'project_sites','project_phases','project_documents','cost_codes','budget_heads',
    'budget_allocations','budget_ledger','budget_alerts','boq_items','inventory_locations',
    'stock_balances','stock_ledger','construction_activities','activity_updates',
    'daily_progress_reports','dpr_activity_lines','delay_events','activity_deletion_requests',
    'demand_forecasts','checklists','material_requests','material_request_lines',
    'purchase_requisitions','purchase_requisition_lines','purchase_requisition_assignments',
    'rfqs','rfq_vendors','vendor_quotations','quotation_lines','quotation_scores',
    'vendor_selections','purchase_orders','purchase_order_lines','delivery_trackings',
    'goods_receipt_notes','goods_receipt_note_lines','stock_reservations','stock_transfers',
    'stock_transfer_lines','material_issue_slips','material_issue_lines','consumption_variances',
    'work_orders','work_order_lines','work_order_activities','labour_attendance',
    'equipment_assets','equipment_usage_logs','equipment_maintenance_logs','qc_inspections',
    'qc_inspection_items','non_conformance_reports','vendor_bills','vendor_bill_lines',
    'bill_documents','three_way_matches','payment_approvals','payments','notifications',
    'activity_events','entity_attachments','approval_requests','workflow_instances',
    'report_runs','automation_rules','automation_jobs'
  ] loop
    execute format('create index if not exists %I on public.%I (project_id)', t || '_project_id_idx', t);
  end loop;
end $$;

create index if not exists profiles_organization_id_idx on public.profiles (organization_id);
create index if not exists projects_organization_id_idx on public.projects (organization_id);
create index if not exists project_members_user_id_idx on public.project_members (user_id);
create index if not exists organization_members_user_id_idx on public.organization_members (user_id);
create index if not exists rbac_user_roles_user_id_idx on public.rbac_user_roles (user_id);
create unique index if not exists rbac_user_roles_scope_unique_idx
  on public.rbac_user_roles (
    user_id,
    role_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists audit_logs_project_created_idx on public.audit_logs (project_id, created_at desc);
create index if not exists audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists entity_attachments_entity_idx on public.entity_attachments (entity_table, entity_id);
create index if not exists project_documents_status_idx on public.project_documents (project_id, status);
create index if not exists item_master_category_idx on public.item_master (category_id);
create index if not exists item_master_active_name_idx on public.item_master (lower(name)) where deleted_at is null;
create unique index if not exists vendors_gst_unique_idx on public.vendors (gst_number) where gst_number is not null and deleted_at is null;
create unique index if not exists vendors_name_unique_idx on public.vendors (lower(legal_name)) where deleted_at is null;
create index if not exists vendors_active_rating_idx on public.vendors (is_active, rating desc) where deleted_at is null;
create index if not exists vendor_contacts_vendor_id_idx on public.vendor_contacts (vendor_id);
create index if not exists vendor_documents_vendor_id_idx on public.vendor_documents (vendor_id);
create index if not exists stock_balances_item_idx on public.stock_balances (item_id);
create index if not exists stock_balances_low_stock_idx on public.stock_balances (project_id, item_id) where available_qty <= reorder_level;
create index if not exists stock_ledger_item_date_idx on public.stock_ledger (item_id, transaction_date desc);
create index if not exists construction_activities_status_due_idx on public.construction_activities (project_id, status, planned_end_date);
create index if not exists construction_activities_assigned_idx on public.construction_activities (assigned_to) where assigned_to is not null;
create index if not exists daily_progress_reports_date_idx on public.daily_progress_reports (project_id, report_date desc);
create index if not exists delay_events_status_idx on public.delay_events (project_id, status);
create index if not exists demand_forecasts_due_idx on public.demand_forecasts (project_id, expected_requirement_date);
create index if not exists checklist_items_checklist_id_idx on public.checklist_items (checklist_id);
create index if not exists material_request_lines_request_id_idx on public.material_request_lines (material_request_id);
create index if not exists purchase_requisition_lines_pr_id_idx on public.purchase_requisition_lines (purchase_requisition_id);
create index if not exists rfq_vendors_vendor_id_idx on public.rfq_vendors (vendor_id);
create index if not exists vendor_quotations_rfq_vendor_idx on public.vendor_quotations (rfq_id, vendor_id);
create index if not exists quotation_lines_quotation_id_idx on public.quotation_lines (quotation_id);
create index if not exists purchase_orders_vendor_idx on public.purchase_orders (vendor_id, status);
create index if not exists purchase_order_lines_po_id_idx on public.purchase_order_lines (purchase_order_id);
create index if not exists grn_po_idx on public.goods_receipt_notes (purchase_order_id);
create index if not exists grn_lines_grn_id_idx on public.goods_receipt_note_lines (grn_id);
create index if not exists issue_lines_issue_id_idx on public.material_issue_lines (issue_slip_id);
create index if not exists work_orders_vendor_idx on public.work_orders (vendor_id, status);
create index if not exists qc_inspections_activity_idx on public.qc_inspections (activity_id, status);
create index if not exists vendor_bills_vendor_status_idx on public.vendor_bills (vendor_id, status);
create unique index if not exists vendor_bills_vendor_bill_unique_idx
  on public.vendor_bills (vendor_id, bill_number)
  where deleted_at is null;
create unique index if not exists bill_documents_hash_unique_idx
  on public.bill_documents (document_hash)
  where document_hash is not null;
create index if not exists three_way_matches_status_idx on public.three_way_matches (project_id, match_status);
create index if not exists notifications_recipient_status_idx on public.notifications (recipient_id, status, created_at desc);
create index if not exists message_threads_site_idx on public.message_threads (site_id);
create index if not exists raw_messages_source_idx on public.raw_messages (coalesce(group_jid, from_number), received_at desc);
create index if not exists raw_messages_thread_idx on public.raw_messages (thread_id, received_at desc);
create index if not exists outbound_messages_to_phone_idx on public.outbound_messages (to_phone, created_at desc);
create index if not exists whatsapp_numbers_user_id_idx on public.whatsapp_numbers (user_id);
create index if not exists user_site_assignments_site_idx on public.user_site_assignments (site_id);
create index if not exists materials_project_id_idx on public.materials (project_id);
create index if not exists materials_item_master_id_idx on public.materials (item_master_id);
create index if not exists material_transactions_project_id_idx on public.material_transactions (project_id);
create index if not exists material_transactions_material_id_idx on public.material_transactions (material_id);
create index if not exists tasks_activity_id_idx on public.tasks (activity_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','organization_members','rbac_roles','users','projects','profiles',
    'project_sites','project_phases','project_documents','entity_attachments',
    'workflow_definitions','workflow_steps','workflow_instances','approval_requests',
    'notifications','notification_preferences','system_config','cost_codes','budget_heads',
    'budget_allocations','budget_alerts','boq_items','unit_of_measurements','item_categories',
    'item_master','vendors','vendor_contacts','vendor_documents','vendor_performance_reviews',
    'inventory_locations','stock_balances','materials','construction_activities',
    'activity_updates','daily_progress_reports','dpr_activity_lines','delay_events',
    'activity_deletion_requests','demand_forecasts','checklists','checklist_items',
    'material_requests','material_request_lines','purchase_requisitions',
    'purchase_requisition_lines','purchase_requisition_assignments','rfqs','rfq_vendors',
    'vendor_quotations','quotation_lines','quotation_scores','vendor_selections',
    'purchase_orders','purchase_order_lines','delivery_trackings','goods_receipt_notes',
    'goods_receipt_note_lines','stock_reservations','stock_transfers','stock_transfer_lines',
    'material_issue_slips','material_issue_lines','consumption_variances','contractors',
    'work_orders','work_order_lines','labour_attendance','equipment_assets',
    'equipment_usage_logs','equipment_maintenance_logs','qc_checklist_templates',
    'qc_checklist_template_items','qc_inspections','qc_inspection_items',
    'non_conformance_reports','vendor_bills','vendor_bill_lines','bill_documents',
    'three_way_matches','payment_approvals','payments','user_site_assignments',
    'whatsapp_numbers','message_threads','raw_messages','clean_messages','media_files',
    'transcriptions','outbound_messages','report_definitions','report_runs',
    'automation_rules','automation_jobs','tasks','daily_logs'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', 'trg_set_updated_at', t);
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_set_updated_at', t);
    end if;
  end loop;
end $$;

drop trigger if exists trg_vendor_bill_rules on public.vendor_bills;
create trigger trg_vendor_bill_rules
before insert or update on public.vendor_bills
for each row execute function app_private.enforce_vendor_bill_rules();

drop trigger if exists trg_vendor_bill_budget_ledger on public.vendor_bills;
create trigger trg_vendor_bill_budget_ledger
after insert or update on public.vendor_bills
for each row execute function app_private.post_bill_budget_ledger();

drop trigger if exists trg_post_grn_stock on public.goods_receipt_notes;
create trigger trg_post_grn_stock
before insert or update on public.goods_receipt_notes
for each row execute function app_private.post_grn_stock();

drop trigger if exists trg_post_issue_stock on public.material_issue_slips;
create trigger trg_post_issue_stock
after insert or update on public.material_issue_slips
for each row execute function app_private.post_issue_stock();

do $$
declare
  t text;
begin
  foreach t in array array[
    'construction_activities','daily_progress_reports','delay_events','demand_forecasts',
    'material_requests','purchase_requisitions','rfqs','vendor_quotations',
    'vendor_selections','purchase_orders','goods_receipt_notes','stock_transfers',
    'material_issue_slips','work_orders','qc_inspections','non_conformance_reports',
    'vendor_bills','payments','budget_allocations','vendors','tasks','daily_logs','materials'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', 'trg_audit_row', t);
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_row_change()', 'trg_audit_row', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Security: grants and RLS policies
-- ---------------------------------------------------------------------------
grant usage on schema app_private to authenticated;
grant execute on all functions in schema app_private to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.profiles enable row level security;
drop policy if exists pms_profiles_select on public.profiles;
create policy pms_profiles_select on public.profiles
for select to authenticated
using ((select auth.uid()) is not null);
drop policy if exists pms_profiles_update on public.profiles;
create policy pms_profiles_update on public.profiles
for update to authenticated
using (id = (select auth.uid()) or (select app_private.is_admin()))
with check (id = (select auth.uid()) or (select app_private.is_admin()));

alter table public.projects enable row level security;
drop policy if exists pms_projects_select on public.projects;
create policy pms_projects_select on public.projects
for select to authenticated
using ((select app_private.can_access_project(id)) or created_by = (select auth.uid()));
drop policy if exists pms_projects_insert on public.projects;
create policy pms_projects_insert on public.projects
for insert to authenticated
with check ((select app_private.is_admin()) or created_by = (select auth.uid()));
drop policy if exists pms_projects_update on public.projects;
create policy pms_projects_update on public.projects
for update to authenticated
using ((select app_private.can_edit_project(id)))
with check ((select app_private.can_edit_project(id)));

alter table public.project_members enable row level security;
drop policy if exists pms_project_members_select on public.project_members;
create policy pms_project_members_select on public.project_members
for select to authenticated
using ((select app_private.can_access_project(project_id)) or user_id = (select auth.uid()));
drop policy if exists pms_project_members_write on public.project_members;
create policy pms_project_members_write on public.project_members
for all to authenticated
using ((select app_private.is_admin()) or (select app_private.can_edit_project(project_id)))
with check ((select app_private.is_admin()) or (select app_private.can_edit_project(project_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'project_sites','project_phases','project_documents','cost_codes','budget_heads',
    'budget_allocations','budget_ledger','budget_alerts','boq_items','inventory_locations',
    'stock_balances','stock_ledger','construction_activities','activity_updates',
    'daily_progress_reports','dpr_activity_lines','delay_events','activity_deletion_requests',
    'demand_forecasts','checklists','material_requests','material_request_lines',
    'purchase_requisitions','purchase_requisition_lines','purchase_requisition_assignments',
    'rfqs','rfq_vendors','vendor_quotations','quotation_lines','quotation_scores',
    'vendor_selections','purchase_orders','purchase_order_lines','delivery_trackings',
    'goods_receipt_notes','goods_receipt_note_lines','stock_reservations','stock_transfers',
    'stock_transfer_lines','material_issue_slips','material_issue_lines','consumption_variances',
    'work_orders','work_order_lines','work_order_activities','labour_attendance',
    'equipment_assets','equipment_usage_logs','equipment_maintenance_logs','qc_inspections',
    'qc_inspection_items','non_conformance_reports','vendor_bills','vendor_bill_lines',
    'bill_documents','three_way_matches','payment_approvals','payments','notifications',
    'activity_events','entity_attachments','approval_requests','workflow_instances',
    'report_runs','automation_rules','automation_jobs','materials','tasks','daily_logs',
    'conversations','conversation_members','messages','message_attachments','call_sessions',
    'project_activity'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_select', t);
      execute format('create policy %I on public.%I for select to authenticated using ((select app_private.can_access_project(project_id)))', 'pms_project_select', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_insert', t);
      execute format('create policy %I on public.%I for insert to authenticated with check ((select app_private.can_edit_project(project_id)))', 'pms_project_insert', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_update', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select app_private.can_edit_project(project_id))) with check ((select app_private.can_edit_project(project_id)))', 'pms_project_update', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_delete', t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select app_private.can_edit_project(project_id)))', 'pms_project_delete', t);
    end if;
  end loop;
end $$;

alter table public.organizations enable row level security;
drop policy if exists pms_organizations_select on public.organizations;
create policy pms_organizations_select on public.organizations
for select to authenticated
using ((select app_private.is_admin()) or exists (
  select 1 from public.organization_members om
  where om.organization_id = organizations.id and om.user_id = (select auth.uid()) and om.is_active
));
drop policy if exists pms_organizations_write on public.organizations;
create policy pms_organizations_write on public.organizations
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

alter table public.organization_members enable row level security;
drop policy if exists pms_org_members_select on public.organization_members;
create policy pms_org_members_select on public.organization_members
for select to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_admin()));
drop policy if exists pms_org_members_write on public.organization_members;
create policy pms_org_members_write on public.organization_members
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'rbac_roles','rbac_permissions','rbac_role_permissions','rbac_user_roles',
    'unit_of_measurements','item_categories','item_master','vendors','vendor_contacts',
    'vendor_documents','vendor_categories','vendor_category_map','vendor_performance_reviews',
    'contractors','qc_checklist_templates','qc_checklist_template_items','workflow_definitions',
    'workflow_steps','report_definitions','system_config'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'pms_master_select', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) is not null)', 'pms_master_select', t);
    execute format('drop policy if exists %I on public.%I', 'pms_master_write', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()))', 'pms_master_write', t);
  end loop;
end $$;

alter table public.checklist_items enable row level security;
drop policy if exists pms_checklist_items_select on public.checklist_items;
create policy pms_checklist_items_select on public.checklist_items
for select to authenticated
using (exists (
  select 1 from public.checklists c
  where c.id = checklist_items.checklist_id
    and (select app_private.can_access_project(c.project_id))
));
drop policy if exists pms_checklist_items_write on public.checklist_items;
create policy pms_checklist_items_write on public.checklist_items
for all to authenticated
using (exists (
  select 1 from public.checklists c
  where c.id = checklist_items.checklist_id
    and (select app_private.can_edit_project(c.project_id))
))
with check (exists (
  select 1 from public.checklists c
  where c.id = checklist_items.checklist_id
    and (select app_private.can_edit_project(c.project_id))
));

alter table public.material_transactions enable row level security;
drop policy if exists pms_material_transactions_select on public.material_transactions;
create policy pms_material_transactions_select on public.material_transactions
for select to authenticated
using (
  (project_id is not null and (select app_private.can_access_project(project_id)))
  or exists (
    select 1 from public.materials m
    where m.id = material_transactions.material_id
      and (select app_private.can_access_project(m.project_id))
  )
);
drop policy if exists pms_material_transactions_write on public.material_transactions;
create policy pms_material_transactions_write on public.material_transactions
for all to authenticated
using (
  (project_id is not null and (select app_private.can_edit_project(project_id)))
  or exists (
    select 1 from public.materials m
    where m.id = material_transactions.material_id
      and (select app_private.can_edit_project(m.project_id))
  )
)
with check (
  (project_id is not null and (select app_private.can_edit_project(project_id)))
  or exists (
    select 1 from public.materials m
    where m.id = material_transactions.material_id
      and (select app_private.can_edit_project(m.project_id))
  )
);

alter table public.audit_logs enable row level security;
drop policy if exists pms_audit_logs_select on public.audit_logs;
create policy pms_audit_logs_select on public.audit_logs
for select to authenticated
using ((select app_private.is_admin()) or (project_id is not null and (select app_private.can_access_project(project_id))));

alter table public.users enable row level security;
drop policy if exists pms_users_select on public.users;
create policy pms_users_select on public.users
for select to authenticated
using ((select auth.uid()) is not null);
drop policy if exists pms_users_write on public.users;
create policy pms_users_write on public.users
for all to authenticated
using (id = (select auth.uid()) or (select app_private.is_admin()))
with check (id = (select auth.uid()) or (select app_private.is_admin()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'message_threads','raw_messages','outbound_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'pms_comm_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (project_id is null or (select app_private.can_access_project(project_id)))', 'pms_comm_select', t);
    execute format('drop policy if exists %I on public.%I', 'pms_comm_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (project_id is null or (select app_private.can_edit_project(project_id))) with check (project_id is null or (select app_private.can_edit_project(project_id)))', 'pms_comm_write', t);
  end loop;
end $$;

alter table public.user_site_assignments enable row level security;
drop policy if exists pms_user_site_assignments_select on public.user_site_assignments;
create policy pms_user_site_assignments_select on public.user_site_assignments
for select to authenticated
using (user_id = (select auth.uid()) or (select app_private.can_access_project(site_id)));
drop policy if exists pms_user_site_assignments_write on public.user_site_assignments;
create policy pms_user_site_assignments_write on public.user_site_assignments
for all to authenticated
using ((select app_private.is_admin()) or (select app_private.can_edit_project(site_id)))
with check ((select app_private.is_admin()) or (select app_private.can_edit_project(site_id)));

alter table public.whatsapp_numbers enable row level security;
drop policy if exists pms_whatsapp_numbers_select on public.whatsapp_numbers;
create policy pms_whatsapp_numbers_select on public.whatsapp_numbers
for select to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_admin()));
drop policy if exists pms_whatsapp_numbers_write on public.whatsapp_numbers;
create policy pms_whatsapp_numbers_write on public.whatsapp_numbers
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

alter table public.document_versions enable row level security;
drop policy if exists pms_document_versions_select on public.document_versions;
create policy pms_document_versions_select on public.document_versions
for select to authenticated
using (exists (
  select 1
  from public.project_documents d
  where d.id = document_versions.document_id
    and (select app_private.can_access_project(d.project_id))
));
drop policy if exists pms_document_versions_write on public.document_versions;
create policy pms_document_versions_write on public.document_versions
for all to authenticated
using (exists (
  select 1
  from public.project_documents d
  where d.id = document_versions.document_id
    and (select app_private.can_edit_project(d.project_id))
))
with check (exists (
  select 1
  from public.project_documents d
  where d.id = document_versions.document_id
    and (select app_private.can_edit_project(d.project_id))
));

alter table public.activity_dependencies enable row level security;
drop policy if exists pms_activity_dependencies_select on public.activity_dependencies;
create policy pms_activity_dependencies_select on public.activity_dependencies
for select to authenticated
using (exists (
  select 1
  from public.construction_activities a
  where a.id = activity_dependencies.activity_id
    and (select app_private.can_access_project(a.project_id))
));
drop policy if exists pms_activity_dependencies_write on public.activity_dependencies;
create policy pms_activity_dependencies_write on public.activity_dependencies
for all to authenticated
using (exists (
  select 1
  from public.construction_activities a
  where a.id = activity_dependencies.activity_id
    and (select app_private.can_edit_project(a.project_id))
))
with check (exists (
  select 1
  from public.construction_activities a
  where a.id = activity_dependencies.activity_id
    and (select app_private.can_edit_project(a.project_id))
));

alter table public.workflow_actions enable row level security;
drop policy if exists pms_workflow_actions_select on public.workflow_actions;
create policy pms_workflow_actions_select on public.workflow_actions
for select to authenticated
using (exists (
  select 1
  from public.workflow_instances wi
  where wi.id = workflow_actions.workflow_instance_id
    and (wi.project_id is null or (select app_private.can_access_project(wi.project_id)))
));
drop policy if exists pms_workflow_actions_write on public.workflow_actions;
create policy pms_workflow_actions_write on public.workflow_actions
for all to authenticated
using (exists (
  select 1
  from public.workflow_instances wi
  where wi.id = workflow_actions.workflow_instance_id
    and (wi.project_id is null or (select app_private.can_edit_project(wi.project_id)))
))
with check (exists (
  select 1
  from public.workflow_instances wi
  where wi.id = workflow_actions.workflow_instance_id
    and (wi.project_id is null or (select app_private.can_edit_project(wi.project_id)))
));

do $$
declare
  t text;
begin
  foreach t in array array['clean_messages','media_files','transcriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'pms_message_artifacts_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (exists (select 1 from public.raw_messages rm where rm.id = %I.raw_message_id and (rm.project_id is null or (select app_private.can_access_project(rm.project_id)))))',
      'pms_message_artifacts_select', t, t
    );
    execute format('drop policy if exists %I on public.%I', 'pms_message_artifacts_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (exists (select 1 from public.raw_messages rm where rm.id = %I.raw_message_id and (rm.project_id is null or (select app_private.can_edit_project(rm.project_id))))) with check (exists (select 1 from public.raw_messages rm where rm.id = %I.raw_message_id and (rm.project_id is null or (select app_private.can_edit_project(rm.project_id)))))',
      'pms_message_artifacts_write', t, t, t
    );
  end loop;
end $$;

alter table public.push_registrations enable row level security;
drop policy if exists pms_push_registrations_self on public.push_registrations;
create policy pms_push_registrations_self on public.push_registrations
for all to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_admin()))
with check (user_id = (select auth.uid()) or (select app_private.is_admin()));

alter table public.notification_preferences enable row level security;
drop policy if exists pms_notification_preferences_self on public.notification_preferences;
create policy pms_notification_preferences_self on public.notification_preferences
for all to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_admin()))
with check (user_id = (select auth.uid()) or (select app_private.is_admin()));

alter table public.call_participants enable row level security;
drop policy if exists pms_call_participants_select on public.call_participants;
create policy pms_call_participants_select on public.call_participants
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.call_sessions cs
    where cs.id = call_participants.call_id
      and (select app_private.can_access_project(cs.project_id))
  )
);
drop policy if exists pms_call_participants_write on public.call_participants;
create policy pms_call_participants_write on public.call_participants
for all to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.call_sessions cs
    where cs.id = call_participants.call_id
      and (select app_private.can_edit_project(cs.project_id))
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.call_sessions cs
    where cs.id = call_participants.call_id
      and (select app_private.can_edit_project(cs.project_id))
  )
);

alter table public.call_events enable row level security;
drop policy if exists pms_call_events_select on public.call_events;
create policy pms_call_events_select on public.call_events
for select to authenticated
using (exists (
  select 1 from public.call_sessions cs
  where cs.id = call_events.call_id
    and (select app_private.can_access_project(cs.project_id))
));
drop policy if exists pms_call_events_write on public.call_events;
create policy pms_call_events_write on public.call_events
for all to authenticated
using (exists (
  select 1 from public.call_sessions cs
  where cs.id = call_events.call_id
    and (select app_private.can_edit_project(cs.project_id))
))
with check (exists (
  select 1 from public.call_sessions cs
  where cs.id = call_events.call_id
    and (select app_private.can_edit_project(cs.project_id))
));

alter table public.log_attachments enable row level security;
drop policy if exists pms_log_attachments_select on public.log_attachments;
create policy pms_log_attachments_select on public.log_attachments
for select to authenticated
using (exists (
  select 1 from public.daily_logs dl
  where dl.id = log_attachments.log_id
    and (select app_private.can_access_project(dl.project_id))
));
drop policy if exists pms_log_attachments_write on public.log_attachments;
create policy pms_log_attachments_write on public.log_attachments
for all to authenticated
using (exists (
  select 1 from public.daily_logs dl
  where dl.id = log_attachments.log_id
    and (select app_private.can_edit_project(dl.project_id))
))
with check (exists (
  select 1 from public.daily_logs dl
  where dl.id = log_attachments.log_id
    and (select app_private.can_edit_project(dl.project_id))
));

alter table public.log_comments enable row level security;
drop policy if exists pms_log_comments_select on public.log_comments;
create policy pms_log_comments_select on public.log_comments
for select to authenticated
using (exists (
  select 1 from public.daily_logs dl
  where dl.id = log_comments.log_id
    and (select app_private.can_access_project(dl.project_id))
));
drop policy if exists pms_log_comments_write on public.log_comments;
create policy pms_log_comments_write on public.log_comments
for all to authenticated
using (exists (
  select 1 from public.daily_logs dl
  where dl.id = log_comments.log_id
    and (select app_private.can_edit_project(dl.project_id))
))
with check (exists (
  select 1 from public.daily_logs dl
  where dl.id = log_comments.log_id
    and (select app_private.can_edit_project(dl.project_id))
));

-- ---------------------------------------------------------------------------
-- Reporting views. security_invoker keeps underlying table RLS active.
-- ---------------------------------------------------------------------------
create or replace view public.portfolio_budget_summary
with (security_invoker = true)
as
select
  p.id as project_id,
  p.code as project_code,
  p.name as project_name,
  coalesce(sum(ba.allocated_amount), 0)::numeric(16,2) as allocated_amount,
  coalesce(sum(ba.committed_amount), 0)::numeric(16,2) as committed_amount,
  coalesce(sum(ba.spent_amount), 0)::numeric(16,2) as spent_amount,
  greatest(coalesce(sum(ba.allocated_amount), 0) - coalesce(sum(ba.spent_amount), 0), 0)::numeric(16,2) as remaining_amount
from public.projects p
left join public.budget_allocations ba on ba.project_id = p.id and ba.deleted_at is null
group by p.id, p.code, p.name;

create or replace view public.project_quality_billing_status
with (security_invoker = true)
as
select
  ca.project_id,
  ca.id as activity_id,
  ca.title as activity_title,
  ca.status as activity_status,
  qi.status as qc_status,
  case
    when ca.status = 'completed' and qi.status in ('approved', 'passed', 'waived') then true
    else false
  end as billing_allowed
from public.construction_activities ca
left join lateral (
  select q.status
  from public.qc_inspections q
  where q.activity_id = ca.id
  order by q.created_at desc
  limit 1
) qi on true;

grant select on public.portfolio_budget_summary to authenticated;
grant select on public.project_quality_billing_status to authenticated;

-- ---------------------------------------------------------------------------
-- Seed default catalog values only; no project/user data is overwritten.
-- ---------------------------------------------------------------------------
insert into public.unit_of_measurements (code, name)
values
  ('NOS', 'Numbers'),
  ('BAG', 'Bags'),
  ('MT', 'Metric Tons'),
  ('KG', 'Kilograms'),
  ('CUM', 'Cubic Meters'),
  ('SQM', 'Square Meters'),
  ('MTR', 'Meters'),
  ('LOT', 'Lot')
on conflict (code) do nothing;

insert into public.vendor_categories (code, name)
values
  ('CEMENT', 'Cement and Concrete'),
  ('STEEL', 'Reinforcement Steel'),
  ('MEP', 'MEP Materials'),
  ('FINISHING', 'Finishing Materials'),
  ('LABOUR', 'Labour Contractor'),
  ('EQUIPMENT', 'Equipment and Fleet')
on conflict (code) do nothing;

insert into public.rbac_permissions (code, module, action, description)
values
  ('projects.read', 'projects', 'read', 'View assigned projects'),
  ('dpr.manage', 'dpr', 'manage', 'Create and update DPR records'),
  ('procurement.manage', 'procurement', 'manage', 'Manage MR, PR, RFQ, PO and GRN'),
  ('inventory.manage', 'inventory', 'manage', 'Manage stock movements and stock balances'),
  ('qc.approve', 'quality', 'approve', 'Approve quality inspections'),
  ('billing.approve', 'billing', 'approve', 'Approve bills and payments'),
  ('budget.manage', 'budget', 'manage', 'Manage budgets and cost codes'),
  ('admin.manage', 'admin', 'manage', 'Manage users, roles and system configuration')
on conflict (code) do nothing;
