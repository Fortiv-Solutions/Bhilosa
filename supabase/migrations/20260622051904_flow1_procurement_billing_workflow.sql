-- End-to-end Flow 1 RPCs and policies:
-- mobile material requirement -> PR/inventory decision -> PO/GRN -> billing/budget.

create schema if not exists app_private;

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
      and coalesce(p.is_active, true) = true
      and lower(p.role::text) in (
        'upper_management',
        'super_admin',
        'project_director',
        'project_manager',
        'admin',
        'administrator'
      )
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
      and coalesce(p.is_active, true) = true
      and lower(p.role::text) in (
        'pr_team',
        'procurement',
        'purchase',
        'purchase_team',
        'procurement_team'
      )
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'procurement-documents',
  'procurement-documents',
  false,
  52428800,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.flow1_sequence(prefix text)
returns text
language sql
stable
set search_path = public
as $$
  select upper(prefix) || '-' || to_char(now(), 'YYYYMMDD') || '-' || right(floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text, 6);
$$;

create or replace function app_private.flow1_slug(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'), '');
$$;

create or replace function app_private.flow1_item_id(item_name text, unit_code text default null, estimated_rate numeric default 0)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_id uuid;
  uom_id_value uuid;
  clean_name text := nullif(trim(item_name), '');
  item_sku text;
begin
  if clean_name is null then
    raise exception 'Material item name is required';
  end if;

  select id into existing_id
  from public.item_master
  where deleted_at is null and lower(name) = lower(clean_name)
  order by created_at
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  if nullif(trim(unit_code), '') is not null then
    select id into uom_id_value
    from public.unit_of_measurements
    where lower(code) = lower(trim(unit_code))
       or lower(name) = lower(trim(unit_code))
    limit 1;
  end if;

  item_sku := 'AUTO-' || upper(substr(md5(clean_name), 1, 12));

  insert into public.item_master (
    sku,
    name,
    uom_id,
    default_rate,
    is_stock_item,
    created_by,
    updated_by
  )
  values (
    item_sku,
    clean_name,
    uom_id_value,
    greatest(coalesce(estimated_rate, 0), 0),
    true,
    (select auth.uid()),
    (select auth.uid())
  )
  on conflict (sku) do update set
    name = excluded.name,
    uom_id = coalesce(public.item_master.uom_id, excluded.uom_id),
    default_rate = greatest(public.item_master.default_rate, excluded.default_rate),
    updated_at = now(),
    updated_by = (select auth.uid())
  returning id into existing_id;

  return existing_id;
end;
$$;

create or replace function app_private.flow1_notify(
  target_project uuid,
  title text,
  message text,
  notification_type text,
  entity_table text default null,
  entity_id uuid default null,
  priority public.erp_priority default 'medium',
  action_url text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.notifications (
    project_id,
    recipient_id,
    title,
    message,
    notification_type,
    priority,
    entity_table,
    entity_id,
    action_url,
    created_by,
    updated_by
  )
  values (
    target_project,
    null,
    title,
    message,
    notification_type,
    priority,
    entity_table,
    entity_id,
    action_url,
    (select auth.uid()),
    (select auth.uid())
  );
end;
$$;

create or replace function public.submit_mobile_material_request(
  p_project_id uuid,
  p_site_id uuid default null,
  p_title text default 'Material requirement',
  p_required_date date default current_date,
  p_priority text default 'medium',
  p_lines jsonb default '[]'::jsonb,
  p_attachments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  mr_id uuid;
  mr_no text;
  line jsonb;
  attachment jsonb;
  item_name text;
  item_id_value uuid;
  quantity_value numeric;
  rate_value numeric;
  priority_value public.erp_priority;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not ((select app_private.can_access_project(p_project_id)) or (select app_private.can_access_procurement(p_project_id))) then
    raise exception 'You do not have access to this project';
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one material line is required';
  end if;

  priority_value := case lower(coalesce(p_priority, 'medium'))
    when 'low' then 'low'::public.erp_priority
    when 'high' then 'high'::public.erp_priority
    when 'critical' then 'critical'::public.erp_priority
    else 'medium'::public.erp_priority
  end;

  mr_no := app_private.flow1_sequence('MR');

  insert into public.material_requests (
    project_id,
    site_id,
    mr_number,
    source,
    justification,
    required_date,
    priority,
    stock_decision,
    status,
    raised_by,
    submitted_at,
    created_by,
    updated_by
  )
  values (
    p_project_id,
    p_site_id,
    mr_no,
    'android',
    nullif(trim(p_title), ''),
    coalesce(p_required_date, current_date),
    priority_value,
    'pending',
    'submitted',
    (select auth.uid()),
    now(),
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into mr_id;

  for line in select * from jsonb_array_elements(p_lines)
  loop
    item_name := coalesce(line->>'itemDescription', line->>'materialName', line->>'name');
    quantity_value := nullif(line->>'quantity', '')::numeric;
    rate_value := coalesce(nullif(line->>'estimatedRate', '')::numeric, 0);
    item_id_value := coalesce(nullif(line->>'itemId', '')::uuid, app_private.flow1_item_id(item_name, line->>'unit', rate_value));

    if quantity_value is null or quantity_value <= 0 then
      raise exception 'Material quantity must be greater than zero';
    end if;

    insert into public.material_request_lines (
      material_request_id,
      project_id,
      item_id,
      item_description,
      quantity,
      estimated_rate,
      remarks,
      created_by,
      updated_by
    )
    values (
      mr_id,
      p_project_id,
      item_id_value,
      item_name,
      quantity_value,
      rate_value,
      nullif(line->>'remarks', ''),
      (select auth.uid()),
      (select auth.uid())
    );
  end loop;

  if jsonb_typeof(p_attachments) = 'array' then
    for attachment in select * from jsonb_array_elements(p_attachments)
    loop
      if nullif(attachment->>'storagePath', '') is not null then
        insert into public.entity_attachments (
          project_id,
          entity_table,
          entity_id,
          document_type,
          file_name,
          storage_bucket,
          storage_path,
          mime_type,
          size_bytes,
          document_hash,
          uploaded_by,
          created_by,
          updated_by
        )
        values (
          p_project_id,
          'material_requests',
          mr_id,
          coalesce(nullif(attachment->>'documentType', ''), 'material_request'),
          coalesce(nullif(attachment->>'fileName', ''), 'attachment'),
          coalesce(nullif(attachment->>'storageBucket', ''), 'procurement-documents'),
          attachment->>'storagePath',
          coalesce(nullif(attachment->>'mimeType', ''), 'application/octet-stream'),
          nullif(attachment->>'sizeBytes', '')::bigint,
          nullif(attachment->>'documentHash', ''),
          (select auth.uid()),
          (select auth.uid()),
          (select auth.uid())
        )
        on conflict (storage_path) do nothing;
      end if;
    end loop;
  end if;

  perform app_private.flow1_notify(
    p_project_id,
    'Material request submitted',
    coalesce(nullif(trim(p_title), ''), mr_no) || ' was submitted from mobile.',
    'material_request_submitted',
    'material_requests',
    mr_id,
    priority_value,
    '/procurement'
  );

  return jsonb_build_object('materialRequestId', mr_id, 'materialRequestNumber', mr_no);
end;
$$;

create or replace function public.review_material_request_inventory(p_material_request_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  request_row public.material_requests%rowtype;
  line_count integer;
  available_line_count integer;
  decision text;
begin
  select * into request_row
  from public.material_requests
  where id = p_material_request_id and deleted_at is null;

  if not found then
    raise exception 'Material request not found';
  end if;

  if not (select app_private.can_access_procurement(request_row.project_id)) then
    raise exception 'You do not have procurement access to this project';
  end if;

  select count(*) into line_count
  from public.material_request_lines
  where material_request_id = p_material_request_id;

  select count(*) into available_line_count
  from public.material_request_lines mrl
  where mrl.material_request_id = p_material_request_id
    and mrl.item_id is not null
    and coalesce((
      select sum(sb.available_qty)
      from public.stock_balances sb
      where sb.project_id = request_row.project_id
        and sb.item_id = mrl.item_id
        and (request_row.site_id is null or sb.site_id = request_row.site_id or sb.site_id is null)
    ), 0) >= mrl.quantity;

  decision := case when line_count > 0 and line_count = available_line_count then 'available' else 'shortage' end;

  update public.material_requests
  set stock_decision = decision,
      status = 'in_review',
      updated_by = (select auth.uid())
  where id = p_material_request_id;

  perform app_private.flow1_notify(
    request_row.project_id,
    case when decision = 'available' then 'Stock available' else 'Stock shortage' end,
    request_row.mr_number || ' inventory review result: ' || decision || '.',
    'material_request_inventory_reviewed',
    'material_requests',
    request_row.id,
    request_row.priority,
    '/procurement'
  );

  return jsonb_build_object('materialRequestId', p_material_request_id, 'decision', decision);
end;
$$;

create or replace function public.issue_material_from_stock(
  p_material_request_id uuid,
  p_location_id uuid default null,
  p_issued_to text default 'Site team'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  request_row public.material_requests%rowtype;
  line record;
  stock_row record;
  issue_id uuid;
  issue_no text;
begin
  select * into request_row
  from public.material_requests
  where id = p_material_request_id and deleted_at is null;

  if not found then
    raise exception 'Material request not found';
  end if;

  if not (select app_private.can_access_procurement(request_row.project_id)) then
    raise exception 'You do not have procurement access to this project';
  end if;

  issue_no := app_private.flow1_sequence('ISS');

  insert into public.material_issue_slips (
    project_id,
    site_id,
    location_id,
    activity_id,
    issue_number,
    issued_to,
    activity_team,
    status,
    created_by,
    updated_by
  )
  values (
    request_row.project_id,
    request_row.site_id,
    p_location_id,
    request_row.activity_id,
    issue_no,
    coalesce(nullif(trim(p_issued_to), ''), 'Site team'),
    'Material Request ' || request_row.mr_number,
    'draft',
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into issue_id;

  for line in
    select *
    from public.material_request_lines
    where material_request_id = p_material_request_id
  loop
    if line.item_id is null then
      raise exception 'Cannot issue % because it is not linked to item master', line.item_description;
    end if;

    select *
    into stock_row
    from public.stock_balances sb
    where sb.project_id = request_row.project_id
      and sb.item_id = line.item_id
      and (request_row.site_id is null or sb.site_id = request_row.site_id or sb.site_id is null)
      and (p_location_id is null or sb.location_id = p_location_id)
      and sb.available_qty >= line.quantity
    order by sb.available_qty desc
    limit 1
    for update;

    if not found then
      raise exception 'Insufficient stock for %', line.item_description;
    end if;

    insert into public.material_issue_lines (
      issue_slip_id,
      project_id,
      item_id,
      quantity,
      rate,
      created_by,
      updated_by
    )
    values (
      issue_id,
      request_row.project_id,
      line.item_id,
      line.quantity,
      coalesce(stock_row.average_rate, line.estimated_rate, 0),
      (select auth.uid()),
      (select auth.uid())
    );
  end loop;

  update public.material_issue_slips
  set status = 'approved',
      updated_by = (select auth.uid())
  where id = issue_id;

  update public.material_requests
  set status = 'closed',
      stock_decision = 'issued_from_stock',
      updated_by = (select auth.uid())
  where id = p_material_request_id;

  perform app_private.flow1_notify(
    request_row.project_id,
    'Material issued from stock',
    issue_no || ' fulfilled ' || request_row.mr_number || '.',
    'material_issued_from_stock',
    'material_issue_slips',
    issue_id,
    'medium',
    '/inventory'
  );

  return jsonb_build_object('materialRequestId', p_material_request_id, 'issueSlipId', issue_id, 'issueNumber', issue_no);
end;
$$;

create or replace function public.approve_purchase_requisition(p_purchase_requisition_id uuid, p_remarks text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  pr_row public.purchase_requisitions%rowtype;
begin
  select * into pr_row
  from public.purchase_requisitions
  where id = p_purchase_requisition_id and deleted_at is null;

  if not found then
    raise exception 'Purchase requisition not found';
  end if;

  if not (select app_private.can_access_procurement(pr_row.project_id)) then
    raise exception 'You do not have procurement access to this project';
  end if;

  update public.purchase_requisitions
  set status = 'approved',
      current_approval_stage = 'approved',
      assigned_team_notes = coalesce(nullif(p_remarks, ''), assigned_team_notes),
      updated_by = (select auth.uid())
  where id = p_purchase_requisition_id;

  perform app_private.flow1_notify(
    pr_row.project_id,
    'PR approved',
    pr_row.pr_number || ' is approved for RFQ.',
    'purchase_requisition_approved',
    'purchase_requisitions',
    pr_row.id,
    case when pr_row.finance_required then 'high'::public.erp_priority else 'medium'::public.erp_priority end,
    '/procurement'
  );

  return jsonb_build_object('purchaseRequisitionId', p_purchase_requisition_id, 'status', 'approved');
end;
$$;

create or replace function public.approve_and_send_purchase_order(p_purchase_order_id uuid, p_send_to_vendor boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  po_row public.purchase_orders%rowtype;
  has_selection boolean;
  budget_available numeric;
  commitment_inserted integer;
  next_status public.erp_po_status;
begin
  if not (select app_private.is_admin()) then
    raise exception 'Only upper management can approve purchase orders';
  end if;

  select * into po_row
  from public.purchase_orders
  where id = p_purchase_order_id and deleted_at is null;

  if not found then
    raise exception 'Purchase order not found';
  end if;

  select exists (
    select 1
    from public.vendor_selections vs
    where vs.project_id = po_row.project_id
      and vs.purchase_requisition_id = po_row.purchase_requisition_id
      and vs.selected_vendor_id = po_row.vendor_id
      and vs.status = 'approved'
  )
  into has_selection;

  if not has_selection then
    raise exception 'PO cannot be approved until vendor is finalized';
  end if;

  if po_row.budget_allocation_id is not null then
    select (allocated_amount - committed_amount - spent_amount)
    into budget_available
    from public.budget_allocations
    where id = po_row.budget_allocation_id
    for update;

    if budget_available < po_row.total_amount then
      raise exception 'Budget is insufficient for PO approval';
    end if;

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
      po_row.project_id,
      po_row.budget_allocation_id,
      'commitment',
      'purchase_orders',
      po_row.id,
      po_row.total_amount,
      'PO budget commitment ' || po_row.po_number,
      (select auth.uid())
    )
    on conflict do nothing;

    get diagnostics commitment_inserted = row_count;

    if commitment_inserted > 0 then
      update public.budget_allocations
      set committed_amount = committed_amount + po_row.total_amount,
          updated_by = (select auth.uid())
      where id = po_row.budget_allocation_id;
    end if;
  end if;

  next_status := case when p_send_to_vendor then 'sent_to_vendor'::public.erp_po_status else 'approved'::public.erp_po_status end;

  update public.purchase_orders
  set status = next_status,
      approved_by = coalesce(approved_by, (select auth.uid())),
      approved_at = coalesce(approved_at, now()),
      sent_at = case when p_send_to_vendor then coalesce(sent_at, now()) else sent_at end,
      updated_by = (select auth.uid())
  where id = po_row.id;

  perform app_private.flow1_notify(
    po_row.project_id,
    case when p_send_to_vendor then 'PO sent to vendor' else 'PO approved' end,
    po_row.po_number || ' is ' || replace(next_status::text, '_', ' ') || '.',
    'purchase_order_approved',
    'purchase_orders',
    po_row.id,
    'high',
    '/procurement'
  );

  return jsonb_build_object('purchaseOrderId', po_row.id, 'status', next_status::text);
end;
$$;

create or replace function public.post_goods_receipt_note(p_purchase_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  po_row public.purchase_orders%rowtype;
  grn_id uuid;
  grn_no text;
  line_count integer;
begin
  select * into po_row
  from public.purchase_orders
  where id = p_purchase_order_id and deleted_at is null;

  if not found then
    raise exception 'Purchase order not found';
  end if;

  if not (select app_private.can_access_procurement(po_row.project_id)) then
    raise exception 'You do not have procurement access to this project';
  end if;

  if po_row.status not in ('approved', 'sent_to_vendor', 'acknowledged', 'partially_delivered') then
    raise exception 'GRN can be posted only after PO approval or vendor dispatch';
  end if;

  select id into grn_id
  from public.goods_receipt_notes
  where purchase_order_id = po_row.id
    and status = 'posted'
    and deleted_at is null
  limit 1;

  if grn_id is not null then
    return jsonb_build_object('purchaseOrderId', po_row.id, 'grnId', grn_id, 'status', 'posted');
  end if;

  select count(*) into line_count
  from public.purchase_order_lines
  where purchase_order_id = po_row.id
    and item_id is not null;

  if line_count = 0 then
    raise exception 'GRN cannot be posted because PO has no item-linked lines';
  end if;

  grn_no := app_private.flow1_sequence('GRN');

  insert into public.goods_receipt_notes (
    project_id,
    site_id,
    purchase_order_id,
    vendor_id,
    grn_number,
    receipt_date,
    received_by,
    quantity_verification,
    physical_inspection,
    damage_check,
    quality_decision,
    status,
    created_by,
    updated_by
  )
  values (
    po_row.project_id,
    po_row.site_id,
    po_row.id,
    po_row.vendor_id,
    grn_no,
    current_date,
    (select auth.uid()),
    'Quantities accepted against PO lines.',
    'Material checked at site store.',
    'No rejected quantity recorded.',
    'approved',
    'draft',
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into grn_id;

  insert into public.goods_receipt_note_lines (
    grn_id,
    project_id,
    purchase_order_line_id,
    item_id,
    received_qty,
    accepted_qty,
    rejected_qty,
    unit_rate,
    created_by,
    updated_by
  )
  select
    grn_id,
    pol.project_id,
    pol.id,
    pol.item_id,
    pol.quantity - pol.received_qty,
    pol.quantity - pol.received_qty,
    0,
    pol.unit_rate,
    (select auth.uid()),
    (select auth.uid())
  from public.purchase_order_lines pol
  where pol.purchase_order_id = po_row.id
    and pol.item_id is not null
    and pol.quantity > pol.received_qty;

  update public.goods_receipt_notes
  set status = 'posted',
      posted_at = now(),
      updated_by = (select auth.uid())
  where id = grn_id;

  update public.purchase_order_lines
  set received_qty = quantity,
      updated_by = (select auth.uid())
  where purchase_order_id = po_row.id
    and item_id is not null;

  update public.purchase_orders
  set status = 'delivered',
      updated_by = (select auth.uid())
  where id = po_row.id;

  perform app_private.flow1_notify(
    po_row.project_id,
    'GRN posted',
    grn_no || ' posted and inventory updated.',
    'goods_receipt_note_posted',
    'goods_receipt_notes',
    grn_id,
    'medium',
    '/inventory'
  );

  return jsonb_build_object('purchaseOrderId', po_row.id, 'grnId', grn_id, 'grnNumber', grn_no, 'status', 'posted');
end;
$$;

create or replace function public.submit_vendor_bill_from_grn(
  p_grn_id uuid,
  p_bill_number text,
  p_bill_date date default current_date,
  p_document_hash text default null,
  p_storage_path text default null,
  p_file_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  grn_row public.goods_receipt_notes%rowtype;
  po_row public.purchase_orders%rowtype;
  bill_id uuid;
  bill_total numeric;
  duplicate_bill boolean;
  duplicate_document boolean;
  po_value numeric;
  match_status_value text;
begin
  select * into grn_row
  from public.goods_receipt_notes
  where id = p_grn_id and deleted_at is null;

  if not found then
    raise exception 'GRN not found';
  end if;

  if grn_row.status <> 'posted' then
    raise exception 'Vendor bill can be submitted only after GRN is posted';
  end if;

  if not (select app_private.can_access_procurement(grn_row.project_id)) then
    raise exception 'You do not have procurement access to this project';
  end if;

  select * into po_row
  from public.purchase_orders
  where id = grn_row.purchase_order_id;

  if not found then
    raise exception 'Linked PO not found';
  end if;

  select coalesce(sum(accepted_qty * unit_rate), 0)::numeric(16,2)
  into bill_total
  from public.goods_receipt_note_lines
  where grn_id = grn_row.id;

  if bill_total <= 0 then
    raise exception 'Vendor bill cannot be submitted for zero-value GRN';
  end if;

  select exists (
    select 1
    from public.vendor_bills
    where vendor_id = grn_row.vendor_id
      and lower(bill_number) = lower(trim(p_bill_number))
      and deleted_at is null
  ) into duplicate_bill;

  select exists (
    select 1
    from public.bill_documents
    where document_hash is not null
      and document_hash = nullif(trim(p_document_hash), '')
  ) into duplicate_document;

  insert into public.vendor_bills (
    project_id,
    site_id,
    vendor_id,
    purchase_order_id,
    grn_id,
    budget_allocation_id,
    bill_number,
    bill_date,
    subtotal_amount,
    tax_amount,
    total_amount,
    duplicate_detected,
    required_documents_received,
    work_completion_verified,
    qc_approval_verified,
    status,
    created_by,
    updated_by
  )
  values (
    grn_row.project_id,
    grn_row.site_id,
    grn_row.vendor_id,
    po_row.id,
    grn_row.id,
    po_row.budget_allocation_id,
    nullif(trim(p_bill_number), ''),
    coalesce(p_bill_date, current_date),
    bill_total,
    0,
    bill_total,
    duplicate_bill or duplicate_document,
    nullif(trim(p_storage_path), '') is not null or nullif(trim(p_document_hash), '') is not null,
    true,
    true,
    case when duplicate_bill or duplicate_document then 'blocked'::public.erp_billing_status else 'submitted'::public.erp_billing_status end,
    (select auth.uid()),
    (select auth.uid())
  )
  returning id into bill_id;

  insert into public.vendor_bill_lines (
    vendor_bill_id,
    project_id,
    item_id,
    purchase_order_line_id,
    description,
    quantity,
    rate,
    line_total,
    created_by,
    updated_by
  )
  select
    bill_id,
    grnl.project_id,
    grnl.item_id,
    grnl.purchase_order_line_id,
    coalesce(pol.item_description, 'GRN material'),
    grnl.accepted_qty,
    grnl.unit_rate,
    round((grnl.accepted_qty * grnl.unit_rate)::numeric, 2),
    (select auth.uid()),
    (select auth.uid())
  from public.goods_receipt_note_lines grnl
  left join public.purchase_order_lines pol on pol.id = grnl.purchase_order_line_id
  where grnl.grn_id = grn_row.id;

  if nullif(trim(p_storage_path), '') is not null then
    insert into public.bill_documents (
      vendor_bill_id,
      project_id,
      document_type,
      file_name,
      storage_bucket,
      storage_path,
      mime_type,
      document_hash,
      created_by,
      updated_by
    )
    values (
      bill_id,
      grn_row.project_id,
      'vendor_bill',
      coalesce(nullif(trim(p_file_name), ''), p_bill_number || '.pdf'),
      'procurement-documents',
      p_storage_path,
      'application/pdf',
      nullif(trim(p_document_hash), ''),
      (select auth.uid()),
      (select auth.uid())
    );
  end if;

  po_value := coalesce(po_row.total_amount, 0);
  match_status_value := case
    when duplicate_bill or duplicate_document then 'blocked_duplicate'
    when abs(po_value - bill_total) <= greatest(1, po_value * 0.02) then 'matched'
    else 'variance'
  end;

  insert into public.three_way_matches (
    project_id,
    vendor_bill_id,
    purchase_order_id,
    grn_id,
    po_value,
    grn_value,
    invoice_value,
    tolerance_amount,
    match_status,
    remarks,
    created_by,
    updated_by
  )
  values (
    grn_row.project_id,
    bill_id,
    po_row.id,
    grn_row.id,
    po_value,
    bill_total,
    bill_total,
    greatest(1, po_value * 0.02),
    match_status_value,
    case when match_status_value = 'matched' then 'PO, GRN, and bill are within tolerance.' else 'Manual billing review required.' end,
    (select auth.uid()),
    (select auth.uid())
  );

  insert into public.payment_approvals (
    project_id,
    vendor_bill_id,
    approval_order,
    status,
    created_by,
    updated_by
  )
  values (
    grn_row.project_id,
    bill_id,
    1,
    'pending',
    (select auth.uid()),
    (select auth.uid())
  );

  perform app_private.flow1_notify(
    grn_row.project_id,
    'Vendor bill submitted',
    p_bill_number || ' is ready for billing verification.',
    'vendor_bill_submitted',
    'vendor_bills',
    bill_id,
    case when duplicate_bill or duplicate_document then 'critical'::public.erp_priority else 'high'::public.erp_priority end,
    '/billing'
  );

  return jsonb_build_object('vendorBillId', bill_id, 'status', case when duplicate_bill or duplicate_document then 'blocked' else 'submitted' end, 'duplicateDetected', duplicate_bill or duplicate_document);
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
begin
  select * into bill_row
  from public.vendor_bills
  where id = p_vendor_bill_id and deleted_at is null;

  if not found then
    raise exception 'Vendor bill not found';
  end if;

  if not (select app_private.can_access_procurement(bill_row.project_id)) then
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
    select allocated_amount - committed_amount - spent_amount
    into available_budget
    from public.budget_allocations
    where id = bill_row.budget_allocation_id;

    if available_budget + bill_row.total_amount < 0 then
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

create or replace function public.approve_vendor_bill(p_vendor_bill_id uuid, p_remarks text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  bill_row public.vendor_bills%rowtype;
begin
  if not (select app_private.is_admin()) then
    raise exception 'Only upper management can approve vendor bills';
  end if;

  select * into bill_row
  from public.vendor_bills
  where id = p_vendor_bill_id and deleted_at is null;

  if not found then
    raise exception 'Vendor bill not found';
  end if;

  if bill_row.status <> 'verified' then
    raise exception 'Vendor bill must be verified before approval';
  end if;

  update public.vendor_bills
  set status = 'approved',
      payment_status = 'approved',
      approved_by = (select auth.uid()),
      approved_at = now(),
      updated_by = (select auth.uid())
  where id = bill_row.id;

  update public.payment_approvals
  set status = 'approved',
      approver_id = (select auth.uid()),
      acted_at = now(),
      remarks = coalesce(nullif(p_remarks, ''), remarks),
      updated_by = (select auth.uid())
  where vendor_bill_id = bill_row.id
    and approval_order = 1;

  perform app_private.flow1_notify(
    bill_row.project_id,
    'Vendor bill approved',
    bill_row.bill_number || ' was approved and budget ledger updated.',
    'vendor_bill_approved',
    'vendor_bills',
    bill_row.id,
    'high',
    '/budget'
  );

  return jsonb_build_object('vendorBillId', bill_row.id, 'status', 'approved');
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'vendor_bills',
    'vendor_bill_lines',
    'bill_documents',
    'three_way_matches',
    'payment_approvals',
    'payments',
    'budget_ledger',
    'budget_alerts',
    'notifications',
    'entity_attachments'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

drop policy if exists flow1_vendor_bills_select on public.vendor_bills;
create policy flow1_vendor_bills_select on public.vendor_bills
for select to authenticated
using ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin()));

drop policy if exists flow1_vendor_bills_insert on public.vendor_bills;
create policy flow1_vendor_bills_insert on public.vendor_bills
for insert to authenticated
with check ((select app_private.can_access_procurement(project_id)));

drop policy if exists flow1_vendor_bills_update on public.vendor_bills;
create policy flow1_vendor_bills_update on public.vendor_bills
for update to authenticated
using (
  (select app_private.is_admin())
  or ((select app_private.is_pr_team()) and status in ('draft', 'submitted', 'under_verification', 'blocked', 'rejected'))
)
with check (
  (select app_private.is_admin())
  or ((select app_private.is_pr_team()) and status in ('draft', 'submitted', 'under_verification', 'verified', 'blocked', 'rejected'))
);

do $$
declare
  t text;
begin
  foreach t in array array['vendor_bill_lines','bill_documents','three_way_matches','payment_approvals','payments'] loop
    execute format('drop policy if exists %I on public.%I', 'flow1_billing_children_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin()))',
      'flow1_billing_children_select', t
    );
    execute format('drop policy if exists %I on public.%I', 'flow1_billing_children_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin()))',
      'flow1_billing_children_insert', t
    );
    execute format('drop policy if exists %I on public.%I', 'flow1_billing_children_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin())) with check ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin()))',
      'flow1_billing_children_update', t
    );
  end loop;
end $$;

drop policy if exists flow1_budget_ledger_select on public.budget_ledger;
create policy flow1_budget_ledger_select on public.budget_ledger
for select to authenticated
using ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin()));

drop policy if exists flow1_budget_alerts_select on public.budget_alerts;
create policy flow1_budget_alerts_select on public.budget_alerts
for select to authenticated
using ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin()));

drop policy if exists flow1_notifications_select on public.notifications;
create policy flow1_notifications_select on public.notifications
for select to authenticated
using (
  recipient_id is null
  or recipient_id = (select auth.uid())
  or (project_id is not null and ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin())))
);

drop policy if exists flow1_notifications_update on public.notifications;
create policy flow1_notifications_update on public.notifications
for update to authenticated
using (
  recipient_id is null
  or recipient_id = (select auth.uid())
  or (project_id is not null and ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin())))
)
with check (
  recipient_id is null
  or recipient_id = (select auth.uid())
  or (project_id is not null and ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin())))
);

