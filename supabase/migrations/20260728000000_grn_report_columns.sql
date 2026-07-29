-- =============================================================================
-- GRN "Download Report" — schema delta
-- -----------------------------------------------------------------------------
-- Adds the columns the Goods Received Note report PDF renders that are not yet
-- present on goods_receipt_notes / goods_receipt_note_lines. Everything is
-- idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to re-run.
--
-- The PDF endpoint (POST /api/procurement/grns/{id}/pdf) reads these via
-- `SELECT *` / `l.*`, so once this migration is applied the values flow through
-- automatically; until then those cells simply render as '-' / 0.00.
-- =============================================================================

-- ---- Header: accounting / status extras -------------------------------------
alter table public.goods_receipt_notes
  add column if not exists remarks                 text,
  add column if not exists account_posting_amount  numeric,
  add column if not exists asset_amount            numeric default 0,
  add column if not exists asset_item              text,
  add column if not exists pb_lines_created        numeric,
  add column if not exists unlocked_fy             numeric default 1.00;
-- (qc_no, challan_no, challan_date, vehicle_no, volume_in_brass, in_weight,
--  out_weight, net_weight, transporter_name, godown_name, dealer_name already exist.)

-- ---- Line items: Purchase-Entries report columns ----------------------------
alter table public.goods_receipt_note_lines
  add column if not exists po_number            text,
  add column if not exists pr_number            text,
  add column if not exists item_group           text,
  add column if not exists item_code            text,
  add column if not exists item_brand           text,
  add column if not exists item_description     text,
  add column if not exists location             text,
  add column if not exists purchase_category    text,
  add column if not exists unit                 text,
  add column if not exists approved_qty         numeric,
  add column if not exists po_balance_qty       numeric,
  add column if not exists return_qty           numeric,
  add column if not exists challan_qty          numeric,
  add column if not exists balance_allowed      numeric,
  add column if not exists current_balance_qty  numeric,
  add column if not exists test_report_no       text,
  add column if not exists expiry_date          date;
-- (received_qty, accepted_qty, rejected_qty, unit_rate already exist.)

-- ---- Optional: GRN status/audit history feeds the report's REPORT HISTORY ----
-- Mirrors pr_activity_log. If absent, the report falls back to a single
-- synthetic "Created -> <status>" row.
create table if not exists public.grn_activity_log (
  id               uuid primary key default gen_random_uuid(),
  grn_id           uuid not null references public.goods_receipt_notes(id) on delete cascade,
  project_id       uuid,
  action           text,
  previous_status  text,
  new_status       text,
  actor_id         uuid,
  actor_role       text,
  comment          text,
  created_at       timestamp with time zone not null default now()
);

create index if not exists idx_grn_activity_log_grn_id on public.grn_activity_log (grn_id);
