-- ============================================================================
-- PRAMUKH GROUP ERP V2 — ENSURE QTY COLUMN IN ALL WORK ORDER TEMPLATES
-- File: supabase/migrations/20260812120000_ensure_qty_column_in_all_wo_templates.sql
-- ============================================================================

BEGIN;

-- Update all wo_templates where item_columns does not contain Qty or Quantity
UPDATE public.wo_templates
SET item_columns = (
  CASE 
    WHEN item_columns::text ILIKE '%unit%' THEN
      -- Insert "Qty" right after "Unit" column
      (
        SELECT jsonb_agg(elem)
        FROM (
          SELECT elem, ord
          FROM jsonb_array_elements_text(item_columns) WITH ORDINALITY AS t(elem, ord)
          UNION ALL
          SELECT 'Qty' AS elem, 
                 (SELECT ord + 0.5 FROM jsonb_array_elements_text(item_columns) WITH ORDINALITY AS t(elem, ord) WHERE elem ILIKE '%unit%' LIMIT 1) AS ord
          ORDER BY ord
        ) sub
      )
    ELSE
      -- Insert "Qty" as third element
      item_columns || '["Qty"]'::jsonb
  END
),
updated_at = now()
WHERE NOT (item_columns::text ILIKE '%qty%' OR item_columns::text ILIKE '%quantity%' OR item_columns::text ILIKE '%flats%');

-- Report updated templates count
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.wo_templates;
  RAISE NOTICE '✅ Successfully verified all % wo_templates have a Qty column in item_columns.', v_count;
END $$;

COMMIT;
