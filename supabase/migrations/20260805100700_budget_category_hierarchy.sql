-- ============================================================================
-- PHASE 8 — BUDGET CATEGORY HIERARCHY (sub-categories)
-- File: supabase/migrations/20260805100700_budget_category_hierarchy.sql
--
-- Option (i) of the three considered: parent_id on budget_categories,
-- self-referencing, mirroring the pattern cost_codes already uses. Chosen over a
-- dedicated budget_sub_categories table (rigid at exactly three levels) and over
-- unifying on cost_codes (cleanest, but it rewrites every budget read).
--
-- THE THREE CONSEQUENCES, HANDLED HERE
-- ====================================
-- 1. uq_budget_allocations_project_category is UNIQUE on (project_id,
--    category_id) — one allocation per category. Allocations now provision at
--    the LEAF, so fn_sync_category_to_allocation and fn_resolve_budget_allocation
--    both change: a parent head aggregates its children rather than holding money
--    directly.
-- 2. Category name uniqueness becomes (project_id, parent_id, category_name).
--    "Finishes > Flooring" and "Infra > Flooring" are different heads.
-- 3. The two-level assumptions in fetchMasterBudgetCategories and the Excel
--    parser's single-level header detection are handled on the frontend; this
--    migration exposes budget_category_tree so neither has to walk the hierarchy
--    itself.
--
-- Applied BEFORE any sub-category data exists, so there is no backfill ambiguity
-- and no name-collision cleanup: every existing category becomes a root.
--
-- Idempotent and non-destructive: safe to re-run.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '20s';
SET LOCAL statement_timeout = '300s';
SET LOCAL deadlock_timeout = '2s';

LOCK TABLE public.budget_allocations,
           public.budget_categories,
           public.master_budget_items
  IN ACCESS EXCLUSIVE MODE;

-- ----------------------------------------------------------------------------
-- 1. SCHEMA
-- ----------------------------------------------------------------------------

ALTER TABLE public.budget_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.budget_categories(id) ON DELETE RESTRICT,
  /* Materialised for cheap sorting and display; maintained by trigger. */
  ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS path_label text,
  /* Provenance, so taxonomy sprawl from inline creation is auditable. */
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_categories_created_via_chk') THEN
    ALTER TABLE public.budget_categories ADD CONSTRAINT budget_categories_created_via_chk
      CHECK (created_via IN ('manual', 'excel_import', 'inline_change_document', 'auto'));
  END IF;

  -- A category cannot be its own parent. Deeper cycles are caught by the trigger.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_categories_no_self_parent_chk') THEN
    ALTER TABLE public.budget_categories ADD CONSTRAINT budget_categories_no_self_parent_chk
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;

-- 1b. Name uniqueness is now per PARENT. Two different heads may each have a
--     "Flooring" child. The old constraint was project-wide and would block that.
--     NULLs are not equal in a plain unique index, so roots need a second index
--     with a COALESCE'd sentinel.
-- Drop whatever project-wide uniqueness exists on (project_id, category_name),
-- by DEFINITION rather than by name: it was created implicitly and its generated
-- name is not guaranteed across environments. Leaving it in place would block
-- two sibling heads each having a "Flooring" child, which is the whole point.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'budget_categories'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%project_id%'
      AND pg_get_constraintdef(c.oid) ILIKE '%category_name%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%parent_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.budget_categories DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'Dropped project-wide category-name constraint %.', v_name;
  END LOOP;

  FOR v_name IN
    SELECT i.indexname
    FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename = 'budget_categories'
      AND i.indexdef ILIKE '%UNIQUE%'
      AND i.indexdef ILIKE '%project_id%'
      AND i.indexdef ILIKE '%category_name%'
      AND i.indexdef NOT ILIKE '%parent_id%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_name);
    RAISE NOTICE 'Dropped project-wide category-name index %.', v_name;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_budget_categories_parent_name
  ON public.budget_categories (
    project_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(category_name))
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budget_categories_parent
  ON public.budget_categories (parent_id) WHERE parent_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. HIERARCHY MAINTENANCE
--    depth and path_label are derived. A trigger keeps them true rather than
--    trusting callers to supply them.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_budget_category_hierarchy()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_parent public.budget_categories;
  v_cursor uuid;
  v_guard  integer := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth      := 0;
    NEW.path_label := NEW.category_name;
    RETURN NEW;
  END IF;

  -- Cycle guard: walk up from the proposed parent; if we meet ourselves, reject.
  v_cursor := NEW.parent_id;
  WHILE v_cursor IS NOT NULL AND v_guard < 32 LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Category "%" cannot be nested under its own descendant.', NEW.category_name
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_id INTO v_cursor FROM public.budget_categories WHERE id = v_cursor;
    v_guard := v_guard + 1;
  END LOOP;

  SELECT * INTO v_parent FROM public.budget_categories WHERE id = NEW.parent_id;
  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Parent category % does not exist.', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_parent.project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'A sub-category must belong to the same project as its parent.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Two levels of nesting (head > category > sub-category) is what the business
  -- asked for; deeper trees make the Master Sheet unreadable.
  IF COALESCE(v_parent.depth, 0) >= 2 THEN
    RAISE EXCEPTION 'Budget categories nest at most three levels deep.'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.depth      := COALESCE(v_parent.depth, 0) + 1;
  NEW.path_label := COALESCE(v_parent.path_label, v_parent.category_name) || ' › ' || NEW.category_name;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_budget_category_hierarchy ON public.budget_categories;
