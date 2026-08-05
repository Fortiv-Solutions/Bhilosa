-- =====================================================================
-- PURCHASE ORDER MODULE — PRODUCTION HARDENING
-- =====================================================================
-- Companion to 20260805090000_po_status_enum_canonical.sql, which must run
-- first (it adds the enum labels this migration writes).
--
-- Audit findings addressed, in order:
--
--   A. Three competing status vocabularies wrote to purchase_orders.status;
--      only one was a valid enum. Legacy rows are rewritten and a single
--      transition table becomes the database-level authority (§3, §6).
--   B. Status was driven by a free <select> in the browser with no transition
--      rule and no server-side check. The guard trigger now rejects any
--      illegal move and gates privileged moves on app_can_approve() (§6).
--   C. Re-saving a live PO reverted it to 'draft', leaving an already-posted
--      budget commitment against a draft order. Illegal now (§6).
--   D. No status history, and approved_by/approved_at were client-supplied.
--      po_status_history records every transition with its actor (§5).
--   E. Header totals were client-supplied with only a >= 0 check, so they
--      could disagree with the lines that back them — and the budget
--      commitment posts total_amount verbatim. Totals are now derived in the
--      database (§7).
--   F. line_total meant tax-inclusive on one write path and tax-exclusive on
--      two others. It is now defined as tax-inclusive everywhere and existing
--      rows are backfilled (§4, §7).
--   G. Discounts and freight/loading/other charges collected by the PO form
--      had nowhere to land and were discarded on every save (§4).
--   H. Tolerance allowance was re-granted on every partial receipt, so
--      cumulative over-receipt was unbounded. Now a cumulative cap (§9).
--   I. Cancelled and unposted GRNs consumed PO balance (§9).
--   J. anon could read and write every PO using the publishable key that
--      ships in the browser bundle (§10).
--   K. save_purchase_order deleted the existing lines, then inserted the new
--      ones in a separate statement — a failed insert destroyed the lines it
--      was replacing. Both now happen in one transaction (§11).
--   L. No indexes on the PO join columns (§8).
--
-- Everything here is idempotent and converges on re-run.
-- =====================================================================

-- =====================================================================
-- 1. PREREQUISITE IDENTITY + ROLE HELPERS
-- =====================================================================
-- 20260731090100_procurement_production_hardening.sql defines these, but the
-- live schema shows it only partially applied (document_number_sequences
-- exists; three_way_matches and the vendor_bills columns do not). This
-- migration therefore cannot assume they are present.
--
-- The bodies are byte-identical to that migration's, so whichever runs last
-- leaves the same definition behind and the two cannot diverge.

CREATE OR REPLACE FUNCTION public.app_normalize_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(regexp_replace(coalesce(trim(p_role), ''), '[\s-]+', '_', 'g'))
    WHEN 'upper_management'    THEN 'upper_management'
    WHEN 'admin'               THEN 'upper_management'
    WHEN 'administrator'       THEN 'upper_management'
    WHEN 'superadmin'          THEN 'upper_management'
    WHEN 'super_admin'         THEN 'upper_management'
    WHEN 'project_director'    THEN 'upper_management'
    WHEN 'director'            THEN 'upper_management'
    WHEN 'management'          THEN 'upper_management'
    WHEN 'project_manager'     THEN 'project_manager'
    WHEN 'pr_team'             THEN 'pr_team'
    WHEN 'procurement'         THEN 'pr_team'
    WHEN 'procurement_manager' THEN 'pr_team'
    WHEN 'purchase'            THEN 'pr_team'
    WHEN 'purchase_team'       THEN 'pr_team'
    WHEN 'site_engineer'       THEN 'site_engineer'
    WHEN 'engineer'            THEN 'site_engineer'
    WHEN 'store_keeper'        THEN 'site_engineer'
    WHEN 'storekeeper'         THEN 'site_engineer'
    WHEN 'store'               THEN 'site_engineer'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.app_current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active
    AND p.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.app_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_normalize_role(p.role)
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.is_active
    AND p.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.app_can_write_procurement()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_role()
    IN ('upper_management', 'project_manager', 'pr_team', 'site_engineer');
$$;

CREATE OR REPLACE FUNCTION public.app_can_approve()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_role() IN ('upper_management', 'project_manager');
$$;

CREATE OR REPLACE FUNCTION public.app_can_approve_financial()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_current_role() = 'upper_management';
$$;

CREATE OR REPLACE FUNCTION public.app_require_profile()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_profile uuid;
BEGIN
  v_profile := public.app_current_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Authentication required: no active profile for the current session.'
      USING ERRCODE = '28000';
  END IF;
  RETURN v_profile;
END;
$$;

-- Atomic document numbering. The client-side fallback used
-- Math.random(), which collides.
CREATE TABLE IF NOT EXISTS public.document_number_sequences (
  prefix      text NOT NULL,
  period      text NOT NULL,
  last_value  bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_number_sequences_pkey PRIMARY KEY (prefix, period)
);

CREATE OR REPLACE FUNCTION public.next_document_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text := upper(coalesce(nullif(trim(p_prefix), ''), 'DOC'));
  v_period text := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');
  v_next   bigint;
BEGIN
  INSERT INTO public.document_number_sequences (prefix, period, last_value, updated_at)
  VALUES (v_prefix, v_period, 1, now())
  ON CONFLICT (prefix, period) DO UPDATE
    SET last_value = public.document_number_sequences.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN format('%s-%s-%s', v_prefix, v_period, lpad(v_next::text, 4, '0'));
END;
$$;

