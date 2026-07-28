-- ============================================================================
-- PRAMUKH GROUP ERP — SAFE TRIGGER FUNCTION FOR UPDATED_AT
-- ----------------------------------------------------------------------------
-- Prevents "record 'new' has no field 'updated_at'" errors when tables
-- without an `updated_at` column have a `set_updated_at()` trigger attached.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) ? 'updated_at') THEN
    NEW := jsonb_populate_record(NEW, jsonb_build_object('updated_at', now()));
  END IF;
  RETURN NEW;
END $$;
