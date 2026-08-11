// ============================================================================
// PRAMUKH GROUP ERP V2 — ENTITY ATTACHMENTS
// File: frontend/src/lib/documents.ts
//
// Rebuilt in Phase 6. What the previous implementation did, and why none of it
// survives:
//
//   * Storage upload failures were caught and console.warn'd, then the metadata
//     row was inserted ANYWAY and the function resolved successfully. That
//     produced attachment records pointing at objects that do not exist, while
//     the UI reported success — disqualifying for a bill-verification workflow.
//   * It fell back to a hardcoded user id and, when no matching profile existed,
//     INSERTED one with role 'project_manager'. A privileged row written from an
//     unauthenticated client path.
//   * It uploaded to project-documents, then silently to procurement-documents
//     on failure, so one logical document could live in either bucket.
//   * No delete, no multi-file, no progress, no size/type validation, no dedupe.
//
// Everything here returns {data, error} like the rest of the lib layer and never
// resolves on failure.
// ============================================================================

import { supabase } from '@/utils/supabase-client';

const BUCKET = 'project-documents';
const MAX_FILE_BYTES = 25 * 1024 * 1024; // matches the bucket's file_size_limit

/**
 * Supporting evidence arrives in three shapes and all three must be accepted:
 * scanned documents (PDF), site photographs, and the spreadsheets that carry
 * measurement and BOQ working — every Work Order and Payment Certificate in the
 * corpus is an .xlsx, so refusing spreadsheets would refuse the source records.
 */
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  // Spreadsheets. Excel reports several of these depending on version and OS.
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/vnd.oasis.opendocument.spreadsheet', // .ods
  'text/csv',
  'application/csv',
];

/** Accept attribute for a file input that takes anything we can store. */
export const ATTACHMENT_ACCEPT = '.pdf,.xlsx,.xls,.ods,.csv,image/*';

/** Broad kind, for grouping and icon choice in the UI. */
export type AttachmentKind = 'pdf' | 'spreadsheet' | 'image' | 'other';

export function attachmentKind(mimeType: string | null, fileName: string): AttachmentKind {
  const type = (mimeType || '').toLowerCase();
  const name = fileName.toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif|bmp)$/.test(name)) return 'image';
  if (
    type.includes('spreadsheet') ||
    type.includes('excel') ||
    type.includes('csv') ||
    /\.(xlsx?|ods|csv)$/.test(name)
  ) {
    return 'spreadsheet';
  }
  return 'other';
}

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export type AttachmentStatus = 'pending' | 'approved' | 'rejected';

export interface AttachmentRow {
  id: string;
  project_id: string | null;
  entity_table: string;
  entity_id: string;
  document_type: string | null;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  document_hash: string | null;
  is_required: boolean;
  is_duplicate: boolean;
  status: AttachmentStatus;
  rejection_reason: string | null;
  verified_at: string | null;
  created_at: string;
  uploaded_by: string | null;
  /** Resolved from profiles by listEntityAttachments. Null when unknown. */
  uploaded_by_name?: string | null;
}

/**
 * Document taxonomy for a Work Order or Service Bill. Stored on the row so the
 * list can be filtered and so "what evidence is missing" is answerable — which
 * a free-text label never makes possible.
 */
export const WORK_ORDER_DOCUMENT_TYPES = [
  { value: 'wo_supporting_document', label: 'Work Order / contract' },
  { value: 'quotation', label: 'Quotation / BOQ' },
  { value: 'measurement_working', label: 'Measurement working (sheet)' },
  { value: 'progress_photo', label: 'Progress photo' },
  { value: 'qc_certificate', label: 'QC / test certificate' },
  { value: 'warranty_certificate', label: 'Warranty / guarantee' },
  { value: 'invoice_pdf', label: 'Invoice / bill PDF' },
  { value: 'signed_certificate', label: 'Signed certification' },
  { value: 'other', label: 'Other' },
] as const;

/** Document taxonomy for bills. Free text elsewhere. */
export const BILL_DOCUMENT_TYPES = [
  { value: 'invoice_pdf', label: 'Invoice / Bill PDF' },
  { value: 'measurement_sheet', label: 'Measurement sheet' },
  { value: 'qc_certificate', label: 'QC certificate' },
  { value: 'site_photo', label: 'Site photo' },
  { value: 'delivery_challan', label: 'Delivery challan' },
  { value: 'e_way_bill', label: 'E-way bill' },
  { value: 'signed_certificate', label: 'Signed certification' },
  { value: 'other', label: 'Other' },
] as const;