drop policy if exists flow1_entity_attachments_select on public.entity_attachments;
create policy flow1_entity_attachments_select on public.entity_attachments
for select to authenticated
using (project_id is not null and ((select app_private.can_access_procurement(project_id)) or (select app_private.is_admin())));

drop policy if exists flow1_entity_attachments_insert on public.entity_attachments;
create policy flow1_entity_attachments_insert on public.entity_attachments
for insert to authenticated
with check (project_id is not null and ((select app_private.can_access_procurement(project_id)) or (select app_private.can_access_project(project_id))));

drop policy if exists flow1_procurement_documents_select on storage.objects;
create policy flow1_procurement_documents_select on storage.objects
for select to authenticated
using (
  bucket_id = 'procurement-documents'
  and (select auth.uid()) is not null
);

drop policy if exists flow1_procurement_documents_insert on storage.objects;
create policy flow1_procurement_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'procurement-documents'
  and (select auth.uid()) is not null
);

drop policy if exists flow1_procurement_documents_update on storage.objects;
create policy flow1_procurement_documents_update on storage.objects
for update to authenticated
using (
  bucket_id = 'procurement-documents'
  and (select auth.uid()) is not null
)
with check (
  bucket_id = 'procurement-documents'
  and (select auth.uid()) is not null
);

