-- ============================================================================
-- PRAMUKH GROUP ERP V2 — BUDGET MODULE PRODUCTION HARDENING
-- File: supabase/migrations/20260730120000_budget_module_production_hardening.sql
--
-- Supersedes the hand-applied supabase/schemma/budget_module_production_schema.sql
-- and repairs 20260729190000_budget_module_v2_schema.sql.
--
-- This migration is IDEMPOTENT and NON-DESTRUCTIVE: it never deletes budget rows.
-- It can be re-run safely.
--
-- WHAT IT FIXES
--   1.  Broken cross-module triggers: 20260729190000 casts to a type that does not
--       exist (erp_ledger_transaction_type) using a value that is not in the enum
--       ('committed'). The real type is public.erp_budget_txn_type and the value is
--       'commitment'. Any PO approval carrying a budget_allocation_id aborted.
--   2.  Master Budget (budget_categories / master_budget_items) had NO relationship
--       to the allocation + ledger engine (budget_allocations), so PO -> committed
--       and Bill -> spent could never post. Adds the link and auto-provisions one
--       allocation per budget category.
--   3.  budget_variance_items.po_* / actual_* were never written by anything.
--       Adds rollups from purchase_orders and vendor_bills.
--   4.  Stored variance columns (qty_variation, cost_variance_amount, ...) were
--       never maintained. Adds a BEFORE trigger that computes them.
--   5.  budget_alerts had no dedup guard: every allocation UPDATE inserted a new
--       identical alert.
--   6.  Partial-bill commitment release released against the bill amount instead
--       of the PO commitment, leaving phantom commitment.
--   7.  No RLS anywhere: the public anon key had full SELECT/UPDATE/DELETE on the
--       entire budget. Enables RLS + authenticated-only policies on every table.
--   8.  No budget_config table (the Config tab was component state only).
--   9.  No project-wise bill ledger source (the Bill-Wise Ledger tab read columns
--       that do not exist on budget_ledger). Adds budget_bill_ledger_view.
--  10.  master_budget_items.sr_no is TEXT, so ORDER BY sr_no sorted
--       1, 10, 11, 2, 20 ... Adds a numeric sort_order and backfills it.
--  11.  No unique constraint on master budget line items, so re-running a seed or
--       an Excel import duplicated everything.
-- ============================================================================

SET client_min_messages TO WARNING;

-- ----------------------------------------------------------------------------
-- 0. PRECONDITIONS — verify the enum this migration depends on
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'erp_budget_txn_type') THEN
    RAISE EXCEPTION 'Required enum public.erp_budget_txn_type is missing. Restore the base ERP schema before running this migration.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'erp_budget_txn_type' AND e.enumlabel = 'commitment'
  ) THEN
    RAISE EXCEPTION 'Enum public.erp_budget_txn_type is missing the ''commitment'' value.';
  END IF;
END $$;

-- Drop the broken triggers from 20260729190000 up front so that the data
-- backfill later in this migration cannot trip over them.
DROP TRIGGER IF EXISTS trg_po_budget_commitment ON public.purchase_orders;
DROP TRIGGER IF EXISTS trg_bill_budget_actual ON public.vendor_bills;
DROP TRIGGER IF EXISTS trg_budget_overrun_alert ON public.budget_allocations;

-- ============================================================================
-- 1. SCHEMA EXTENSIONS
-- ============================================================================

-- 1z. budget_categories — created here because 20260729190000 never created it
--     (it only ever existed via the hand-applied supabase/schemma/ script, so a
--     clean `supabase db reset` produced a database the frontend could not read).
CREATE TABLE IF NOT EXISTS public.budget_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  category_code text,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unq_project_category UNIQUE (project_id, category_name)
);

CREATE INDEX IF NOT EXISTS idx_budget_categories_project
  ON public.budget_categories (project_id, sort_order);

-- 1a. Master budget line items -----------------------------------------------
ALTER TABLE public.master_budget_items
  ADD COLUMN IF NOT EXISTS category_id  uuid REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope_tag    text NOT NULL DEFAULT 'site_infra',
  ADD COLUMN IF NOT EXISTS item_type    text NOT NULL DEFAULT 'material',
  ADD COLUMN IF NOT EXISTS sort_order   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at   timestamptz;

