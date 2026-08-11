'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — SERVICE BILL DETAIL DRAWER & ATTACHMENT MANAGER
// File: frontend/src/components/service-bills/service-bill-detail-drawer.tsx
//
// Displays full Service Bill details, line items breakdown, linked Work Order
// context, inherited Work Order attachments, and direct Service Bill file
// management (uploading multiple PDFs, photos, and Excel sheets).
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  Paperclip,
  Upload,
  Image as ImageIcon,
  FileSpreadsheet,
  ExternalLink,
  Loader2,
  Wrench,
  User,
  ShieldCheck,
  Calendar,
  Building,
  DollarSign,
  Eye,
  Plus,
} from 'lucide-react';
import {
  getServiceBill,
  setServiceBillStatus,
  type ServiceBillRow,
  type ServiceBillStatus,
} from '@/lib/service-bills';
import {
  deleteAttachment,
  getAttachmentUrl,
  getAttachmentUrls,
  listEntityAttachments,
  uploadEntityAttachments,
  type AttachmentRow,
} from '@/lib/documents';
import { formatIndianCurrency } from '@/utils/format-currency';
import { StatusActionBar, type StatusAction } from '@/components/work-orders/status-action-bar';
import {
  SERVICE_BILL_ACTION_LABELS,
  SERVICE_BILL_STATUS_LABELS,
  canonicalServiceBillStatus,
  nextServiceBillStatuses,
  serviceBillNeedsReason,
} from '@/lib/erp/work-order/status';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { serviceBillCertificationBlockedReason } from '@/lib/work-order-permissions';

export const SERVICE_BILL_DOC_TYPES = [
  { value: 'ra_bill_sheet', label: 'RA Bill Sheet' },
  { value: 'measurement_sheet', label: 'Measurement Sheet' },
  { value: 'vendor_invoice', label: 'Vendor Invoice / Bill' },
  { value: 'site_photo', label: 'Site Photo / Evidence' },
  { value: 'quality_certificate', label: 'Quality Certificate' },
  { value: 'other', label: 'Other Document' },
];

export type ServiceBillDetailDrawerProps = {
  billId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
  onOpenCertificate?: (billId: string) => void;
  permissions: WorkOrderPermissions;
  currentProfileId?: string | null;
};

