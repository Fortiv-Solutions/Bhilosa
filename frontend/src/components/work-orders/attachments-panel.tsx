'use client';

// ============================================================================
// ATTACHMENTS — supporting documents on a Work Order or Service Bill
//
// Three shapes are accepted because all three are real: scanned documents
// (PDF), site photographs, and the spreadsheets that carry measurement and BOQ
// working. Every Work Order and Payment Certificate in the source corpus is an
// .xlsx, so refusing spreadsheets would refuse the source records themselves.
//
// Every row keeps filename, document type, upload date and uploader, because
// traceability is the point: a file with no name against it answers none of the
// questions an auditor asks. Both View and Download are offered — View opens
// inline for a PDF or photo, Download is the only useful action for a
// spreadsheet.
//
// URLs are short-lived signed links issued on demand, never stored, so a link
// that leaks cannot be replayed indefinitely.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Paperclip,
  Loader2,
  AlertTriangle,
  Download,
  Eye,
  Trash2,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  File as FileIcon,
  Upload,
} from 'lucide-react';
import {
  listEntityAttachments,
  uploadEntityAttachments,
  getAttachmentUrl,
  deleteAttachment,
  attachmentKind,
  ATTACHMENT_ACCEPT,
  WORK_ORDER_DOCUMENT_TYPES,
  type AttachmentRow,
  type AttachmentKind,
} from '@/lib/documents';

type Props = {
  projectId: string;
  entityTable: 'work_orders' | 'service_bills';
  entityId: string;
  /** Uploading is hidden without this; the list stays readable. */
  canUpload?: boolean;
  /** Retiring an attachment is a stronger right than adding one. */
  canDelete?: boolean;
  title?: string;
};

const KIND_ICON: Record<AttachmentKind, typeof FileIcon> = {
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  image: ImageIcon,
  other: FileIcon,
};

const KIND_TONE: Record<AttachmentKind, string> = {
  pdf: 'text-red-600 dark:text-red-400',
  spreadsheet: 'text-emerald-600 dark:text-emerald-400',
  image: 'text-blue-600 dark:text-blue-400',
  other: 'text-muted-foreground',
};

const TYPE_LABEL = new Map<string, string>(
  WORK_ORDER_DOCUMENT_TYPES.map((t) => [t.value, t.label]),
);

function fileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  projectId,
  entityTable,
  entityId,
  canUpload = true,
  canDelete = false,
  title = 'Attachments',
}: Props) {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>(
    WORK_ORDER_DOCUMENT_TYPES[0].value,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listEntityAttachments(entityTable, entityId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [entityTable, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    const { data, error: err } = await uploadEntityAttachments(
      projectId,
      entityTable,
      entityId,
      documentType,
      Array.from(files),
    );

    setBusy(false);
    // The input keeps its value after a selection, so re-picking the same file
    // would not fire onChange again.
    if (inputRef.current) inputRef.current.value = '';

    if (err) {
      setError(err.message);
      return;
    }
    // Partial success is the normal case with a multi-file pick, so both halves
    // are reported rather than only the failure or only the success.
    if (data?.failed.length) {
      setError(
        data.failed.map((f) => `${f.fileName}: ${f.reason}`).join(' · '),
      );
    }
    if (data?.uploaded.length) {
      setNotice(
        `${data.uploaded.length} file${data.uploaded.length > 1 ? 's' : ''} uploaded` +
          (data.duplicates.length
            ? ` — ${data.duplicates.join(', ')} already attached here and ${
                data.duplicates.length > 1 ? 'were' : 'was'
              } flagged as duplicate.`
            : '.'),
      );
    }
    await load();
  }

  async function open(row: AttachmentRow, download: boolean) {
    setError(null);
    try {
      const url = await getAttachmentUrl(row.storage_bucket, row.storage_path, {
        download: download ? row.file_name : false,
      });
      if (download) {
        // An anchor with `download` respects the signed URL's disposition and
        // does not leave a blank tab behind the way window.open does.
        const link = document.createElement('a');
        link.href = url;
        link.rel = 'noopener';
        link.download = row.file_name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the document.');
    }
  }

  async function remove(row: AttachmentRow) {
    setBusy(true);
    setError(null);
    const { error: err } = await deleteAttachment(row);
    setBusy(false);
    if (err) setError(err.message);
    else await load();
  }

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
            <Paperclip className="h-4 w-4 text-primary" /> {title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, spreadsheets and photos. Up to 25 MB per file.
          </p>
        </div>

        {canUpload && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs font-semibold outline-none"
            >
              {WORK_ORDER_DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:bg-muted">
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Add files
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                disabled={busy}
                onChange={(event) => handleFiles(event.target.files)}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="text-xs text-red-800 dark:text-red-300">{error}</div>
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading attachments…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No documents attached yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-[10px] font-bold uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-2">Document</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Uploaded</th>
                <th className="py-2 pr-2">By</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const kind = attachmentKind(row.mime_type, row.file_name);
                const Icon = KIND_ICON[kind];
                return (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="py-2 pr-2">
                      <div className="flex items-start gap-2">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${KIND_TONE[kind]}`} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {row.file_name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {fileSize(row.size_bytes)}
                            {row.is_duplicate && (
                              <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-400">
                                · duplicate of an existing attachment
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {TYPE_LABEL.get(row.document_type ?? '') ?? row.document_type ?? '—'}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {row.uploaded_by_name || 'Unknown'}
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-1">
                        {/* A spreadsheet has nothing to render in a browser tab,
                            so only PDFs and images offer View. */}
                        {kind !== 'spreadsheet' && kind !== 'other' && (
                          <button
                            type="button"
                            onClick={() => open(row, false)}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                          >
                            <Eye className="h-3 w-3" /> View
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => open(row, true)}
                          className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                        >
                          <Download className="h-3 w-3" /> Download
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => remove(row)}
                            disabled={busy}
                            title="Retire this attachment"
                            className="inline-flex items-center rounded border border-red-300 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