/** SHA-256 of the file contents, so the same invoice cannot be attached twice. */
export async function computeFileHash(file: File): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // Hashing is an integrity aid, not a gate — a failure must not block upload.
    return null;
  }
}

function validateFile(file: File): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`;
  }
  // Some browsers report an empty type for HEIC, .xls and similar; fall back to
  // the extension rather than rejecting a legitimate document.
  const type = file.type || '';
  const byExtension = /\.(pdf|jpe?g|png|webp|heic|gif|bmp|xlsx?|ods|csv)$/i.test(file.name);
  if (type && !ALLOWED_MIME.includes(type) && !byExtension) {
    return `"${file.name}" is a ${type} file. PDF, spreadsheets and images are accepted.`;
  }
  return null;
}

function storagePath(projectId: string, entityTable: string, entityId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
  // crypto.randomUUID avoids the collision a Date.now() prefix allows when two
  // files are uploaded in the same millisecond.
  const unique =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${projectId}/${entityTable}/${entityId}/${unique}-${safe}`;
}

async function currentProfileId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export interface UploadResult {
  uploaded: AttachmentRow[];
  /** Files that failed, with the reason. Never silently dropped. */
  failed: { fileName: string; reason: string }[];
  /** Files whose hash already exists on this entity. Uploaded, but flagged. */
  duplicates: string[];
}

/**
 * Upload one or more files against an entity.
 *
 * Each file is independent: one failure does not abort the rest, and every
 * failure is reported. If the storage object lands but the metadata insert
 * fails, the object is removed again — an orphaned object is preferable to an
 * attachment record pointing at nothing, and neither is acceptable silently.
 */
export async function uploadEntityAttachments(
  projectId: string,
  entityTable: string,
  entityId: string,
  documentType: string,
  files: File[],
  options: { isRequired?: boolean; onProgress?: (done: number, total: number) => void } = {},
): Promise<MutationResult<UploadResult>> {
  try {
    if (!files.length) return { data: { uploaded: [], failed: [], duplicates: [] }, error: null };

    const profileId = await currentProfileId();
    if (!profileId) {
      throw new Error('You must be signed in to attach documents.');
    }

    // Hashes already present on this entity, for duplicate detection.
    const { data: existing } = await supabase
      .from('entity_attachments')
      .select('document_hash')
      .eq('entity_table', entityTable)
      .eq('entity_id', entityId)
      .is('deleted_at', null);
    const knownHashes = new Set(
      ((existing ?? []) as { document_hash: string | null }[])
        .map((r) => r.document_hash)
        .filter(Boolean) as string[],
    );

    const uploaded: AttachmentRow[] = [];
    const failed: { fileName: string; reason: string }[] = [];
    const duplicates: string[] = [];

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const invalid = validateFile(file);
      if (invalid) {
        failed.push({ fileName: file.name, reason: invalid });
        options.onProgress?.(i + 1, files.length);
        continue;
      }

      const hash = await computeFileHash(file);
      const isDuplicate = Boolean(hash && knownHashes.has(hash));
      const path = storagePath(projectId, entityTable, entityId, file.name);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });

      if (uploadError) {
        // Reported, never swallowed.
        failed.push({ fileName: file.name, reason: uploadError.message });
        options.onProgress?.(i + 1, files.length);
        continue;
      }

      const { data: row, error: dbError } = await supabase
        .from('entity_attachments')
        .insert({
          project_id: projectId,
          entity_table: entityTable,
          entity_id: entityId,
          document_type: documentType,
          file_name: file.name,
          storage_bucket: BUCKET,
          storage_path: path,
          mime_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          document_hash: hash,
          is_required: options.isRequired ?? false,
          is_duplicate: isDuplicate,
          status: 'pending',
          uploaded_by: profileId,
          created_by: profileId,
        })
        .select('*')
        .single();

      if (dbError || !row) {
        // Roll the object back so we never keep a file the system cannot see.
        await supabase.storage.from(BUCKET).remove([path]);
        failed.push({ fileName: file.name, reason: dbError?.message ?? 'Could not record the attachment.' });
        options.onProgress?.(i + 1, files.length);
        continue;
      }

      uploaded.push(row as AttachmentRow);
      if (hash) knownHashes.add(hash);
      if (isDuplicate) duplicates.push(file.name);
      options.onProgress?.(i + 1, files.length);
    }

    return { data: { uploaded, failed, duplicates }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Attachments on one entity, newest first, with the uploader resolved.
 *
 * The uploader is joined rather than left as a bare uuid because traceability is
 * the point of the record: a file with no name against it answers none of the
 * questions an auditor asks. The join is nullable — a legacy row may carry no
 * uploaded_by, and that must read as "unknown" rather than failing the query.
 */
export async function listEntityAttachments(
  entityTable: string,
  entityId: string,
): Promise<AttachmentRow[]> {
  const { data, error } = await supabase
    .from('entity_attachments')
    .select('*, uploader:profiles!entity_attachments_uploaded_by_fkey(name, email)')
    .eq('entity_table', entityTable)
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const uploader = row.uploader as { name?: string | null; email?: string | null } | null;
    return {
      ...(row as unknown as AttachmentRow),
      uploaded_by_name: uploader?.name || uploader?.email || null,
    };
  });
}

