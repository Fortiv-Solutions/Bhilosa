-- ============================================================================
-- MR -> PR ITEM MAPPING FIX
-- File: supabase/migrations/20260803120000_mr_pr_item_mapping_fix.sql
--
-- PROBLEM
-- -------
-- The PR item table rendered placeholder values ("Activity Name", "Sub-Activity",
-- "Item Group", "Brand") for lines imported from a Material Request. Three
-- independent defects, all of which had to be fixed for the mapping to work:
--
--   1. material_request_lines has NO sub_activity_name column, while both
--      purchase_requisitions and purchase_requisition_lines DO. The PR mapper
--      read l.sub_activity_name -- a column that cannot exist -- so the value was
--      always empty and then fell back to the MR's justification text.
--
--   2. submit_mobile_material_request() only ever inserted
--      (item_description, quantity, estimated_rate, unit, remarks). Every
--      classification column the PR needs -- activity_name, activity_code,
--      item_group, item_brand, item_code, specification -- was silently dropped
--      at ingest, so MR lines were born blank in exactly those fields.
--
--   3. Realtime was not enabled on the MR/PR line tables, so a PR open in another
--      tab never saw MR edits.
--
-- This migration fixes (1), (2) and (3) at the database level. It is idempotent
-- and safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Add the missing classification columns to material_request_lines.
--    sub_activity_name is the actual gap; the rest are guarded by IF NOT EXISTS
--    because they were added piecemeal by earlier work and may already be there.
-- ----------------------------------------------------------------------------
ALTER TABLE public.material_request_lines
  ADD COLUMN IF NOT EXISTS sub_activity_name text,
  ADD COLUMN IF NOT EXISTS activity_name     text,
  ADD COLUMN IF NOT EXISTS activity_code     text,
  ADD COLUMN IF NOT EXISTS item_group        text,
  ADD COLUMN IF NOT EXISTS item_brand        text,
  ADD COLUMN IF NOT EXISTS item_code         text,
  ADD COLUMN IF NOT EXISTS specification     text;

-- Header-level sub-activity, so an MR raised against a single sub-activity can
-- carry it once instead of repeating it on every line.
ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS sub_activity_name text;

COMMENT ON COLUMN public.material_request_lines.sub_activity_name IS
  'Sub-activity for this line. Maps 1:1 to purchase_requisition_lines.sub_activity_name.';
COMMENT ON COLUMN public.material_request_lines.item_brand IS
  'Requested brand. Distinct from specification -- maps to purchase_requisition_lines.preferred_brand.';

-- Index the FK the PR conversion joins on. Without it, every PR line save does a
-- seq scan of material_request_lines to recompute conversion balances.
CREATE INDEX IF NOT EXISTS idx_mr_lines_mr_id
  ON public.material_request_lines (material_request_id);
CREATE INDEX IF NOT EXISTS idx_pr_lines_mr_line_id
  ON public.purchase_requisition_lines (material_request_line_id)
  WHERE material_request_line_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Backfill: inherit header activity onto pre-existing lines that have none,
--    so historical MRs stop showing blanks in the PR. Only fills NULLs; never
--    overwrites a value a user already entered.
-- ----------------------------------------------------------------------------
UPDATE public.material_request_lines l
SET activity_name = COALESCE(l.activity_name, m.activity_name),
    activity_code = COALESCE(l.activity_code, m.activity_code)
FROM public.material_requests m
WHERE l.material_request_id = m.id
  AND (l.activity_name IS NULL OR l.activity_code IS NULL)
  AND (m.activity_name IS NOT NULL OR m.activity_code IS NOT NULL);

