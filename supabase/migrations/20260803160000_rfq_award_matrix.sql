-- ============================================================================
-- RFQ AWARD MATRIX — LINE-ITEM-CENTRIC SOURCING
-- File: supabase/migrations/20260803160000_rfq_award_matrix.sql
--
-- WHY
-- ---
-- The sourcing chain was header-bound: 1 PR -> 1 RFQ -> 1 winning vendor -> 1 PO.
-- Two ordinary procurement scenarios were structurally impossible:
--
--   A. Item-wise split   — Cement+Steel from Supplier A, Sand+Bricks from B.
--   B. Quantity split    — 60 MT of Rebar from A, 40 MT from B.
--
-- Root causes in the existing schema:
--   * No rfq_lines at all. An RFQ was a header pointing at a PR, so "what are we
--     asking for" was implicit (= every PR line) and could not be sub-selected.
--   * quotation_lines had no rfq_line_id. Vendors quoted free-text descriptions,
--     so two bids for the same item could not be compared programmatically.
--   * vendor_selections.selected_vendor_id / selected_quotation_id were NOT NULL
--     and the app upserted one row per purchase_requisition_id — choosing a
--     second vendor OVERWROTE the first.
--   * purchase_order_lines had no purchase_requisition_line_id, so there was no
--     line-level traceability from PO back to PR.
--
-- WHAT THIS DOES
-- --------------
--   1. purchase_requisition_lines: ordered_qty / balance_qty / line_status
--   2. rfq_lines                  (new) — the canonical ask, per PR line
--   3. quotation_lines            — + rfq_line_id, offered_qty, lead_time_days
--   4. vendor_selections          — demoted to an AWARD SCENARIO header
--   5. vendor_selection_awards    (new) — the allocation: line x vendor x qty
--   6. purchase_order_lines       — + pr_line_id, award_id (traceability)
--   7. Integrity triggers         — over-award prevention, qty rollups
--
-- Resulting chain:
--   mr_line -> pr_line -> rfq_line -> quotation_line -> award -> po_line -> grn
--
-- Idempotent and safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Enum extension — MUST run outside a transaction block.
--
--    PostgreSQL forbids using a newly added enum label in the same transaction
--    that adds it, and rejects ALTER TYPE ... ADD VALUE from inside a function
--    or DO block. Kept here, in autocommit, matching the convention already
--    used by 20260731090000_procurement_status_enums.sql.
--
--    Nothing below USES this label during the migration (the backfill only calls
--    recompute_pr_line_ordered, never the header rollup), so the ordering is safe.
--
--    FOLLOW-UP REQUIRED: add 'partially_ordered' to PrWorkflowStatus in
--    frontend/src/lib/erp/purchase-requisition/types.ts, otherwise the PR list
--    filters will not recognise the new header state.
-- ----------------------------------------------------------------------------
ALTER TYPE public.erp_procurement_status ADD VALUE IF NOT EXISTS 'partially_ordered';

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PR LINES — consumption tracking
--
--    NOTE ON NAMING: purchase_requisition_lines.pr_bal_qty already exists and
--    means something DIFFERENT — it is the balance left on the source MATERIAL
--    REQUEST line after this PR consumes it. The new balance_qty is the balance
--    left on the PR LINE after purchase orders consume it. Both are legitimate;
--    they sit at different stages of the chain.
-- ----------------------------------------------------------------------------
ALTER TABLE public.purchase_requisition_lines
  ADD COLUMN IF NOT EXISTS ordered_qty numeric NOT NULL DEFAULT 0
    CHECK (ordered_qty >= 0),
  ADD COLUMN IF NOT EXISTS line_status text NOT NULL DEFAULT 'open';

-- Generated, so it can never drift from quantity - ordered_qty and cannot be
-- written by application code. Deliberately NOT clamped at zero: if an over-award
-- ever slips past the trigger below, a negative balance makes it visible instead
-- of silently hiding it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'purchase_requisition_lines'
      AND column_name = 'balance_qty'
  ) THEN
    ALTER TABLE public.purchase_requisition_lines
      ADD COLUMN balance_qty numeric
        GENERATED ALWAYS AS (quantity - ordered_qty) STORED;
  END IF;
END $$;

ALTER TABLE public.purchase_requisition_lines
  DROP CONSTRAINT IF EXISTS pr_lines_line_status_chk;
