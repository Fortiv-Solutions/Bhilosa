-- Ensure the procurement-documents storage bucket exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'procurement-documents',
  'procurement-documents',
  true,
  52428800, -- 50MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Also ensure project-documents bucket exists as fallback
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  true,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800;

-- Ensure full RLS policies for both buckets
DROP POLICY IF EXISTS "Enable read procurement documents" ON storage.objects;
CREATE POLICY "Enable read procurement documents" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket_id IN ('procurement-documents', 'project-documents'));

DROP POLICY IF EXISTS "Enable upload procurement documents" ON storage.objects;
CREATE POLICY "Enable upload procurement documents" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (bucket_id IN ('procurement-documents', 'project-documents'));

DROP POLICY IF EXISTS "Enable update procurement documents" ON storage.objects;
CREATE POLICY "Enable update procurement documents" ON storage.objects
  FOR UPDATE TO authenticated, anon
  USING (bucket_id IN ('procurement-documents', 'project-documents'));

DROP POLICY IF EXISTS "Enable delete procurement documents" ON storage.objects;
CREATE POLICY "Enable delete procurement documents" ON storage.objects
  FOR DELETE TO authenticated, anon
  USING (bucket_id IN ('procurement-documents', 'project-documents'));

-- Make entity_attachments FK columns nullable so uploads don't fail on missing profile
ALTER TABLE public.entity_attachments
  ALTER COLUMN created_by DROP NOT NULL,
  ALTER COLUMN updated_by DROP NOT NULL,
  ALTER COLUMN uploaded_by DROP NOT NULL;
