-- ============================================================================
-- ACTIVITY -> BUDGET CATEGORY MAPPING CACHE
-- File: supabase/migrations/20260803140000_activity_budget_category_map.sql
--
-- WHY
-- ---
-- The PR's activity-wise budget card matched PR line activities to Master Budget
-- categories with word-overlap string similarity (labelled "AI" in the UI, but
-- no model was involved). Measured against the live 24-category Master Budget it
-- resolved almost nothing, because the MR activity vocabulary and the budget
-- vocabulary are different taxonomies:
--
--     'Masonry / Brickwork'      -> best score 0.000  (no match)
--     'Excavation / Foundation'  -> best score 0.167  (below the 0.3 threshold)
--
-- Unmatched activities were then silently dropped from the breakdown, so the
-- card showed either the whole project budget (empty PR) or zero plus a false
-- overrun alert (populated PR).
--
-- This table is the durable resolution layer. An activity name is resolved ONCE
-- and the answer is reused forever, so the model is never on the hot path of a
-- render and the same activity can never resolve two different ways.
--
-- Resolution order (see activity-category-resolver.ts):
--   1. exact / normalised name match   -> source = 'exact'
--   2. this cache                      -> source = whatever produced the row
--   3. LLM taxonomy call               -> source = 'llm'      (cached here)
--   4. none                            -> source = 'miscellaneous'
--
-- A human override (source = 'manual') always wins and is never overwritten by
-- an automated pass.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.activity_budget_category_map (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  /* Normalised activity text (lowercased, punctuation collapsed) — the lookup
     key. Storing it normalised means 'Masonry / Brickwork' and 'masonry
     brickwork' cannot produce two competing rows. */
  activity_key      text NOT NULL,
  /* The activity exactly as the user typed it, for display and audit. */
  activity_label    text NOT NULL,

  category_id       uuid REFERENCES public.budget_categories(id) ON DELETE SET NULL,

  /* 'exact' | 'llm' | 'manual' | 'miscellaneous' */
  source            text NOT NULL DEFAULT 'llm',
  /* 0..1 from the model; 1 for exact and manual. Advisory only — it never
     scales a budget figure, it only drives a "confirm this" hint in the UI. */
  confidence        numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  /* Short model rationale, shown as the match reason. */
  reasoning         text,
  model             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id),
  updated_by        uuid REFERENCES public.profiles(id),

  CONSTRAINT activity_budget_category_map_source_chk
    CHECK (source IN ('exact', 'llm', 'manual', 'miscellaneous'))
);

-- One resolution per activity per project.
CREATE UNIQUE INDEX IF NOT EXISTS uq_activity_category_map
  ON public.activity_budget_category_map (project_id, activity_key);

CREATE INDEX IF NOT EXISTS idx_activity_category_map_category
  ON public.activity_budget_category_map (category_id)
  WHERE category_id IS NOT NULL;

COMMENT ON TABLE public.activity_budget_category_map IS
  'Durable activity -> Master Budget category resolution. Populated by exact match, an LLM taxonomy call, or a human override. Budget amounts are NEVER sent to the model; only activity and category NAMES are.';

-- ----------------------------------------------------------------------------
-- RLS: readable by any authenticated user, writable by procurement roles.
-- Mirrors the procurement hardening migration's helper predicates.
-- ----------------------------------------------------------------------------
ALTER TABLE public.activity_budget_category_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_category_map_read ON public.activity_budget_category_map;
CREATE POLICY activity_category_map_read
  ON public.activity_budget_category_map
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS activity_category_map_write ON public.activity_budget_category_map;
CREATE POLICY activity_category_map_write
  ON public.activity_budget_category_map
  FOR ALL TO authenticated
  USING (public.app_can_write_procurement())
  WITH CHECK (public.app_can_write_procurement());

-- ----------------------------------------------------------------------------
-- Upsert helper. Never downgrades a manual override.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_upsert_activity_category_map(
  p_project_id     uuid,
  p_activity_key   text,
  p_activity_label text,
  p_category_id    uuid,
  p_source         text DEFAULT 'llm',
  p_confidence     numeric DEFAULT 0,
  p_reasoning      text DEFAULT NULL,
  p_model          text DEFAULT NULL
)
RETURNS public.activity_budget_category_map
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid := public.app_current_profile_id();
  v_row     public.activity_budget_category_map;
BEGIN
  IF p_project_id IS NULL OR coalesce(btrim(p_activity_key), '') = '' THEN
    RAISE EXCEPTION 'project id and activity key are required.' USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.activity_budget_category_map (
    project_id, activity_key, activity_label, category_id,
    source, confidence, reasoning, model, created_by, updated_by
  ) VALUES (
    p_project_id, btrim(p_activity_key), coalesce(p_activity_label, p_activity_key),
    p_category_id, coalesce(p_source, 'llm'), coalesce(p_confidence, 0),
    p_reasoning, p_model, v_profile, v_profile
  )
  ON CONFLICT (project_id, activity_key) DO UPDATE
    SET category_id = EXCLUDED.category_id,
        source      = EXCLUDED.source,
        confidence  = EXCLUDED.confidence,
        reasoning   = EXCLUDED.reasoning,
        model       = EXCLUDED.model,
        activity_label = EXCLUDED.activity_label,
        updated_at  = now(),
        updated_by  = v_profile
    -- A human decision outranks any later automated pass.
    WHERE public.activity_budget_category_map.source <> 'manual'
       OR EXCLUDED.source = 'manual'
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.activity_budget_category_map
    WHERE project_id = p_project_id AND activity_key = btrim(p_activity_key);
  END IF;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.rpc_upsert_activity_category_map(
  uuid, text, text, uuid, text, numeric, text, text
) TO authenticated;

-- Realtime, so a mapping confirmed in one tab updates an open PR in another.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  EXECUTE 'ALTER TABLE public.activity_budget_category_map REPLICA IDENTITY FULL';

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'activity_budget_category_map'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_budget_category_map;
  END IF;
END $$;

COMMIT;