ALTER TABLE public.purchase_requisition_lines
  ADD CONSTRAINT pr_lines_line_status_chk CHECK (line_status IN (
    'open', 'in_rfq', 'partially_ordered', 'fully_ordered', 'short_closed', 'cancelled'
  ));

COMMENT ON COLUMN public.purchase_requisition_lines.ordered_qty IS
  'Cumulative quantity placed on purchase orders across ALL vendors for this PR line.';
COMMENT ON COLUMN public.purchase_requisition_lines.balance_qty IS
  'Generated: quantity - ordered_qty. Quantity still to be ordered.';
COMMENT ON COLUMN public.purchase_requisition_lines.pr_bal_qty IS
  'LEGACY / different meaning: balance on the source MR line, not the PR line. See balance_qty for PO consumption.';

-- ----------------------------------------------------------------------------
-- 2. RFQ LINES — the canonical ask
--
--    rfq_quantity may be LESS than the PR line quantity: a buyer can tender part
--    of a line now and the rest later.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_lines (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                        uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  project_id                    uuid NOT NULL REFERENCES public.projects(id),

  -- Traceability. purchase_requisition_id is denormalised so an RFQ that bundles
  -- lines from several PRs can still be filtered per PR without a join.
  purchase_requisition_line_id  uuid REFERENCES public.purchase_requisition_lines(id) ON DELETE SET NULL,
  purchase_requisition_id       uuid REFERENCES public.purchase_requisitions(id) ON DELETE SET NULL,

  line_number                   integer NOT NULL DEFAULT 1,
  item_id                       uuid REFERENCES public.item_master(id),
  item_code                     text,
  item_group                    text,
  item_description              text NOT NULL,
  specification                 text,
  preferred_brand               text,
  unit                          text NOT NULL DEFAULT 'nos',

  rfq_quantity                  numeric NOT NULL CHECK (rfq_quantity > 0),
  estimated_rate                numeric NOT NULL DEFAULT 0 CHECK (estimated_rate >= 0),

  -- Carried from the PR line so the activity -> budget-category mapping survives
  -- PR -> RFQ -> award -> PO without re-deriving it at each hop.
  activity_name                 text,
  sub_activity_name             text,
  activity_code                 text,

  required_date                 date,
  remarks                       text,

  -- 'open' | 'quoted' | 'partially_awarded' | 'fully_awarded' | 'cancelled'
  status                        text NOT NULL DEFAULT 'open',

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid REFERENCES public.profiles(id),
  updated_by                    uuid REFERENCES public.profiles(id),

  CONSTRAINT rfq_lines_status_chk CHECK (status IN (
    'open', 'quoted', 'partially_awarded', 'fully_awarded', 'cancelled'
  ))
);

