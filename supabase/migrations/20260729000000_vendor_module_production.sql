-- =============================================================================
-- Vendor Module — production schema
-- -----------------------------------------------------------------------------
-- 1. Adds the missing vendor address attributes (location / city / pincode).
-- 2. Ensures vendor_contacts can hold the primary "Contact Person" and that a
--    vendor has at most ONE primary contact.
-- 3. Adds vendor_profile_summary: a read-only aggregate view giving each vendor's
--    procurement history (deliveries, last delivery date, PO/MR/RFQ/bill totals).
--
-- Everything is idempotent (IF NOT EXISTS / CREATE OR REPLACE) so it is safe to
-- re-run. Purely additive — no existing column or row is altered or dropped.
-- =============================================================================

-- ---- 1. Vendor master: missing address attributes ---------------------------
alter table public.vendors
  add column if not exists location text,
  add column if not exists city     text,
  add column if not exists pincode  text;

comment on column public.vendors.legal_name   is 'Company Name (mandatory)';
comment on column public.vendors.display_name is 'Vendor / Ledger Name (mandatory at app layer)';
comment on column public.vendors.phone        is 'Mobile Number (mandatory at app layer)';

-- Lookup indexes for the vendor ledger search / filters.
create index if not exists idx_vendors_city         on public.vendors (city)          where deleted_at is null;
create index if not exists idx_vendors_is_active    on public.vendors (is_active)     where deleted_at is null;
create index if not exists idx_vendors_legal_name   on public.vendors (lower(legal_name));
create index if not exists idx_vendors_display_name on public.vendors (lower(display_name));

-- ---- 2. Contact person lives in vendor_contacts (canonical, multi-contact) ---
-- The table already exists; guarantee the columns the app writes and enforce a
-- single primary contact per vendor so "Contact Person" is unambiguous.
alter table public.vendor_contacts
  add column if not exists name        text,
  add column if not exists designation text,
  add column if not exists email       text,
  add column if not exists phone       text,
  add column if not exists is_primary  boolean not null default false;

create unique index if not exists uq_vendor_contacts_one_primary
  on public.vendor_contacts (vendor_id)
  where is_primary and deleted_at is null;

create index if not exists idx_vendor_contacts_vendor_id
  on public.vendor_contacts (vendor_id)
  where deleted_at is null;

-- ---- 3. Vendor profile / history aggregate ----------------------------------
-- One row per vendor. Computed on read so it can never drift from the source
-- documents. Consumed by the vendor ledger list and the vendor profile panel.
--
-- Note on MR linkage: material_requests has no vendor_id. A vendor is associated
-- with an MR indirectly through PO -> purchase_requisition -> material_request,
-- so linked_mr_count counts DISTINCT source MRs reached via that path.
create or replace view public.vendor_profile_summary as
with po as (
  select
    vendor_id,
    count(*)                             as total_pos,
    coalesce(sum(total_amount), 0)       as total_po_value,
    max(po_date)                         as last_po_date
  from public.purchase_orders
  where deleted_at is null
  group by vendor_id
),
grn as (
  select
    vendor_id,
    count(*)                             as total_grns,
    max(receipt_date)                    as last_delivery_date
  from public.goods_receipt_notes
  where deleted_at is null
  group by vendor_id
),
bill as (
  select
    vendor_id,
    count(*)                             as total_bills,
    coalesce(sum(total_amount), 0)       as total_billed_value
  from public.vendor_bills
  group by vendor_id
),
rfq as (
  select vendor_id, count(*) as total_rfqs_invited
  from public.rfq_vendors
  group by vendor_id
),
quote as (
  select vendor_id, count(*) as total_quotations
  from public.vendor_quotations
  group by vendor_id
),
mr as (
  select o.vendor_id, count(distinct r.material_request_id) as linked_mr_count
  from public.purchase_orders o
  join public.purchase_requisitions r on r.id = o.purchase_requisition_id
  where o.deleted_at is null
    and r.material_request_id is not null
  group by o.vendor_id
),
contact as (
  select vendor_id, name as contact_person, designation as contact_designation,
         email as contact_email, phone as contact_phone
  from public.vendor_contacts
  where is_primary and deleted_at is null
)
select
  v.id                                        as vendor_id,
  v.vendor_code,
  v.legal_name,
  v.display_name,
  v.gst_number,
  v.pan_number,
  v.email,
  v.phone,
  v.address,
  v.location,
  v.city,
  v.pincode,
  v.compliance_status,
  v.rating,
  v.is_active,
  v.created_at,
  c.contact_person,
  c.contact_designation,
  c.contact_email,
  c.contact_phone,
  coalesce(po.total_pos, 0)                   as total_pos,
  coalesce(po.total_po_value, 0)              as total_po_value,
  po.last_po_date,
  coalesce(grn.total_grns, 0)                 as total_deliveries,
  grn.last_delivery_date,
  coalesce(bill.total_bills, 0)               as total_bills,
  coalesce(bill.total_billed_value, 0)        as total_billed_value,
  coalesce(rfq.total_rfqs_invited, 0)         as total_rfqs_invited,
  coalesce(quote.total_quotations, 0)         as total_quotations,
  coalesce(mr.linked_mr_count, 0)             as linked_mr_count
from public.vendors v
left join po      on po.vendor_id    = v.id
left join grn     on grn.vendor_id   = v.id
left join bill    on bill.vendor_id  = v.id
left join rfq     on rfq.vendor_id   = v.id
left join quote   on quote.vendor_id = v.id
left join mr      on mr.vendor_id    = v.id
left join contact c on c.vendor_id   = v.id
where v.deleted_at is null;

comment on view public.vendor_profile_summary is
  'Read-only vendor master + procurement history aggregate (POs, deliveries/GRNs, bills, RFQs, quotations, linked MRs) and primary contact. Computed on read so it cannot drift.';

-- Supporting indexes for the aggregate joins.
create index if not exists idx_purchase_orders_vendor_id      on public.purchase_orders (vendor_id)      where deleted_at is null;
create index if not exists idx_grn_vendor_id                  on public.goods_receipt_notes (vendor_id)  where deleted_at is null;
create index if not exists idx_vendor_bills_vendor_id         on public.vendor_bills (vendor_id);
create index if not exists idx_vendor_quotations_vendor_id    on public.vendor_quotations (vendor_id);

grant select on public.vendor_profile_summary to anon, authenticated, service_role;