-- =====================================================================
-- 2. CANONICAL STATUS VOCABULARY (single source of truth)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.po_canonical_status(p_status text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(regexp_replace(coalesce(trim(p_status), ''), '[\s-]+', '_', 'g'))
    -- canonical labels pass straight through
    WHEN 'draft'               THEN 'draft'
    WHEN 'pending_approval'    THEN 'pending_approval'
    WHEN 'approved'            THEN 'approved'
    WHEN 'rejected'            THEN 'rejected'
    WHEN 'sent_to_vendor'      THEN 'sent_to_vendor'
    WHEN 'acknowledged'        THEN 'acknowledged'
    WHEN 'partially_delivered' THEN 'partially_delivered'
    WHEN 'delivered'           THEN 'delivered'
    WHEN 'short_closed'        THEN 'short_closed'
    WHEN 'closed'              THEN 'closed'
    WHEN 'cancelled'           THEN 'cancelled'
    -- legacy labels from the PO form and the old tolerance RPC
    WHEN 'draft_auto'          THEN 'draft'
    WHEN 'verification'        THEN 'pending_approval'
    WHEN 'pending_verification' THEN 'pending_approval'
    WHEN 'under_review'        THEN 'pending_approval'
    WHEN 'audit'               THEN 'pending_approval'
    WHEN 'pending'             THEN 'pending_approval'
    WHEN 'issued'              THEN 'sent_to_vendor'
    WHEN 'accepted_by_vendor'  THEN 'acknowledged'
    WHEN 'partially_received'  THEN 'partially_delivered'
    WHEN 'fulfilled'           THEN 'delivered'
    WHEN 'completed'           THEN 'delivered'
    WHEN 'canceled'            THEN 'cancelled'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.po_canonical_status(text) IS
  'Maps any historical or UI purchase-order status spelling onto the canonical erp_po_status label set. Returns NULL for an unrecognised value so callers fail closed rather than writing a status nobody validates.';

-- Legal transitions. Anything absent is rejected by the guard trigger.
CREATE OR REPLACE FUNCTION public.po_transition_allowed(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_from = p_to THEN true
    WHEN p_from = 'draft'               AND p_to IN ('pending_approval', 'cancelled') THEN true
    -- A PR-less direct PO raised by an approver may be approved from draft.
    WHEN p_from = 'draft'               AND p_to = 'approved' THEN true
    WHEN p_from = 'pending_approval'    AND p_to IN ('approved', 'rejected', 'draft', 'cancelled') THEN true
    WHEN p_from = 'rejected'            AND p_to IN ('draft', 'cancelled') THEN true
    WHEN p_from = 'approved'            AND p_to IN ('sent_to_vendor', 'cancelled') THEN true
    WHEN p_from = 'sent_to_vendor'      AND p_to IN ('acknowledged', 'partially_delivered', 'delivered', 'short_closed', 'cancelled') THEN true
    WHEN p_from = 'acknowledged'        AND p_to IN ('partially_delivered', 'delivered', 'short_closed', 'cancelled') THEN true
    WHEN p_from = 'partially_delivered' AND p_to IN ('delivered', 'short_closed', 'closed') THEN true
    WHEN p_from = 'delivered'           AND p_to IN ('short_closed', 'closed') THEN true
    WHEN p_from = 'short_closed'        AND p_to = 'closed' THEN true
    ELSE false   -- 'closed' and 'cancelled' are terminal
  END;
$$;

COMMENT ON FUNCTION public.po_transition_allowed(text, text) IS
  'The purchase-order state machine. Mirrored by PO_TRANSITIONS in frontend/src/lib/erp/purchase-order/status.ts; the database is the authority and the browser copy exists only to disable buttons early. Change both together.';

-- =====================================================================
-- 3. REWRITE ANY ROW HOLDING A LEGACY STATUS
-- =====================================================================
-- Runs before the guard trigger is installed so the corrective UPDATE is not
-- itself blocked as an illegal transition. Comparing on ::text means the
-- statement is a harmless no-op when the legacy label was never added to the
-- enum in the first place.

-- The predecessor guard from 20260731090100 gates 'sent_to_vendor' and
-- 'rejected' on app_can_approve(), which is false inside a migration because
-- there is no auth.uid(). It has to go before the rewrite below moves any row
-- to one of those, or the whole migration aborts with 42501.
DROP TRIGGER IF EXISTS guard_purchase_order_approval ON public.purchase_orders;

DO $$
DECLARE
  r record;
  v_target text;
  v_count  bigint;
BEGIN
  FOR r IN
    SELECT DISTINCT status::text AS legacy
    FROM public.purchase_orders
    WHERE public.po_canonical_status(status::text) IS DISTINCT FROM status::text
  LOOP
    v_target := public.po_canonical_status(r.legacy);

    IF v_target IS NULL THEN
      RAISE WARNING 'purchase_orders holds unrecognised status %; left untouched for manual review.', r.legacy;
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.purchase_orders SET status = %L::erp_po_status WHERE status::text = %L',
      v_target, r.legacy);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Migrated % purchase_orders row(s) from % to %.', v_count, r.legacy, v_target;
  END LOOP;
END $$;

-- =====================================================================
-- 4. SCHEMA COMPLETION
-- =====================================================================

-- 4a. Lifecycle audit columns. rejection_reason was previously squatting in
-- terms_and_conditions_legal; the rest had no home at all, so a rejection or
-- cancellation left no record of who did it or why.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS rejection_reason     text,
  ADD COLUMN IF NOT EXISTS rejected_at          timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by          uuid,
  ADD COLUMN IF NOT EXISTS cancellation_reason  text,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by         uuid,
  ADD COLUMN IF NOT EXISTS closed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by            uuid,
  ADD COLUMN IF NOT EXISTS acknowledged_at      timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at         timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by         uuid;

-- 4b. Commercial fields the PO form collects. Every one of these was typed by
-- the user and silently dropped on save, which is why the total shown in the
-- form footer never matched the total that reached the vendor.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS freight_amount                   numeric NOT NULL DEFAULT 0 CHECK (freight_amount >= 0),
  ADD COLUMN IF NOT EXISTS loading_unloading_charges        numeric NOT NULL DEFAULT 0 CHECK (loading_unloading_charges >= 0),
  ADD COLUMN IF NOT EXISTS other_charges                    numeric NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  ADD COLUMN IF NOT EXISTS discount_amount                  numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS transportation_taxable_amount    numeric NOT NULL DEFAULT 0 CHECK (transportation_taxable_amount >= 0),
  ADD COLUMN IF NOT EXISTS transportation_tax_rate          numeric NOT NULL DEFAULT 0 CHECK (transportation_tax_rate >= 0),
  ADD COLUMN IF NOT EXISTS transportation_tax_amount        numeric NOT NULL DEFAULT 0 CHECK (transportation_tax_amount >= 0),
  ADD COLUMN IF NOT EXISTS transportation_hsn_code          text,
  ADD COLUMN IF NOT EXISTS transportation_tax_code          text,
  ADD COLUMN IF NOT EXISTS credit_period_days               integer,
  ADD COLUMN IF NOT EXISTS note_on_po                       text,
  ADD COLUMN IF NOT EXISTS remarks                          text,
  ADD COLUMN IF NOT EXISTS our_state                        text,
  ADD COLUMN IF NOT EXISTS vendor_state                     text,
  ADD COLUMN IF NOT EXISTS company_currency                 text NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS is_import_po                     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_exchange_rate             numeric,
  ADD COLUMN IF NOT EXISTS comparative_statement_no         text,
  ADD COLUMN IF NOT EXISTS fax_no                           text,
  ADD COLUMN IF NOT EXISTS vat_no                           text,
  ADD COLUMN IF NOT EXISTS cst_no                           text,
  ADD COLUMN IF NOT EXISTS cess_no                          text,
  ADD COLUMN IF NOT EXISTS is_budget_applicable             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_grn                     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_address                 text;

-- 4c. The PO form's Comparative Statements / Advance Payment / PO Amendment
-- tabs are repeating operational sections with no financial posting of their
-- own. They follow the precedent set for vendor_bills in
-- 20260731090100: one jsonb payload each, so nothing the user types is
-- discarded, without inventing three tables that nothing joins to.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS comparative_statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS advance_payments       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS amendments             jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_comparative_statements_is_array'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_comparative_statements_is_array
      CHECK (jsonb_typeof(comparative_statements) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_advance_payments_is_array'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_advance_payments_is_array
      CHECK (jsonb_typeof(advance_payments) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_amendments_is_array'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_amendments_is_array
      CHECK (jsonb_typeof(amendments) = 'array');
  END IF;
END $$;

-- 4d. FKs for the new actor columns, so the audit trail cannot point at a
-- profile that does not exist.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('rejected_by'),  ('cancelled_by'), ('closed_by'), ('submitted_by')
    ) AS t(col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = format('purchase_orders_%s_fkey', r.col)
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.purchase_orders
           ADD CONSTRAINT purchase_orders_%1$s_fkey
           FOREIGN KEY (%1$I) REFERENCES public.profiles(id)',
        r.col);
    END IF;
  END LOOP;
END $$;

-- 4e. Line-level commercial fields. Same story: collected by the form, no
-- column to land in.
ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS item_code                 text,
  ADD COLUMN IF NOT EXISTS item_group                text,
  ADD COLUMN IF NOT EXISTS item_brand                text,
  ADD COLUMN IF NOT EXISTS item_specification        text,
  ADD COLUMN IF NOT EXISTS hsn_code                  text,
  ADD COLUMN IF NOT EXISTS tax_code                  text,
  ADD COLUMN IF NOT EXISTS purchase_category         text,
  ADD COLUMN IF NOT EXISTS estimated_rate            numeric,
  ADD COLUMN IF NOT EXISTS previous_rate             numeric,
  ADD COLUMN IF NOT EXISTS discount_pct              numeric NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  ADD COLUMN IF NOT EXISTS discount_amount           numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS freight_charges           numeric NOT NULL DEFAULT 0 CHECK (freight_charges >= 0),
  ADD COLUMN IF NOT EXISTS loading_unloading_charges numeric NOT NULL DEFAULT 0 CHECK (loading_unloading_charges >= 0),
  ADD COLUMN IF NOT EXISTS other_charges             numeric NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  ADD COLUMN IF NOT EXISTS is_gst_applicable         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_open_po                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_till_date            date,
  ADD COLUMN IF NOT EXISTS required_date             date;

COMMENT ON COLUMN public.purchase_order_lines.line_total IS
  'Tax-INCLUSIVE line value, equal to total_amount. Previously ambiguous: savePurchaseOrderForm wrote tax-inclusive while generatePurchaseOrder and generatePurchaseOrdersFromAwards wrote tax-exclusive, so reopening a PO in the form compounded tax on every save.';
COMMENT ON COLUMN public.purchase_order_lines.subtotal_amount IS
  'Taxable value: quantity * unit_rate - discount_amount + freight_charges + loading_unloading_charges + other_charges. Derived by trg_po_line_amounts; client-supplied values are overwritten.';
COMMENT ON COLUMN public.purchase_order_lines.unit IS
  'Free-text UoM as printed on the PO. uom_id is the normalised reference_values FK and is resolved from this text by trg_po_line_amounts when a match exists.';

-- =====================================================================
-- 5. STATUS HISTORY
-- =====================================================================
-- POs had no history table at all: nothing recorded who moved a PO, when, or
-- from what. MRs and PRs already have document_activity_log; this is the PO
-- equivalent, written by a trigger so it cannot be bypassed by a direct
-- PostgREST update.

CREATE TABLE IF NOT EXISTS public.purchase_order_status_history (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL,
  project_id        uuid,
  from_status       text,
  to_status         text NOT NULL,
  reason            text,
  changed_by        uuid,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  total_amount_at_change numeric,
  CONSTRAINT purchase_order_status_history_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_order_status_history_po_fkey
    FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT purchase_order_status_history_project_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT purchase_order_status_history_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.purchase_order_status_history IS
  'Append-only audit trail of every purchase_orders.status change, written by trg_po_record_status_history. Insert-only for authenticated roles; no UPDATE or DELETE policy exists.';

CREATE INDEX IF NOT EXISTS ix_po_status_history_po
  ON public.purchase_order_status_history (purchase_order_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS ix_po_status_history_project
  ON public.purchase_order_status_history (project_id, changed_at DESC);

-- =====================================================================
-- 6. STATUS GUARD — THE DATABASE IS THE AUTHORITY
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_guard_purchase_order_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from       text := public.po_canonical_status(OLD.status::text);
  v_to         text := public.po_canonical_status(NEW.status::text);
  v_actor      uuid := public.app_current_profile_id();
  -- Moves that commit money or close the order need approval authority.
  -- Receipt-driven moves (partially_delivered / delivered) deliberately do
  -- not: post_goods_receipt_note runs SECURITY DEFINER but auth.uid() is
  -- still the site engineer who recorded the receipt, and gating those would
  -- have made every GRN fail for exactly the people who file them.
  v_privileged text[] := ARRAY['approved', 'rejected', 'sent_to_vendor', 'cancelled', 'closed', 'short_closed'];
  v_line_count integer;
  -- Set transaction-locally by refresh_purchase_order_receipt_status(), which
  -- derives 'delivered' / 'short_closed' / 'closed' from the goods actually
  -- received. That is a system consequence, not a human decision, and the
  -- caller is usually the site engineer who filed the GRN — gating it on
  -- app_can_approve() would fail every receipt that completes an order.
  -- The flag cannot be forged from PostgREST: a client can only reach this
  -- trigger through an UPDATE, and it has no way to run set_config first.
  v_system boolean := coalesce(
    nullif(current_setting('app.po_system_transition', true), ''), 'off') = 'on';
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised purchase order status %. Valid values: draft, pending_approval, approved, rejected, sent_to_vendor, acknowledged, partially_delivered, delivered, short_closed, closed, cancelled.',
      NEW.status USING ERRCODE = '22023';
  END IF;

  -- Normalise, so a legacy spelling arriving from an un-upgraded client is
  -- stored canonically rather than rejected.
  NEW.status := v_to::erp_po_status;

  IF v_from = v_to THEN
    RETURN NEW;
  END IF;

  IF NOT public.po_transition_allowed(v_from, v_to) THEN
    RAISE EXCEPTION 'Purchase order % cannot move from % to %.', NEW.po_number, v_from, v_to
      USING ERRCODE = '22023',
            HINT = 'Re-saving a purchase order must not change its workflow state. Use set_purchase_order_status() for a deliberate transition.';
  END IF;

  IF v_to = ANY(v_privileged) AND NOT v_system AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may move a purchase order to %.', v_to
      USING ERRCODE = '42501';
  END IF;

  -- A PO cannot be approved or dispatched without value or lines: the budget
  -- commitment trigger posts total_amount verbatim.
  IF v_to IN ('approved', 'sent_to_vendor') THEN
    IF coalesce(NEW.total_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'Purchase order % has no value and cannot be approved.', NEW.po_number
        USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_line_count
    FROM public.purchase_order_lines WHERE purchase_order_id = NEW.id;
    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'Purchase order % has no line items and cannot be approved.', NEW.po_number
        USING ERRCODE = '22023';
    END IF;
    IF NEW.vendor_id IS NULL THEN
      RAISE EXCEPTION 'Purchase order % has no vendor and cannot be approved.', NEW.po_number
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_to = 'rejected' AND coalesce(trim(NEW.rejection_reason), '') = '' THEN
    RAISE EXCEPTION 'A rejection reason is required to reject purchase order %.', NEW.po_number
      USING ERRCODE = '22023';
  END IF;

  IF v_to = 'cancelled' AND coalesce(trim(NEW.cancellation_reason), '') = '' THEN
    RAISE EXCEPTION 'A cancellation reason is required to cancel purchase order %.', NEW.po_number
      USING ERRCODE = '22023';
  END IF;

  -- Stamp the actor and timestamps server-side so the trail cannot be forged
  -- by a client that simply posts approved_by.
  NEW.updated_at := now();
  NEW.updated_by := coalesce(v_actor, NEW.updated_by);

  CASE v_to
    WHEN 'pending_approval' THEN
      NEW.submitted_at := now();
      NEW.submitted_by := coalesce(v_actor, NEW.submitted_by);
    WHEN 'approved' THEN
      NEW.approved_at := now();
      NEW.approved_by := coalesce(v_actor, NEW.approved_by);
      NEW.rejection_reason := NULL;
      NEW.rejected_at := NULL;
      NEW.rejected_by := NULL;
    WHEN 'rejected' THEN
      NEW.rejected_at := now();
      NEW.rejected_by := coalesce(v_actor, NEW.rejected_by);
    WHEN 'sent_to_vendor' THEN
      NEW.sent_at := coalesce(NEW.sent_at, now());
    WHEN 'acknowledged' THEN
      NEW.acknowledged_at := coalesce(NEW.acknowledged_at, now());
    WHEN 'cancelled' THEN
      NEW.cancelled_at := now();
      NEW.cancelled_by := coalesce(v_actor, NEW.cancelled_by);
    WHEN 'closed' THEN
      NEW.closed_at := now();
      NEW.closed_by := coalesce(v_actor, NEW.closed_by);
    WHEN 'short_closed' THEN
      -- Short close IS a close: the outstanding balance is abandoned, so the
      -- order stops appearing as receivable and stops holding budget open.
      NEW.closed_at := coalesce(NEW.closed_at, now());
      NEW.closed_by := coalesce(v_actor, NEW.closed_by);
    ELSE
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_order_approval ON public.purchase_orders;
DROP TRIGGER IF EXISTS guard_purchase_order_status ON public.purchase_orders;
CREATE TRIGGER guard_purchase_order_status
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_purchase_order_status();

-- Insert-time validation: a PO may only be born draft, or approved/
-- pending_approval by someone entitled to put it there.
CREATE OR REPLACE FUNCTION public.trg_validate_purchase_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to text := public.po_canonical_status(coalesce(NEW.status::text, 'draft'));
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised purchase order status % on insert.', NEW.status
      USING ERRCODE = '22023';
  END IF;
  NEW.status := v_to::erp_po_status;

  IF v_to NOT IN ('draft', 'pending_approval') AND NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'A new purchase order may only be created as draft or pending_approval.'
      USING ERRCODE = '42501';
  END IF;

  NEW.created_by := coalesce(NEW.created_by, public.app_current_profile_id());
  NEW.updated_by := coalesce(NEW.updated_by, NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_purchase_order_insert ON public.purchase_orders;
CREATE TRIGGER validate_purchase_order_insert
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_validate_purchase_order_insert();

CREATE OR REPLACE FUNCTION public.trg_po_record_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status::text = NEW.status::text THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.purchase_order_status_history (
    purchase_order_id, project_id, from_status, to_status, reason,
    changed_by, total_amount_at_change
  ) VALUES (
    NEW.id,
    NEW.project_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status::text ELSE NULL END,
    NEW.status::text,
    CASE NEW.status::text
      WHEN 'rejected'  THEN NEW.rejection_reason
      WHEN 'cancelled' THEN NEW.cancellation_reason
      ELSE NULL
    END,
    coalesce(public.app_current_profile_id(), NEW.updated_by, NEW.created_by),
    NEW.total_amount
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS po_record_status_history ON public.purchase_orders;
CREATE TRIGGER po_record_status_history
  AFTER INSERT OR UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_record_status_history();

-- =====================================================================
-- 7. DERIVED AMOUNTS — THE DATABASE OWNS THE ARITHMETIC
-- =====================================================================
-- Header totals were whatever the client posted, checked only for >= 0. The
-- PO form displayed a net amount including discounts and freight while
-- procurement-module.tsx persisted a different figure computed from the
-- pre-discount rate with all charges dropped. Deriving both levels in the
-- database makes that class of bug impossible and gives the budget
-- commitment trigger a total it can trust.

CREATE OR REPLACE FUNCTION public.trg_po_line_amounts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_gross    numeric;
  v_discount numeric;
  v_taxable  numeric;
  v_tax      numeric;
  v_uom      uuid;
BEGIN
  NEW.quantity  := coalesce(NEW.quantity, 0);
  NEW.unit_rate := coalesce(NEW.unit_rate, 0);
  NEW.tax_rate  := coalesce(NEW.tax_rate, 0);

  v_gross := NEW.quantity * NEW.unit_rate;

  -- A percentage wins over a stale absolute amount, so the two can never
  -- disagree once the user edits the percentage.
  IF coalesce(NEW.discount_pct, 0) > 0 THEN
    v_discount := round(v_gross * NEW.discount_pct / 100.0, 4);
  ELSE
    v_discount := least(coalesce(NEW.discount_amount, 0), v_gross);
  END IF;
  NEW.discount_amount := v_discount;

  v_taxable := v_gross
             - v_discount
             + coalesce(NEW.freight_charges, 0)
             + coalesce(NEW.loading_unloading_charges, 0)
             + coalesce(NEW.other_charges, 0);

  IF coalesce(NEW.is_gst_applicable, true) THEN
    v_tax := round(v_taxable * NEW.tax_rate / 100.0, 4);
  ELSE
    v_tax := 0;
  END IF;

  NEW.subtotal_amount := v_taxable;
  NEW.tax_amount      := v_tax;
  NEW.total_amount    := v_taxable + v_tax;
  NEW.line_total      := v_taxable + v_tax;

  -- Keep the normalised UoM FK in step with the free-text unit that is
  -- actually printed on the PO. Previously uom_id was never populated.
  IF NEW.uom_id IS NULL AND coalesce(trim(NEW.unit), '') <> '' THEN
    SELECT id INTO v_uom
    FROM public.reference_values
    WHERE kind = 'uom'
      AND is_active
      AND (lower(trim(code)) = lower(trim(NEW.unit))
        OR lower(trim(name)) = lower(trim(NEW.unit)))
    ORDER BY sort_order
    LIMIT 1;
    NEW.uom_id := v_uom;   -- stays NULL when the free-text unit has no master row
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(NEW.created_by, public.app_current_profile_id());
  END IF;
  NEW.updated_by := coalesce(public.app_current_profile_id(), NEW.updated_by, NEW.created_by);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_line_amounts ON public.purchase_order_lines;
CREATE TRIGGER po_line_amounts
  BEFORE INSERT OR UPDATE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_line_amounts();

CREATE OR REPLACE FUNCTION public.po_recalculate_header(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_line_sub   numeric;
  v_line_tax   numeric;
  v_line_count integer;
BEGIN
  SELECT count(*), coalesce(sum(subtotal_amount), 0), coalesce(sum(tax_amount), 0)
  INTO v_line_count, v_line_sub, v_line_tax
  FROM public.purchase_order_lines
  WHERE purchase_order_id = p_po_id;

  -- With no lines there is nothing authoritative to derive from; leave the
  -- header alone so a freshly inserted header keeps its posted figures until
  -- its lines arrive in the same transaction.
  IF v_line_count = 0 THEN
    RETURN;
  END IF;

  UPDATE public.purchase_orders po
  SET subtotal_amount = v_line_sub
                      + po.transportation_taxable_amount
                      + po.freight_amount
                      + po.loading_unloading_charges
                      + po.other_charges,
      tax_amount      = v_line_tax + po.transportation_tax_amount,
      total_amount    = v_line_sub
                      + po.transportation_taxable_amount
                      + po.freight_amount
                      + po.loading_unloading_charges
                      + po.other_charges
                      + v_line_tax + po.transportation_tax_amount,
      updated_at      = now()
  WHERE po.id = p_po_id
    AND (
      po.subtotal_amount IS DISTINCT FROM v_line_sub + po.transportation_taxable_amount
                                       + po.freight_amount + po.loading_unloading_charges
                                       + po.other_charges
      OR po.tax_amount IS DISTINCT FROM v_line_tax + po.transportation_tax_amount
      OR po.total_amount IS DISTINCT FROM v_line_sub + po.transportation_taxable_amount
                                        + po.freight_amount + po.loading_unloading_charges
                                        + po.other_charges
                                        + v_line_tax + po.transportation_tax_amount
    );
END;
$$;

COMMENT ON FUNCTION public.po_recalculate_header(uuid) IS
  'Derives purchase_orders.subtotal_amount/tax_amount/total_amount from its lines plus header-level transportation and charge fields. The WHERE guard makes a no-change call a no-op so the header trigger cannot recurse.';

CREATE OR REPLACE FUNCTION public.trg_po_line_rollup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.po_recalculate_header(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_order_id ELSE NEW.purchase_order_id END);
  IF TG_OP = 'UPDATE' AND NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id THEN
    PERFORM public.po_recalculate_header(OLD.purchase_order_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS po_line_rollup ON public.purchase_order_lines;
CREATE TRIGGER po_line_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_line_rollup();

-- Header-level charge edits must roll into the total too.
CREATE OR REPLACE FUNCTION public.trg_po_header_charges()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_line_sub   numeric;
  v_line_tax   numeric;
  v_line_count integer;
BEGIN
  NEW.transportation_tax_amount := round(
    coalesce(NEW.transportation_taxable_amount, 0) * coalesce(NEW.transportation_tax_rate, 0) / 100.0, 4);

  SELECT count(*), coalesce(sum(subtotal_amount), 0), coalesce(sum(tax_amount), 0)
  INTO v_line_count, v_line_sub, v_line_tax
  FROM public.purchase_order_lines
  WHERE purchase_order_id = NEW.id;

  IF v_line_count > 0 THEN
    NEW.subtotal_amount := v_line_sub
                         + coalesce(NEW.transportation_taxable_amount, 0)
                         + coalesce(NEW.freight_amount, 0)
                         + coalesce(NEW.loading_unloading_charges, 0)
                         + coalesce(NEW.other_charges, 0);
    NEW.tax_amount   := v_line_tax + NEW.transportation_tax_amount;
    NEW.total_amount := NEW.subtotal_amount + NEW.tax_amount;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_header_charges ON public.purchase_orders;
CREATE TRIGGER po_header_charges
  BEFORE UPDATE OF transportation_taxable_amount, transportation_tax_rate,
                   freight_amount, loading_unloading_charges, other_charges
  ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_header_charges();

-- Backfill: settle line_total's meaning on existing rows and re-derive every
-- header from its lines. Runs as one statement per level so the triggers above
-- do the arithmetic rather than duplicating it here.
UPDATE public.purchase_order_lines SET updated_at = updated_at;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT id FROM public.purchase_orders LOOP
    PERFORM public.po_recalculate_header(r.id);
  END LOOP;
END $$;

-- =====================================================================
-- 8. INDEXES
-- =====================================================================
-- The live schema had none of these. ix_grn_lines_po_line in particular is
-- hit by the PO-balance lookup on every goods receipt.

CREATE INDEX IF NOT EXISTS ix_po_lines_po
  ON public.purchase_order_lines (purchase_order_id);
CREATE INDEX IF NOT EXISTS ix_po_lines_pr_line
  ON public.purchase_order_lines (purchase_requisition_line_id)
  WHERE purchase_requisition_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_po_lines_award
  ON public.purchase_order_lines (vendor_selection_award_id)
  WHERE vendor_selection_award_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_po_lines_item
  ON public.purchase_order_lines (item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_purchase_orders_project_status
  ON public.purchase_orders (project_id, status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_purchase_orders_vendor
  ON public.purchase_orders (vendor_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_purchase_orders_pr
  ON public.purchase_orders (purchase_requisition_id)
  WHERE purchase_requisition_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_purchase_orders_rfq
  ON public.purchase_orders (rfq_id)
  WHERE rfq_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_purchase_orders_selection
  ON public.purchase_orders (vendor_selection_id)
  WHERE vendor_selection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_purchase_orders_created_at
  ON public.purchase_orders (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_grn_lines_po_line
  ON public.goods_receipt_note_lines (purchase_order_line_id)
  WHERE purchase_order_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_grn_po
  ON public.goods_receipt_notes (purchase_order_id)
  WHERE purchase_order_id IS NOT NULL;

-- Duplicate PO numbers made savePurchaseOrderForm's .maybeSingle() lookup on
-- po_number error out, and let two orders claim one document number.
DO $$
DECLARE
  v_dupes bigint;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT po_number FROM public.purchase_orders
    WHERE deleted_at IS NULL AND po_number IS NOT NULL
    GROUP BY po_number HAVING count(*) > 1
  ) d;

  IF v_dupes > 0 THEN
    RAISE WARNING 'purchase_orders has % duplicate po_number value(s); unique index not created. Resolve the duplicates and re-run this migration.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_orders_po_number
      ON public.purchase_orders (po_number) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- One PO per (vendor selection, vendor) and per (requisition, vendor) was
-- enforced only by a read-then-insert race in the browser.
DO $$
DECLARE
  v_dupes bigint;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT vendor_selection_id, vendor_id FROM public.purchase_orders
    WHERE deleted_at IS NULL AND vendor_selection_id IS NOT NULL
    GROUP BY vendor_selection_id, vendor_id HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE WARNING 'purchase_orders has % duplicate (vendor_selection_id, vendor_id) pair(s); unique index not created.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS ux_purchase_orders_selection_vendor
      ON public.purchase_orders (vendor_selection_id, vendor_id)
      WHERE deleted_at IS NULL AND vendor_selection_id IS NOT NULL;
  END IF;
END $$;

-- =====================================================================
-- 9. GOODS-RECEIPT BALANCE + TOLERANCE (corrected)
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_po_line_remaining_balances(uuid);

CREATE OR REPLACE FUNCTION public.get_po_line_remaining_balances(p_po_id uuid)
RETURNS TABLE (
  po_line_id           uuid,
  ordered_qty          numeric,
  cumulative_received  numeric,
  cumulative_accepted  numeric,
  remaining_balance    numeric,
  over_tolerance_pct   numeric,
  max_allowable_accept numeric,
  is_short_closed      boolean,
  line_status          text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH received AS (
    SELECT
      grnl.purchase_order_line_id AS po_line_id,
      coalesce(sum(grnl.received_qty), 0) AS received_qty,
      coalesce(sum(grnl.accepted_qty), 0) AS accepted_qty
    FROM public.goods_receipt_note_lines grnl
    JOIN public.goods_receipt_notes grn ON grn.id = grnl.grn_id
    -- A cancelled, rejected or still-draft GRN must not consume PO balance.
    -- The previous frontend implementation ignored GRN status entirely, so a
    -- cancelled receipt permanently ate the outstanding quantity.
    WHERE grn.status::text NOT IN ('cancelled', 'rejected', 'draft')
      AND grn.deleted_at IS NULL
    GROUP BY grnl.purchase_order_line_id
  )
  SELECT
    pol.id,
    pol.quantity,
    coalesce(r.received_qty, 0),
    coalesce(r.accepted_qty, 0),
    greatest(0, pol.quantity - coalesce(r.accepted_qty, 0)),
    coalesce(pol.over_tolerance_pct, 5.00),
    -- Cumulative cap, not a per-receipt allowance. The old formula was
    -- `remaining + ordered * tol%`, which handed out a fresh 5% of the
    -- ordered quantity on every partial receipt, so total over-receipt grew
    -- without bound across enough GRNs.
    greatest(0, pol.quantity * (1 + coalesce(pol.over_tolerance_pct, 5.00) / 100.0)
                - coalesce(r.accepted_qty, 0)),
    coalesce(pol.is_short_closed, false),
    CASE
      WHEN coalesce(pol.is_short_closed, false) THEN 'short_closed'
      WHEN coalesce(r.accepted_qty, 0) >= pol.quantity THEN 'fulfilled'
      WHEN coalesce(r.accepted_qty, 0) > 0 THEN 'partially_received'
      ELSE 'open'
    END
  FROM public.purchase_order_lines pol
  LEFT JOIN received r ON r.po_line_id = pol.id
  WHERE pol.purchase_order_id = p_po_id;
$$;

COMMENT ON FUNCTION public.get_po_line_remaining_balances(uuid) IS
  'Per-line outstanding quantity and cumulative over-delivery ceiling for a PO. line_status here describes the LINE (open/partially_received/fulfilled/short_closed) and is deliberately distinct from erp_po_status.';

DROP FUNCTION IF EXISTS public.refresh_purchase_order_receipt_status(uuid);

CREATE OR REPLACE FUNCTION public.refresh_purchase_order_receipt_status(p_po_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer;
  v_settled   integer;
  v_receiving integer;
  v_short     integer;
  v_current   text;
  v_new       text;
BEGIN
  SELECT public.po_canonical_status(status::text) INTO v_current
  FROM public.purchase_orders WHERE id = p_po_id;

  IF v_current IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE line_status IN ('fulfilled', 'short_closed')),
         count(*) FILTER (WHERE cumulative_accepted > 0),
         count(*) FILTER (WHERE line_status = 'short_closed')
  INTO v_total, v_settled, v_receiving, v_short
  FROM public.get_po_line_remaining_balances(p_po_id);

  IF v_total = 0 THEN
    RETURN v_current;
  END IF;

  IF v_settled = v_total THEN
    -- Every line is settled. If any of them was abandoned short of its
    -- ordered quantity the order closed short, whatever else was delivered
    -- in full.
    v_new := CASE
               WHEN v_short > 0    THEN 'short_closed'
               WHEN v_receiving > 0 THEN 'delivered'
               ELSE 'closed'
             END;
  ELSIF v_receiving > 0 THEN
    v_new := 'partially_delivered';
  ELSE
    -- Nothing received yet. The previous version wrote 'accepted_by_vendor'
    -- unconditionally here, clobbering sent_to_vendor / acknowledged on any
    -- PO whose only GRN had been cancelled.
    RETURN v_current;
  END IF;

  IF v_new = v_current OR NOT public.po_transition_allowed(v_current, v_new) THEN
    RETURN v_current;
  END IF;

  -- Transaction-local, and cleared immediately: see trg_guard_purchase_order_status.
  PERFORM set_config('app.po_system_transition', 'on', true);
  UPDATE public.purchase_orders SET status = v_new::erp_po_status WHERE id = p_po_id;
  PERFORM set_config('app.po_system_transition', 'off', true);

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.refresh_purchase_order_receipt_status(uuid) IS
  'Derives a purchase order status from the goods actually accepted against it. Never regresses the order and never clobbers sent_to_vendor/acknowledged when nothing has been received — the previous implementation wrote accepted_by_vendor unconditionally.';

CREATE OR REPLACE FUNCTION public.short_close_purchase_order_line(
  p_po_line_id uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_po_id   uuid;
  v_status  text;
BEGIN
  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may short-close a purchase order line.'
      USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to short-close a purchase order line.'
      USING ERRCODE = '22023';
  END IF;

  SELECT purchase_order_id INTO v_po_id
  FROM public.purchase_order_lines WHERE id = p_po_line_id;
  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order line % not found.', p_po_line_id USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.purchase_order_lines
  SET is_short_closed = true,
      short_closed_reason = trim(p_reason),
      updated_by = v_profile
  WHERE id = p_po_line_id;

  v_status := public.refresh_purchase_order_receipt_status(v_po_id);

  RETURN jsonb_build_object(
    'purchaseOrderLineId', p_po_line_id,
    'purchaseOrderId', v_po_id,
    'purchaseOrderStatus', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_purchase_order_line(p_po_line_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_po_id   uuid;
BEGIN
  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may reopen a purchase order line.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.purchase_order_lines
  SET is_short_closed = false, short_closed_reason = NULL, updated_by = v_profile
  WHERE id = p_po_line_id
  RETURNING purchase_order_id INTO v_po_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order line % not found.', p_po_line_id USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('purchaseOrderLineId', p_po_line_id, 'purchaseOrderId', v_po_id);
END;
$$;

-- =====================================================================
-- 10. ROW LEVEL SECURITY
-- =====================================================================
-- anon could SELECT and UPDATE every purchase order using the publishable key
-- that ships in the browser bundle.

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'purchase_orders', 'purchase_order_lines', 'purchase_order_status_history',
    'document_number_sequences'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    -- Deliberately NOT "FORCE ROW LEVEL SECURITY": the SECURITY DEFINER RPCs
    -- below execute as the table owner, and forcing RLS would subject them to
    -- policies scoped TO authenticated, which no longer match once the
    -- effective role is the owner — every RPC would silently see zero rows.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'p_' || t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (public.app_can_write_procurement())',
      'p_' || t || '_select', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
         WITH CHECK (public.app_can_write_procurement())',
      'p_' || t || '_insert', t);

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- History is append-only: it gets no UPDATE or DELETE policy at all.
CREATE POLICY p_purchase_order_status_history_update
  ON public.purchase_order_status_history FOR UPDATE TO authenticated USING (false);
CREATE POLICY p_purchase_order_status_history_delete
  ON public.purchase_order_status_history FOR DELETE TO authenticated USING (false);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders', 'purchase_order_lines', 'document_number_sequences'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
         USING (public.app_can_write_procurement())
         WITH CHECK (public.app_can_write_procurement())',
      'p_' || t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
         USING (public.app_can_approve_financial())',
      'p_' || t || '_delete', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT ON public.purchase_order_status_history TO authenticated;

-- =====================================================================
-- 11. RPCs
-- =====================================================================

-- 11a. Atomic save of a purchase order header plus its complete line set.
--
-- The browser previously did this as three separate statements: UPDATE header,
-- DELETE lines, INSERT lines. A failure on the last one left the PO with no
-- lines at all, having destroyed the ones it was replacing. It also never
-- wrote purchase_requisition_id, created_by or updated_by, so form-created POs
-- had no requisition link and no audit trail.
CREATE OR REPLACE FUNCTION public.save_purchase_order(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile   uuid := public.app_require_profile();
  v_id        uuid := nullif(p_payload->>'id', '')::uuid;
  v_project   uuid := nullif(p_payload->>'project_id', '')::uuid;
  v_vendor    uuid := nullif(p_payload->>'vendor_id', '')::uuid;
  v_status    text := public.po_canonical_status(coalesce(nullif(p_payload->>'status', ''), 'draft'));
  v_existing  text;
  v_po_number text := nullif(trim(p_payload->>'po_number'), '');
  v_line      jsonb;
  v_line_no   integer := 0;
  v_result    record;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'You do not have permission to edit purchase orders.' USING ERRCODE = '42501';
  END IF;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Unrecognised purchase order status %.', p_payload->>'status' USING ERRCODE = '22023';
  END IF;
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'A project is required to save a purchase order.' USING ERRCODE = '22023';
  END IF;
  IF v_vendor IS NULL THEN
    RAISE EXCEPTION 'A vendor is required to save a purchase order.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload->'lines') <> 'array' OR jsonb_array_length(p_payload->'lines') = 0 THEN
    RAISE EXCEPTION 'A purchase order requires at least one line item.' USING ERRCODE = '22023';
  END IF;

  IF v_id IS NULL AND v_po_number IS NOT NULL THEN
    SELECT id INTO v_id FROM public.purchase_orders
    WHERE po_number = v_po_number AND deleted_at IS NULL;
  END IF;

  IF v_id IS NULL THEN
    v_po_number := coalesce(v_po_number, public.next_document_number('PO'));

    INSERT INTO public.purchase_orders (
      project_id, site_id, vendor_id, purchase_requisition_id, vendor_selection_id,
      rfq_id, budget_allocation_id, master_budget_item_id,
      po_number, po_date, delivery_date, delivery_location, delivery_address,
      payment_terms, terms_and_conditions, status,
      company_name, po_in_the_name_of, supplier_name, vendor_name,
      phone_no, mobile_no, email_id, supplier_address, contact_person,
      gst_no, pan_no, vat_no, cst_no, cess_no, fax_no,
      our_state, vendor_state, company_currency, is_import_po, import_exchange_rate,
      comparative_statement_no, credit_period_days, note_on_po, remarks,
      freight_amount, loading_unloading_charges, other_charges,
      transportation_taxable_amount, transportation_tax_rate,
      transportation_hsn_code, transportation_tax_code,
      is_budget_applicable, requires_grn,
      comparative_statements, advance_payments, amendments,
      subtotal_amount, tax_amount, total_amount,
      created_by, updated_by
    ) VALUES (
      v_project,
      nullif(p_payload->>'site_id', '')::uuid,
      v_vendor,
      nullif(p_payload->>'purchase_requisition_id', '')::uuid,
      nullif(p_payload->>'vendor_selection_id', '')::uuid,
      nullif(p_payload->>'rfq_id', '')::uuid,
      nullif(p_payload->>'budget_allocation_id', '')::uuid,
      nullif(p_payload->>'master_budget_item_id', '')::uuid,
      v_po_number,
      coalesce(nullif(p_payload->>'po_date', '')::date, current_date),
      nullif(p_payload->>'delivery_date', '')::date,
      nullif(p_payload->>'delivery_location', ''),
      nullif(p_payload->>'delivery_address', ''),
      nullif(p_payload->>'payment_terms', ''),
      nullif(p_payload->>'terms_and_conditions', ''),
      v_status::erp_po_status,
      nullif(p_payload->>'company_name', ''),
      nullif(p_payload->>'po_in_the_name_of', ''),
      nullif(p_payload->>'supplier_name', ''),
      nullif(p_payload->>'vendor_name', ''),
      nullif(p_payload->>'phone_no', ''),
      nullif(p_payload->>'mobile_no', ''),
      nullif(p_payload->>'email_id', ''),
      nullif(p_payload->>'supplier_address', ''),
      nullif(p_payload->>'contact_person', ''),
      nullif(p_payload->>'gst_no', ''),
      nullif(p_payload->>'pan_no', ''),
      nullif(p_payload->>'vat_no', ''),
      nullif(p_payload->>'cst_no', ''),
      nullif(p_payload->>'cess_no', ''),
      nullif(p_payload->>'fax_no', ''),
      nullif(p_payload->>'our_state', ''),
      nullif(p_payload->>'vendor_state', ''),
      coalesce(nullif(p_payload->>'company_currency', ''), 'INR'),
      coalesce((p_payload->>'is_import_po')::boolean, false),
      nullif(p_payload->>'import_exchange_rate', '')::numeric,
      nullif(p_payload->>'comparative_statement_no', ''),
      nullif(p_payload->>'credit_period_days', '')::integer,
      nullif(p_payload->>'note_on_po', ''),
      nullif(p_payload->>'remarks', ''),
      coalesce(nullif(p_payload->>'freight_amount', '')::numeric, 0),
      coalesce(nullif(p_payload->>'loading_unloading_charges', '')::numeric, 0),
      coalesce(nullif(p_payload->>'other_charges', '')::numeric, 0),
      coalesce(nullif(p_payload->>'transportation_taxable_amount', '')::numeric, 0),
      coalesce(nullif(p_payload->>'transportation_tax_rate', '')::numeric, 0),
      nullif(p_payload->>'transportation_hsn_code', ''),
      nullif(p_payload->>'transportation_tax_code', ''),
      coalesce((p_payload->>'is_budget_applicable')::boolean, true),
      coalesce((p_payload->>'requires_grn')::boolean, true),
      coalesce(p_payload->'comparative_statements', '[]'::jsonb),
      coalesce(p_payload->'advance_payments', '[]'::jsonb),
      coalesce(p_payload->'amendments', '[]'::jsonb),
      0, 0, 0,
      v_profile, v_profile
    )
    RETURNING id INTO v_id;
  ELSE
    SELECT public.po_canonical_status(status::text) INTO v_existing
    FROM public.purchase_orders WHERE id = v_id;

    IF v_existing IS NULL THEN
      RAISE EXCEPTION 'Purchase order % not found.', v_id USING ERRCODE = 'P0002';
    END IF;

    -- Editing the commercial content of a PO that is already out with the
    -- vendor would silently change a document the vendor has accepted.
    IF v_existing NOT IN ('draft', 'pending_approval', 'rejected') THEN
      RAISE EXCEPTION 'Purchase order % is % and can no longer be edited. Raise an amendment instead.',
        (SELECT po_number FROM public.purchase_orders WHERE id = v_id), v_existing
        USING ERRCODE = '22023';
    END IF;

    -- Status is NOT taken from this payload. A save must never move the
    -- workflow: re-saving a live PO used to revert it to 'draft'.
    UPDATE public.purchase_orders SET
      project_id               = v_project,
      site_id                  = coalesce(nullif(p_payload->>'site_id', '')::uuid, site_id),
      vendor_id                = v_vendor,
      purchase_requisition_id  = coalesce(nullif(p_payload->>'purchase_requisition_id', '')::uuid, purchase_requisition_id),
      vendor_selection_id      = coalesce(nullif(p_payload->>'vendor_selection_id', '')::uuid, vendor_selection_id),
      rfq_id                   = coalesce(nullif(p_payload->>'rfq_id', '')::uuid, rfq_id),
      budget_allocation_id     = coalesce(nullif(p_payload->>'budget_allocation_id', '')::uuid, budget_allocation_id),
      master_budget_item_id    = coalesce(nullif(p_payload->>'master_budget_item_id', '')::uuid, master_budget_item_id),
      po_number                = coalesce(v_po_number, po_number),
      po_date                  = coalesce(nullif(p_payload->>'po_date', '')::date, po_date),
      delivery_date            = coalesce(nullif(p_payload->>'delivery_date', '')::date, delivery_date),
      delivery_location        = coalesce(nullif(p_payload->>'delivery_location', ''), delivery_location),
      delivery_address         = coalesce(nullif(p_payload->>'delivery_address', ''), delivery_address),
      payment_terms            = coalesce(nullif(p_payload->>'payment_terms', ''), payment_terms),
      terms_and_conditions     = coalesce(nullif(p_payload->>'terms_and_conditions', ''), terms_and_conditions),
      company_name             = coalesce(nullif(p_payload->>'company_name', ''), company_name),
      po_in_the_name_of        = coalesce(nullif(p_payload->>'po_in_the_name_of', ''), po_in_the_name_of),
      supplier_name            = coalesce(nullif(p_payload->>'supplier_name', ''), supplier_name),
      vendor_name              = coalesce(nullif(p_payload->>'vendor_name', ''), vendor_name),
      phone_no                 = coalesce(nullif(p_payload->>'phone_no', ''), phone_no),
      mobile_no                = coalesce(nullif(p_payload->>'mobile_no', ''), mobile_no),
      email_id                 = coalesce(nullif(p_payload->>'email_id', ''), email_id),
      supplier_address         = coalesce(nullif(p_payload->>'supplier_address', ''), supplier_address),
      contact_person           = coalesce(nullif(p_payload->>'contact_person', ''), contact_person),
      gst_no                   = coalesce(nullif(p_payload->>'gst_no', ''), gst_no),
      pan_no                   = coalesce(nullif(p_payload->>'pan_no', ''), pan_no),
      vat_no                   = coalesce(nullif(p_payload->>'vat_no', ''), vat_no),
      cst_no                   = coalesce(nullif(p_payload->>'cst_no', ''), cst_no),
      cess_no                  = coalesce(nullif(p_payload->>'cess_no', ''), cess_no),
      fax_no                   = coalesce(nullif(p_payload->>'fax_no', ''), fax_no),
      our_state                = coalesce(nullif(p_payload->>'our_state', ''), our_state),
      vendor_state             = coalesce(nullif(p_payload->>'vendor_state', ''), vendor_state),
      company_currency         = coalesce(nullif(p_payload->>'company_currency', ''), company_currency),
      is_import_po             = coalesce((p_payload->>'is_import_po')::boolean, is_import_po),
      import_exchange_rate     = coalesce(nullif(p_payload->>'import_exchange_rate', '')::numeric, import_exchange_rate),
      comparative_statement_no = coalesce(nullif(p_payload->>'comparative_statement_no', ''), comparative_statement_no),
      credit_period_days       = coalesce(nullif(p_payload->>'credit_period_days', '')::integer, credit_period_days),
      note_on_po               = coalesce(nullif(p_payload->>'note_on_po', ''), note_on_po),
      remarks                  = coalesce(nullif(p_payload->>'remarks', ''), remarks),
      freight_amount                = coalesce(nullif(p_payload->>'freight_amount', '')::numeric, freight_amount),
      loading_unloading_charges     = coalesce(nullif(p_payload->>'loading_unloading_charges', '')::numeric, loading_unloading_charges),
      other_charges                 = coalesce(nullif(p_payload->>'other_charges', '')::numeric, other_charges),
      transportation_taxable_amount = coalesce(nullif(p_payload->>'transportation_taxable_amount', '')::numeric, transportation_taxable_amount),
      transportation_tax_rate       = coalesce(nullif(p_payload->>'transportation_tax_rate', '')::numeric, transportation_tax_rate),
      transportation_hsn_code       = coalesce(nullif(p_payload->>'transportation_hsn_code', ''), transportation_hsn_code),
      transportation_tax_code       = coalesce(nullif(p_payload->>'transportation_tax_code', ''), transportation_tax_code),
      is_budget_applicable     = coalesce((p_payload->>'is_budget_applicable')::boolean, is_budget_applicable),
      requires_grn             = coalesce((p_payload->>'requires_grn')::boolean, requires_grn),
      comparative_statements   = coalesce(p_payload->'comparative_statements', comparative_statements),
      advance_payments         = coalesce(p_payload->'advance_payments', advance_payments),
      amendments               = coalesce(p_payload->'amendments', amendments),
      updated_by               = v_profile,
      updated_at               = now()
    WHERE id = v_id;
  END IF;

  -- Replace the line set inside this transaction, so a failure on insert rolls
  -- the delete back rather than leaving an empty PO.
  --
  -- Anything that has already consumed a line must block the edit with a
  -- readable message rather than a raw foreign-key violation. The status guard
  -- above makes this unreachable in normal use (a draft cannot have receipts),
  -- but a hand-edited row could still get here.
  IF EXISTS (
    SELECT 1 FROM public.goods_receipt_note_lines grnl
    JOIN public.purchase_order_lines pol ON pol.id = grnl.purchase_order_line_id
    WHERE pol.purchase_order_id = v_id
  ) THEN
    RAISE EXCEPTION 'Purchase order % has goods receipts against its lines and cannot be re-saved. Raise an amendment instead.',
      (SELECT po_number FROM public.purchase_orders WHERE id = v_id) USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vendor_bill_lines vbl
    JOIN public.purchase_order_lines pol ON pol.id = vbl.purchase_order_line_id
    WHERE pol.purchase_order_id = v_id
  ) THEN
    RAISE EXCEPTION 'Purchase order % has vendor bills against its lines and cannot be re-saved.',
      (SELECT po_number FROM public.purchase_orders WHERE id = v_id) USING ERRCODE = '22023';
  END IF;

  -- Awards legitimately point at the lines of a draft PO created from an RFQ
  -- award matrix. Detach them across the replacement and re-link below from
  -- vendor_selection_award_id, which the payload carries per line. Without
  -- this, editing any awards-generated PO failed on the DELETE.
  UPDATE public.vendor_selection_awards a
  SET purchase_order_line_id = NULL
  WHERE a.purchase_order_line_id IN (
    SELECT id FROM public.purchase_order_lines WHERE purchase_order_id = v_id
  );

  DELETE FROM public.purchase_order_lines WHERE purchase_order_id = v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'lines') LOOP
    v_line_no := v_line_no + 1;

    IF coalesce(trim(v_line->>'item_description'), '') = '' THEN
      RAISE EXCEPTION 'Line % requires an item description.', v_line_no USING ERRCODE = '22023';
    END IF;
    IF coalesce(nullif(v_line->>'quantity', '')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Line % (%): quantity must be greater than zero.',
        v_line_no, v_line->>'item_description' USING ERRCODE = '22023';
    END IF;
    IF coalesce(nullif(v_line->>'unit_rate', '')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'Line % (%): rate cannot be negative.',
        v_line_no, v_line->>'item_description' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.purchase_order_lines (
      purchase_order_id, project_id, item_id, purchase_requisition_line_id,
      vendor_selection_award_id, rfq_line_id, master_budget_item_id,
      line_number, item_description, item_code, item_group, item_brand,
      item_specification, hsn_code, tax_code, purchase_category,
      quantity, unit, unit_rate, tax_rate,
      estimated_rate, previous_rate, discount_pct, discount_amount,
      freight_charges, loading_unloading_charges, other_charges,
      is_gst_applicable, is_open_po, open_till_date, required_date,
      activity_name, sub_activity_name,
      over_tolerance_pct, under_tolerance_pct,
      subtotal_amount, tax_amount, total_amount, line_total,
      created_by, updated_by
    ) VALUES (
      v_id, v_project,
      nullif(v_line->>'item_id', '')::uuid,
      nullif(v_line->>'purchase_requisition_line_id', '')::uuid,
      nullif(v_line->>'vendor_selection_award_id', '')::uuid,
      nullif(v_line->>'rfq_line_id', '')::uuid,
      nullif(v_line->>'master_budget_item_id', '')::uuid,
      coalesce(nullif(v_line->>'line_number', '')::integer, v_line_no),
      trim(v_line->>'item_description'),
      nullif(v_line->>'item_code', ''),
      nullif(v_line->>'item_group', ''),
      nullif(v_line->>'item_brand', ''),
      nullif(v_line->>'item_specification', ''),
      nullif(v_line->>'hsn_code', ''),
      nullif(v_line->>'tax_code', ''),
      nullif(v_line->>'purchase_category', ''),
      (v_line->>'quantity')::numeric,
      coalesce(nullif(v_line->>'unit', ''), 'nos'),
      coalesce(nullif(v_line->>'unit_rate', '')::numeric, 0),
      coalesce(nullif(v_line->>'tax_rate', '')::numeric, 0),
      nullif(v_line->>'estimated_rate', '')::numeric,
      nullif(v_line->>'previous_rate', '')::numeric,
      coalesce(nullif(v_line->>'discount_pct', '')::numeric, 0),
      coalesce(nullif(v_line->>'discount_amount', '')::numeric, 0),
      coalesce(nullif(v_line->>'freight_charges', '')::numeric, 0),
      coalesce(nullif(v_line->>'loading_unloading_charges', '')::numeric, 0),
      coalesce(nullif(v_line->>'other_charges', '')::numeric, 0),
      coalesce((v_line->>'is_gst_applicable')::boolean, true),
      coalesce((v_line->>'is_open_po')::boolean, false),
      nullif(v_line->>'open_till_date', '')::date,
      nullif(v_line->>'required_date', '')::date,
      nullif(v_line->>'activity_name', ''),
      nullif(v_line->>'sub_activity_name', ''),
      coalesce(nullif(v_line->>'over_tolerance_pct', '')::numeric, 5.00),
      coalesce(nullif(v_line->>'under_tolerance_pct', '')::numeric, 0.00),
      0, 0, 0, 0,
      v_profile, v_profile
    );
  END LOOP;

  -- Re-point the awards detached above at their replacement lines, so the RFQ
  -- award matrix keeps reporting the requisition as ordered.
  UPDATE public.vendor_selection_awards a
  SET purchase_order_id = v_id,
      purchase_order_line_id = pol.id
  FROM public.purchase_order_lines pol
  WHERE pol.purchase_order_id = v_id
    AND pol.vendor_selection_award_id = a.id
    AND a.purchase_order_line_id IS DISTINCT FROM pol.id;

  -- Totals are derived by trg_po_line_amounts + trg_po_line_rollup; read them
  -- back rather than trusting anything the client sent.
  SELECT po_number, subtotal_amount, tax_amount, total_amount, status::text
  INTO v_result
  FROM public.purchase_orders WHERE id = v_id;

  RETURN jsonb_build_object(
    'purchaseOrderId', v_id,
    'poNumber',        v_result.po_number,
    'status',          v_result.status,
    'subtotal',        v_result.subtotal_amount,
    'tax',             v_result.tax_amount,
    'total',           v_result.total_amount,
    'lineCount',       v_line_no
  );
END;
$$;

-- 11b. The single entry point for a deliberate workflow transition.
CREATE OR REPLACE FUNCTION public.set_purchase_order_status(
  p_purchase_order_id uuid,
  p_status            text,
  p_reason            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_to      text := public.po_canonical_status(p_status);
  v_from    text;
  v_number  text;
BEGIN
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Unrecognised purchase order status %.', p_status USING ERRCODE = '22023';
  END IF;

  SELECT public.po_canonical_status(status::text), po_number
  INTO v_from, v_number
  FROM public.purchase_orders WHERE id = p_purchase_order_id AND deleted_at IS NULL;

  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found.', p_purchase_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_from = v_to THEN
    RETURN jsonb_build_object('purchaseOrderId', p_purchase_order_id,
                              'poNumber', v_number, 'status', v_to, 'changed', false);
  END IF;

  -- The reason columns must be populated in the same statement that moves the
  -- status, because the guard trigger requires them.
  UPDATE public.purchase_orders SET
    status              = v_to::erp_po_status,
    rejection_reason    = CASE WHEN v_to = 'rejected'  THEN nullif(trim(p_reason), '') ELSE rejection_reason END,
    cancellation_reason = CASE WHEN v_to = 'cancelled' THEN nullif(trim(p_reason), '') ELSE cancellation_reason END,
    updated_by          = v_profile
  WHERE id = p_purchase_order_id;

  RETURN jsonb_build_object('purchaseOrderId', p_purchase_order_id,
                            'poNumber', v_number, 'status', v_to, 'changed', true);
END;
$$;

COMMENT ON FUNCTION public.set_purchase_order_status(uuid, text, text) IS
  'Moves a purchase order through its lifecycle. Accepts legacy status spellings and normalises them; the guard trigger enforces the transition table and role gating.';

-- 11c. Approve, and optionally dispatch to the vendor, in one call.
CREATE OR REPLACE FUNCTION public.approve_and_send_purchase_order(
  p_purchase_order_id uuid,
  p_send_to_vendor    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_po      public.purchase_orders;
  v_status  text;
BEGIN
  IF NOT public.app_can_approve() THEN
    RAISE EXCEPTION 'Only management or a project manager may approve a purchase order.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders
  WHERE id = p_purchase_order_id AND deleted_at IS NULL;
  IF v_po.id IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found.', p_purchase_order_id USING ERRCODE = 'P0002';
  END IF;

  v_status := public.po_canonical_status(v_po.status::text);

  IF v_status IN ('approved', 'sent_to_vendor', 'acknowledged',
                  'partially_delivered', 'delivered', 'closed') THEN
    RAISE EXCEPTION 'Purchase order % is already %.', v_po.po_number, v_status
      USING ERRCODE = '22023';
  END IF;
  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Purchase order % is cancelled and cannot be approved.', v_po.po_number
      USING ERRCODE = '22023';
  END IF;

  -- Two statements, so the guard trigger stamps approved_by/approved_at and
  -- the budget commitment trigger sees status = 'approved' even when the PO
  -- goes straight out to the vendor. fn_auto_commit_po_to_budget fires only on
  -- 'approved'; a direct jump to sent_to_vendor would never commit the budget.
  UPDATE public.purchase_orders
  SET status = 'approved'::erp_po_status, updated_by = v_profile
  WHERE id = p_purchase_order_id;

  IF p_send_to_vendor THEN
    UPDATE public.purchase_orders
    SET status = 'sent_to_vendor'::erp_po_status, updated_by = v_profile
    WHERE id = p_purchase_order_id;
    v_status := 'sent_to_vendor';
  ELSE
    v_status := 'approved';
  END IF;

  RETURN jsonb_build_object(
    'purchaseOrderId', p_purchase_order_id,
    'poNumber', v_po.po_number,
    'status', v_status
  );
END;
$$;

-- =====================================================================
-- 12. GRANTS
-- =====================================================================

REVOKE ALL ON FUNCTION public.save_purchase_order(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_purchase_order_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_and_send_purchase_order(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.short_close_purchase_order_line(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_purchase_order_line(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_purchase_order_receipt_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_document_number(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.save_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_send_purchase_order(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.short_close_purchase_order_line(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_purchase_order_line(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_purchase_order_receipt_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_po_line_remaining_balances(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_canonical_status(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.po_transition_allowed(text, text) TO authenticated;