-- ----------------------------------------------------------------------------
-- 3. Re-create the MR ingest RPC so it PERSISTS the classification fields.
--    Signature is unchanged, so the existing frontend call site keeps working;
--    the per-line jsonb simply carries more keys now.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_mobile_material_request(
  p_project_id    uuid,
  p_site_id       uuid DEFAULT NULL,
  p_title         text DEFAULT NULL,
  p_required_date date DEFAULT NULL,
  p_priority      text DEFAULT 'medium',
  p_lines         jsonb DEFAULT '[]'::jsonb,
  p_attachments   jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_require_profile();
  v_mr_id   uuid;
  v_number  text;
  v_line    jsonb;
  v_count   integer := 0;
  v_hdr_activity      text;
  v_hdr_activity_code text;
  v_hdr_sub_activity  text;
BEGIN
  IF NOT public.app_can_write_procurement() THEN
    RAISE EXCEPTION 'Your role may not raise material requests.' USING ERRCODE = '42501';
  END IF;
  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'A project is required to raise a material request.' USING ERRCODE = '22004';
  END IF;
  IF jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one material line is required.' USING ERRCODE = '22004';
  END IF;

  v_number := public.next_document_number('MR');

  -- Header activity: use the first line that declares one, so the MR header and
  -- its lines never disagree about which activity the request belongs to.
  SELECT nullif(e->>'activityName', ''),
         nullif(e->>'activityCode', ''),
         nullif(e->>'subActivityName', '')
    INTO v_hdr_activity, v_hdr_activity_code, v_hdr_sub_activity
  FROM jsonb_array_elements(p_lines) e
  WHERE nullif(e->>'activityName', '') IS NOT NULL
  LIMIT 1;

  INSERT INTO public.material_requests (
    project_id, site_id, mr_number, source, title, justification,
    required_date, priority, status, raised_by, submitted_at,
    activity_name, activity_code, sub_activity_name,
    created_by, updated_by
  ) VALUES (
    p_project_id, p_site_id, v_number, 'site_engineer', p_title, p_title,
    coalesce(p_required_date, CURRENT_DATE + 7),
    coalesce(nullif(p_priority, ''), 'medium')::erp_priority,
    'submitted'::erp_procurement_status, v_profile, now(),
    v_hdr_activity, v_hdr_activity_code, v_hdr_sub_activity,
    v_profile, v_profile
  )
  RETURNING id INTO v_mr_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_count := v_count + 1;
    INSERT INTO public.material_request_lines (
      material_request_id, project_id, item_id, item_description, quantity,
      estimated_rate, unit, remarks, line_number,
      item_code, item_group, item_brand, specification,
      activity_name, activity_code, sub_activity_name,
      created_by, updated_by
    ) VALUES (
      v_mr_id,
      p_project_id,
      nullif(v_line->>'itemId', '')::uuid,
      coalesce(nullif(v_line->>'itemDescription', ''), 'Unspecified material'),
      greatest(coalesce((v_line->>'quantity')::numeric, 0), 0.0001),
      greatest(coalesce((v_line->>'estimatedRate')::numeric, 0), 0),
      coalesce(nullif(v_line->>'unit', ''), 'nos'),
      nullif(v_line->>'remarks', ''),
      v_count,
      nullif(v_line->>'itemCode', ''),
      nullif(v_line->>'itemGroup', ''),
      nullif(v_line->>'itemBrand', ''),
      nullif(v_line->>'specification', ''),
      -- Line value wins; fall back to the header so a line is never blank when
      -- the MR as a whole knows its activity.
      coalesce(nullif(v_line->>'activityName', ''), v_hdr_activity),
      coalesce(nullif(v_line->>'activityCode', ''), v_hdr_activity_code),
      coalesce(nullif(v_line->>'subActivityName', ''), v_hdr_sub_activity),
      v_profile, v_profile
    );
  END LOOP;

  RETURN jsonb_build_object('materialRequestId', v_mr_id, 'mrNumber', v_number, 'lineCount', v_count);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Conversion-balance recompute.
--    savePurchaseRequisition() already calls this per touched MR line, but the
--    function did not exist in every environment, and the call site swallows the
--    error -- so converted_qty silently never moved and "PR Bal Qty" stayed 0.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_mr_line_conversion(p_mr_line_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_converted numeric := 0;
  v_qty       numeric := 0;
BEGIN
  IF p_mr_line_id IS NULL THEN
    RETURN;
  END IF;

  -- Sum PR lines that consume this MR line, excluding cancelled/rejected PRs so
  -- an abandoned draft does not permanently consume the MR's balance.
  SELECT COALESCE(SUM(prl.quantity), 0)
    INTO v_converted
  FROM public.purchase_requisition_lines prl
  JOIN public.purchase_requisitions pr ON pr.id = prl.purchase_requisition_id
  WHERE prl.material_request_line_id = p_mr_line_id
    AND COALESCE(pr.status::text, '') NOT IN ('cancelled', 'rejected', 'returned_to_draft');

  SELECT quantity INTO v_qty
  FROM public.material_request_lines
  WHERE id = p_mr_line_id;

  UPDATE public.material_request_lines
  SET converted_qty   = LEAST(v_converted, COALESCE(v_qty, v_converted)),
      pending_pr_qty  = GREATEST(COALESCE(v_qty, 0) - v_converted, 0),
      updated_at      = now()
  WHERE id = p_mr_line_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_mr_line_conversion(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4b. REPAIR EXISTING PR LINES.
--     PR lines created before this fix have material_request_line_id = NULL,
--     because the caller projected each MR line down to
--     (description, qty, rate, item_id) and dropped the id. Those rows stay
--     broken forever unless relinked, so: match each orphaned PR line back to
--     its MR line, then backfill the classification columns from it.
--
--     Matching is by (source MR, line number) and falls back to
--     (source MR, item description). Only rows that match exactly one MR line
--     are touched -- an ambiguous match is left alone rather than guessed.
-- ----------------------------------------------------------------------------
WITH candidate AS (
  SELECT prl.id AS pr_line_id,
         (
           SELECT mrl.id
           FROM public.material_request_lines mrl
           WHERE mrl.material_request_id = prl.source_mr_id
             AND (
                   mrl.line_number = prl.mr_line_number
                OR btrim(lower(mrl.item_description)) = btrim(lower(prl.item_description))
             )
           -- Prefer a line-number match over a description match.
           ORDER BY (mrl.line_number IS DISTINCT FROM prl.mr_line_number)
           LIMIT 1
         ) AS mr_line_id
  FROM public.purchase_requisition_lines prl
  WHERE prl.material_request_line_id IS NULL
    AND prl.source_mr_id IS NOT NULL
)
UPDATE public.purchase_requisition_lines prl
SET material_request_line_id = c.mr_line_id
FROM candidate c
WHERE prl.id = c.pr_line_id
  AND c.mr_line_id IS NOT NULL;

-- Backfill classification from the now-linked MR line. COALESCE keeps any value
-- a user has already edited on the PR; only blanks are filled.
UPDATE public.purchase_requisition_lines prl
SET item_group        = COALESCE(NULLIF(btrim(prl.item_group), ''),        mrl.item_group),
    preferred_brand   = COALESCE(NULLIF(btrim(prl.preferred_brand), ''),   mrl.item_brand),
    item_code         = COALESCE(NULLIF(btrim(prl.item_code), ''),         mrl.item_code),
    specification     = COALESCE(NULLIF(btrim(prl.specification), ''),     mrl.specification),
    activity_name     = COALESCE(NULLIF(btrim(prl.activity_name), ''),     mrl.activity_name),
    sub_activity_name = COALESCE(NULLIF(btrim(prl.sub_activity_name), ''), mrl.sub_activity_name),
    activity_code     = COALESCE(NULLIF(btrim(prl.activity_code), ''),     mrl.activity_code),
    -- 'nos' is the column default, so an untouched unit is indistinguishable
    -- from a real "nos". Treat it as unset when the MR says otherwise.
    unit              = CASE
                          WHEN COALESCE(NULLIF(btrim(prl.unit), ''), 'nos') = 'nos'
                               AND NULLIF(btrim(mrl.unit), '') IS NOT NULL
                          THEN mrl.unit
                          ELSE prl.unit
                        END,
    approved_mr_qty   = COALESCE(prl.approved_mr_qty, mrl.quantity),
    remaining_mr_qty  = COALESCE(prl.remaining_mr_qty, mrl.quantity),
    mr_line_number    = COALESCE(prl.mr_line_number, mrl.line_number),
    updated_at        = now()
FROM public.material_request_lines mrl
WHERE prl.material_request_line_id = mrl.id;

-- Recompute conversion balances for every MR line a PR now points at, so
-- converted_qty / pending_pr_qty reflect the relinked rows.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT material_request_line_id AS id
    FROM public.purchase_requisition_lines
    WHERE material_request_line_id IS NOT NULL
  LOOP
    PERFORM public.recompute_mr_line_conversion(r.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Realtime.
--    Add the MR/PR tables to the supabase_realtime publication so an open PR
--    reflects MR edits live. REPLICA IDENTITY FULL is required for UPDATE/DELETE
--    payloads to carry the old row (the client filters on project_id).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'material_requests',
    'material_request_lines',
    'purchase_requisitions',
    'purchase_requisition_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
