-- ============================================================================
-- Migration: Update PR to MR Back to Draft Reason Sync
-- Date: 2026-08-10
-- Purpose:
--   Sync Back to Draft reason (revision_reason / cancellation_reason) from 
--   purchase_requisitions to material_requests (clarification_text) and set 
--   material_requests status to 'draft'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_pr_status_sync_to_mr()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status::text IN ('draft', 'returned_to_draft')) AND NEW.material_request_id IS NOT NULL THEN
    UPDATE public.material_requests
    SET status = 'draft',
        clarification_text = COALESCE(NEW.revision_reason, NEW.cancellation_reason, clarification_text),
        clarification_at = NOW()
    WHERE id = NEW.material_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_pr_status_sync_to_mr ON public.purchase_requisitions;
CREATE TRIGGER trg_pr_status_sync_to_mr
AFTER UPDATE OF status, revision_reason ON public.purchase_requisitions
FOR EACH ROW
EXECUTE FUNCTION public.handle_pr_status_sync_to_mr();