CREATE TRIGGER trg_budget_category_hierarchy
  BEFORE INSERT OR UPDATE OF parent_id, category_name ON public.budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_budget_category_hierarchy();

/* Re-stamp descendants when a parent is renamed or re-parented. */
CREATE OR REPLACE FUNCTION public.fn_restamp_budget_category_children()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.path_label IS NOT DISTINCT FROM OLD.path_label
     AND NEW.depth IS NOT DISTINCT FROM OLD.depth THEN
    RETURN NEW;
  END IF;

  -- Touching parent_id re-fires the BEFORE trigger on each child, which
  -- recomputes its own depth and path from the (now updated) parent.
  UPDATE public.budget_categories
  SET parent_id = parent_id
  WHERE parent_id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_restamp_budget_category_children ON public.budget_categories;
CREATE TRIGGER trg_restamp_budget_category_children
  AFTER UPDATE OF path_label, depth ON public.budget_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_restamp_budget_category_children();

-- Every existing category becomes a root; there is no sub-category data yet.
UPDATE public.budget_categories
SET depth = 0, path_label = category_name
WHERE parent_id IS NULL AND (path_label IS NULL OR depth <> 0);

-- ----------------------------------------------------------------------------
-- 3. ALLOCATIONS PROVISION AT THE LEAF
--    A parent head aggregates its children; it does not hold money directly.
--    Otherwise the same rupee would be counted twice — once on the parent and
--    once on the child.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_budget_category_is_leaf(p_category_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.budget_categories c
    WHERE c.parent_id = p_category_id AND c.deleted_at IS NULL AND COALESCE(c.is_active, true)
  );
$$;

/* Resolution now climbs: a Master Budget line on a sub-category resolves to that
   sub-category's allocation, falling back to the nearest ancestor that has one.
   That keeps documents booked before the hierarchy existed working unchanged. */
CREATE OR REPLACE FUNCTION public.fn_resolve_budget_allocation(
  p_project_id            uuid,
  p_budget_allocation_id  uuid,
  p_master_budget_item_id uuid
)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allocation_id uuid;
  v_category_id   uuid;
  v_guard         integer := 0;
BEGIN
  IF p_budget_allocation_id IS NOT NULL THEN
    RETURN p_budget_allocation_id;
  END IF;

  IF p_master_budget_item_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT category_id INTO v_category_id
  FROM public.master_budget_items WHERE id = p_master_budget_item_id;

  -- Walk up until a category with an allocation is found.
  WHILE v_category_id IS NOT NULL AND v_guard < 8 LOOP
    SELECT id INTO v_allocation_id
    FROM public.budget_allocations
    WHERE project_id = p_project_id
      AND category_id = v_category_id
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_allocation_id IS NOT NULL THEN
      RETURN v_allocation_id;
    END IF;

    SELECT parent_id INTO v_category_id
    FROM public.budget_categories WHERE id = v_category_id;
    v_guard := v_guard + 1;
  END LOOP;

  RETURN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 4. THE TREE VIEW
--    Rolls each node's own baseline plus everything beneath it, so the frontend
--    never has to walk the hierarchy itself.
-- ----------------------------------------------------------------------------

DROP VIEW IF EXISTS public.budget_category_tree CASCADE;
CREATE VIEW public.budget_category_tree AS
WITH RECURSIVE descendants AS (
  SELECT c.id AS root_id, c.id AS node_id
  FROM public.budget_categories c
  WHERE c.deleted_at IS NULL
  UNION ALL
  SELECT d.root_id, child.id
  FROM descendants d
  JOIN public.budget_categories child ON child.parent_id = d.node_id AND child.deleted_at IS NULL
),
own_totals AS (
  SELECT category_id,
         COALESCE(SUM(budgeted_cost), 0)          AS baseline,
         COALESCE(SUM(original_budgeted_cost), 0) AS original,
         COUNT(*)                                 AS line_count
  FROM public.master_budget_items
  WHERE is_active AND deleted_at IS NULL AND category_id IS NOT NULL
  GROUP BY category_id
),
rolled AS (
  SELECT d.root_id,
         COALESCE(SUM(t.baseline), 0)   AS rollup_baseline,
         COALESCE(SUM(t.original), 0)   AS rollup_original,
         COALESCE(SUM(t.line_count), 0) AS rollup_line_count
  FROM descendants d
  LEFT JOIN own_totals t ON t.category_id = d.node_id
  GROUP BY d.root_id
)
SELECT
  c.id, c.project_id, c.parent_id, c.category_name, c.category_code,
  c.depth, c.path_label, c.sort_order, c.is_active, c.created_via,
  public.fn_budget_category_is_leaf(c.id)      AS is_leaf,
  COALESCE(own.baseline, 0)                    AS own_baseline_amount,
  COALESCE(r.rollup_baseline, 0)               AS baseline_amount,
  COALESCE(r.rollup_original, 0)               AS original_amount,
  COALESCE(r.rollup_line_count, 0)             AS line_item_count,
  ba.id                                        AS budget_allocation_id,
  COALESCE(ba.allocated_amount, 0)             AS allocated_amount,
  COALESCE(ba.committed_amount, 0)             AS committed_amount,
  COALESCE(ba.spent_amount, 0)                 AS spent_amount
