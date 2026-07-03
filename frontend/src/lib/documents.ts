import { supabase } from '@/utils/supabase-client';

export async function uploadEntityAttachment(projectId: string, entityTable: string, entityId: string, documentType: string, file: File) {
  const path = `${projectId}/${entityTable}/${entityId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  const { error: uploadError } = await supabase.storage
    .from('project-documents')
    .upload(path, file);
    
  if (uploadError) throw uploadError;

  const { data: { user } } = await supabase.auth.getUser();

  const { error: dbError } = await supabase.from('entity_attachments').insert({
    project_id: projectId,
    entity_table: entityTable,
    entity_id: entityId,
    document_type: documentType,
    file_name: file.name,
    storage_bucket: 'project-documents',
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
    created_by: user?.id
  });

  if (dbError) throw dbError;
}

export async function getEntityAttachments(entityTable: string, entityId: string) {
  const { data, error } = await supabase
    .from('entity_attachments')
    .select('*')
    .eq('entity_table', entityTable)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getAttachmentUrl(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
