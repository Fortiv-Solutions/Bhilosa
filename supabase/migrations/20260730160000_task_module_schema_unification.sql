-- =========================================================================
-- MIGRATION: 20260730160000_task_module_schema_unification.sql
-- DESCRIPTION: Unifies public.tasks schema across ERP and Pramukh-App
-- =========================================================================

-- 1. Add missing columns to public.tasks if they do not exist
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS assignee_id UUID,
  ADD COLUMN IF NOT EXISTS assignee_name TEXT;

-- 2. Create function to automatically keep field aliases in sync
CREATE OR REPLACE FUNCTION public.fn_sync_task_field_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync title and name
  IF NEW.title IS NULL AND NEW.name IS NOT NULL THEN
    NEW.title := NEW.name;
  ELSIF NEW.name IS NULL AND NEW.title IS NOT NULL THEN
    NEW.name := NEW.title;
  END IF;

  -- Sync assigned_to and assignee_id
  IF NEW.assigned_to IS NULL AND NEW.assignee_id IS NOT NULL THEN
    NEW.assigned_to := NEW.assignee_id;
  ELSIF NEW.assignee_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    NEW.assignee_id := NEW.assigned_to;
  END IF;

  -- Sync assigned_name and assignee_name
  IF NEW.assigned_name IS NULL AND NEW.assignee_name IS NOT NULL THEN
    NEW.assigned_name := NEW.assignee_name;
  ELSIF NEW.assignee_name IS NULL AND NEW.assigned_name IS NOT NULL THEN
    NEW.assignee_name := NEW.assigned_name;
  END IF;

  -- Sync due_date and end_date
  IF NEW.due_date IS NULL AND NEW.end_date IS NOT NULL THEN
    NEW.due_date := NEW.end_date::date;
  ELSIF NEW.end_date IS NULL AND NEW.due_date IS NOT NULL THEN
    NEW.end_date := NEW.due_date::timestamp with time zone;
  END IF;

  -- Sync status, progress, and done
  IF NEW.status IS NOT NULL THEN
    IF UPPER(NEW.status) = 'COMPLETED' THEN
      NEW.done := TRUE;
      NEW.progress := COALESCE(NEW.progress, 100);
      IF NEW.progress < 100 THEN
        NEW.progress := 100;
      END IF;
      IF NEW.completed_at IS NULL THEN
        NEW.completed_at := NOW();
      END IF;
    ELSE
      NEW.done := FALSE;
    END IF;
  ELSIF NEW.done IS TRUE THEN
    NEW.status := 'COMPLETED';
    NEW.progress := 100;
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to public.tasks
DROP TRIGGER IF EXISTS trg_sync_task_field_aliases ON public.tasks;
CREATE TRIGGER trg_sync_task_field_aliases
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_task_field_aliases();

-- 4. Backfill existing records to ensure data completeness
UPDATE public.tasks
SET
  title = COALESCE(title, name),
  name = COALESCE(name, title, 'Untitled Task'),
  assignee_id = COALESCE(assignee_id, assigned_to),
  assigned_to = COALESCE(assigned_to, assignee_id),
  assignee_name = COALESCE(assignee_name, assigned_name),
  assigned_name = COALESCE(assigned_name, assignee_name),
  done = CASE WHEN UPPER(COALESCE(status, '')) = 'COMPLETED' OR progress = 100 THEN TRUE ELSE FALSE END,
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE title IS NULL OR name IS NULL OR assignee_id IS NULL OR done IS NULL;