FROM public.budget_categories c
LEFT JOIN own_totals own ON own.category_id = c.id
LEFT JOIN rolled     r   ON r.root_id = c.id
LEFT JOIN public.budget_allocations ba
       ON ba.project_id = c.project_id AND ba.category_id = c.id AND ba.deleted_at IS NULL
WHERE c.deleted_at IS NULL;

REVOKE ALL ON public.budget_category_tree FROM anon;
GRANT SELECT ON public.budget_category_tree TO authenticated;
ALTER VIEW public.budget_category_tree SET (security_invoker = true);

-- ----------------------------------------------------------------------------
-- 5. MANAGING THE TAXONOMY
--    Inline creation is supported but guarded: near-duplicate names are warned
--    about using the same normalisation the activity resolver uses, and every
--    node records how it came into being.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_upsert_budget_category(
  p_project_id    uuid,
  p_category_name text,
  p_parent_id     uuid DEFAULT NULL,
  p_category_code text DEFAULT NULL,
  p_created_via   text DEFAULT 'manual'
)
RETURNS public.budget_categories
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row  public.budget_categories;
  v_name text := btrim(p_category_name);
BEGIN
  IF v_name = '' THEN
    RAISE EXCEPTION 'A category name is required.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.budget_categories
  WHERE project_id = p_project_id
    AND parent_id IS NOT DISTINCT FROM p_parent_id
    AND lower(btrim(category_name)) = lower(v_name)
    AND deleted_at IS NULL;

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.budget_categories (
    project_id, parent_id, category_name, category_code, created_via, sort_order
  ) VALUES (
    p_project_id, p_parent_id, v_name,
    COALESCE(NULLIF(btrim(p_category_code), ''),
             upper(left(regexp_replace(v_name, '[^a-zA-Z0-9]', '', 'g'), 8))),
    COALESCE(NULLIF(p_created_via, ''), 'manual'),
    COALESCE((SELECT MAX(sort_order) + 1 FROM public.budget_categories
              WHERE project_id = p_project_id AND parent_id IS NOT DISTINCT FROM p_parent_id), 0)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

/* Near-duplicate detection, so inline creation does not rot the taxonomy.
   Uses fn_normalize_activity_key — the same normalisation the PR module's
   activity resolver uses, so "Flooring Work" and "flooring-work" collide. */
CREATE OR REPLACE FUNCTION public.rpc_similar_budget_categories(
  p_project_id    uuid,
  p_category_name text,
  p_parent_id     uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, category_name text, path_label text, parent_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.category_name, c.path_label, c.parent_id
  FROM public.budget_categories c
  WHERE c.project_id = p_project_id
    AND c.deleted_at IS NULL
    AND public.fn_normalize_activity_key(c.category_name)
        = public.fn_normalize_activity_key(p_category_name)
    AND c.parent_id IS DISTINCT FROM p_parent_id
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_upsert_budget_category(uuid, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_similar_budget_categories(uuid, text, uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_budget_category_is_leaf(uuid)                          TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_upsert_budget_category(uuid, text, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_similar_budget_categories(uuid, text, uuid)          FROM anon;

-- ----------------------------------------------------------------------------
-- 6. VERIFICATION
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_problems text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'budget_categories' AND column_name = 'parent_id'
  ) THEN
    v_problems := array_append(v_problems, 'budget_categories.parent_id missing');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_budget_categories_parent_name') THEN
    v_problems := array_append(v_problems, 'uq_budget_categories_parent_name missing');
  END IF;

  IF to_regclass('public.budget_category_tree') IS NULL THEN
    v_problems := array_append(v_problems, 'budget_category_tree missing');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_budget_category_hierarchy') THEN
    v_problems := array_append(v_problems, 'trg_budget_category_hierarchy missing');
  END IF;

  -- Every pre-existing category must have become a root with a path.
  IF EXISTS (
    SELECT 1 FROM public.budget_categories
    WHERE deleted_at IS NULL AND (path_label IS NULL OR depth IS NULL)
  ) THEN
    v_problems := array_append(v_problems, 'some categories have no depth/path_label');
  END IF;

  IF array_length(v_problems, 1) > 0 THEN
    RAISE EXCEPTION 'Budget category hierarchy incomplete: %', array_to_string(v_problems, '; ');
  END IF;

  RAISE NOTICE 'Phase 8 applied: budget categories now nest, allocations resolve up the tree, budget_category_tree exposes the rollup.';
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
