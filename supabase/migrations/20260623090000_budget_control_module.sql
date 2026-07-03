-- Budget control module: allocation RPCs, revision ledger, alerts, and commitment release.

create schema if not exists app_private;

create or replace function app_private.can_manage_budget(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_project is not null
     and (
       (select app_private.is_admin())
       or coalesce((select app_private.current_app_role()), '') = 'finance_team'
     );
$$;

create or replace function app_private.refresh_budget_alert(p_budget_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  allocation_row public.budget_allocations%rowtype;
  exposure_percent numeric;
  alert_kind text;
  alert_message text;
begin
  select * into allocation_row
  from public.budget_allocations
  where id = p_budget_allocation_id
    and deleted_at is null;

  if not found or allocation_row.allocated_amount <= 0 then
    return;
  end if;

  exposure_percent :=
    ((allocation_row.committed_amount + allocation_row.spent_amount) / allocation_row.allocated_amount) * 100;

  if exposure_percent >= allocation_row.hard_limit_percent then
    alert_kind := 'overrun';
    alert_message := allocation_row.allocation_name || ' has reached or exceeded the hard budget limit.';
  elsif exposure_percent >= allocation_row.warning_threshold_percent then
    alert_kind := 'near_limit';
    alert_message := allocation_row.allocation_name || ' has crossed the warning budget threshold.';
  else
    update public.budget_alerts
    set status = 'closed',
        resolved_at = coalesce(resolved_at, now()),
        updated_at = now(),
        updated_by = (select auth.uid())
    where budget_allocation_id = allocation_row.id
      and status = 'pending'
      and alert_type in ('near_limit', 'overrun');
    return;
  end if;

  update public.budget_alerts
  set actual_percent = exposure_percent,
      threshold_percent = case when alert_kind = 'overrun' then allocation_row.hard_limit_percent else allocation_row.warning_threshold_percent end,
      message = alert_message,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = (
    select id
    from public.budget_alerts
    where budget_allocation_id = allocation_row.id
      and alert_type = alert_kind
      and status = 'pending'
    order by created_at desc
    limit 1
  );

  if not found then
    insert into public.budget_alerts (
      project_id,
      budget_allocation_id,
      alert_type,
      threshold_percent,
      actual_percent,
      message,
      status,
      created_by,
      updated_by
    )
    values (
      allocation_row.project_id,
      allocation_row.id,
      alert_kind,
      case when alert_kind = 'overrun' then allocation_row.hard_limit_percent else allocation_row.warning_threshold_percent end,
      exposure_percent,
      alert_message,
      'pending',
      (select auth.uid()),
      (select auth.uid())
    );
  end if;
end;
$$;

create or replace function public.create_budget_allocation(
  p_project_id uuid,
  p_allocation_name text,
  p_allocated_amount numeric,
  p_budget_head_name text,
  p_budget_head_code text default null,
  p_cost_code text default null,
  p_cost_code_name text default null,
  p_site_id uuid default null,
  p_activity_id uuid default null,
  p_vendor_id uuid default null,
  p_warning_threshold_percent numeric default 80,
  p_hard_limit_percent numeric default 100,
  p_status public.erp_workflow_status default 'approved'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_allocation_name text := nullif(trim(p_allocation_name), '');
  clean_head_name text := nullif(trim(p_budget_head_name), '');
  head_code text := upper(coalesce(nullif(trim(p_budget_head_code), ''), left(regexp_replace(coalesce(p_budget_head_name, 'BUDGET'), '[^A-Za-z0-9]+', '', 'g'), 16), 'BUDGET'));
  cost_code_value text := upper(nullif(trim(p_cost_code), ''));
  cost_code_id_value uuid;
  budget_head_id_value uuid;
  allocation_id_value uuid;
begin
  if not (select app_private.can_manage_budget(p_project_id)) then
    raise exception 'You do not have budget management access to this project';
  end if;

  if clean_allocation_name is null then
    raise exception 'Budget allocation name is required';
  end if;

  if clean_head_name is null then
    raise exception 'Budget head name is required';
  end if;

  if coalesce(p_allocated_amount, 0) < 0 then
    raise exception 'Budget amount cannot be negative';
  end if;

  if coalesce(p_warning_threshold_percent, 80) < 0 or coalesce(p_warning_threshold_percent, 80) > 100 then
    raise exception 'Warning threshold must be between 0 and 100';
  end if;

  if coalesce(p_hard_limit_percent, 100) < coalesce(p_warning_threshold_percent, 80) then
    raise exception 'Hard limit cannot be lower than warning threshold';
  end if;

  if cost_code_value is not null then
    select id into cost_code_id_value
    from public.cost_codes
    where project_id = p_project_id
      and deleted_at is null
      and lower(code) = lower(cost_code_value)
    limit 1;

    if cost_code_id_value is null then
      insert into public.cost_codes (project_id, code, name, created_by, updated_by)
      values (p_project_id, cost_code_value, coalesce(nullif(trim(p_cost_code_name), ''), clean_head_name), (select auth.uid()), (select auth.uid()))
      returning id into cost_code_id_value;
    end if;
  end if;

  select id into budget_head_id_value
  from public.budget_heads
  where project_id = p_project_id
    and deleted_at is null
    and lower(code) = lower(head_code)
  limit 1;

  if budget_head_id_value is null then
    insert into public.budget_heads (project_id, cost_code_id, code, name, created_by, updated_by)
    values (p_project_id, cost_code_id_value, head_code, clean_head_name, (select auth.uid()), (select auth.uid()))
    returning id into budget_head_id_value;
  end if;

  insert into public.budget_allocations (
    project_id,
    site_id,
    budget_head_id,
    activity_id,
    vendor_id,
    allocation_name,
    allocated_amount,
    warning_threshold_percent,
    hard_limit_percent,
    status,
    created_by,
    updated_by
  )
  values (
    p_project_id,
    p_site_id,
    budget_head_id_value,
    p_activity_id,
    p_vendor_id,
    clean_allocation_name,
    p_allocated_amount,
    coalesce(p_warning_threshold_percent, 80),
    coalesce(p_hard_limit_percent, 100),
    coalesce(p_status, 'approved'),
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into allocation_id_value;

  insert into public.budget_ledger (
    project_id,
    budget_allocation_id,
    transaction_type,
    source_table,
    source_id,
    amount,
    description,
    created_by
  )
  values (
    p_project_id,
    allocation_id_value,
    'allocation',
    'budget_allocations',
    allocation_id_value,
    p_allocated_amount,
    'Initial budget allocation: ' || clean_allocation_name,
    (select auth.uid())
  )
  on conflict do nothing;

  perform app_private.refresh_budget_alert(allocation_id_value);
  return jsonb_build_object('allocationId', allocation_id_value);
end;
$$;

create or replace function public.revise_budget_allocation(
  p_budget_allocation_id uuid,
  p_new_allocated_amount numeric,
  p_remarks text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  allocation_row public.budget_allocations%rowtype;
  delta_amount numeric;
begin
  select * into allocation_row
  from public.budget_allocations
  where id = p_budget_allocation_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Budget allocation not found';
  end if;

  if not (select app_private.can_manage_budget(allocation_row.project_id)) then
    raise exception 'You do not have budget management access to this project';
  end if;

  if coalesce(p_new_allocated_amount, 0) < 0 then
    raise exception 'Revised amount cannot be negative';
  end if;

  if p_new_allocated_amount < allocation_row.spent_amount then
    raise exception 'Revised budget cannot be less than already spent amount';
  end if;

  delta_amount := p_new_allocated_amount - allocation_row.allocated_amount;

  update public.budget_allocations
  set allocated_amount = p_new_allocated_amount,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = allocation_row.id;

  if delta_amount <> 0 then
    insert into public.budget_ledger (
      project_id,
      budget_allocation_id,
      transaction_type,
      source_table,
      source_id,
      amount,
      description,
      created_by
    )
    values (
      allocation_row.project_id,
      allocation_row.id,
      'adjustment',
      'budget_revisions',
      gen_random_uuid(),
      abs(delta_amount),
      case when delta_amount > 0 then 'Budget increased. ' else 'Budget reduced. ' end || coalesce(nullif(trim(p_remarks), ''), 'No remarks provided.'),
      (select auth.uid())
    );
  end if;

  perform app_private.refresh_budget_alert(allocation_row.id);
  return jsonb_build_object('allocationId', allocation_row.id, 'deltaAmount', delta_amount);
end;
$$;

create or replace function public.approve_budget_allocation(p_budget_allocation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  allocation_row public.budget_allocations%rowtype;
begin
  select * into allocation_row
  from public.budget_allocations
  where id = p_budget_allocation_id
    and deleted_at is null;

  if not found then
    raise exception 'Budget allocation not found';
  end if;

  if not (select app_private.can_manage_budget(allocation_row.project_id)) then
    raise exception 'You do not have budget approval access to this project';
  end if;

  update public.budget_allocations
  set status = 'approved',
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = allocation_row.id;

  perform app_private.refresh_budget_alert(allocation_row.id);
  return jsonb_build_object('allocationId', allocation_row.id, 'status', 'approved');
end;
$$;

create or replace function public.resolve_budget_alert(
  p_budget_alert_id uuid,
  p_status public.erp_workflow_status default 'closed'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  alert_row public.budget_alerts%rowtype;
begin
  select * into alert_row
  from public.budget_alerts
  where id = p_budget_alert_id;

  if not found then
    raise exception 'Budget alert not found';
  end if;

  if not (select app_private.can_manage_budget(alert_row.project_id)) then
    raise exception 'You do not have budget alert approval access to this project';
  end if;

  update public.budget_alerts
  set status = coalesce(p_status, 'closed'),
      resolved_at = now(),
      resolved_by = (select auth.uid()),
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = alert_row.id;

  return jsonb_build_object('alertId', alert_row.id, 'status', coalesce(p_status, 'closed'));
end;
$$;

create or replace function app_private.post_bill_budget_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  release_amount numeric := 0;
begin
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and new.budget_allocation_id is not null then

    select least(ba.committed_amount, new.total_amount)
    into release_amount
    from public.budget_allocations ba
    where ba.id = new.budget_allocation_id
    for update;

    release_amount := coalesce(release_amount, 0);

    if release_amount > 0 then
      insert into public.budget_ledger (
        project_id, budget_allocation_id, transaction_type, source_table, source_id, amount, description, created_by
      )
      values (
        new.project_id, new.budget_allocation_id, 'release', 'vendor_bills', new.id, release_amount,
        'Released PO commitment for approved vendor bill ' || new.bill_number, (select auth.uid())
      )
      on conflict do nothing;
    end if;

    insert into public.budget_ledger (
      project_id, budget_allocation_id, transaction_type, source_table, source_id, amount, description, created_by
    )
    values (
      new.project_id, new.budget_allocation_id, 'actual', 'vendor_bills', new.id, new.total_amount,
      'Approved vendor bill ' || new.bill_number, (select auth.uid())
    )
    on conflict do nothing;

    update public.budget_allocations
    set committed_amount = greatest(committed_amount - release_amount, 0),
        spent_amount = spent_amount + new.total_amount,
        updated_at = now(),
        updated_by = (select auth.uid())
    where id = new.budget_allocation_id;

    perform app_private.refresh_budget_alert(new.budget_allocation_id);
  end if;
  return new;
end;
$$;

create or replace function public.verify_vendor_bill(p_vendor_bill_id uuid, p_remarks text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  bill_row public.vendor_bills%rowtype;
  match_row public.three_way_matches%rowtype;
  available_budget numeric;
  po_reserved numeric := 0;
begin
  select * into bill_row
  from public.vendor_bills
  where id = p_vendor_bill_id and deleted_at is null;

  if not found then
    raise exception 'Vendor bill not found';
  end if;

  if not (select app_private.can_manage_billing(bill_row.project_id)) then
    raise exception 'You do not have billing access to this project';
  end if;

  if bill_row.duplicate_detected then
    update public.vendor_bills set status = 'blocked', updated_by = (select auth.uid()) where id = bill_row.id;
    raise exception 'Vendor bill is blocked because duplicate bill/document was detected';
  end if;

  if bill_row.purchase_order_id is null or bill_row.grn_id is null then
    update public.vendor_bills set status = 'blocked', updated_by = (select auth.uid()) where id = bill_row.id;
    raise exception 'Vendor bill requires linked PO and GRN';
  end if;

  select * into match_row
  from public.three_way_matches
  where vendor_bill_id = bill_row.id;

  if not found or match_row.match_status not in ('matched', 'within_tolerance') then
    update public.vendor_bills set status = 'blocked', updated_by = (select auth.uid()) where id = bill_row.id;
    raise exception 'Vendor bill three-way match is not approved';
  end if;

  if bill_row.budget_allocation_id is not null then
    select allocated_amount - committed_amount - spent_amount,
           least(committed_amount, bill_row.total_amount)
    into available_budget, po_reserved
    from public.budget_allocations
    where id = bill_row.budget_allocation_id;

    if coalesce(available_budget, 0) + coalesce(po_reserved, 0) < bill_row.total_amount then
      update public.vendor_bills set status = 'blocked', updated_by = (select auth.uid()) where id = bill_row.id;
      raise exception 'Budget is insufficient for vendor bill';
    end if;
  end if;

  update public.vendor_bills
  set status = 'verified',
      required_documents_received = true,
      work_completion_verified = true,
      qc_approval_verified = true,
      verified_by = (select auth.uid()),
      verified_at = now(),
      updated_by = (select auth.uid())
  where id = bill_row.id;

  perform app_private.flow1_notify(
    bill_row.project_id,
    'Vendor bill verified',
    bill_row.bill_number || ' is verified and awaiting approval.',
    'vendor_bill_verified',
    'vendor_bills',
    bill_row.id,
    'high',
    '/billing'
  );

  return jsonb_build_object('vendorBillId', bill_row.id, 'status', 'verified');
end;
$$;

drop policy if exists budget_allocations_finance_insert on public.budget_allocations;
create policy budget_allocations_finance_insert on public.budget_allocations
for insert to authenticated
with check ((select app_private.can_manage_budget(project_id)));

drop policy if exists budget_allocations_finance_update on public.budget_allocations;
create policy budget_allocations_finance_update on public.budget_allocations
for update to authenticated
using ((select app_private.can_manage_budget(project_id)))
with check ((select app_private.can_manage_budget(project_id)));

drop policy if exists budget_alerts_finance_update on public.budget_alerts;
create policy budget_alerts_finance_update on public.budget_alerts
for update to authenticated
using ((select app_private.can_manage_budget(project_id)))
with check ((select app_private.can_manage_budget(project_id)));

grant execute on function public.create_budget_allocation(uuid, text, numeric, text, text, text, text, uuid, uuid, uuid, numeric, numeric, public.erp_workflow_status) to authenticated;
grant execute on function public.revise_budget_allocation(uuid, numeric, text) to authenticated;
grant execute on function public.approve_budget_allocation(uuid) to authenticated;
grant execute on function public.resolve_budget_alert(uuid, public.erp_workflow_status) to authenticated;
