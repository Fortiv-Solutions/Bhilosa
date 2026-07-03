-- Pragati production foundation: restore the full role model from the
-- specification and add operational tables needed by mobile sync, reports,
-- device security, workflow configuration, and health scoring.

do $$
begin
  if exists (select 1 from pg_type where typname = 'app_role') then
    alter type public.app_role add value if not exists 'super_admin';
    alter type public.app_role add value if not exists 'project_manager';
    alter type public.app_role add value if not exists 'site_manager';
    alter type public.app_role add value if not exists 'qc_team';
    alter type public.app_role add value if not exists 'billing_team';
    alter type public.app_role add value if not exists 'finance_team';
    alter type public.app_role add value if not exists 'inventory_team';
  end if;
end $$;

insert into public.rbac_roles (organization_id, code, name, description, is_system)
values
  (null, 'super_admin', 'Super Admin', 'Full system, security, users, roles, workflow rules, and all organization data.', true),
  (null, 'upper_management', 'Upper Management', 'Full project and company visibility with approval, reporting, vendor, budget, and bill controls.', true),
  (null, 'project_manager', 'Project Manager', 'Assigned project execution control with tasks, DPR, delays, and limited commercial visibility.', true),
  (null, 'pr_team', 'PR Team', 'Procurement operations across material requests, PR, RFQ, quotations, vendors, PO, GRN, and procurement reports.', true),
  (null, 'site_manager', 'Site Manager', 'Assigned site mobile work for DPR, material requests, tasks, checklists, QC inputs, photos, notes, issues, and messages.', true),
  (null, 'qc_team', 'QC Team', 'Quality templates, inspections, checklist review, rework, QC approvals, and QC reports.', true),
  (null, 'billing_team', 'Billing Team', 'Vendor bills, duplicate checks, three-way matching, bill workflow, and billing reports.', true),
  (null, 'finance_team', 'Finance Team', 'Budget checks, payment status, cost exposure, financial analytics, and finance approvals.', true),
  (null, 'inventory_team', 'Inventory Team', 'Stock balances, transfers, issue slips, GRN stock posting, low-stock alerts, and inventory reports.', true)
on conflict (organization_id, code) do update
set name = excluded.name,
    description = excluded.description,
    is_system = true,
    updated_at = now();

insert into public.rbac_permissions (code, module, action, description)
values
  ('projects.read_assigned', 'projects', 'read_assigned', 'View assigned projects only'),
  ('projects.manage_all', 'projects', 'manage_all', 'Create, edit, archive, and assign all projects'),
  ('execution.manage', 'execution', 'manage', 'Manage activities, DPR, delays, tasks, and work orders'),
  ('site.mobile_write', 'site_mobile', 'write', 'Create site DPR, material requests, notes, checklists, photos, and issues from mobile'),
  ('procurement.manage', 'procurement', 'manage', 'Manage material requests, PR, RFQ, quotations, vendors, PO, GRN, and procurement reports'),
  ('inventory.manage', 'inventory', 'manage', 'Manage stock balances, stock ledger, transfers, issue slips, and low-stock alerts'),
  ('qc.manage', 'qc', 'manage', 'Manage QC checklists, inspections, failures, approvals, and rework'),
  ('billing.manage', 'billing', 'manage', 'Manage vendor bills, duplicate checks, and billing workflow'),
  ('finance.manage', 'finance', 'manage', 'Manage budgets, payment status, cost exposure, and financial analytics'),
  ('reports.export', 'reports', 'export', 'Generate, export, and share reports'),
  ('admin.manage', 'admin', 'manage', 'Manage users, roles, templates, workflow rules, and company settings'),
  ('workflow.approve', 'workflow', 'approve', 'Approve, reject, send back, and comment on workflow approvals'),
  ('documents.manage', 'documents', 'manage', 'Upload, version, approve, archive, and export documents'),
  ('communication.convert', 'communication', 'convert', 'Convert inbox messages into tasks, PRs, delays, issues, QC observations, or document requests')
on conflict (code) do update
set module = excluded.module,
    action = excluded.action,
    description = excluded.description;

