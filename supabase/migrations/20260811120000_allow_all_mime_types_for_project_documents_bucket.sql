-- ============================================================================
-- MIGRATION: 20260811120000_allow_all_mime_types_for_project_documents_bucket.sql
-- Description: Allow all file MIME types (including .xlsx, .xls, .csv spreadsheets)
--              in project-documents and procurement-documents storage buckets
--              and raise file size limit to 50 MB.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET allowed_mime_types = NULL,
        file_size_limit = 52428800 -- 50 MB
    WHERE id IN ('project-documents', 'procurement-documents', 'inbox-media', 'dpr-photos');
  END IF;
END $$;