-- category_name is denormalised for display; it must never block an insert.
ALTER TABLE public.master_budget_items ALTER COLUMN category_name DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'master_budget_items_scope_tag_chk'
  ) THEN
    ALTER TABLE public.master_budget_items
      ADD CONSTRAINT master_budget_items_scope_tag_chk
      CHECK (scope_tag IN ('building_rcc', 'building_finishes', 'site_infra'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'master_budget_items_item_type_chk'
  ) THEN
    ALTER TABLE public.master_budget_items
      ADD CONSTRAINT master_budget_items_item_type_chk
      CHECK (item_type IN ('material', 'labour', 'service', 'equipment', 'subcontract', 'mixed'));
  END IF;
END $$;

-- 1b. Budget categories ------------------------------------------------------
ALTER TABLE public.budget_categories
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 1c. Budget allocations: the missing link to the Master Budget ---------------
ALTER TABLE public.budget_allocations
  ADD COLUMN IF NOT EXISTS category_id           uuid REFERENCES public.budget_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS master_budget_item_id uuid REFERENCES public.master_budget_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS advance_amount        numeric NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
  ADD COLUMN IF NOT EXISTS retention_held        numeric NOT NULL DEFAULT 0 CHECK (retention_held >= 0),
  ADD COLUMN IF NOT EXISTS financial_year        text,
  ADD COLUMN IF NOT EXISTS is_auto_provisioned   boolean NOT NULL DEFAULT false;

-- 1d. Budget ledger ----------------------------------------------------------
ALTER TABLE public.budget_ledger
  ADD COLUMN IF NOT EXISTS financial_year text,
  ADD COLUMN IF NOT EXISTS category_id    uuid REFERENCES public.budget_categories(id) ON DELETE SET NULL;

-- 1e. Budget alerts ----------------------------------------------------------
ALTER TABLE public.budget_alerts
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'warning';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_alerts_severity_chk') THEN
    ALTER TABLE public.budget_alerts
      ADD CONSTRAINT budget_alerts_severity_chk
      CHECK (severity IN ('info', 'warning', 'critical', 'overrun'));
  END IF;
END $$;

-- 1f. Budget revisions: approval workflow ------------------------------------
ALTER TABLE public.budget_revisions
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by  uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS scope        text NOT NULL DEFAULT 'master_budget';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_revisions_status_chk') THEN
    ALTER TABLE public.budget_revisions
      ADD CONSTRAINT budget_revisions_status_chk
      CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_revisions_scope_chk') THEN
    ALTER TABLE public.budget_revisions
      ADD CONSTRAINT budget_revisions_scope_chk
      CHECK (scope IN ('master_budget', 'variance_reconciliation', 'excel_import'));
  END IF;
END $$;

-- 1g. Variance items --------------------------------------------------------
ALTER TABLE public.budget_variance_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.budget_categories(id) ON DELETE SET NULL;

-- 1h. Vendor bills: real retention / advance / net payable --------------------
-- The Bill-Wise Ledger needs these; they did not exist, so the tab invented them.
ALTER TABLE public.vendor_bills
  ADD COLUMN IF NOT EXISTS retention_percent   numeric NOT NULL DEFAULT 0 CHECK (retention_percent >= 0 AND retention_percent <= 100),
  ADD COLUMN IF NOT EXISTS retention_amount    numeric NOT NULL DEFAULT 0 CHECK (retention_amount >= 0),
  ADD COLUMN IF NOT EXISTS advance_adjusted    numeric NOT NULL DEFAULT 0 CHECK (advance_adjusted >= 0),
  ADD COLUMN IF NOT EXISTS other_deductions    numeric NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  ADD COLUMN IF NOT EXISTS net_payable_amount  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ledger_remarks      text;

-- 1i. Per-project budget configuration (the Config tab had nowhere to save) ---
CREATE TABLE IF NOT EXISTS public.budget_config (
  project_id                        uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  caution_threshold_percent         numeric NOT NULL DEFAULT 50,
  warning_threshold_percent         numeric NOT NULL DEFAULT 75,
  critical_threshold_percent        numeric NOT NULL DEFAULT 90,
  hard_limit_percent                numeric NOT NULL DEFAULT 100,
  hard_limit_enforcement            text    NOT NULL DEFAULT 'block',
  require_justification_over_budget boolean NOT NULL DEFAULT true,
  current_fy                        text    NOT NULL DEFAULT '2026-27',
  budget_lock_enabled               boolean NOT NULL DEFAULT false,
  default_retention_percent         numeric NOT NULL DEFAULT 5,
  default_gst_percent               numeric NOT NULL DEFAULT 18,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  updated_by                        uuid REFERENCES public.profiles(id),
  CONSTRAINT budget_config_enforcement_chk CHECK (hard_limit_enforcement IN ('block', 'warn_only')),
  CONSTRAINT budget_config_thresholds_chk  CHECK (
    caution_threshold_percent  >= 0
    AND caution_threshold_percent  <= warning_threshold_percent
    AND warning_threshold_percent  <= critical_threshold_percent
    AND critical_threshold_percent <= hard_limit_percent
    AND hard_limit_percent <= 500
  ),
  CONSTRAINT budget_config_retention_chk CHECK (default_retention_percent >= 0 AND default_retention_percent <= 100),
  CONSTRAINT budget_config_gst_chk       CHECK (default_gst_percent >= 0 AND default_gst_percent <= 100)
);

-- Every existing project gets a config row.
INSERT INTO public.budget_config (project_id)
SELECT id FROM public.projects WHERE deleted_at IS NULL
ON CONFLICT (project_id) DO NOTHING;

-- ============================================================================
-- 2. DATA BACKFILL
-- ============================================================================

-- 2a. Numeric sort order derived from the text sr_no (fixes 1,10,11,2,20 order).
UPDATE public.master_budget_items
SET sort_order = COALESCE(NULLIF(regexp_replace(sr_no, '[^0-9]', '', 'g'), '')::int, 0)
WHERE sort_order = 0;

-- 2b. Denormalised category_name kept in step with budget_categories.
UPDATE public.master_budget_items mbi
SET category_name = bc.category_name
FROM public.budget_categories bc
WHERE mbi.category_id = bc.id
  AND (mbi.category_name IS DISTINCT FROM bc.category_name);

-- 2c. Variance rows inherit the category link.
UPDATE public.budget_variance_items bvi
SET category_id = mbi.category_id
FROM public.master_budget_items mbi
WHERE bvi.master_budget_item_id = mbi.id
  AND bvi.category_id IS DISTINCT FROM mbi.category_id;

-- 2d. Existing vendor bills get retention / net payable from project config.
UPDATE public.vendor_bills vb
SET retention_percent = cfg.default_retention_percent,
    retention_amount  = ROUND(COALESCE(vb.subtotal_amount, 0) * cfg.default_retention_percent / 100.0, 2)
FROM public.budget_config cfg
WHERE cfg.project_id = vb.project_id
  AND vb.retention_percent = 0
  AND vb.retention_amount = 0;

UPDATE public.vendor_bills
SET net_payable_amount = GREATEST(
      0,
      COALESCE(total_amount, 0) - COALESCE(retention_amount, 0)
        - COALESCE(advance_adjusted, 0) - COALESCE(other_deductions, 0)
    )
WHERE net_payable_amount = 0;

-- ============================================================================
-- 3. CONSTRAINTS & INDEXES
-- ============================================================================

-- 3a. One master budget line per (project, category, description).
--     Verified safe against live data: the only repeated descriptions live in
--     DIFFERENT categories (Material vs Labour), which this permits.
--     NOTE: intentionally NOT unique on sr_no — sr_no is an Excel display label
--     and live data legitimately contains a collision.
--     Attempted defensively: if an environment already contains true duplicates the
--     index cannot be built, and we must NOT abort the whole migration — the RLS and
--     broken-trigger fixes later in this file are security-critical. Instead we log
--     exactly what to clean up and carry on.
DO $$
DECLARE
  v_dupes text;
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_master_budget_items_project_cat_desc
      ON public.master_budget_items (project_id, category_id, lower(btrim(item_description)))
      WHERE deleted_at IS NULL AND category_id IS NOT NULL;
  EXCEPTION WHEN unique_violation THEN
    SELECT string_agg(format('%s (category %s, x%s)', item_description, category_id, cnt), '; ')
      INTO v_dupes
    FROM (
      SELECT item_description, category_id, COUNT(*) AS cnt
      FROM public.master_budget_items
      WHERE deleted_at IS NULL AND category_id IS NOT NULL
      GROUP BY project_id, category_id, lower(btrim(item_description)), item_description
      HAVING COUNT(*) > 1
    ) d;

    RAISE WARNING
      'Could not create uq_master_budget_items_project_cat_desc: duplicate line items exist. Deduplicate then re-run this migration. Duplicates: %',
      COALESCE(v_dupes, 'unknown');
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_master_budget_items_project_sort
  ON public.master_budget_items (project_id, sort_order, sr_no);
CREATE INDEX IF NOT EXISTS idx_master_budget_items_category
  ON public.master_budget_items (category_id);
CREATE INDEX IF NOT EXISTS idx_master_budget_items_active
  ON public.master_budget_items (project_id) WHERE is_active AND deleted_at IS NULL;

-- 3b. One variance row per master budget item (upsert target).
CREATE UNIQUE INDEX IF NOT EXISTS uq_variance_project_item
  ON public.budget_variance_items (project_id, master_budget_item_id);
CREATE INDEX IF NOT EXISTS idx_budget_variance_category
  ON public.budget_variance_items (category_id);

-- 3c. One auto-provisioned allocation per budget category.
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_allocations_project_category
  ON public.budget_allocations (project_id, category_id)
  WHERE category_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budget_allocations_project_status
  ON public.budget_allocations (project_id, status) WHERE deleted_at IS NULL;

-- 3d. Ledger idempotency: a given source document posts a given txn type once.
--     This is what makes the cross-module triggers safe to re-fire.
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_ledger_source_txn
  ON public.budget_ledger (source_table, source_id, transaction_type)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_ledger_project_posted
  ON public.budget_ledger (project_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_ledger_allocation
  ON public.budget_ledger (budget_allocation_id);

-- 3e. Alerts: at most one OPEN alert per (allocation, type).
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_alerts_open_per_type
  ON public.budget_alerts (budget_allocation_id, alert_type)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_budget_alerts_project_status
  ON public.budget_alerts (project_id, status, created_at DESC);

-- 3f. Revisions.
CREATE INDEX IF NOT EXISTS idx_budget_revisions_project_created
  ON public.budget_revisions (project_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_revisions_project_version
  ON public.budget_revisions (project_id, version_number, scope);

-- 3g. Bill ledger read paths.
CREATE INDEX IF NOT EXISTS idx_vendor_bills_project_billdate
  ON public.vendor_bills (project_id, bill_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_bill_lines_bill
  ON public.vendor_bill_lines (vendor_bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill
  ON public.payments (vendor_bill_id);

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- 4a. Current financial year label (India: Apr -> Mar).
CREATE OR REPLACE FUNCTION public.fn_budget_current_fy(p_when timestamptz DEFAULT now())
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_when) >= 4
      THEN EXTRACT(YEAR FROM p_when)::int || '-' || right((EXTRACT(YEAR FROM p_when)::int + 1)::text, 2)
    ELSE (EXTRACT(YEAR FROM p_when)::int - 1) || '-' || right(EXTRACT(YEAR FROM p_when)::text, 2)
  END;
$$;

-- 4b. Resolve the allocation a source document should post against.
--     Order of preference: explicit allocation -> master item's category -> null.
CREATE OR REPLACE FUNCTION public.fn_resolve_budget_allocation(
  p_project_id            uuid,
  p_budget_allocation_id  uuid,
  p_master_budget_item_id uuid
)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation_id uuid;
  v_category_id   uuid;
BEGIN
  IF p_budget_allocation_id IS NOT NULL THEN
    RETURN p_budget_allocation_id;
  END IF;

  IF p_master_budget_item_id IS NOT NULL THEN
    SELECT category_id INTO v_category_id
    FROM public.master_budget_items
    WHERE id = p_master_budget_item_id;

    IF v_category_id IS NOT NULL THEN
      SELECT id INTO v_allocation_id
      FROM public.budget_allocations
      WHERE project_id = p_project_id
        AND category_id = v_category_id
        AND deleted_at IS NULL
      LIMIT 1;
      RETURN v_allocation_id;
    END IF;
  END IF;

  RETURN NULL;
END $$;

-- ============================================================================
-- 5. AUTO-PROVISION BUDGET HEADS + ALLOCATIONS FROM THE MASTER BUDGET
--    This is the structural fix: without it nothing can post to the ledger.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_sync_category_to_allocation(p_category_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat            public.budget_categories;
  v_head_id        uuid;
  v_cost_code_id   uuid;
  v_allocated      numeric;
  v_allocation_id  uuid;
  v_cfg            public.budget_config;
BEGIN
  SELECT * INTO v_cat FROM public.budget_categories WHERE id = p_category_id;
  IF v_cat.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cfg FROM public.budget_config WHERE project_id = v_cat.project_id;

  -- Baseline for this category = sum of its active master budget lines.
  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_allocated
  FROM public.master_budget_items
  WHERE category_id = p_category_id AND is_active AND deleted_at IS NULL;

  -- A cost code + budget head per category keeps the pre-existing ERP
  -- reporting hierarchy intact (budget_allocations.budget_head_id is NOT NULL).
  SELECT id INTO v_cost_code_id
  FROM public.cost_codes
  WHERE project_id = v_cat.project_id
    AND code = COALESCE(v_cat.category_code, 'CAT') AND deleted_at IS NULL
  LIMIT 1;

  IF v_cost_code_id IS NULL THEN
    INSERT INTO public.cost_codes (project_id, code, name, description)
    VALUES (v_cat.project_id,
            COALESCE(v_cat.category_code, 'CAT-' || left(v_cat.id::text, 8)),
            v_cat.category_name,
            'Auto-created from Master Budget category')
    RETURNING id INTO v_cost_code_id;
  END IF;

  SELECT id INTO v_head_id
  FROM public.budget_heads
  WHERE project_id = v_cat.project_id
    AND code = COALESCE(v_cat.category_code, 'CAT') AND deleted_at IS NULL
  LIMIT 1;

  IF v_head_id IS NULL THEN
    INSERT INTO public.budget_heads (project_id, cost_code_id, code, name, description)
    VALUES (v_cat.project_id,
            v_cost_code_id,
            COALESCE(v_cat.category_code, 'CAT-' || left(v_cat.id::text, 8)),
            v_cat.category_name,
            'Auto-created from Master Budget category')
    RETURNING id INTO v_head_id;
  END IF;

  -- Upsert the allocation. allocated_amount is always re-derived from the
  -- master budget; committed/spent are owned by the ledger triggers and are
  -- deliberately NOT touched here.
  SELECT id INTO v_allocation_id
  FROM public.budget_allocations
  WHERE project_id = v_cat.project_id AND category_id = p_category_id AND deleted_at IS NULL
  LIMIT 1;

  IF v_allocation_id IS NULL THEN
    INSERT INTO public.budget_allocations (
      project_id, category_id, budget_head_id, allocation_name,
      allocated_amount, committed_amount, spent_amount,
      warning_threshold_percent, hard_limit_percent,
      status, financial_year, is_auto_provisioned
    ) VALUES (
      v_cat.project_id, p_category_id, v_head_id, v_cat.category_name,
      v_allocated, 0, 0,
      COALESCE(v_cfg.warning_threshold_percent, 75),
      COALESCE(v_cfg.hard_limit_percent, 100),
      'approved'::erp_workflow_status,
      COALESCE(v_cfg.current_fy, public.fn_budget_current_fy()),
      true
    )
    RETURNING id INTO v_allocation_id;
  ELSE
    UPDATE public.budget_allocations
    SET allocated_amount = v_allocated,
        allocation_name  = v_cat.category_name,
        budget_head_id   = COALESCE(budget_head_id, v_head_id),
        updated_at       = now()
    WHERE id = v_allocation_id;
  END IF;

  RETURN v_allocation_id;
END $$;

-- Re-provision whenever a category or one of its line items changes.
-- NOTE: NEW is unassigned on DELETE and OLD is unassigned on INSERT in PL/pgSQL,
-- so every reference below is guarded by TG_OP rather than COALESCE(NEW, OLD).
CREATE OR REPLACE FUNCTION public.trg_fn_category_allocation_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_cat uuid;
  v_old_cat uuid;
BEGIN
  IF TG_TABLE_NAME = 'budget_categories' THEN
    IF TG_OP <> 'DELETE' THEN v_new_cat := NEW.id;  END IF;
    IF TG_OP <> 'INSERT' THEN v_old_cat := OLD.id;  END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN v_new_cat := NEW.category_id; END IF;
    IF TG_OP <> 'INSERT' THEN v_old_cat := OLD.category_id; END IF;
  END IF;

  IF v_new_cat IS NOT NULL THEN
    PERFORM public.fn_sync_category_to_allocation(v_new_cat);
  END IF;

  -- A line item may have moved between categories, or been deleted: refresh the
  -- previous category's allocation too.
  IF v_old_cat IS NOT NULL AND v_old_cat IS DISTINCT FROM v_new_cat THEN
    PERFORM public.fn_sync_category_to_allocation(v_old_cat);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_budget_category_allocation_sync ON public.budget_categories;
CREATE TRIGGER trg_budget_category_allocation_sync
  AFTER INSERT OR UPDATE OF category_name, category_code ON public.budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_category_allocation_sync();

DROP TRIGGER IF EXISTS trg_master_item_allocation_sync ON public.master_budget_items;
CREATE TRIGGER trg_master_item_allocation_sync
  AFTER INSERT OR UPDATE OF budgeted_cost, category_id, is_active, deleted_at
    OR DELETE ON public.master_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_category_allocation_sync();

-- ============================================================================
-- 6. VARIANCE ITEMS — keep the stored computed columns correct
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_compute_variance_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_raw_diff numeric;
BEGIN
  NEW.actual_total_cost := ROUND(COALESCE(NEW.actual_bill_qty, 0) * COALESCE(NEW.actual_bill_rate, 0), 2);
  -- po_amount is deliberately NOT recomputed here: it is owned by
  -- fn_rollup_variance_for_master_item, which sums real purchase_order_lines totals.
  -- Those can differ from qty x rate across multi-line POs, and the summed value
  -- is the authoritative commitment.
  NEW.po_amount := COALESCE(NEW.po_amount, 0);

  -- Signed variance. Positive = under budget (saving), negative = overrun.
  v_raw_diff := ROUND(COALESCE(NEW.budget_cost, 0) - NEW.actual_total_cost, 2);

  NEW.balance_amount        := GREATEST(0, v_raw_diff);
  NEW.cost_variance_amount  := v_raw_diff;
  NEW.cost_variance_percent := CASE
    WHEN COALESCE(NEW.budget_cost, 0) > 0 THEN ROUND((v_raw_diff / NEW.budget_cost) * 100, 2)
    ELSE 0
  END;

  NEW.qty_variation  := ROUND(COALESCE(NEW.actual_bill_qty, 0)  - COALESCE(NEW.budget_qty, 0), 4);
  NEW.rate_variation := ROUND(COALESCE(NEW.actual_bill_rate, 0) - COALESCE(NEW.budget_rate, 0), 4);

  NEW.work_status := CASE
    WHEN NEW.actual_total_cost <= 0 THEN 'Not Started'
    WHEN COALESCE(NEW.actual_bill_qty, 0) >= COALESCE(NEW.budget_qty, 0) THEN 'Completed'
    ELSE 'In Progress'
  END;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_compute_variance_item ON public.budget_variance_items;
CREATE TRIGGER trg_compute_variance_item
  BEFORE INSERT OR UPDATE ON public.budget_variance_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_variance_item();

-- Master item -> variance row upsert (baseline snapshot only; never clobbers
-- actuals that a billing engineer has already entered).
CREATE OR REPLACE FUNCTION public.fn_sync_master_item_to_variance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cat_name text;
BEGIN
  SELECT category_name INTO v_cat_name FROM public.budget_categories WHERE id = NEW.category_id;

  INSERT INTO public.budget_variance_items (
    project_id, master_budget_item_id, category_id, sr_no, sub_activity,
    category_name, unit, budget_qty, budget_rate, budget_cost, remark
  ) VALUES (
    NEW.project_id, NEW.id, NEW.category_id, NEW.sr_no, NEW.item_description,
    COALESCE(v_cat_name, NEW.category_name, 'Uncategorised'),
    COALESCE(NEW.unit, 'LS'), NEW.qty_total, NEW.estimated_rate, NEW.budgeted_cost,
    'Pending vendor bill entry'
  )
  ON CONFLICT (project_id, master_budget_item_id) DO UPDATE SET
    category_id   = EXCLUDED.category_id,
    sr_no         = EXCLUDED.sr_no,
    sub_activity  = EXCLUDED.sub_activity,
    category_name = EXCLUDED.category_name,
    unit          = EXCLUDED.unit,
    budget_qty    = EXCLUDED.budget_qty,
    budget_rate   = EXCLUDED.budget_rate,
    budget_cost   = EXCLUDED.budget_cost;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_master_to_variance ON public.master_budget_items;
CREATE TRIGGER trg_sync_master_to_variance
  AFTER INSERT OR UPDATE OF sr_no, item_description, unit, qty_total, estimated_rate, budgeted_cost, category_id
  ON public.master_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_master_item_to_variance();

-- ============================================================================
-- 7. CROSS-MODULE SYNC — PO -> committed, Bill -> spent (CORRECTED)
-- ============================================================================

-- 7a. Purchase Order approved -> commitment.
CREATE OR REPLACE FUNCTION public.fn_auto_commit_po_to_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation_id uuid;
  v_amount        numeric;
  v_category_id   uuid;
BEGIN
  IF NEW.status <> 'approved'::erp_po_status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved'::erp_po_status THEN
    RETURN NEW;  -- already handled
  END IF;

  v_amount := COALESCE(NEW.total_amount, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_allocation_id := public.fn_resolve_budget_allocation(
    NEW.project_id, NEW.budget_allocation_id, NEW.master_budget_item_id
  );
  IF v_allocation_id IS NULL THEN
    RETURN NEW;  -- unbudgeted PO: nothing to post against
  END IF;

  SELECT category_id INTO v_category_id FROM public.budget_allocations WHERE id = v_allocation_id;

  -- Idempotent: uq_budget_ledger_source_txn makes a repeat a no-op, and we only
  -- move the allocation counters when the ledger row is actually new.
  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount, description, posted_at, financial_year
  ) VALUES (
    NEW.project_id, v_allocation_id, v_category_id, 'commitment'::erp_budget_txn_type,
    'purchase_orders', NEW.id, v_amount,
    'PO approved: ' || COALESCE(NEW.po_number, NEW.id::text),
    now(), public.fn_budget_current_fy()
  )
  ON CONFLICT (source_table, source_id, transaction_type) DO NOTHING;

  IF FOUND THEN
    UPDATE public.budget_allocations
    SET committed_amount = committed_amount + v_amount,
        updated_at = now()
    WHERE id = v_allocation_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_po_budget_commitment ON public.purchase_orders;
CREATE TRIGGER trg_po_budget_commitment
  AFTER INSERT OR UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_commit_po_to_budget();

-- 7b. Vendor Bill approved/paid -> actual spend, and release the PO commitment
--     against the PO's OUTSTANDING commitment (not the bill amount).
CREATE OR REPLACE FUNCTION public.fn_auto_post_bill_to_budget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation_id uuid;
  v_category_id   uuid;
  v_net           numeric;
  v_committed     numeric;
  v_released      numeric;
  v_release_now   numeric;
BEGIN
  IF NEW.status NOT IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('approved'::erp_billing_status, 'paid'::erp_billing_status) THEN
    RETURN NEW;  -- already posted
  END IF;

  v_net := COALESCE(NULLIF(NEW.net_payable_amount, 0), NEW.total_amount, 0);
  IF v_net <= 0 THEN
    RETURN NEW;
  END IF;

  v_allocation_id := public.fn_resolve_budget_allocation(
    NEW.project_id, NEW.budget_allocation_id, NEW.master_budget_item_id
  );
  IF v_allocation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT category_id INTO v_category_id FROM public.budget_allocations WHERE id = v_allocation_id;

  INSERT INTO public.budget_ledger (
    project_id, budget_allocation_id, category_id, transaction_type,
    source_table, source_id, amount, description, posted_at, financial_year
  ) VALUES (
    NEW.project_id, v_allocation_id, v_category_id, 'actual'::erp_budget_txn_type,
    'vendor_bills', NEW.id, v_net,
    'Vendor bill verified: ' || COALESCE(NEW.bill_number, NEW.id::text),
    now(), public.fn_budget_current_fy()
  )
  ON CONFLICT (source_table, source_id, transaction_type) DO NOTHING;

  IF NOT FOUND THEN
    RETURN NEW;  -- already posted, do not double count
  END IF;

  UPDATE public.budget_allocations
  SET spent_amount   = spent_amount + v_net,
      retention_held = retention_held + COALESCE(NEW.retention_amount, 0),
      advance_amount = GREATEST(0, advance_amount - COALESCE(NEW.advance_adjusted, 0)),
      updated_at     = now()
  WHERE id = v_allocation_id;

  -- Release commitment, capped at what this PO still has outstanding.
  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_committed
    FROM public.budget_ledger
    WHERE source_table = 'purchase_orders'
      AND source_id = NEW.purchase_order_id
      AND transaction_type = 'commitment'::erp_budget_txn_type;

    SELECT COALESCE(SUM(bl.amount), 0) INTO v_released
    FROM public.budget_ledger bl
    JOIN public.vendor_bills vb ON vb.id = bl.source_id
    WHERE bl.source_table = 'vendor_bills'
      AND bl.transaction_type = 'release'::erp_budget_txn_type
      AND vb.purchase_order_id = NEW.purchase_order_id;

    v_release_now := LEAST(v_net, GREATEST(0, v_committed - v_released));

    IF v_release_now > 0 THEN
      INSERT INTO public.budget_ledger (
        project_id, budget_allocation_id, category_id, transaction_type,
        source_table, source_id, amount, description, posted_at, financial_year
      ) VALUES (
        NEW.project_id, v_allocation_id, v_category_id, 'release'::erp_budget_txn_type,
        'vendor_bills', NEW.id, v_release_now,
        'Commitment released against bill ' || COALESCE(NEW.bill_number, NEW.id::text),
        now(), public.fn_budget_current_fy()
      )
      ON CONFLICT (source_table, source_id, transaction_type) DO NOTHING;

      UPDATE public.budget_allocations
      SET committed_amount = GREATEST(0, committed_amount - v_release_now),
          updated_at = now()
      WHERE id = v_allocation_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bill_budget_actual ON public.vendor_bills;
CREATE TRIGGER trg_bill_budget_actual
  AFTER INSERT OR UPDATE OF status ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_post_bill_to_budget();

-- 7c. Keep vendor_bills.net_payable_amount arithmetically true.
CREATE OR REPLACE FUNCTION public.fn_compute_vendor_bill_net()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.retention_percent > 0 AND NEW.retention_amount = 0 THEN
    NEW.retention_amount := ROUND(COALESCE(NEW.subtotal_amount, 0) * NEW.retention_percent / 100.0, 2);
  END IF;

  NEW.net_payable_amount := GREATEST(0,
      COALESCE(NEW.total_amount, 0)
    - COALESCE(NEW.retention_amount, 0)
    - COALESCE(NEW.advance_adjusted, 0)
    - COALESCE(NEW.other_deductions, 0));

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vendor_bill_net ON public.vendor_bills;
CREATE TRIGGER trg_vendor_bill_net
  BEFORE INSERT OR UPDATE OF subtotal_amount, tax_amount, total_amount,
    retention_percent, retention_amount, advance_adjusted, other_deductions
  ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.fn_compute_vendor_bill_net();

-- ============================================================================
-- 8. PO / BILL -> VARIANCE ITEM ROLLUP
--    Nothing previously wrote budget_variance_items.po_* or actual_*, which is
--    why the Variance tab's P.O columns were permanently zero.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_rollup_variance_for_master_item(p_master_item_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po_qty     numeric := 0;
  v_po_amount  numeric := 0;
  v_bill_qty   numeric := 0;
  v_bill_amount numeric := 0;
BEGIN
  IF p_master_item_id IS NULL THEN
    RETURN;
  END IF;

  -- Committed side: approved POs mapped to this master budget line.
  SELECT COALESCE(SUM(pol.quantity), 0), COALESCE(SUM(pol.line_total), 0)
    INTO v_po_qty, v_po_amount
  FROM public.purchase_orders po
  LEFT JOIN public.purchase_order_lines pol ON pol.purchase_order_id = po.id
  WHERE po.master_budget_item_id = p_master_item_id
    AND po.deleted_at IS NULL
    AND po.status IN ('approved'::erp_po_status, 'sent_to_vendor'::erp_po_status,
                      'acknowledged'::erp_po_status, 'partially_delivered'::erp_po_status,
                      'delivered'::erp_po_status, 'closed'::erp_po_status);

  -- Actual side: verified/approved/paid bills mapped to this master budget line.
  SELECT COALESCE(SUM(vbl.quantity), 0), COALESCE(SUM(vbl.line_total), 0)
    INTO v_bill_qty, v_bill_amount
  FROM public.vendor_bills vb
  LEFT JOIN public.vendor_bill_lines vbl ON vbl.vendor_bill_id = vb.id
  WHERE vb.master_budget_item_id = p_master_item_id
    AND vb.deleted_at IS NULL
    AND vb.status IN ('verified'::erp_billing_status, 'approved'::erp_billing_status,
                      'paid'::erp_billing_status);

  UPDATE public.budget_variance_items
  SET po_qty          = v_po_qty,
      po_rate         = CASE WHEN v_po_qty > 0 THEN ROUND(v_po_amount / v_po_qty, 2) ELSE 0 END,
      po_amount       = v_po_amount,
      actual_bill_qty = v_bill_qty,
      actual_bill_rate = CASE WHEN v_bill_qty > 0 THEN ROUND(v_bill_amount / v_bill_qty, 2) ELSE 0 END,
      remark = CASE
        WHEN v_bill_amount > 0 THEN 'Auto-posted from vendor bills'
        WHEN v_po_amount > 0 THEN 'Committed via purchase order'
        ELSE remark
      END
  WHERE master_budget_item_id = p_master_item_id;
  -- actual_total_cost / variances are recomputed by trg_compute_variance_item.
END $$;

CREATE OR REPLACE FUNCTION public.trg_fn_rollup_variance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_item uuid;
  v_old_item uuid;
BEGIN
  IF TG_OP <> 'DELETE' THEN v_new_item := NEW.master_budget_item_id; END IF;
  IF TG_OP <> 'INSERT' THEN v_old_item := OLD.master_budget_item_id; END IF;

  IF v_new_item IS NOT NULL THEN
    PERFORM public.fn_rollup_variance_for_master_item(v_new_item);
  END IF;
  IF v_old_item IS NOT NULL AND v_old_item IS DISTINCT FROM v_new_item THEN
    PERFORM public.fn_rollup_variance_for_master_item(v_old_item);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_po_variance_rollup ON public.purchase_orders;
CREATE TRIGGER trg_po_variance_rollup
  AFTER INSERT OR UPDATE OF status, master_budget_item_id, total_amount OR DELETE
  ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rollup_variance();

DROP TRIGGER IF EXISTS trg_bill_variance_rollup ON public.vendor_bills;
CREATE TRIGGER trg_bill_variance_rollup
  AFTER INSERT OR UPDATE OF status, master_budget_item_id, total_amount OR DELETE
  ON public.vendor_bills
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_rollup_variance();

-- ============================================================================
-- 9. BUDGET ALERTS — threshold detection with dedup + auto-resolve
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_budget_overrun_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_util      numeric;
  v_cfg       public.budget_config;
  v_type      text;
  v_severity  text;
  v_threshold numeric;
BEGIN
  IF COALESCE(NEW.allocated_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_util := ((COALESCE(NEW.spent_amount, 0) + COALESCE(NEW.committed_amount, 0))
             / NEW.allocated_amount) * 100;

  SELECT * INTO v_cfg FROM public.budget_config WHERE project_id = NEW.project_id;

  IF v_util >= COALESCE(v_cfg.hard_limit_percent, NEW.hard_limit_percent, 100) THEN
    v_type := 'HARD_LIMIT_EXCEEDED';   v_severity := 'overrun';
    v_threshold := COALESCE(v_cfg.hard_limit_percent, NEW.hard_limit_percent, 100);
  ELSIF v_util >= COALESCE(v_cfg.critical_threshold_percent, 90) THEN
    v_type := 'CRITICAL_THRESHOLD_REACHED'; v_severity := 'critical';
    v_threshold := COALESCE(v_cfg.critical_threshold_percent, 90);
  ELSIF v_util >= COALESCE(v_cfg.warning_threshold_percent, NEW.warning_threshold_percent, 75) THEN
    v_type := 'WARNING_THRESHOLD_REACHED'; v_severity := 'warning';
    v_threshold := COALESCE(v_cfg.warning_threshold_percent, NEW.warning_threshold_percent, 75);
  ELSIF v_util >= COALESCE(v_cfg.caution_threshold_percent, 50) THEN
    v_type := 'CAUTION_THRESHOLD_REACHED'; v_severity := 'info';
    v_threshold := COALESCE(v_cfg.caution_threshold_percent, 50);
  ELSE
    -- Back under every threshold: close any open alerts for this allocation.
    UPDATE public.budget_alerts
    SET status = 'closed'::erp_workflow_status, resolved_at = now()
    WHERE budget_allocation_id = NEW.id AND status = 'pending'::erp_workflow_status;
    RETURN NEW;
  END IF;

  -- Close open alerts of a DIFFERENT tier so only the current tier stays open.
  UPDATE public.budget_alerts
  SET status = 'closed'::erp_workflow_status, resolved_at = now()
  WHERE budget_allocation_id = NEW.id
    AND status = 'pending'::erp_workflow_status
    AND alert_type <> v_type;

  -- uq_budget_alerts_open_per_type makes this a no-op if one is already open.
  INSERT INTO public.budget_alerts (
    project_id, budget_allocation_id, alert_type, severity,
    threshold_percent, actual_percent, message, status
  ) VALUES (
    NEW.project_id, NEW.id, v_type, v_severity,
    v_threshold, ROUND(v_util, 2),
    format('%s: allocation "%s" is at %s%% utilisation (threshold %s%%).',
           replace(v_type, '_', ' '), NEW.allocation_name, ROUND(v_util, 2), v_threshold),
    'pending'::erp_workflow_status
  )
  ON CONFLICT (budget_allocation_id, alert_type) WHERE status = 'pending' DO UPDATE
    SET actual_percent = EXCLUDED.actual_percent,
        message        = EXCLUDED.message,
        updated_at     = now();

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_budget_overrun_alert ON public.budget_allocations;
CREATE TRIGGER trg_budget_overrun_alert
  AFTER INSERT OR UPDATE OF allocated_amount, committed_amount, spent_amount
  ON public.budget_allocations
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_budget_overrun_alert();

-- ============================================================================
-- 10. PROJECT-WISE BILL-WISE LEDGER VIEW
--     One row per vendor bill line (bills with no lines still appear once),
--     carrying every column the Bill-Wise Ledger tab renders — from real data.
-- ============================================================================

DROP VIEW IF EXISTS public.budget_bill_ledger_view CASCADE;
CREATE VIEW public.budget_bill_ledger_view AS
WITH bill_payments AS (
  SELECT vendor_bill_id,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'::erp_payment_status), 0) AS paid_amount,
         COUNT(*) FILTER (WHERE status = 'paid'::erp_payment_status)                 AS paid_count
  FROM public.payments
  GROUP BY vendor_bill_id
),
lines AS (
  SELECT
    vb.id                                            AS bill_id,
    vb.project_id,
    vb.bill_number,
    vb.bill_book_number,
    vb.bill_date,
    vb.created_at                                    AS accounting_date,
    vb.status                                        AS bill_status,
    vb.payment_status,
    vb.subtotal_amount,
    vb.tax_amount,
    vb.total_amount,
    vb.retention_percent,
    vb.retention_amount,
    vb.advance_adjusted,
    vb.other_deductions,
    vb.net_payable_amount,
    vb.match_status,
    vb.match_remarks,
    vb.ledger_remarks,
    vb.purchase_order_id,
    vb.grn_id,
    vb.master_budget_item_id,
    vb.budget_allocation_id,
    vb.vendor_id,
    vbl.id                                           AS line_id,
    vbl.description                                  AS line_description,
    vbl.unit                                         AS line_unit,
    vbl.quantity                                     AS line_quantity,
    vbl.rate                                         AS line_rate,
    vbl.tax_rate                                     AS line_tax_rate,
    vbl.line_total                                   AS line_total,
    vbl.purchase_order_line_id,
    vbl.item_id
  FROM public.vendor_bills vb
  LEFT JOIN public.vendor_bill_lines vbl ON vbl.vendor_bill_id = vb.id
  WHERE vb.deleted_at IS NULL
)
SELECT
  COALESCE(l.line_id, l.bill_id)                                     AS id,
  l.bill_id,
  l.line_id,
  l.project_id,
  p.name                                                             AS project_name,
  p.code                                                             AS project_code,

  -- Budget head identity
  COALESCE(bc.category_name, ba.allocation_name, 'Unallocated')       AS head_activity,
  COALESCE(mbi.item_description, l.line_description, 'Unmapped')     AS sub_activity_ledger,
  COALESCE(bh.code, cc.code, bc.category_code, 'UNMAPPED')           AS cost_code,
  bc.id                                                              AS category_id,
  l.master_budget_item_id,
  l.budget_allocation_id,

  -- Supplier + bill audit
  COALESCE(v.display_name, v.legal_name, 'Unknown vendor')           AS supplier_name,
  v.id                                                               AS vendor_id,
  v.gst_number                                                       AS supplier_gst,
  l.accounting_date,
  l.bill_date                                                        AS bill_date_of_supplier,
  l.bill_number                                                      AS bill_no,
  COALESCE(l.bill_book_number, l.bill_number)                        AS bill_no_of_supplier,
  COALESCE(l.ledger_remarks, l.match_remarks, '')                    AS remarks,

  -- Billed line item + taxes
  COALESCE(im.name, 'General')                                       AS item_group,
  COALESCE(l.line_description, mbi.item_description, 'Bill total')   AS item_desc,
  COALESCE(l.line_unit, mbi.unit, 'LS')                              AS unit,
  COALESCE(l.line_quantity, 0)                                       AS received_qty,
  COALESCE(l.line_rate, 0)                                           AS final_bill_rate,
  COALESCE(l.line_total, l.subtotal_amount, 0)                       AS bill_item_amt,
  COALESCE(l.line_tax_rate, 0)                                       AS gst_rate,
  COALESCE(l.retention_percent, 0)                                   AS retention_percent,
  COALESCE(l.retention_amount, 0)                                    AS retention_deduction,
  COALESCE(l.total_amount, 0)                                        AS gross_bill_amount,
  COALESCE(l.net_payable_amount, 0)                                  AS final_bill_amount,

  -- Payment settlement
  COALESCE(l.advance_adjusted, 0)                                    AS advance_payment,
  GREATEST(0, COALESCE(l.net_payable_amount, 0) - COALESCE(bp.paid_amount, 0)) AS expected_payment,
  COALESCE(bp.paid_amount, 0)                                        AS jv_payment,
  l.bill_status,
  l.payment_status,
  l.match_status,

  -- PO / PR traceability
  COALESCE(po.po_number, '')                                         AS po_wo_no,
  COALESCE(pol.unit_rate, 0)                                         AS po_wo_rate,
  COALESCE(po.payment_terms, '')                                     AS note_on_po,
  COALESCE(pr.pr_number, '')                                         AS pr_no,
  COALESCE(grn.grn_number, '')                                       AS grn_no,

  -- Running available budget for this category, in bill-date order
  COALESCE(ba.allocated_amount, 0) - SUM(COALESCE(l.net_payable_amount, 0)) OVER (
    PARTITION BY l.project_id, COALESCE(ba.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY l.bill_date NULLS LAST, l.bill_id, COALESCE(l.line_id, l.bill_id)
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )                                                                  AS running_available_budget,
  COALESCE(ba.allocated_amount, 0)                                   AS category_allocated_amount

FROM lines l
JOIN      public.projects              p    ON p.id   = l.project_id
LEFT JOIN public.vendors               v    ON v.id   = l.vendor_id
LEFT JOIN public.master_budget_items   mbi  ON mbi.id = l.master_budget_item_id
LEFT JOIN public.budget_categories     bc   ON bc.id  = mbi.category_id
LEFT JOIN public.budget_allocations    ba   ON ba.id  = COALESCE(
            l.budget_allocation_id,
            (SELECT id FROM public.budget_allocations
             WHERE project_id = l.project_id AND category_id = mbi.category_id AND deleted_at IS NULL LIMIT 1))
LEFT JOIN public.budget_heads          bh   ON bh.id  = ba.budget_head_id
LEFT JOIN public.cost_codes            cc   ON cc.id  = bh.cost_code_id
LEFT JOIN public.purchase_orders       po   ON po.id  = l.purchase_order_id
LEFT JOIN public.purchase_order_lines  pol  ON pol.id = l.purchase_order_line_id
LEFT JOIN public.purchase_requisitions pr   ON pr.id  = po.purchase_requisition_id
LEFT JOIN public.goods_receipt_notes   grn  ON grn.id = l.grn_id
LEFT JOIN public.item_master           im   ON im.id  = l.item_id
LEFT JOIN bill_payments                bp   ON bp.vendor_bill_id = l.bill_id;

COMMENT ON VIEW public.budget_bill_ledger_view IS
  'Project-wise bill-wise construction ledger. One row per vendor bill line '
  '(header-only row when a bill has no lines). Filter by project_id.';

-- ============================================================================
-- 11. PORTFOLIO SUMMARY — include the Master Budget baseline
--     The old view read only budget_allocations, so with 0 allocations every
--     executive KPI rendered as zero even though a 191-line baseline existed.
-- ============================================================================

DROP VIEW IF EXISTS public.portfolio_budget_summary CASCADE;
CREATE VIEW public.portfolio_budget_summary AS
SELECT
  p.id                                                   AS project_id,
  p.code                                                 AS project_code,
  p.name                                                 AS project_name,
  COALESCE(mb.baseline_amount, 0)                        AS baseline_amount,
  COALESCE(NULLIF(alloc.allocated_amount, 0), mb.baseline_amount, 0) AS allocated_amount,
  COALESCE(alloc.committed_amount, 0)                    AS committed_amount,
  COALESCE(alloc.spent_amount, 0)                        AS spent_amount,
  COALESCE(alloc.retention_held, 0)                      AS retention_held,
  COALESCE(alloc.advance_amount, 0)                      AS advance_amount,
  COALESCE(NULLIF(alloc.allocated_amount, 0), mb.baseline_amount, 0)
    - COALESCE(alloc.committed_amount, 0)
    - COALESCE(alloc.spent_amount, 0)                    AS remaining_amount,
  CASE
    WHEN COALESCE(NULLIF(alloc.allocated_amount, 0), mb.baseline_amount, 0) > 0
    THEN ROUND(((COALESCE(alloc.committed_amount, 0) + COALESCE(alloc.spent_amount, 0))
                / COALESCE(NULLIF(alloc.allocated_amount, 0), mb.baseline_amount)) * 100, 2)
    ELSE 0
  END                                                    AS utilization_percent,
  GREATEST(0,
    COALESCE(alloc.committed_amount, 0) + COALESCE(alloc.spent_amount, 0)
    - COALESCE(NULLIF(alloc.allocated_amount, 0), mb.baseline_amount, 0)
  )                                                      AS overrun_amount,
  COALESCE(mb.line_item_count, 0)                        AS line_item_count,
  COALESCE(cat.category_count, 0)                        AS category_count,
  COALESCE(p.bua_sqft, 0)                                AS bua_sqft,
  COALESCE(alert.open_alert_count, 0)                    AS open_alert_count
FROM public.projects p
LEFT JOIN (
  SELECT project_id,
         SUM(budgeted_cost) AS baseline_amount,
         COUNT(*)           AS line_item_count
  FROM public.master_budget_items
  WHERE is_active AND deleted_at IS NULL
  GROUP BY project_id
) mb ON mb.project_id = p.id
LEFT JOIN (
  SELECT project_id,
         SUM(allocated_amount) AS allocated_amount,
         SUM(committed_amount) AS committed_amount,
         SUM(spent_amount)     AS spent_amount,
         SUM(retention_held)   AS retention_held,
         SUM(advance_amount)   AS advance_amount
  FROM public.budget_allocations
  WHERE deleted_at IS NULL
  GROUP BY project_id
) alloc ON alloc.project_id = p.id
LEFT JOIN (
  SELECT project_id, COUNT(*) AS category_count
  FROM public.budget_categories
  WHERE is_active AND deleted_at IS NULL
  GROUP BY project_id
) cat ON cat.project_id = p.id
LEFT JOIN (
  SELECT project_id, COUNT(*) AS open_alert_count
  FROM public.budget_alerts
  WHERE status = 'pending'::erp_workflow_status
  GROUP BY project_id
) alert ON alert.project_id = p.id
WHERE p.deleted_at IS NULL;

-- Monthly cash-flow curve, replacing the hardcoded 12-month S-curve.
DROP VIEW IF EXISTS public.budget_monthly_cashflow_view CASCADE;
CREATE VIEW public.budget_monthly_cashflow_view AS
SELECT
  bl.project_id,
  date_trunc('month', bl.posted_at)::date                     AS month_start,
  SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'actual'::erp_budget_txn_type)     AS actual_amount,
  SUM(bl.amount) FILTER (WHERE bl.transaction_type = 'commitment'::erp_budget_txn_type) AS committed_amount,
  COUNT(*) FILTER (WHERE bl.transaction_type = 'actual'::erp_budget_txn_type)           AS actual_txn_count
FROM public.budget_ledger bl
GROUP BY bl.project_id, date_trunc('month', bl.posted_at);

-- ============================================================================
-- 12. ROW LEVEL SECURITY
--     Before this migration the browser-shipped anon key had full
--     SELECT / UPDATE / DELETE on every budget table.
-- ============================================================================

DO $$
DECLARE
  t text;
  budget_tables text[] := ARRAY[
    'budget_categories', 'master_budget_items', 'budget_variance_items',
    'budget_revisions', 'budget_revision_items', 'budget_allocations',
    'budget_ledger', 'budget_alerts', 'budget_config'
  ];
BEGIN
  FOREACH t IN ARRAY budget_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Deliberately NOT "FORCE ROW LEVEL SECURITY": the table owner must keep
    -- bypassing RLS so the SECURITY DEFINER cross-module triggers in section 7
    -- can still post to budget_ledger / budget_allocations.

    -- Anonymous users get nothing.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || '_select', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
      t || '_insert', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
      t || '_update', t);
  END LOOP;
END $$;

-- DELETE is intentionally NOT granted by policy on financial history.
-- Master budget lines are retired with is_active = false / deleted_at.
-- Categories may be deleted only while they carry no line items.
DROP POLICY IF EXISTS budget_categories_delete ON public.budget_categories;
CREATE POLICY budget_categories_delete
  ON public.budget_categories FOR DELETE TO authenticated
  USING (NOT EXISTS (
    SELECT 1 FROM public.master_budget_items m
    WHERE m.category_id = budget_categories.id AND m.deleted_at IS NULL
  ));

DROP POLICY IF EXISTS master_budget_items_delete ON public.master_budget_items;
CREATE POLICY master_budget_items_delete
  ON public.master_budget_items FOR DELETE TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.master_budget_item_id = master_budget_items.id)
    AND NOT EXISTS (SELECT 1 FROM public.vendor_bills vb WHERE vb.master_budget_item_id = master_budget_items.id)
  );

-- Views inherit RLS from their base tables; expose them to authenticated only.
REVOKE ALL ON public.portfolio_budget_summary      FROM anon;
REVOKE ALL ON public.budget_bill_ledger_view       FROM anon;
REVOKE ALL ON public.budget_monthly_cashflow_view  FROM anon;
GRANT SELECT ON public.portfolio_budget_summary     TO authenticated;
GRANT SELECT ON public.budget_bill_ledger_view      TO authenticated;
GRANT SELECT ON public.budget_monthly_cashflow_view TO authenticated;

ALTER VIEW public.portfolio_budget_summary      SET (security_invoker = true);
ALTER VIEW public.budget_bill_ledger_view       SET (security_invoker = true);
ALTER VIEW public.budget_monthly_cashflow_view  SET (security_invoker = true);

-- ============================================================================
-- 12b. REALTIME PUBLICATION
--      The Budget module subscribes to postgres_changes on these tables. Without
--      membership of supabase_realtime the subscription connects successfully but
--      never delivers an event, so "real-time cross-module sync" silently did
--      nothing. Realtime still honours RLS, so only authenticated clients receive
--      rows they are allowed to read.
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'Publication supabase_realtime not found; skipping realtime registration.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['budget_categories', 'master_budget_items', 'budget_variance_items',
                           'budget_allocations', 'budget_ledger', 'budget_alerts',
                           'budget_revisions', 'vendor_bills'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 13. updated_at MAINTENANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_categories', 'master_budget_items',
                           'budget_allocations', 'budget_config'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_touch_' || t, t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at()',
      'trg_touch_' || t, t);
  END LOOP;
END $$;

-- ============================================================================
-- 14. BACKFILL — build the allocation + ledger state from existing documents
-- ============================================================================

-- 14a. One allocation per existing budget category (24 for Central Park).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.budget_categories WHERE COALESCE(is_active, true) LOOP
    PERFORM public.fn_sync_category_to_allocation(r.id);
  END LOOP;
END $$;

-- 14b. Ensure every active master budget line has a variance row.
INSERT INTO public.budget_variance_items (
  project_id, master_budget_item_id, category_id, sr_no, sub_activity,
  category_name, unit, budget_qty, budget_rate, budget_cost, remark
)
SELECT mbi.project_id, mbi.id, mbi.category_id, mbi.sr_no, mbi.item_description,
       COALESCE(bc.category_name, mbi.category_name, 'Uncategorised'),
       COALESCE(mbi.unit, 'LS'), mbi.qty_total, mbi.estimated_rate, mbi.budgeted_cost,
       'Pending vendor bill entry'
FROM public.master_budget_items mbi
LEFT JOIN public.budget_categories bc ON bc.id = mbi.category_id
WHERE mbi.is_active AND mbi.deleted_at IS NULL
ON CONFLICT (project_id, master_budget_item_id) DO UPDATE SET
  category_id   = EXCLUDED.category_id,
  category_name = EXCLUDED.category_name,
  budget_qty    = EXCLUDED.budget_qty,
  budget_rate   = EXCLUDED.budget_rate,
  budget_cost   = EXCLUDED.budget_cost;

-- 14c. Post commitments for POs that were already approved before this fix.
DO $$
DECLARE
  r record;
  v_alloc uuid;
  v_cat   uuid;
BEGIN
  FOR r IN
    SELECT * FROM public.purchase_orders
    WHERE deleted_at IS NULL
      AND status IN ('approved'::erp_po_status, 'sent_to_vendor'::erp_po_status,
                     'acknowledged'::erp_po_status, 'partially_delivered'::erp_po_status,
                     'delivered'::erp_po_status, 'closed'::erp_po_status)
      AND COALESCE(total_amount, 0) > 0
  LOOP
    v_alloc := public.fn_resolve_budget_allocation(r.project_id, r.budget_allocation_id, r.master_budget_item_id);
    CONTINUE WHEN v_alloc IS NULL;

    SELECT category_id INTO v_cat FROM public.budget_allocations WHERE id = v_alloc;

    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, description, posted_at, financial_year
    ) VALUES (
      r.project_id, v_alloc, v_cat, 'commitment'::erp_budget_txn_type,
      'purchase_orders', r.id, r.total_amount,
      'Backfilled PO commitment: ' || COALESCE(r.po_number, r.id::text),
      COALESCE(r.approved_at, r.po_date::timestamptz, r.created_at), public.fn_budget_current_fy()
    )
    ON CONFLICT (source_table, source_id, transaction_type) DO NOTHING;
  END LOOP;
END $$;

-- 14d. Post actuals for bills that were already approved/paid.
DO $$
DECLARE
  r record;
  v_alloc uuid;
  v_cat   uuid;
  v_net   numeric;
BEGIN
  FOR r IN
    SELECT * FROM public.vendor_bills
    WHERE deleted_at IS NULL
      AND status IN ('approved'::erp_billing_status, 'paid'::erp_billing_status)
  LOOP
    v_net := COALESCE(NULLIF(r.net_payable_amount, 0), r.total_amount, 0);
    CONTINUE WHEN v_net <= 0;

    v_alloc := public.fn_resolve_budget_allocation(r.project_id, r.budget_allocation_id, r.master_budget_item_id);
    CONTINUE WHEN v_alloc IS NULL;

    SELECT category_id INTO v_cat FROM public.budget_allocations WHERE id = v_alloc;

    INSERT INTO public.budget_ledger (
      project_id, budget_allocation_id, category_id, transaction_type,
      source_table, source_id, amount, description, posted_at, financial_year
    ) VALUES (
      r.project_id, v_alloc, v_cat, 'actual'::erp_budget_txn_type,
      'vendor_bills', r.id, v_net,
      'Backfilled bill actual: ' || COALESCE(r.bill_number, r.id::text),
      COALESCE(r.approved_at, r.bill_date::timestamptz, r.created_at), public.fn_budget_current_fy()
    )
    ON CONFLICT (source_table, source_id, transaction_type) DO NOTHING;
  END LOOP;
END $$;

-- 14e. Recompute allocation counters from the ledger (single source of truth).
--      This also repairs any drift from earlier partial/incorrect posting.
UPDATE public.budget_allocations ba
SET committed_amount = GREATEST(0, COALESCE(led.committed_total, 0) - COALESCE(led.released_total, 0)),
    spent_amount     = COALESCE(led.actual_total, 0),
    retention_held   = COALESCE(ret.retention, 0),
    updated_at       = now()
FROM (
  SELECT budget_allocation_id,
         SUM(amount) FILTER (WHERE transaction_type = 'commitment'::erp_budget_txn_type) AS committed_total,
         SUM(amount) FILTER (WHERE transaction_type = 'release'::erp_budget_txn_type)    AS released_total,
         SUM(amount) FILTER (WHERE transaction_type = 'actual'::erp_budget_txn_type)     AS actual_total
  FROM public.budget_ledger
  GROUP BY budget_allocation_id
) led
LEFT JOIN (
  SELECT bl.budget_allocation_id, SUM(vb.retention_amount) AS retention
  FROM public.budget_ledger bl
  JOIN public.vendor_bills vb ON vb.id = bl.source_id
  WHERE bl.source_table = 'vendor_bills'
    AND bl.transaction_type = 'actual'::erp_budget_txn_type
  GROUP BY bl.budget_allocation_id
) ret ON ret.budget_allocation_id = led.budget_allocation_id
WHERE ba.id = led.budget_allocation_id;

-- 14f. Roll PO / bill quantities into the variance sheet.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT master_budget_item_id FROM (
      SELECT master_budget_item_id FROM public.purchase_orders WHERE master_budget_item_id IS NOT NULL
      UNION
      SELECT master_budget_item_id FROM public.vendor_bills   WHERE master_budget_item_id IS NOT NULL
    ) s
  LOOP
    PERFORM public.fn_rollup_variance_for_master_item(r.master_budget_item_id);
  END LOOP;
END $$;

-- 14g. Force the variance compute trigger over every row so the stored
--      variance columns stop being stale zeros.
UPDATE public.budget_variance_items SET updated_at = now();

-- 14h. Keep projects.actual_spend_amount honest (dashboards read it).
UPDATE public.projects p
SET actual_spend_amount = COALESCE(s.spent_amount, 0)
FROM public.portfolio_budget_summary s
WHERE s.project_id = p.id
  AND p.actual_spend_amount IS DISTINCT FROM COALESCE(s.spent_amount, 0);

-- ============================================================================
-- 15. ATOMIC WRITE RPCs
--     The UI previously looped individual UPDATEs from the browser with no
--     transaction, so a partial failure left the budget half-saved and the
--     revision log empty. Each RPC below is one transaction.
-- ============================================================================

-- 15a. Guard: refuse writes when the project's budget is locked.
CREATE OR REPLACE FUNCTION public.fn_assert_budget_unlocked(p_project_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_locked boolean;
BEGIN
  SELECT budget_lock_enabled INTO v_locked
  FROM public.budget_config WHERE project_id = p_project_id;

  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'Budget is locked for this project. Disable the lock in Budget > Config before editing.'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- 15b. Save a Master Budget change order: bump versions, write the audit trail,
--      update the line items, and let the triggers cascade to allocations and
--      the variance sheet. Returns the created revision.
--
--      p_items: [{ "id": uuid, "qty_rcc": n|null, "qty_finishes": n|null,
--                  "qty_infra": n|null, "qty_total": n, "estimated_rate": n }]
CREATE OR REPLACE FUNCTION public.rpc_save_master_budget_revision(
  p_project_id     uuid,
  p_justification  text,
  p_edited_by_name text,
  p_items          jsonb
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item        jsonb;
  v_old         public.master_budget_items;
  v_new_qty     numeric;
  v_new_rate    numeric;
  v_new_cost    numeric;
  v_bua         numeric;
  v_old_total   numeric;
  v_new_total   numeric;
  v_version     integer;
  v_revision    public.budget_revisions;
  v_changed     integer := 0;
BEGIN
  IF p_justification IS NULL OR btrim(p_justification) = '' THEN
    RAISE EXCEPTION 'A change-order justification is mandatory.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No budget line items supplied.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_assert_budget_unlocked(p_project_id);

  SELECT COALESCE(bua_sqft, 0) INTO v_bua FROM public.projects WHERE id = p_project_id;

  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_old_total
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM public.budget_revisions
  WHERE project_id = p_project_id AND scope = 'master_budget';

  INSERT INTO public.budget_revisions (
    project_id, version_number, version_label, justification_reason,
    old_total_cost, new_total_cost, net_diff_amount,
    edited_by_name, status, scope, approved_at
  ) VALUES (
    p_project_id, v_version, format('Version v%s (Change Order)', v_version),
    btrim(p_justification), v_old_total, v_old_total, 0,
    COALESCE(NULLIF(btrim(p_edited_by_name), ''), 'Pramukh ERP User'),
    'approved', 'master_budget', now()
  )
  RETURNING * INTO v_revision;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_old FROM public.master_budget_items
    WHERE id = (v_item->>'id')::uuid AND project_id = p_project_id;
    CONTINUE WHEN v_old.id IS NULL;

    v_new_rate := COALESCE((v_item->>'estimated_rate')::numeric, v_old.estimated_rate);
    v_new_qty  := COALESCE(
      NULLIF(COALESCE((v_item->>'qty_rcc')::numeric, 0)
           + COALESCE((v_item->>'qty_finishes')::numeric, 0)
           + COALESCE((v_item->>'qty_infra')::numeric, 0), 0),
      (v_item->>'qty_total')::numeric,
      v_old.qty_total,
      1);

    IF v_new_rate < 0 OR v_new_qty < 0 THEN
      RAISE EXCEPTION 'Negative quantity or rate rejected for "%".', v_old.item_description
        USING ERRCODE = 'check_violation';
    END IF;

    v_new_cost := ROUND(v_new_qty * v_new_rate, 2);

    CONTINUE WHEN v_new_cost = v_old.budgeted_cost
              AND v_new_rate = v_old.estimated_rate
              AND v_new_qty  = v_old.qty_total;

    INSERT INTO public.budget_revision_items (
      revision_id, master_budget_item_id, sub_activity, category_name,
      old_qty, new_qty, old_rate, new_rate, old_cost, new_cost
    ) VALUES (
      v_revision.id, v_old.id, v_old.item_description,
      COALESCE(v_old.category_name, 'Uncategorised'),
      v_old.qty_total, v_new_qty, v_old.estimated_rate, v_new_rate,
      v_old.budgeted_cost, v_new_cost
    );

    UPDATE public.master_budget_items
    SET qty_rcc        = NULLIF((v_item->>'qty_rcc')::numeric, 0),
        qty_finishes   = NULLIF((v_item->>'qty_finishes')::numeric, 0),
        qty_infra      = NULLIF((v_item->>'qty_infra')::numeric, 0),
        qty_total      = v_new_qty,
        estimated_rate = v_new_rate,
        budgeted_cost  = v_new_cost,
        cost_per_bua   = CASE WHEN v_bua > 0 THEN ROUND(v_new_cost / v_bua, 2) ELSE 0 END,
        version_number = v_version,
        updated_at     = now()
    WHERE id = v_old.id;

    v_changed := v_changed + 1;
  END LOOP;

  IF v_changed = 0 THEN
    RAISE EXCEPTION 'No budget line items actually changed.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_new_total
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;

  UPDATE public.budget_revisions
  SET new_total_cost  = v_new_total,
      net_diff_amount = v_new_total - v_old_total
  WHERE id = v_revision.id
  RETURNING * INTO v_revision;

  UPDATE public.projects SET budget_amount = v_new_total WHERE id = p_project_id;

  RETURN v_revision;
END $$;

-- 15c. Save Variance reconciliation actuals + audit trail in one transaction.
--      p_items: [{ "id": uuid (variance item id), "actual_bill_qty": n,
--                  "actual_bill_rate": n, "remark": text }]
CREATE OR REPLACE FUNCTION public.rpc_save_variance_reconciliation(
  p_project_id     uuid,
  p_justification  text,
  p_edited_by_name text,
  p_items          jsonb
)
RETURNS public.budget_revisions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item     jsonb;
  v_old      public.budget_variance_items;
  v_qty      numeric;
  v_rate     numeric;
  v_cost     numeric;
  v_version  integer;
  v_revision public.budget_revisions;
  v_changed  integer := 0;
  v_net      numeric := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No variance rows supplied.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_assert_budget_unlocked(p_project_id);

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM public.budget_revisions
  WHERE project_id = p_project_id AND scope = 'variance_reconciliation';

  INSERT INTO public.budget_revisions (
    project_id, version_number, version_label, justification_reason,
    old_total_cost, new_total_cost, net_diff_amount,
    edited_by_name, status, scope, approved_at
  ) VALUES (
    p_project_id, v_version, format('Recon Revision v%s', v_version),
    COALESCE(NULLIF(btrim(p_justification), ''), 'Variance reconciliation update'),
    0, 0, 0,
    COALESCE(NULLIF(btrim(p_edited_by_name), ''), 'Pramukh ERP User'),
    'approved', 'variance_reconciliation', now()
  )
  RETURNING * INTO v_revision;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_old FROM public.budget_variance_items
    WHERE id = (v_item->>'id')::uuid AND project_id = p_project_id;
    CONTINUE WHEN v_old.id IS NULL;

    v_qty  := COALESCE((v_item->>'actual_bill_qty')::numeric,  v_old.actual_bill_qty);
    v_rate := COALESCE((v_item->>'actual_bill_rate')::numeric, v_old.actual_bill_rate);

    IF v_qty < 0 OR v_rate < 0 THEN
      RAISE EXCEPTION 'Negative billed quantity or rate rejected for "%".', v_old.sub_activity
        USING ERRCODE = 'check_violation';
    END IF;

    v_cost := ROUND(v_qty * v_rate, 2);

    CONTINUE WHEN v_qty = v_old.actual_bill_qty
              AND v_rate = v_old.actual_bill_rate
              AND COALESCE(v_item->>'remark', '') = COALESCE(v_old.remark, '');

    INSERT INTO public.budget_revision_items (
      revision_id, master_budget_item_id, sub_activity, category_name,
      old_qty, new_qty, old_rate, new_rate, old_cost, new_cost
    ) VALUES (
      v_revision.id, v_old.master_budget_item_id, v_old.sub_activity,
      COALESCE(v_old.category_name, 'Uncategorised'),
      v_old.actual_bill_qty, v_qty, v_old.actual_bill_rate, v_rate,
      v_old.actual_total_cost, v_cost
    );

    UPDATE public.budget_variance_items
    SET actual_bill_qty  = v_qty,
        actual_bill_rate = v_rate,
        remark           = COALESCE(NULLIF(btrim(COALESCE(v_item->>'remark', '')), ''), remark)
    WHERE id = v_old.id;

    v_net := v_net + (v_cost - v_old.actual_total_cost);
    v_changed := v_changed + 1;
  END LOOP;

  IF v_changed = 0 THEN
    RAISE EXCEPTION 'No variance rows actually changed.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.budget_revisions
  SET net_diff_amount = v_net,
      justification_reason = justification_reason
        || format(' (%s row(s), net impact %s)', v_changed, ROUND(v_net, 2))
  WHERE id = v_revision.id
  RETURNING * INTO v_revision;

  RETURN v_revision;
END $$;

-- 15d. Excel import: upsert categories + line items, log the revision, and
--      optionally retire lines the sheet no longer contains.
--      p_items: [{ "category_name": text, "category_code": text, "sr_no": text,
--                  "item_description": text, "qty_rcc": n|null,
--                  "qty_finishes": n|null, "qty_infra": n|null, "qty_total": n,
--                  "unit": text, "estimated_rate": n, "budgeted_cost": n,
--                  "scope_tag": text, "item_type": text }]
--      p_archive_missing: retire active lines absent from the sheet.
CREATE OR REPLACE FUNCTION public.rpc_import_master_budget(
  p_project_id      uuid,
  p_justification   text,
  p_edited_by_name  text,
  p_items           jsonb,
  p_archive_missing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item       jsonb;
  v_cat_id     uuid;
  v_bua        numeric;
  v_old_total  numeric;
  v_new_total  numeric;
  v_version    integer;
  v_revision   uuid;
  v_inserted   integer := 0;
  v_updated    integer := 0;
  v_archived   integer := 0;
  v_cost       numeric;
  v_qty        numeric;
  v_existing   uuid;
  v_seen       uuid[] := ARRAY[]::uuid[];
  v_sort       integer := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'The uploaded sheet produced no budget line items.' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.fn_assert_budget_unlocked(p_project_id);

  SELECT COALESCE(bua_sqft, 0) INTO v_bua FROM public.projects WHERE id = p_project_id;
  IF v_bua IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_old_total
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version
  FROM public.budget_revisions
  WHERE project_id = p_project_id AND scope = 'excel_import';

  INSERT INTO public.budget_revisions (
    project_id, version_number, version_label, justification_reason,
    old_total_cost, new_total_cost, net_diff_amount,
    edited_by_name, status, scope, approved_at
  ) VALUES (
    p_project_id, v_version, format('Excel Import v%s', v_version),
    COALESCE(NULLIF(btrim(p_justification), ''), 'Master budget schedule imported from Excel'),
    v_old_total, v_old_total, 0,
    COALESCE(NULLIF(btrim(p_edited_by_name), ''), 'Pramukh ERP User'),
    'approved', 'excel_import', now()
  )
  RETURNING id INTO v_revision;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    CONTINUE WHEN COALESCE(btrim(v_item->>'item_description'), '') = '';
    v_sort := v_sort + 1;

    INSERT INTO public.budget_categories (project_id, category_name, category_code, sort_order)
    VALUES (p_project_id,
            COALESCE(NULLIF(btrim(v_item->>'category_name'), ''), 'Uncategorised'),
            NULLIF(btrim(COALESCE(v_item->>'category_code', '')), ''),
            v_sort)
    ON CONFLICT (project_id, category_name) DO UPDATE
      SET category_code = COALESCE(EXCLUDED.category_code, budget_categories.category_code)
    RETURNING id INTO v_cat_id;

    v_qty  := GREATEST(COALESCE((v_item->>'qty_total')::numeric, 1), 0);
    v_cost := COALESCE((v_item->>'budgeted_cost')::numeric,
                       ROUND(v_qty * COALESCE((v_item->>'estimated_rate')::numeric, 0), 2));

    SELECT id INTO v_existing FROM public.master_budget_items
    WHERE project_id = p_project_id AND category_id = v_cat_id
      AND lower(btrim(item_description)) = lower(btrim(v_item->>'item_description'))
      AND deleted_at IS NULL;

    IF v_existing IS NULL THEN
      INSERT INTO public.master_budget_items (
        project_id, category_id, category_name, sr_no, item_description,
        qty_rcc, qty_finishes, qty_infra, qty_total, unit,
        estimated_rate, budgeted_cost, cost_per_bua,
        scope_tag, item_type, sort_order, version_number
      ) VALUES (
        p_project_id, v_cat_id,
        COALESCE(NULLIF(btrim(v_item->>'category_name'), ''), 'Uncategorised'),
        COALESCE(NULLIF(btrim(v_item->>'sr_no'), ''), v_sort::text),
        btrim(v_item->>'item_description'),
        NULLIF((v_item->>'qty_rcc')::numeric, 0),
        NULLIF((v_item->>'qty_finishes')::numeric, 0),
        NULLIF((v_item->>'qty_infra')::numeric, 0),
        v_qty,
        COALESCE(NULLIF(btrim(v_item->>'unit'), ''), 'LS'),
        COALESCE((v_item->>'estimated_rate')::numeric, 0),
        v_cost,
        CASE WHEN v_bua > 0 THEN ROUND(v_cost / v_bua, 2) ELSE 0 END,
        COALESCE(NULLIF(v_item->>'scope_tag', ''), 'site_infra'),
        COALESCE(NULLIF(v_item->>'item_type', ''), 'material'),
        v_sort, 1
      )
      RETURNING id INTO v_existing;
      v_inserted := v_inserted + 1;
    ELSE
      UPDATE public.master_budget_items
      SET sr_no          = COALESCE(NULLIF(btrim(v_item->>'sr_no'), ''), sr_no),
          qty_rcc        = NULLIF((v_item->>'qty_rcc')::numeric, 0),
          qty_finishes   = NULLIF((v_item->>'qty_finishes')::numeric, 0),
          qty_infra      = NULLIF((v_item->>'qty_infra')::numeric, 0),
          qty_total      = v_qty,
          unit           = COALESCE(NULLIF(btrim(v_item->>'unit'), ''), unit),
          estimated_rate = COALESCE((v_item->>'estimated_rate')::numeric, estimated_rate),
          budgeted_cost  = v_cost,
          cost_per_bua   = CASE WHEN v_bua > 0 THEN ROUND(v_cost / v_bua, 2) ELSE 0 END,
          scope_tag      = COALESCE(NULLIF(v_item->>'scope_tag', ''), scope_tag),
          item_type      = COALESCE(NULLIF(v_item->>'item_type', ''), item_type),
          sort_order     = v_sort,
          is_active      = true,
          version_number = version_number + 1,
          updated_at     = now()
      WHERE id = v_existing;
      v_updated := v_updated + 1;
    END IF;

    v_seen := array_append(v_seen, v_existing);
  END LOOP;

  IF v_inserted = 0 AND v_updated = 0 THEN
    RAISE EXCEPTION 'Every row in the uploaded sheet was skipped (no usable item descriptions).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Guarded by the check above: v_seen can never be empty here, so "archive
  -- everything not in the sheet" cannot wipe the whole baseline.
  IF p_archive_missing AND array_length(v_seen, 1) > 0 THEN
    UPDATE public.master_budget_items
    SET is_active = false, updated_at = now()
    WHERE project_id = p_project_id
      AND is_active
      AND deleted_at IS NULL
      AND NOT (id = ANY(v_seen));
    GET DIAGNOSTICS v_archived = ROW_COUNT;
  END IF;

  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_new_total
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND is_active AND deleted_at IS NULL;

  UPDATE public.budget_revisions
  SET new_total_cost  = v_new_total,
      net_diff_amount = v_new_total - v_old_total
  WHERE id = v_revision;

  UPDATE public.projects SET budget_amount = v_new_total WHERE id = p_project_id;

  RETURN jsonb_build_object(
    'revision_id',    v_revision,
    'version_number', v_version,
    'inserted',       v_inserted,
    'updated',        v_updated,
    'archived',       v_archived,
    'old_total',      v_old_total,
    'new_total',      v_new_total
  );
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_save_master_budget_revision(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_variance_reconciliation(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_import_master_budget(uuid, text, text, jsonb, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_save_master_budget_revision(uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_save_variance_reconciliation(uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_import_master_budget(uuid, text, text, jsonb, boolean) FROM anon;

-- ============================================================================
-- 16. VERIFICATION — fails loudly if the module is still inconsistent
-- ============================================================================
DO $$
DECLARE
  v_cats        int;
  v_allocs      int;
  v_baseline    numeric;
  v_allocated   numeric;
  v_var_missing int;
BEGIN
  SELECT COUNT(*) INTO v_cats   FROM public.budget_categories WHERE COALESCE(is_active, true);
  SELECT COUNT(*) INTO v_allocs FROM public.budget_allocations WHERE category_id IS NOT NULL AND deleted_at IS NULL;

  IF v_allocs < v_cats THEN
    RAISE EXCEPTION 'Allocation provisioning incomplete: % categories but only % allocations', v_cats, v_allocs;
  END IF;

  SELECT COALESCE(SUM(budgeted_cost), 0) INTO v_baseline
  FROM public.master_budget_items WHERE is_active AND deleted_at IS NULL;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_allocated
  FROM public.budget_allocations WHERE category_id IS NOT NULL AND deleted_at IS NULL;

  IF ROUND(v_baseline, 2) <> ROUND(v_allocated, 2) THEN
    RAISE EXCEPTION 'Baseline/allocation mismatch: master budget % vs allocations %', v_baseline, v_allocated;
  END IF;

  SELECT COUNT(*) INTO v_var_missing
  FROM public.master_budget_items mbi
  LEFT JOIN public.budget_variance_items bvi ON bvi.master_budget_item_id = mbi.id
  WHERE mbi.is_active AND mbi.deleted_at IS NULL AND bvi.id IS NULL;

  IF v_var_missing > 0 THEN
    RAISE EXCEPTION '% active master budget lines have no variance row', v_var_missing;
  END IF;

  RAISE NOTICE 'Budget hardening OK: % categories, % allocations, baseline %',
    v_cats, v_allocs, v_baseline;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