insert into public.rbac_role_permissions (role_id, permission_id)
select r.id, p.id
from public.rbac_roles r
join public.rbac_permissions p on
  (r.code in ('super_admin', 'upper_management') and p.code in (
    'projects.read_assigned','projects.manage_all','execution.manage','site.mobile_write',
    'procurement.manage','inventory.manage','qc.manage','billing.manage','finance.manage',
    'reports.export','admin.manage','workflow.approve','documents.manage','communication.convert'
  ))
  or (r.code = 'project_manager' and p.code in ('projects.read_assigned','execution.manage','reports.export','documents.manage','communication.convert'))
  or (r.code = 'pr_team' and p.code in ('projects.read_assigned','procurement.manage','inventory.manage','reports.export','documents.manage','communication.convert'))
  or (r.code = 'site_manager' and p.code in ('projects.read_assigned','site.mobile_write','documents.manage','communication.convert'))
  or (r.code = 'qc_team' and p.code in ('projects.read_assigned','qc.manage','execution.manage','reports.export','documents.manage','communication.convert'))
  or (r.code = 'billing_team' and p.code in ('projects.read_assigned','billing.manage','reports.export','documents.manage','communication.convert'))
  or (r.code = 'finance_team' and p.code in ('projects.read_assigned','finance.manage','billing.manage','reports.export','documents.manage'))
  or (r.code = 'inventory_team' and p.code in ('projects.read_assigned','inventory.manage','procurement.manage','reports.export','documents.manage','communication.convert'))
where r.organization_id is null
on conflict do nothing;

create or replace function app_private.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select lower(coalesce(p.role::text, ''))
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active = true
  limit 1;
$$;

create or replace function app_private.has_any_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select app_private.current_app_role()) = any(roles), false);
$$;

create or replace function app_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select (select app_private.current_app_role()) in ('super_admin', 'upper_management');
$$;

create or replace function app_private.is_pr_team()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select (select app_private.current_app_role()) = 'pr_team';
$$;

create or replace function app_private.can_access_procurement(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and (
       (select app_private.is_admin())
       or (select app_private.current_app_role()) in ('pr_team', 'inventory_team')
     );
$$;

create or replace function app_private.can_manage_inventory(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and (
       (select app_private.is_admin())
       or (select app_private.current_app_role()) in ('inventory_team', 'pr_team')
     );
$$;

create or replace function app_private.can_manage_qc(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and (
       (select app_private.is_admin())
       or (select app_private.current_app_role()) in ('qc_team', 'project_manager')
       or exists (
         select 1 from public.project_members pm
         where pm.project_id = target_project
           and pm.user_id = (select auth.uid())
           and pm.is_active = true
       )
     );
$$;

create or replace function app_private.can_manage_billing(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and (
       (select app_private.is_admin())
       or (select app_private.current_app_role()) in ('billing_team', 'finance_team')
     );
$$;

create table if not exists public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  push_token text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id)
);

create table if not exists public.mobile_sync_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  device_registration_id uuid references public.device_registrations(id) on delete set null,
  idempotency_key text not null unique,
  entity_table text not null,
  operation text not null check (operation in ('insert', 'update', 'archive', 'upload')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'applied', 'failed', 'cancelled')),
  error_message text,
  queued_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.workflow_rule_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  workflow_type text not null,
  rule_key text not null,
  rule_value jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, workflow_type, rule_key)
);

create table if not exists public.report_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  report_type text not null,
  format text not null check (format in ('pdf', 'xlsx', 'csv')),
  filters jsonb not null default '{}'::jsonb,
  status public.erp_report_status not null default 'queued',
  storage_bucket text,
  storage_path text,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_job_id uuid references public.report_jobs(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  project_id uuid references public.projects(id) on delete cascade,
  report_type text not null,
  snapshot_data jsonb not null default '{}'::jsonb,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);