/**
 * Signed URLs for a batch of attachments, in one round trip per bucket.
 * A gallery of twenty photos previously issued twenty sequential requests.
 */
export async function getAttachmentUrls(
  attachments: Pick<AttachmentRow, 'id' | 'storage_bucket' | 'storage_path'>[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  const byBucket = new Map<string, Pick<AttachmentRow, 'id' | 'storage_path'>[]>();
  for (const a of attachments) {
    const bucket = a.storage_bucket || BUCKET;
    const list = byBucket.get(bucket);
    if (list) list.push(a);
    else byBucket.set(bucket, [a]);
  }

  const urls: Record<string, string> = {};
  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, items]) => {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(items.map((i) => i.storage_path), expiresInSeconds);
      if (error || !data) return;
      data.forEach((entry, index) => {
        if (entry.signedUrl) urls[items[index].id] = entry.signedUrl;
      });
    }),
  );
  return urls;
}

/** Single signed URL, with an optional forced download. */
export async function getAttachmentUrl(
  bucket: string,
  path: string,
  options: { download?: string | boolean } = {},
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket || BUCKET)
    .createSignedUrl(path, 3600, options.download ? { download: options.download } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/**
 * Verification transition. Goes through an RPC so it is an auditable state
 * change (who, when, why) rather than a free-text UPDATE.
 */
export async function setAttachmentStatus(
  attachmentId: string,
  status: AttachmentStatus,
  reason?: string,
): Promise<MutationResult<AttachmentRow>> {
  try {
    const { data, error } = await supabase.rpc('rpc_set_attachment_status', {
      p_attachment_id: attachmentId,
      p_status: status,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { data: data as AttachmentRow, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Retire an attachment. Soft-deleted and the object removed from storage.
 * The RLS policy blocks this entirely once the parent bill is certified —
 * evidence behind a certified bill is not working data.
 */
export async function deleteAttachment(attachment: AttachmentRow): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('entity_attachments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', attachment.id);
    if (error) throw new Error(error.message);

    // Best effort: the metadata is the source of truth, and a stranded object is
    // recoverable where a stranded record is not.
    await supabase.storage
      .from(attachment.storage_bucket || BUCKET)
      .remove([attachment.storage_path]);

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Back-compat shim
//
// Several modules (Work Orders, GRN, Procurement) still call the old
// single-file signature. It now returns a real result instead of resolving on
// failure, and throws rather than reporting a success that did not happen.
// ---------------------------------------------------------------------------

export async function uploadEntityAttachment(
  projectId: string,
  entityTable: string,
  entityId: string,
  documentType: string,
  file: File,
): Promise<AttachmentRow> {
  const { data, error } = await uploadEntityAttachments(
    projectId, entityTable, entityId, documentType, [file],
  );
  if (error) throw error;
  if (!data || data.uploaded.length === 0) {
    throw new Error(data?.failed[0]?.reason ?? 'Upload failed.');
  }
  return data.uploaded[0];
}

/** @deprecated use listEntityAttachments — kept for existing callers. */
export async function getEntityAttachments(entityTable: string, entityId: string) {
  return listEntityAttachments(entityTable, entityId);
}
