-- Collapse application access to two roles:
-- upper_management: full system access
-- pr_team: dashboard plus procurement-related workflows

do $$
begin
  if exists (select 1 from pg_type where typname = 'app_role') then
    alter type public.app_role add value if not exists 'upper_management';
    alter type public.app_role add value if not exists 'pr_team';
  end if;
end $$;

update public.profiles
set role = 'upper_management'::public.app_role
where role::text in (
  'super_admin', 'project_director', 'project_manager',
  'SUPER_ADMIN', 'PROJECT_DIRECTOR', 'PROJECT_MANAGER',
  'admin', 'administrator'
);

update public.profiles
set role = 'pr_team'::public.app_role
where role::text not in ('upper_management', 'pr_team');

update public.users
set role = case
  when lower(coalesce(role, '')) in ('super_admin', 'project_director', 'project_manager', 'admin', 'administrator', 'upper_management')
    then 'upper_management'
  else 'pr_team'
end;

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
      and p.role::text = 'upper_management'
  );
$$;

create or replace function app_private.is_pr_team()
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
      and p.role::text = 'pr_team'
  );
$$;

create or replace function app_private.can_access_procurement(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and ((select app_private.is_admin()) or (select app_private.is_pr_team()));
$$;

-- Do not let pr_team project memberships inherit broad project RLS for execution, billing, QC, or admin tables.
update public.project_members pm
set is_active = false
from public.profiles p
where p.id = pm.user_id
  and p.role::text = 'pr_team';

insert into public.rbac_permissions (code, module, action, description)
values
  ('dashboard.read', 'dashboard', 'read', 'View dashboard'),
  ('vendors.manage', 'vendors', 'manage', 'Manage procurement vendors'),
  ('documents.procurement', 'documents', 'manage', 'Manage procurement documents'),
  ('reports.procurement', 'reports', 'read', 'View procurement reports')
on conflict (code) do nothing;

insert into public.rbac_roles (organization_id, code, name, description, is_system)
select null, 'upper_management', 'Upper Management', 'Full system access', true
where not exists (
  select 1 from public.rbac_roles where organization_id is null and code = 'upper_management'
);

insert into public.rbac_roles (organization_id, code, name, description, is_system)
select null, 'pr_team', 'PR Team', 'Procurement and related module access', true
where not exists (
  select 1 from public.rbac_roles where organization_id is null and code = 'pr_team'
);

insert into public.rbac_role_permissions (role_id, permission_id)
select r.id, p.id
from public.rbac_roles r
cross join public.rbac_permissions p
where r.organization_id is null
  and r.code = 'pr_team'
  and p.code in (
    'dashboard.read',
    'projects.read',
    'procurement.manage',
    'inventory.manage',
    'vendors.manage',
    'documents.procurement',
    'reports.procurement'
  )
on conflict do nothing;

do $$
declare
  t text;
begin
  foreach t in array array[
    'material_requests','material_request_lines','purchase_requisitions',
    'purchase_requisition_lines','purchase_requisition_assignments','rfqs','rfq_vendors',
    'vendor_quotations','quotation_lines','quotation_scores','vendor_selections',
    'purchase_orders','purchase_order_lines','delivery_trackings','goods_receipt_notes',
    'goods_receipt_note_lines','stock_reservations','stock_transfers','stock_transfer_lines',
    'material_issue_slips','material_issue_lines','consumption_variances'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'pms_project_select', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_insert', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_update', t);
      execute format('drop policy if exists %I on public.%I', 'pms_project_delete', t);
      execute format('drop policy if exists %I on public.%I', 'pr_team_procurement_select', t);
      execute format('drop policy if exists %I on public.%I', 'pr_team_procurement_insert', t);
      execute format('drop policy if exists %I on public.%I', 'pr_team_procurement_update', t);
      execute format('drop policy if exists %I on public.%I', 'pr_team_procurement_delete', t);
      execute format('create policy %I on public.%I for select to authenticated using ((select app_private.can_access_procurement(project_id)))', 'pr_team_procurement_select', t);
      execute format('create policy %I on public.%I for insert to authenticated with check ((select app_private.can_access_procurement(project_id)))', 'pr_team_procurement_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using ((select app_private.can_access_procurement(project_id))) with check ((select app_private.can_access_procurement(project_id)))', 'pr_team_procurement_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select app_private.is_admin()))', 'pr_team_procurement_delete', t);
    end if;
  end loop;
end $$;

drop policy if exists pr_team_vendor_select on public.vendors;
create policy pr_team_vendor_select on public.vendors
for select to authenticated
using ((select app_private.is_admin()) or (select app_private.is_pr_team()));

drop policy if exists pr_team_vendor_write on public.vendors;
create policy pr_team_vendor_write on public.vendors
for all to authenticated
using ((select app_private.is_admin()) or (select app_private.is_pr_team()))
with check ((select app_private.is_admin()) or (select app_private.is_pr_team()));

drop policy if exists pr_team_item_master_select on public.item_master;
create policy pr_team_item_master_select on public.item_master
for select to authenticated
using ((select app_private.is_admin()) or (select app_private.is_pr_team()));

drop policy if exists pr_team_stock_balances_select on public.stock_balances;
create policy pr_team_stock_balances_select on public.stock_balances
for select to authenticated
using ((select app_private.can_access_procurement(project_id)));

drop policy if exists pr_team_stock_ledger_select on public.stock_ledger;
create policy pr_team_stock_ledger_select on public.stock_ledger
for select to authenticated
using ((select app_private.can_access_procurement(project_id)));
