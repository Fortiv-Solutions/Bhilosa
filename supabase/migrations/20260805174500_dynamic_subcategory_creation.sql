-- =====================================================================
-- Migration: 20260805174500_dynamic_subcategory_creation.sql
-- Purpose: Enable dynamic sub-category (Master Budget Item) creation
--          on-the-fly during bill booking and variance reconciliation.
-- =====================================================================

-- 1. Ensure master_budget_items has tracking columns for dynamic sub-categories
ALTER TABLE public.master_budget_items
  ADD COLUMN IF NOT EXISTS is_unbudgeted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_from_source text DEFAULT 'manual';

COMMENT ON COLUMN public.master_budget_items.is_unbudgeted IS
  'True if item was dynamically added during bill booking without baseline budget.';

COMMENT ON COLUMN public.master_budget_items.created_from_source IS
  'Source module that created this master budget item (e.g. manual, bill_booking, variance_reconciliation).';

-- 2. Stored Procedure: rpc_create_master_budget_item
CREATE OR REPLACE FUNCTION public.rpc_create_master_budget_item(
  p_project_id uuid,
  p_category_id uuid,
  p_item_description text,
  p_unit text DEFAULT 'NOS',
  p_estimated_rate numeric DEFAULT 0,
  p_scope_tag text DEFAULT 'General',
  p_source text DEFAULT 'bill_booking'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_cat_name        text;
  v_cat_code        text;
  v_clean_desc      text;
  v_existing_id     uuid;
  v_next_sr_no      int;
  v_new_item        public.master_budget_items;
BEGIN
  -- Sanitize description
  v_clean_desc := btrim(p_item_description);
  IF v_clean_desc IS NULL OR v_clean_desc = '' THEN
    RAISE EXCEPTION 'Sub-category item description cannot be empty.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Resolve category details
  SELECT category_name, category_code INTO v_cat_name, v_cat_code
  FROM public.budget_categories
  WHERE id = p_category_id AND (project_id = p_project_id OR project_id IS NULL)
  LIMIT 1;

  IF v_cat_name IS NULL THEN
    -- Fallback: lookup by ID directly
    SELECT category_name, category_code INTO v_cat_name, v_cat_code
    FROM public.budget_categories
    WHERE id = p_category_id
    LIMIT 1;
  END IF;

  IF v_cat_name IS NULL THEN
    RAISE EXCEPTION 'Specified Budget Head / Category not found.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Check for existing duplicate item under this category
  SELECT id INTO v_existing_id
  FROM public.master_budget_items
  WHERE project_id = p_project_id
    AND category_id = p_category_id
    AND lower(btrim(item_description)) = lower(v_clean_desc)
    AND is_active = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT * INTO v_new_item FROM public.master_budget_items WHERE id = v_existing_id;
    RETURN to_jsonb(v_new_item);
  END IF;

  -- Determine next sr_no
  SELECT COALESCE(MAX(CASE WHEN sr_no ~ '^[0-9]+$' THEN sr_no::int ELSE 0 END), 0) + 1
  INTO v_next_sr_no
  FROM public.master_budget_items
  WHERE project_id = p_project_id AND category_id = p_category_id;

  -- Insert new master budget item
  INSERT INTO public.master_budget_items (
    project_id,
    category_id,
    category_name,
    sr_no,
    item_description,
    unit,
    estimated_rate,
    budgeted_cost,
    cost_per_bua,
    scope_tag,
    item_type,
    is_active,
    is_unbudgeted,
    created_from_source,
    sort_order
  ) VALUES (
    p_project_id,
    p_category_id,
    v_cat_name,
    v_next_sr_no::text,
    v_clean_desc,
    UPPER(COALESCE(p_unit, 'NOS')),
    COALESCE(p_estimated_rate, 0),
    0, -- baseline budgeted cost starts at 0 for dynamic items
    0,
    COALESCE(p_scope_tag, 'General'),
    'Material',
    true,
    true,
    COALESCE(p_source, 'bill_booking'),
    v_next_sr_no
  )
  RETURNING * INTO v_new_item;

  -- The trigger trg_sync_master_to_variance automatically inserts or updates
  -- the corresponding row in budget_variance_items.

  RETURN to_jsonb(v_new_item);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_create_master_budget_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_master_budget_item TO service_role;
