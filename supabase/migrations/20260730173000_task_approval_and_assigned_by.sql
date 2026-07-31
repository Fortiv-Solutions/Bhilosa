-- Migration: Add approval status and creator metadata columns to tasks table

ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'NOT_SUBMITTED',
ADD COLUMN IF NOT EXISTS created_by_name TEXT,
ADD COLUMN IF NOT EXISTS approved_by_name TEXT;

-- Update trigger function to handle dual aliases and approval_status
CREATE OR REPLACE FUNCTION public.fn_sync_task_field_aliases()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync title <-> name
  IF NEW.title IS NULL AND NEW.name IS NOT NULL THEN
    NEW.title := NEW.name;
  ELSIF NEW.name IS NULL AND NEW.title IS NOT NULL THEN
    NEW.name := NEW.title;
  END IF;

  -- Sync assignee_id <-> assigned_to
  IF NEW.assignee_id IS NULL AND NEW.assigned_to IS NOT NULL THEN
    NEW.assignee_id := NEW.assigned_to;
  ELSIF NEW.assigned_to IS NULL AND NEW.assignee_id IS NOT NULL THEN
    NEW.assigned_to := NEW.assignee_id;
  END IF;

  -- Sync assignee_name <-> assigned_name
  IF NEW.assignee_name IS NULL AND NEW.assigned_name IS NOT NULL THEN
    NEW.assignee_name := NEW.assigned_name;
  ELSIF NEW.assigned_name IS NULL AND NEW.assignee_name IS NOT NULL THEN
    NEW.assigned_name := NEW.assignee_name;
  END IF;

  -- Sync created_by_name <-> assigned_by_name fallback
  IF NEW.created_by_name IS NOT NULL AND NEW.assigned_by_name IS NULL THEN
    NEW.assigned_by_name := NEW.created_by_name;
  ELSIF NEW.assigned_by_name IS NOT NULL AND NEW.created_by_name IS NULL THEN
    NEW.created_by_name := NEW.assigned_by_name;
  END IF;

  -- Auto-set approval_status for completed tasks
  IF (NEW.status = 'COMPLETED' OR NEW.progress = 100) AND (NEW.approval_status IS NULL OR NEW.approval_status = 'NOT_SUBMITTED') THEN
    NEW.approval_status := 'AWAITING_APPROVAL';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