create index if not exists flow1_material_request_lines_mr_idx on public.material_request_lines (material_request_id);
create index if not exists flow1_material_request_lines_item_idx on public.material_request_lines (item_id);
create index if not exists flow1_purchase_requisitions_mr_idx on public.purchase_requisitions (material_request_id);
create index if not exists flow1_vendor_bills_po_grn_idx on public.vendor_bills (purchase_order_id, grn_id);
create index if not exists flow1_bill_documents_hash_idx on public.bill_documents (document_hash) where document_hash is not null;
create index if not exists flow1_notifications_project_idx on public.notifications (project_id, created_at desc);

grant execute on function public.submit_mobile_material_request(uuid, uuid, text, date, text, jsonb, jsonb) to authenticated;
grant execute on function public.review_material_request_inventory(uuid) to authenticated;
grant execute on function public.issue_material_from_stock(uuid, uuid, text) to authenticated;
grant execute on function public.approve_purchase_requisition(uuid, text) to authenticated;
grant execute on function public.approve_and_send_purchase_order(uuid, boolean) to authenticated;
grant execute on function public.post_goods_receipt_note(uuid) to authenticated;
grant execute on function public.submit_vendor_bill_from_grn(uuid, text, date, text, text, text) to authenticated;
grant execute on function public.verify_vendor_bill(uuid, text) to authenticated;
grant execute on function public.approve_vendor_bill(uuid, text) to authenticated;