-- A PR line may appear at most once per RFQ.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rfq_lines_rfq_pr_line
  ON public.rfq_lines (rfq_id, purchase_requisition_line_id)
  WHERE purchase_requisition_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rfq_lines_rfq        ON public.rfq_lines (rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_pr_line    ON public.rfq_lines (purchase_requisition_line_id);
CREATE INDEX IF NOT EXISTS idx_rfq_lines_project    ON public.rfq_lines (project_id);

COMMENT ON TABLE public.rfq_lines IS
  'What an RFQ actually asks for. One row per PR line pulled into the sourcing event. Quotations and awards both reference these rows, which is what makes bid comparison a matrix rather than free text.';

-- ----------------------------------------------------------------------------
-- 3. QUOTATION LINES — bind bids to the ask
--
--    offered_qty models vendor CAPACITY: "I can supply at most 60 of the 100 MT
--    you asked for." This is the most common real reason a line gets split.
-- ----------------------------------------------------------------------------
ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS rfq_line_id     uuid REFERENCES public.rfq_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offered_qty     numeric CHECK (offered_qty IS NULL OR offered_qty > 0),
  ADD COLUMN IF NOT EXISTS lead_time_days  integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  ADD COLUMN IF NOT EXISTS remarks         text;

CREATE INDEX IF NOT EXISTS idx_quotation_lines_rfq_line
  ON public.quotation_lines (rfq_line_id)
  WHERE rfq_line_id IS NOT NULL;

COMMENT ON COLUMN public.quotation_lines.rfq_line_id IS
  'Binds this bid to the RFQ line it answers. Without it, two vendors quoting the same item cannot be compared programmatically.';
COMMENT ON COLUMN public.quotation_lines.offered_qty IS
  'Maximum the vendor can supply for this line. NULL = the full rfq_quantity. Drives split-award validation.';

-- ----------------------------------------------------------------------------
-- 4. VENDOR SELECTIONS — demoted to an AWARD SCENARIO header
--
--    Was: "the one winning vendor for this PR" (NOT NULL vendor + quotation).
--    Now: "an award scenario covering an RFQ", which may award N vendors across
--    M lines. The legacy columns stay and are still populated for single-vendor
--    awards, so existing reads keep working.
-- ----------------------------------------------------------------------------
ALTER TABLE public.vendor_selections
  ALTER COLUMN selected_quotation_id DROP NOT NULL,
  ALTER COLUMN selected_vendor_id    DROP NOT NULL,
  -- Nullable so one scenario can bundle lines from several PRs. Existing rows
  -- keep their value; awards carry per-line PR traceability regardless.
  ALTER COLUMN purchase_requisition_id DROP NOT NULL;

ALTER TABLE public.vendor_selections
  ADD COLUMN IF NOT EXISTS total_award_value numeric NOT NULL DEFAULT 0
    CHECK (total_award_value >= 0),
  ADD COLUMN IF NOT EXISTS award_mode text NOT NULL DEFAULT 'single_vendor',
  ADD COLUMN IF NOT EXISTS vendor_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.vendor_selections
  DROP CONSTRAINT IF EXISTS vendor_selections_award_mode_chk;
ALTER TABLE public.vendor_selections
  ADD CONSTRAINT vendor_selections_award_mode_chk CHECK (award_mode IN (
    'single_vendor', 'multi_vendor', 'split_quantity'
  ));

COMMENT ON COLUMN public.vendor_selections.selected_vendor_id IS
  'Legacy single-vendor shortcut. NULL for multi-vendor awards; see vendor_selection_awards.';
COMMENT ON COLUMN public.vendor_selections.total_award_value IS
  'Sum of all award lines. Approval thresholds MUST key off this, never off an individual PO — otherwise splitting a large award across vendors evades the threshold.';

-- ----------------------------------------------------------------------------
-- 5. VENDOR SELECTION AWARDS — the allocation matrix
--
--    One row per (rfq_line x vendor x quantity). This single table is what makes
--    both scenarios possible: item-wise split = one row per line with different
--    vendors; quantity split = two rows for the SAME line with different vendors.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_selection_awards (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_selection_id           uuid NOT NULL REFERENCES public.vendor_selections(id) ON DELETE CASCADE,
  project_id                    uuid NOT NULL REFERENCES public.projects(id),

  rfq_line_id                   uuid NOT NULL REFERENCES public.rfq_lines(id) ON DELETE CASCADE,
  -- Denormalised for direct PR rollup without traversing rfq_lines.
  purchase_requisition_line_id  uuid REFERENCES public.purchase_requisition_lines(id) ON DELETE SET NULL,

  vendor_id                     uuid NOT NULL REFERENCES public.vendors(id),
  quotation_id                  uuid REFERENCES public.vendor_quotations(id) ON DELETE SET NULL,
  quotation_line_id             uuid REFERENCES public.quotation_lines(id) ON DELETE SET NULL,

  awarded_qty                   numeric NOT NULL CHECK (awarded_qty > 0),
  -- Both rates are kept: the delta between them IS the negotiated saving, and
  -- storing only the final rate erases whether any negotiation happened.
  quoted_rate                   numeric NOT NULL DEFAULT 0 CHECK (quoted_rate >= 0),
  awarded_rate                  numeric NOT NULL DEFAULT 0 CHECK (awarded_rate >= 0),
  tax_rate                      numeric NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  awarded_amount                numeric GENERATED ALWAYS AS (awarded_qty * awarded_rate) STORED,

  -- Governance. Awarding anyone other than the lowest bidder on a line is the
  -- first thing an auditor asks about, so the reason is captured structurally.
  is_lowest_bid                 boolean NOT NULL DEFAULT true,
  non_l1_justification          text,
  award_reason                  text,
  lead_time_days                integer CHECK (lead_time_days IS NULL OR lead_time_days >= 0),

  -- Populated when the PO is generated.
  purchase_order_id             uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  purchase_order_line_id        uuid REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL,

  -- 'pending' | 'approved' | 'rejected' | 'po_created' | 'cancelled'
  status                        text NOT NULL DEFAULT 'pending',

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid REFERENCES public.profiles(id),
  updated_by                    uuid REFERENCES public.profiles(id),

  CONSTRAINT vendor_selection_awards_status_chk CHECK (status IN (
    'pending', 'approved', 'rejected', 'po_created', 'cancelled'
  )),
  -- A non-L1 award must say why.
  CONSTRAINT vendor_selection_awards_non_l1_chk CHECK (
    is_lowest_bid OR coalesce(btrim(non_l1_justification), '') <> ''
  )
);

-- One allocation per vendor per line per scenario. Splitting 100 between A and B
-- is two rows with different vendor_id; awarding A twice on one line is a bug.
CREATE UNIQUE INDEX IF NOT EXISTS uq_award_scenario_line_vendor
  ON public.vendor_selection_awards (vendor_selection_id, rfq_line_id, vendor_id);

CREATE INDEX IF NOT EXISTS idx_awards_selection ON public.vendor_selection_awards (vendor_selection_id);
CREATE INDEX IF NOT EXISTS idx_awards_rfq_line  ON public.vendor_selection_awards (rfq_line_id);
CREATE INDEX IF NOT EXISTS idx_awards_pr_line   ON public.vendor_selection_awards (purchase_requisition_line_id);
CREATE INDEX IF NOT EXISTS idx_awards_vendor    ON public.vendor_selection_awards (vendor_id);
CREATE INDEX IF NOT EXISTS idx_awards_po        ON public.vendor_selection_awards (purchase_order_id);

COMMENT ON TABLE public.vendor_selection_awards IS
  'The award matrix. One row per rfq_line x vendor x quantity. Item-wise split = one row per line to different vendors; quantity split = several rows on the SAME line to different vendors.';

-- ----------------------------------------------------------------------------
-- 6. PURCHASE ORDER LINES — line-level traceability
--
--    Also unblocks budget posting: fn_auto_commit_po_to_budget resolves an
--    allocation via master_budget_item_id, and nothing could carry that from the
--    PR to the PO because no line-level link existed.
-- ----------------------------------------------------------------------------
ALTER TABLE public.purchase_order_lines
  ADD COLUMN IF NOT EXISTS purchase_requisition_line_id uuid
    REFERENCES public.purchase_requisition_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_selection_award_id uuid
    REFERENCES public.vendor_selection_awards(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rfq_line_id uuid
    REFERENCES public.rfq_lines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS master_budget_item_id uuid
    REFERENCES public.master_budget_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'nos',
  ADD COLUMN IF NOT EXISTS line_number integer,
  ADD COLUMN IF NOT EXISTS activity_name text,
  ADD COLUMN IF NOT EXISTS sub_activity_name text;

CREATE INDEX IF NOT EXISTS idx_po_lines_pr_line
  ON public.purchase_order_lines (purchase_requisition_line_id)
  WHERE purchase_requisition_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_lines_award
  ON public.purchase_order_lines (vendor_selection_award_id)
  WHERE vendor_selection_award_id IS NOT NULL;

-- One PO per vendor per award scenario. Makes multi-PO generation idempotent:
-- a retry after a partial failure cannot duplicate a vendor's order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_po_selection_vendor
  ON public.purchase_orders (vendor_selection_id, vendor_id)
  WHERE vendor_selection_id IS NOT NULL AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 7a. GUARD — an award may never exceed the RFQ line quantity
--
--     Enforced at AWARD time, in the database. Checking at PO time is too late
--     and racy: two buyers building scenarios concurrently would each pass a
--     UI-level check and jointly over-order.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_guard_award_quantity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rfq_qty     numeric;
  v_total       numeric;
  v_offered     numeric;
BEGIN
  SELECT rfq_quantity INTO v_rfq_qty
  FROM public.rfq_lines WHERE id = NEW.rfq_line_id;

  IF v_rfq_qty IS NULL THEN
    RAISE EXCEPTION 'RFQ line % does not exist.', NEW.rfq_line_id USING ERRCODE = 'P0002';
  END IF;

  -- Total awarded on this line across all vendors in this scenario, including
  -- the row being written.
  SELECT COALESCE(SUM(awarded_qty), 0) INTO v_total
  FROM public.vendor_selection_awards
  WHERE rfq_line_id = NEW.rfq_line_id
    AND vendor_selection_id = NEW.vendor_selection_id
    AND status <> 'cancelled'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_total := v_total + NEW.awarded_qty;

  IF v_total > v_rfq_qty + 1e-6 THEN
    RAISE EXCEPTION
      'Award exceeds the RFQ line quantity: awarding % against a line of % (already allocated %).',
      NEW.awarded_qty, v_rfq_qty, v_total - NEW.awarded_qty
      USING ERRCODE = '23514';
  END IF;

  -- Respect vendor capacity when the quotation declared one.
  IF NEW.quotation_line_id IS NOT NULL THEN
    SELECT offered_qty INTO v_offered
    FROM public.quotation_lines WHERE id = NEW.quotation_line_id;

    IF v_offered IS NOT NULL AND NEW.awarded_qty > v_offered + 1e-6 THEN
      RAISE EXCEPTION
        'Award of % exceeds the quantity this vendor offered (%).', NEW.awarded_qty, v_offered
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Keep the PR-line denormalisation honest.
  IF NEW.purchase_requisition_line_id IS NULL THEN
    SELECT purchase_requisition_line_id INTO NEW.purchase_requisition_line_id
    FROM public.rfq_lines WHERE id = NEW.rfq_line_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_award_quantity ON public.vendor_selection_awards;
CREATE TRIGGER guard_award_quantity
  BEFORE INSERT OR UPDATE OF awarded_qty, rfq_line_id, quotation_line_id
  ON public.vendor_selection_awards
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_guard_award_quantity();

-- ----------------------------------------------------------------------------
-- 7b. ROLLUP — RFQ line award status
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_recompute_rfq_line_award(p_rfq_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty      numeric;
  v_awarded  numeric;
BEGIN
  IF p_rfq_line_id IS NULL THEN RETURN; END IF;

  SELECT rfq_quantity INTO v_qty FROM public.rfq_lines WHERE id = p_rfq_line_id;
  IF v_qty IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(a.awarded_qty), 0) INTO v_awarded
  FROM public.vendor_selection_awards a
  JOIN public.vendor_selections s ON s.id = a.vendor_selection_id
  WHERE a.rfq_line_id = p_rfq_line_id
    AND a.status NOT IN ('cancelled', 'rejected')
    AND COALESCE(s.status::text, '') <> 'rejected';

  UPDATE public.rfq_lines
  SET status = CASE
        WHEN v_awarded <= 1e-6            THEN 'open'
        WHEN v_awarded >= v_qty - 1e-6    THEN 'fully_awarded'
        ELSE 'partially_awarded'
      END,
      updated_at = now()
  WHERE id = p_rfq_line_id;
END $$;

-- ----------------------------------------------------------------------------
-- 7c. ROLLUP — PR line ordered quantity and status
--
--     ordered_qty counts PURCHASE ORDER lines, not awards: an approved award
--     that has not yet become a PO has not consumed the requisition.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_pr_line_ordered(p_pr_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_qty     numeric;
  v_ordered numeric;
BEGIN
  IF p_pr_line_id IS NULL THEN RETURN; END IF;

  SELECT quantity INTO v_qty
  FROM public.purchase_requisition_lines WHERE id = p_pr_line_id;
  IF v_qty IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(pol.quantity), 0) INTO v_ordered
  FROM public.purchase_order_lines pol
  JOIN public.purchase_orders po ON po.id = pol.purchase_order_id
  WHERE pol.purchase_requisition_line_id = p_pr_line_id
    AND po.deleted_at IS NULL
    AND po.status::text NOT IN ('cancelled', 'rejected');

  UPDATE public.purchase_requisition_lines
  SET ordered_qty = v_ordered,
      line_status = CASE
        WHEN line_status IN ('cancelled', 'short_closed') THEN line_status
        WHEN v_ordered <= 1e-6         THEN 'open'
        WHEN v_ordered >= v_qty - 1e-6 THEN 'fully_ordered'
        ELSE 'partially_ordered'
      END,
      updated_at = now()
  WHERE id = p_pr_line_id;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_pr_line_ordered(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7d. ROLLUP — PR header from its lines
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_pr_header_status(p_pr_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total    integer;
  v_full     integer;
  v_any      integer;
BEGIN
  IF p_pr_id IS NULL THEN RETURN; END IF;

  SELECT count(*),
         count(*) FILTER (WHERE line_status = 'fully_ordered'),
         count(*) FILTER (WHERE ordered_qty > 1e-6)
    INTO v_total, v_full, v_any
  FROM public.purchase_requisition_lines
  WHERE purchase_requisition_id = p_pr_id
    AND line_status <> 'cancelled';

  IF v_total = 0 OR v_any = 0 THEN
    RETURN;  -- nothing ordered yet; leave the workflow status alone
  END IF;

  -- Explicit casts are required: a CASE of bare literals resolves to text, and
  -- text cannot be assigned to an enum column.
  UPDATE public.purchase_requisitions
  SET status = CASE
        WHEN v_full = v_total THEN 'po_issued'::public.erp_procurement_status
        ELSE 'partially_ordered'::public.erp_procurement_status
      END,
      status_changed_at = now(),
      updated_at = now()
  WHERE id = p_pr_id
    AND COALESCE(status::text, '') NOT IN ('cancelled', 'rejected', 'closed');
EXCEPTION
  -- purchase_requisitions.status may be an enum without 'partially_ordered'.
  -- The rollup is advisory; never let it break PO creation.
  WHEN invalid_text_representation OR check_violation THEN
    RETURN;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_pr_header_status(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7e. TRIGGERS wiring the rollups
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_award_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM public.fn_recompute_rfq_line_award(OLD.rfq_line_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM public.fn_recompute_rfq_line_award(NEW.rfq_line_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS award_rollup ON public.vendor_selection_awards;
CREATE TRIGGER award_rollup
  AFTER INSERT OR UPDATE OF awarded_qty, status, rfq_line_id OR DELETE
  ON public.vendor_selection_awards
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_award_rollup();

CREATE OR REPLACE FUNCTION public.trg_fn_po_line_pr_rollup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_line uuid;
  v_pr   uuid;
BEGIN
  v_line := CASE WHEN TG_OP = 'DELETE' THEN OLD.purchase_requisition_line_id
                 ELSE NEW.purchase_requisition_line_id END;

  IF v_line IS NOT NULL THEN
    PERFORM public.recompute_pr_line_ordered(v_line);
    SELECT purchase_requisition_id INTO v_pr
    FROM public.purchase_requisition_lines WHERE id = v_line;
    PERFORM public.recompute_pr_header_status(v_pr);
  END IF;

  -- Also recompute the old line when a PO line is repointed.
  IF TG_OP = 'UPDATE'
     AND OLD.purchase_requisition_line_id IS DISTINCT FROM NEW.purchase_requisition_line_id
     AND OLD.purchase_requisition_line_id IS NOT NULL THEN
    PERFORM public.recompute_pr_line_ordered(OLD.purchase_requisition_line_id);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS po_line_pr_rollup ON public.purchase_order_lines;
CREATE TRIGGER po_line_pr_rollup
  AFTER INSERT OR UPDATE OF quantity, purchase_requisition_line_id OR DELETE
  ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_po_line_pr_rollup();

-- ----------------------------------------------------------------------------
-- 7f. Keep the award scenario header totals honest.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_award_scenario_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sel     uuid;
  v_total   numeric;
  v_vendors integer;
  v_lines   integer;
BEGIN
  v_sel := CASE WHEN TG_OP = 'DELETE' THEN OLD.vendor_selection_id ELSE NEW.vendor_selection_id END;
  IF v_sel IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(awarded_amount), 0),
         count(DISTINCT vendor_id),
         count(DISTINCT rfq_line_id)
    INTO v_total, v_vendors, v_lines
  FROM public.vendor_selection_awards
  WHERE vendor_selection_id = v_sel
    AND status <> 'cancelled';

  UPDATE public.vendor_selections
  SET total_award_value = v_total,
      vendor_count      = v_vendors,
      award_mode = CASE
        WHEN v_vendors <= 1 THEN 'single_vendor'
        WHEN EXISTS (
          SELECT 1 FROM public.vendor_selection_awards
          WHERE vendor_selection_id = v_sel AND status <> 'cancelled'
          GROUP BY rfq_line_id HAVING count(DISTINCT vendor_id) > 1
        ) THEN 'split_quantity'
        ELSE 'multi_vendor'
      END,
      updated_at = now()
  WHERE id = v_sel;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS award_scenario_totals ON public.vendor_selection_awards;
CREATE TRIGGER award_scenario_totals
  AFTER INSERT OR UPDATE OF awarded_qty, awarded_rate, status, vendor_id OR DELETE
  ON public.vendor_selection_awards
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_award_scenario_totals();

-- ----------------------------------------------------------------------------
-- 8. updated_at maintenance (fn_touch_updated_at ships with the budget hardening
--    migration; only attach the triggers if it is present).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_touch_updated_at') THEN
    DROP TRIGGER IF EXISTS touch_rfq_lines ON public.rfq_lines;
    CREATE TRIGGER touch_rfq_lines BEFORE UPDATE ON public.rfq_lines
      FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

    DROP TRIGGER IF EXISTS touch_awards ON public.vendor_selection_awards;
    CREATE TRIGGER touch_awards BEFORE UPDATE ON public.vendor_selection_awards
      FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 9. RLS — read for any authenticated user, write for procurement roles.
--    Mirrors the procurement hardening migration's predicates.
-- ----------------------------------------------------------------------------
ALTER TABLE public.rfq_lines               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_selection_awards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfq_lines_read ON public.rfq_lines;
CREATE POLICY rfq_lines_read ON public.rfq_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rfq_lines_write ON public.rfq_lines;
CREATE POLICY rfq_lines_write ON public.rfq_lines
  FOR ALL TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());

DROP POLICY IF EXISTS awards_read ON public.vendor_selection_awards;
CREATE POLICY awards_read ON public.vendor_selection_awards
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS awards_write ON public.vendor_selection_awards;
CREATE POLICY awards_write ON public.vendor_selection_awards
  FOR ALL TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());

-- ----------------------------------------------------------------------------
-- 10. BACKFILL — give existing RFQs their lines, from the PR they point at.
--     Without this, historical RFQs have no comparable structure.
-- ----------------------------------------------------------------------------
INSERT INTO public.rfq_lines (
  rfq_id, project_id, purchase_requisition_line_id, purchase_requisition_id,
  line_number, item_id, item_code, item_group, item_description, specification,
  preferred_brand, unit, rfq_quantity, estimated_rate,
  activity_name, sub_activity_name, activity_code, required_date
)
SELECT r.id, r.project_id, prl.id, prl.purchase_requisition_id,
       COALESCE(prl.line_number, row_number() OVER (PARTITION BY r.id ORDER BY prl.created_at)),
       prl.item_id, prl.item_code, prl.item_group, prl.item_description, prl.specification,
       prl.preferred_brand, COALESCE(prl.unit, 'nos'),
       prl.quantity, COALESCE(prl.estimated_rate, 0),
       prl.activity_name, prl.sub_activity_name, prl.activity_code, prl.required_date
FROM public.rfqs r
JOIN public.purchase_requisition_lines prl
  ON prl.purchase_requisition_id = r.purchase_requisition_id
WHERE r.deleted_at IS NULL
  AND prl.quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.rfq_lines rl
    WHERE rl.rfq_id = r.id AND rl.purchase_requisition_line_id = prl.id
  );

-- Seed ordered_qty for PR lines that already have POs, where the link can be
-- inferred. Existing PO lines have no pr_line_id, so match on
-- (same PR, same description) and only when it is unambiguous.
UPDATE public.purchase_order_lines pol
SET purchase_requisition_line_id = m.pr_line_id
FROM (
  SELECT pol2.id AS po_line_id,
         (SELECT prl.id
            FROM public.purchase_requisition_lines prl
           WHERE prl.purchase_requisition_id = po.purchase_requisition_id
             AND btrim(lower(prl.item_description)) = btrim(lower(pol2.item_description))
           LIMIT 1) AS pr_line_id
  FROM public.purchase_order_lines pol2
  JOIN public.purchase_orders po ON po.id = pol2.purchase_order_id
  WHERE pol2.purchase_requisition_line_id IS NULL
    AND po.purchase_requisition_id IS NOT NULL
) m
WHERE pol.id = m.po_line_id
  AND m.pr_line_id IS NOT NULL;

-- Recompute every PR line touched by the backfill.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT purchase_requisition_line_id AS id
    FROM public.purchase_order_lines
    WHERE purchase_requisition_line_id IS NOT NULL
  LOOP
    PERFORM public.recompute_pr_line_ordered(r.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 11. Realtime
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY ARRAY['rfq_lines', 'vendor_selection_awards', 'vendor_selections', 'quotation_lines'] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
