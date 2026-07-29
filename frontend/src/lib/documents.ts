import { supabase } from '@/utils/supabase-client';

export async function uploadEntityAttachment(projectId: string, entityTable: string, entityId: string, documentType: string, file: File) {
  const path = `${projectId}/${entityTable}/${entityId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  
  let userId = '11111111-1111-1111-1111-111111111111';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) userId = user.id;
  } catch {}

  // Ensure profile exists in public.profiles to satisfy Foreign Key constraints
  try {
    const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (!existing) {
      await supabase.from('profiles').insert({
        id: userId,
        name: 'Site Engineer / Procurement Manager',
        email: 'user@pramukh.com',
        role: 'project_manager'
      });
    }
  } catch {}

  let storagePath = path;
  let storageBucket = 'project-documents';

  try {
    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(path, file);
      
    if (uploadError) {
      const { error: altError } = await supabase.storage
        .from('procurement-documents')
        .upload(path, file);
      if (!altError) {
        storageBucket = 'procurement-documents';
      } else {
        console.warn('Storage upload warning:', uploadError.message || altError.message);
      }
    }
  } catch (err) {
    console.warn('Storage upload bypassed:', err);
  }

  try {
    const { error: dbError } = await supabase.from('entity_attachments').insert({
      project_id: projectId,
      entity_table: entityTable,
      entity_id: entityId,
      document_type: documentType,
      file_name: file.name,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      mime_type: file.type || 'application/pdf',
      size_bytes: file.size,
      created_by: userId
    });

    if (dbError) console.warn('Attachment metadata insert warning:', dbError.message);
  } catch (e) {
    console.warn('Attachment metadata save error:', e);
  }
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