export function ServiceBillDetailDrawer({
  billId,
  isOpen,
  onClose,
  onChanged,
  onOpenCertificate,
  permissions,
  currentProfileId,
}: ServiceBillDetailDrawerProps) {
  const [bill, setBill] = useState<ServiceBillRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);

  // Attachments state
  const [billAttachments, setBillAttachments] = useState<AttachmentRow[]>([]);
  const [woAttachments, setWoAttachments] = useState<AttachmentRow[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  
  // Upload state
  const [docType, setDocType] = useState<string>(SERVICE_BILL_DOC_TYPES[0].value);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getServiceBill(billId);
      setBill(data);

      if (data) {
        // Load direct Service Bill attachments
        const bFiles = await listEntityAttachments('service_bills', data.id).catch(() => []);
        setBillAttachments(bFiles);

        // Load inherited Work Order attachments
        if (data.work_order_id) {
          const woFiles = await listEntityAttachments('work_orders', data.work_order_id).catch(() => []);
          setWoAttachments(woFiles);
        } else {
          setWoAttachments([]);
        }

        // Pre-fetch signed URLs for images/previews
        const allFiles = [...bFiles];
        if (allFiles.length > 0) {
          const urls = await getAttachmentUrls(allFiles).catch(() => ({}));
          setPreviewUrls(urls);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bill details.');
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useEffect(() => {
    if (isOpen && billId) {
      void loadData();
    } else {
      setBill(null);
      setBillAttachments([]);
      setWoAttachments([]);
      setSelectedFiles([]);
      setUploadMsg(null);
    }
  }, [isOpen, billId, loadData]);

  // Handle multi-file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
      setUploadMsg(null);
    }
  };

  // Upload files handler
  const handleUploadFiles = async () => {
    if (!bill || selectedFiles.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    setUploadProgress({ done: 0, total: selectedFiles.length });

    try {
      const result = await uploadEntityAttachments(
        bill.project_id,
        'service_bills',
        bill.id,
        docType,
        selectedFiles,
        {
          onProgress: (done, total) => setUploadProgress({ done, total }),
        },
      );

      if (result.error) {
        setUploadMsg({ tone: 'error', text: result.error.message });
      } else if (result.data) {
        const parts: string[] = [];
        if (result.data.uploaded.length) parts.push(`${result.data.uploaded.length} file(s) uploaded`);
        if (result.data.duplicates.length) parts.push(`${result.data.duplicates.length} duplicate file(s) skipped`);
        if (result.data.failed.length) parts.push(`${result.data.failed.length} failed`);

        setUploadMsg({
          tone: result.data.failed.length ? 'error' : result.data.duplicates.length ? 'warn' : 'ok',
          text: parts.join(' · '),
        });

        setSelectedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadData();
        onChanged?.();
      }
    } catch (err) {
      setUploadMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // Delete attachment handler
  const handleDeleteAttachment = async (attachment: AttachmentRow) => {
    if (!window.confirm(`Are you sure you want to delete "${attachment.file_name}"?`)) return;
    const { error: err } = await deleteAttachment(attachment);
    if (err) {
      alert(`Delete failed: ${err.message}`);
    } else {
      await loadData();
      onChanged?.();
    }
  };

  // View attachment handler (opens inline in lightbox or new browser tab)
  const handleView = async (attachment: AttachmentRow) => {
    try {
      const isImage = attachment.mime_type?.startsWith('image/');
      const url = await getAttachmentUrl(attachment.storage_bucket, attachment.storage_path);
      if (isImage) {
        setLightboxUrl(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      alert(`Failed to view file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Download attachment handler (forces file download prompt)
  const handleDownload = async (attachment: AttachmentRow) => {
    try {
      const url = await getAttachmentUrl(attachment.storage_bucket, attachment.storage_path, {
        download: attachment.file_name,
      });
      window.open(url, '_blank');
    } catch (err) {
      alert(`Failed to download: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Workflow transition
  const handleTransition = async (next: ServiceBillStatus, reason?: string) => {
    if (!billId) return;
    setActioning(true);
    setError(null);
    const res = await setServiceBillStatus(billId, next, reason);
    setActioning(false);
    if (res.error) {
      setError(res.error.message);
    } else {
      await loadData();
      onChanged?.();
    }
  };

  const actionList = useMemo((): StatusAction<ServiceBillStatus>[] => {
    if (!bill) return [];
    const canApprove = permissions.canCertifyServiceBill || permissions.canRejectServiceBill;
    const sodReason = serviceBillCertificationBlockedReason(bill, currentProfileId);

    const orderMap: Record<string, number> = {
      approved: 1, // Certify
      rejected: 2, // Reject
      submitted: 3, // Submit
      verified: 4, // Verify
      draft: 5,
    };

    const list = nextServiceBillStatuses(bill.status, canApprove)
      .filter((next) => {
        if (next === 'verified') return permissions.canVerifyServiceBill;
        if (next === 'approved') return permissions.canCertifyServiceBill;
        if (next === 'rejected') return permissions.canRejectServiceBill;
        return true;
      })
      .map((next) => ({
        status: next,
        label: SERVICE_BILL_ACTION_LABELS[next],
        needsReason: serviceBillNeedsReason(next),
        tone: (next === 'rejected' ? 'danger' : next === 'approved' ? 'primary' : 'neutral') as 'danger' | 'primary' | 'neutral',
        disabledReason: next === 'approved' ? sodReason : null,
      }));

    return list.sort((a, b) => (orderMap[a.status] ?? 99) - (orderMap[b.status] ?? 99));
  }, [bill, permissions, currentProfileId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-4xl bg-card border-l border-border shadow-2xl flex flex-col min-h-0">
          
          {/* Drawer Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold font-heading text-foreground">
                    {bill?.bill_number || 'Service Bill Details'}
                  </h2>
                  {bill?.ra_sequence != null && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary border border-primary/20">
                      RA-{bill.ra_sequence}
                    </span>
                  )}
                  {bill?.status && (
                    <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-semibold uppercase text-muted-foreground">
                      {SERVICE_BILL_STATUS_LABELS[canonicalServiceBillStatus(bill.status) ?? 'draft'] || bill.status}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {bill?.supplier_bill_no ? `Supplier Bill: ${bill.supplier_bill_no} · ` : ''}
                  Bill Date: {bill?.bill_date || '-'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onOpenCertificate && billId && (
                <button
                  type="button"
                  onClick={() => onOpenCertificate(billId)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Certificate
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Action Bar Header */}
          {bill && actionList.length > 0 && (
            <div className="px-6 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">Workflow Actions:</span>
              <StatusActionBar<ServiceBillStatus>
                size="sm"
                busy={actioning}
                actions={actionList}
                onAction={(next, reason) => handleTransition(next, reason)}
              />
            </div>
          )}

          {/* Drawer Body - Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading && (
              <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading service bill details...
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
                {error}
              </div>
            )}

            {!loading && bill && (
              <>
                {/* Financial Summary Cockpit */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Gross Bill Total</p>
                    <p className="text-base font-bold tabular-nums text-foreground mt-0.5">
                      {formatIndianCurrency(Number(bill.total_amount || 0))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Retention Deduction</p>
                    <p className="text-base font-bold tabular-nums text-amber-600 dark:text-amber-400 mt-0.5">
                      {Number(bill.retention_amount || 0) > 0
                        ? `−${formatIndianCurrency(Number(bill.retention_amount))}`
                        : '−'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 shadow-sm">
                    <p className="text-[10px] font-extrabold uppercase text-primary">Net Payable Amount</p>
                    <p className="text-base font-black tabular-nums text-primary mt-0.5">
                      {formatIndianCurrency(Number(bill.net_payable_amount || bill.total_amount || 0))}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <p className="text-[10px] font-extrabold uppercase text-muted-foreground">Tax Amount (GST)</p>
                    <p className="text-base font-bold tabular-nums text-foreground mt-0.5">
                      {formatIndianCurrency(Number(bill.tax_amount || 0))}
                    </p>
                  </div>
                </div>

                {/* Contract & Vendor Information Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Vendor Card */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <Building className="h-4 w-4 text-primary" />
                      <span>Vendor / Contractor</span>
                    </div>
                    <p className="text-sm font-extrabold text-foreground">
                      {bill.vendors?.display_name || bill.vendors?.legal_name || 'Vendor Record'}
                    </p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {bill.vendors?.legal_name && <p>Legal: {bill.vendors.legal_name}</p>}
                    </div>
                  </div>

                  {/* Work Order Card */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                      <FileText className="h-4 w-4 text-primary" />
                      <span>Work Order Link</span>
                    </div>
                    <p className="text-sm font-extrabold text-foreground">
                      {bill.work_orders?.work_order_number || 'Direct Service Bill'}
                    </p>
                    {bill.work_orders && (
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <p>Total Contract: {formatIndianCurrency(Number(bill.work_orders.total_amount || 0))}</p>
                        <p>Remaining: {formatIndianCurrency(Number(bill.work_orders.remaining_balance || 0))}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Scope & Line Items Breakdown */}
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                      Bill Items Breakdown ({bill.service_bill_lines?.length || 0})
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="pb-2">Description</th>
                          <th className="pb-2">Unit</th>
                          <th className="pb-2 text-right">This Bill Qty</th>
                          <th className="pb-2 text-right">Prev Qty</th>
                          <th className="pb-2 text-right">Rate</th>
                          <th className="pb-2 text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bill.service_bill_lines || []).map((line) => (
                          <tr key={line.id} className="border-b border-border/50">
                            <td className="py-2.5 font-medium text-foreground">{line.description}</td>
                            <td className="py-2.5 text-muted-foreground">{line.unit || '-'}</td>
                            <td className="py-2.5 text-right font-bold tabular-nums">{line.quantity}</td>
                            <td className="py-2.5 text-right text-muted-foreground tabular-nums">{line.previous_quantity || 0}</td>
                            <td className="py-2.5 text-right tabular-nums">{formatIndianCurrency(Number(line.rate || 0))}</td>
                            <td className="py-2.5 text-right font-bold text-primary tabular-nums">
                              {formatIndianCurrency(Number(line.line_total || 0))}
                            </td>
                          </tr>
                        ))}

                        {(!bill.service_bill_lines || bill.service_bill_lines.length === 0) && (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-muted-foreground">
                              Lump sum bill with no itemized line breakdown.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* MULTI-FILE ATTACHMENT UPLOADER SECTION */}
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-primary" />
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                        Service Bill Documents &amp; Evidence ({billAttachments.length})
                      </h3>
                    </div>
                  </div>

                  {/* Multi-File Upload Form */}
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-foreground whitespace-nowrap">Doc Type:</label>
                        <select
                          value={docType}
                          onChange={(e) => setDocType(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold outline-none"
                        >
                          {SERVICE_BILL_DOC_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="service-bill-multi-file"
                        />
                        <label
                          htmlFor="service-bill-multi-file"
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-semibold hover:bg-muted transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Choose Files (PDF, Photos, Excel)
                        </label>
                        
                        {selectedFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={handleUploadFiles}
                            disabled={uploading}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {uploading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            Upload {selectedFiles.length} File(s)
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedFiles.length > 0 && (
                      <div className="mt-2 space-y-1 bg-card p-2 rounded border border-border">
                        <p className="text-[11px] font-bold text-muted-foreground">Selected for upload:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedFiles.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-[10px] font-semibold text-foreground">
                              {f.name} ({(f.size / 1024).toFixed(0)} KB)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {uploadProgress && (
                      <div className="text-xs text-primary font-bold animate-pulse">
                        Uploading {uploadProgress.done} of {uploadProgress.total} files...
                      </div>
                    )}

                    {uploadMsg && (
                      <div
                        className={`p-2 rounded text-xs font-semibold ${
                          uploadMsg.tone === 'error'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : uploadMsg.tone === 'warn'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {uploadMsg.text}
                      </div>
                    )}
                  </div>

                  {/* Attached Files List */}
                  <div className="space-y-2">
                    {billAttachments.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        No direct attachments uploaded to this Service Bill yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {billAttachments.map((file) => {
                          const isImage = file.mime_type?.startsWith('image/');
                          const isExcel = file.mime_type?.includes('sheet') || file.file_name.endsWith('.xlsx') || file.file_name.endsWith('.csv');
                          const isPdf = file.mime_type?.includes('pdf') || file.file_name.endsWith('.pdf');
                          const previewUrl = previewUrls[file.id];

                          return (
                            <div
                              key={file.id}
                              className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {isImage ? (
                                  previewUrl ? (
                                    <img
                                      src={previewUrl}
                                      alt={file.file_name}
                                      onClick={() => setLightboxUrl(previewUrl)}
                                      className="h-9 w-9 shrink-0 rounded object-cover cursor-pointer border border-border"
                                    />
                                  ) : (
                                    <ImageIcon className="h-8 w-8 shrink-0 text-blue-500" />
                                  )
                                ) : isExcel ? (
                                  <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-600" />
                                ) : (
                                  <FileText className="h-8 w-8 shrink-0 text-red-500" />
                                )}

                                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => handleView(file)}>
                                  <p className="text-xs font-bold text-foreground truncate hover:text-primary transition-colors" title={file.file_name}>
                                    {file.file_name}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {((file.size_bytes || 0) / 1024).toFixed(0)} KB · {file.document_type || 'Document'}
                                    {file.uploaded_by_name ? ` · by ${file.uploaded_by_name}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleView(file)}
                                  className="p-1 text-primary hover:text-primary/80 rounded hover:bg-primary/10"
                                  title="View file online"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownload(file)}
                                  className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                                  title="Download file"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAttachment(file)}
                                  className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-50 dark:hover:bg-red-950/20"
                                  title="Delete attachment"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* INHERITED WORK ORDER ATTACHMENTS SECTION */}
                {woAttachments.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                    <div className="flex items-center gap-2 border-b border-border pb-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                        Inherited Work Order Attachments ({woAttachments.length})
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {woAttachments.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border/70 bg-muted/10"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => handleView(file)}>
                            <FileText className="h-6 w-6 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate hover:text-primary transition-colors">{file.file_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                Work Order Attachment · {((file.size_bytes || 0) / 1024).toFixed(0)} KB
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleView(file)}
                              className="p-1 text-primary hover:text-primary/80 rounded hover:bg-primary/10"
                              title="View document online"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownload(file)}
                              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                              title="Download Work Order document"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-h-full max-w-full">
            <img src={lightboxUrl} alt="Preview" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl" />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-2 right-2 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