create table if not exists public.project_health_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  schedule_score numeric(5,2) not null default 0 check (schedule_score >= 0 and schedule_score <= 100),
  budget_score numeric(5,2) not null default 0 check (budget_score >= 0 and budget_score <= 100),
  procurement_score numeric(5,2) not null default 0 check (procurement_score >= 0 and procurement_score <= 100),
  inventory_score numeric(5,2) not null default 0 check (inventory_score >= 0 and inventory_score <= 100),
  qc_score numeric(5,2) not null default 0 check (qc_score >= 0 and qc_score <= 100),
  safety_score numeric(5,2) not null default 0 check (safety_score >= 0 and safety_score <= 100),
  workforce_score numeric(5,2) not null default 0 check (workforce_score >= 0 and workforce_score <= 100),
  billing_score numeric(5,2) not null default 0 check (billing_score >= 0 and billing_score <= 100),
  approval_score numeric(5,2) not null default 0 check (approval_score >= 0 and approval_score <= 100),
  risk_alerts jsonb not null default '[]'::jsonb,
  executive_summary text,
  calculated_at timestamptz not null default now(),
  calculated_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_device_registrations_user_active on public.device_registrations(user_id) where revoked_at is null;
create index if not exists idx_mobile_sync_queue_user_status on public.mobile_sync_queue(user_id, status, queued_at);
create index if not exists idx_workflow_rule_configs_type_active on public.workflow_rule_configs(workflow_type) where is_active = true;
create index if not exists idx_report_jobs_project_type on public.report_jobs(project_id, report_type, requested_at desc);
create index if not exists idx_report_snapshots_project_type on public.report_snapshots(project_id, report_type, generated_at desc);
create index if not exists idx_project_health_scores_project_time on public.project_health_scores(project_id, calculated_at desc);

alter table public.device_registrations enable row level security;
alter table public.mobile_sync_queue enable row level security;
alter table public.workflow_rule_configs enable row level security;
alter table public.report_jobs enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.project_health_scores enable row level security;

drop policy if exists device_registrations_self on public.device_registrations;
create policy device_registrations_self on public.device_registrations
for all to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_admin()))
with check (user_id = (select auth.uid()) or (select app_private.is_admin()));

drop policy if exists mobile_sync_queue_self on public.mobile_sync_queue;
create policy mobile_sync_queue_self on public.mobile_sync_queue
for all to authenticated
using (user_id = (select auth.uid()) or (select app_private.is_admin()))
with check (user_id = (select auth.uid()) or (select app_private.is_admin()));

drop policy if exists workflow_rule_configs_admin on public.workflow_rule_configs;
create policy workflow_rule_configs_admin on public.workflow_rule_configs
for all to authenticated
using ((select app_private.is_admin()))
with check ((select app_private.is_admin()));

drop policy if exists report_jobs_project_access on public.report_jobs;
create policy report_jobs_project_access on public.report_jobs
for all to authenticated
using (project_id is null or (select app_private.can_access_project(project_id)) or (select app_private.is_admin()))
with check (project_id is null or (select app_private.can_access_project(project_id)) or (select app_private.is_admin()));

drop policy if exists report_snapshots_project_access on public.report_snapshots;
create policy report_snapshots_project_access on public.report_snapshots
for select to authenticated
using (project_id is null or (select app_private.can_access_project(project_id)) or (select app_private.is_admin()));

drop policy if exists project_health_scores_project_access on public.project_health_scores;
create policy project_health_scores_project_access on public.project_health_scores
for select to authenticated
using ((select app_private.can_access_project(project_id)) or (select app_private.is_admin()));

insert into public.workflow_rule_configs (organization_id, workflow_type, rule_key, rule_value)
values
  (null, 'procurement', 'high_value_pr_approval', '{"threshold_amount":0,"approver_roles":["upper_management"],"note":"Default requires management approval until business-specific threshold is configured."}'::jsonb),
  (null, 'purchase_order', 'budget_reservation_required', '{"enabled":true,"overrun_requires_roles":["upper_management","finance_team"]}'::jsonb),
  (null, 'billing', 'qc_grn_po_budget_gate', '{"require_qc_pass":true,"require_grn":true,"require_approved_po":true,"require_budget_available":true,"block_duplicate_bills":true}'::jsonb),
  (null, 'delay', 'escalation_defaults', '{"critical_after_hours":24,"notify_roles":["upper_management","project_manager"]}'::jsonb),
  (null, 'mobile_sync', 'offline_retry_policy', '{"max_attempts":5,"backoff_seconds":[10,30,120,300,900]}'::jsonb)
on conflict (organization_id, workflow_type, rule_key) do update
set rule_value = excluded.rule_value,
    is_active = true,
    updated_at = now();
