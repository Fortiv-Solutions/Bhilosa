'use client';

// ============================================================================
// BILL DETAILS DRAWER
// File: frontend/src/components/budget/bill-detail-drawer.tsx
//
// Everything about one bill, for either spine. The Bill-Wise Ledger table keeps
// eleven columns; the other thirty live here.
//
// The section that earns the drawer is BUDGET IMPACT: the actual budget_ledger
// rows this bill posted, reversals included. It lets a user answer "why did
// available budget move by this much" without leaving the screen, which is what
// makes the ledger trustable rather than merely presentable.
//
// Settlement editing lives here rather than in the table, because amending a
// certified bill triggers a reverse-and-repost in the database. That is a
// document operation, not a spreadsheet cell.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Receipt,
  Trash2,
  Upload,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  fetchBillDetail,
  updateBillSettlement,
  type BillDetail,
  type BillSource,
} from '@/lib/supabase-budget';
import {
  BILL_DOCUMENT_TYPES,
  deleteAttachment,
  getAttachmentUrl,
  getAttachmentUrls,
  listEntityAttachments,
  setAttachmentStatus,
  uploadEntityAttachments,
  type AttachmentRow,
} from '@/lib/documents';
import { formatIndianCurrency } from '@/utils/format-currency';

type Props = {
  billSource: BillSource;
  billId: string;
  canEditSettlement: boolean;
  onClose: () => void;
  onChanged: () => void;
};

const LEDGER_LABELS: Record<string, string> = {
  commitment: 'Commitment',
  release: 'Commitment released',
  actual: 'Cost (gross certified)',
  retention_held: 'Retention withheld',
  retention_released: 'Retention released',
  advance_paid: 'Advance paid',
  advance_recovered: 'Advance recovered',
  allocation: 'Allocation',
  adjustment: 'Adjustment',
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function s(value: unknown): string {
  return value == null ? '' : String(value);
}

function dmy(value: unknown): string {
  const raw = s(value);
  if (!raw) return '—';
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function BillDetailDrawer({ billSource, billId, canEditSettlement, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<BillDetail | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const entityTable = billSource === 'service' ? 'service_bills' : 'vendor_bills';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, files] = await Promise.all([
        fetchBillDetail(billSource, billId),
        listEntityAttachments(entityTable, billId).catch(() => [] as AttachmentRow[]),
      ]);
      setDetail(data);
      setAttachments(files);
      // Batch-sign: a gallery of twenty photos used to issue twenty requests.
      if (files.length) setPreviewUrls(await getAttachmentUrls(files));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this bill.');
    } finally {
      setLoading(false);
    }
  }, [billSource, billId, entityTable]);

  useEffect(() => {
    void load();
  }, [load]);

  // Escape closes, and the page behind must not scroll under the drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const header = detail?.header ?? {};
  const isCertified = ['approved', 'paid'].includes(s(header.status));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-3xl flex-col bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* ① Header */}
        <div className="flex items-start justify-between border-b border-border p-4">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-bold">{s(header.bill_number) || 'Bill'}</h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                  billSource === 'service'
                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                    : 'border-sky-200 bg-sky-50 text-sky-700'
                }`}
              >
                {billSource === 'service' ? 'Service' : 'Material'}
              </span>
              {Boolean(header.ra_sequence) && (
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold">
                  RA-{s(header.ra_sequence)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {s(header.vendor_name) || 'Unknown vendor'} · {dmy(header.bill_date)}
              {header.supplier_bill_no ? ` · their ref ${s(header.supplier_bill_no)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading bill…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && !detail && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              This bill no longer exists, or has been retired.
            </div>
          )}

          {detail && (
            <>
              {/* ② Classification */}
              <Section title="Budget Classification" icon={Wallet}>
                <Grid>
                  <Field label="Budget Head" value={s(header.category_name) || s(header.allocation_name) || 'Unallocated'} />
                  <Field label="Master Budget Line" value={s(header.master_budget_item) || 'Not linked'} />
                  <Field label="Project" value={s(header.project_id) ? undefined : undefined} hidden />
                  <Field
                    label={billSource === 'service' ? 'Work Order' : 'Purchase Order'}
                    value={s(header.work_order_number) || s(header.po_number) || '—'}
                  />
                </Grid>
              </Section>

              {/* ③ Line items */}
              <Section title={`Line Items (${detail.lines.length})`} icon={FileText}>
                {detail.lines.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Header-only bill — no measured lines were recorded.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-[11px]">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="pb-1.5">Description</th>
                          <th className="pb-1.5">Unit</th>
                          {billSource === 'service' && <th className="pb-1.5 text-right">Cumulative</th>}
                          {billSource === 'service' && <th className="pb-1.5 text-right">Previous</th>}
                          <th className="pb-1.5 text-right">Qty</th>
                          <th className="pb-1.5 text-right">Rate</th>
                          <th className="pb-1.5 text-right">GST %</th>
                          <th className="pb-1.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line, index) => (
                          <tr key={s(line.id) || index} className="border-b border-border/40">
                            <td className="py-1.5">{s(line.description)}</td>
                            <td className="py-1.5 text-muted-foreground">{s(line.unit) || '—'}</td>
                            {billSource === 'service' && (
                              <td className="py-1.5 text-right text-muted-foreground">
                                {n(line.cumulative_quantity).toLocaleString('en-IN')}
                              </td>
                            )}
                            {billSource === 'service' && (
                              <td className="py-1.5 text-right text-muted-foreground">
                                {n(line.previous_quantity).toLocaleString('en-IN')}
                              </td>
                            )}
                            <td className="py-1.5 text-right font-semibold">
                              {n(line.quantity).toLocaleString('en-IN')}
                            </td>
                            <td className="py-1.5 text-right">{formatIndianCurrency(n(line.rate))}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{n(line.tax_rate)}</td>
                            <td className="py-1.5 text-right font-bold">
                              {formatIndianCurrency(n(line.line_total))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>

              {/* ④ Commercials */}
              <CommercialsSection
                header={header}
                billSource={billSource}
                billId={billId}
                editable={canEditSettlement}
                isCertified={isCertified}
                onSaved={() => {
                  void load();
                  onChanged();
                }}
              />

              {/* ⑤ Traceability */}
              <Section title="Traceability" icon={CheckCircle2}>
                {billSource === 'material' ? (
                  <Chain
                    steps={[
                      { label: 'PR', value: s(header.pr_number) },
                      { label: 'PO', value: s(header.po_number) },
                      { label: 'GRN', value: s(header.grn_number) },
                      { label: 'Bill', value: s(header.bill_number) },
                    ]}
                    note={
                      header.match_status
                        ? `Three-way match: ${s(header.match_status)}`
                        : 'No three-way match recorded.'
                    }
                  />
                ) : (
                  <Chain
                    steps={[
                      { label: 'Work Order', value: s(header.work_order_number) },
                      { label: 'QC', value: s(header.qc_status) },
                      { label: 'RA Bill', value: s(header.bill_number) },
                    ]}
                    note={
                      header.wo_total_amount
                        ? `WO value ${formatIndianCurrency(n(header.wo_total_amount))} · certified to date ${formatIndianCurrency(n(header.wo_billed_to_date))}`
                        : undefined
                    }
                  />
                )}
              </Section>

              {/* ⑥ Budget impact — the drill-through */}
              <Section title="Budget Impact" icon={Wallet}>
                {detail.ledger.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This bill has not posted to the budget ledger. That happens on certification, and only when a
                    budget head can be resolved.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detail.ledger.map((row) => (
                      <div
                        key={row.id}
                        className={`flex items-center justify-between rounded-md border px-2.5 py-1.5 text-[11px] ${
                          row.is_reversal
                            ? 'border-dashed border-border bg-muted/30 text-muted-foreground'
                            : 'border-border bg-background'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-semibold">
                            {LEDGER_LABELS[row.transaction_type] ?? row.transaction_type}
                          </span>
                          {row.is_reversal && <span className="ml-1.5 text-[10px] uppercase">reversal</span>}
                          {row.revision_seq > 0 && (
                            <span className="ml-1.5 text-[10px]">rev {row.revision_seq}</span>
                          )}
                          <div className="truncate text-[10px] text-muted-foreground">
                            {row.allocation_name ?? 'Unallocated'} · {dmy(row.document_date ?? row.posted_at)}
                          </div>
                        </div>
                        <span className={`shrink-0 font-bold ${row.amount < 0 ? 'text-red-600' : ''}`}>
                          {row.amount < 0 ? '−' : ''}
                          {formatIndianCurrency(Math.abs(row.amount))}
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-[10px] text-muted-foreground">
                      Cost is recorded at the <strong>gross</strong> certified value. Retention is a payment
                      withholding tracked separately — it never reduces project cost.
                    </p>
                  </div>
                )}
              </Section>

              {/* ⑦ Payments + retention releases */}
              <Section title="Payments & Retention" icon={Receipt}>
                {detail.payments.length === 0 && detail.retentionReleases.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing paid or released yet.</p>
                ) : (
                  <div className="space-y-1.5 text-[11px]">
                    {detail.payments.map((p, i) => (
                      <Row
                        key={s(p.id) || `p${i}`}
                        left={`Payment ${s(p.payment_reference)}`}
                        sub={`${dmy(p.payment_date)} · ${s(p.payment_mode) || 'mode not recorded'} · ${s(p.status)}`}
                        right={formatIndianCurrency(n(p.amount))}
                      />
                    ))}
                    {detail.retentionReleases.map((r, i) => (
                      <Row
                        key={s(r.id) || `r${i}`}
                        left={`Retention release ${s(r.release_number)}`}
                        sub={`${dmy(r.release_date)} · ${s(r.status)}`}
                        right={formatIndianCurrency(n(r.amount))}
                      />
                    ))}
                  </div>
                )}
              </Section>

              {/* ⑧ Documents */}
              <DocumentsSection
                projectId={s(header.project_id)}
                entityTable={entityTable}
                entityId={billId}
                attachments={attachments}
                previewUrls={previewUrls}
                canManage={canEditSettlement}
                isCertified={isCertified}
                onChanged={() => void load()}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commercials — the only editable part of the drawer.
// ---------------------------------------------------------------------------

function CommercialsSection({
  header,
  billSource,
  billId,
  editable,
  isCertified,
  onSaved,
}: {
  header: Record<string, unknown>;
  billSource: BillSource;
  billId: string;
  editable: boolean;
  isCertified: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [retentionPercent, setRetentionPercent] = useState(n(header.retention_percent));
  const [retentionAmount, setRetentionAmount] = useState(n(header.retention_amount));
  const [advance, setAdvance] = useState(n(header.advance_adjusted));
  const [other, setOther] = useState(n(header.other_deductions));

  useEffect(() => {
    setRetentionPercent(n(header.retention_percent));
    setRetentionAmount(n(header.retention_amount));
    setAdvance(n(header.advance_adjusted));
    setOther(n(header.other_deductions));
  }, [header]);

  const gross = n(header.total_amount);
  const net = Math.max(0, gross - retentionAmount - advance - other);

  async function save() {
    setSaving(true);
    setSaveError(null);
    const { error } = await updateBillSettlement(billSource, billId, {
      retention_percent: retentionPercent,
      retention_amount: retentionAmount,
      advance_adjusted: advance,
      other_deductions: other,
    })
      .then(() => ({ error: null as Error | null }))
      .catch((err: unknown) => ({ error: err instanceof Error ? err : new Error(String(err)) }));
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <Section title="Commercials" icon={Wallet}>
      <div className="space-y-2 text-[11px]">
        <Row left="Subtotal (ex-GST)" right={formatIndianCurrency(n(header.subtotal_amount))} />
        <Row left="GST" right={formatIndianCurrency(n(header.tax_amount))} />
        <Row left="Gross certified" right={formatIndianCurrency(gross)} strong />

        {editing ? (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-4">
            <NumberField label="Retention %" value={retentionPercent} onChange={setRetentionPercent} />
            <NumberField label="Retention ₹" value={retentionAmount} onChange={setRetentionAmount} />
            <NumberField label="Advance recovered" value={advance} onChange={setAdvance} />
            <NumberField label="Other deductions" value={other} onChange={setOther} />
          </div>
        ) : (
          <>
            <Row left={`Retention (${n(header.retention_percent)}%)`} right={`− ${formatIndianCurrency(retentionAmount)}`} />
            <Row left="Advance recovered" right={`− ${formatIndianCurrency(advance)}`} />
            <Row left="Other deductions" right={`− ${formatIndianCurrency(other)}`} />
          </>
        )}

        <Row left="Net payable" right={formatIndianCurrency(net)} strong />

        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-700">{saveError}</div>
        )}

        {editable && (
          <div className="flex items-center gap-2 pt-1">
            {editing ? (
              <>
                <button
                  onClick={save}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-md border border-border px-3 py-1.5 font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="rounded-md border border-border px-3 py-1.5 font-semibold hover:bg-muted"
              >
                Amend settlement
              </button>
            )}
          </div>
        )}

        {editable && isCertified && (
          <p className="flex items-start gap-1.5 pt-1 text-[10px] text-amber-700">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            This bill is certified. Amending it reverses its budget ledger entries and re-posts them — the change
            is recorded, never overwritten.
          </p>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function DocumentsSection({
  projectId,
  entityTable,
  entityId,
  attachments,
  previewUrls,
  canManage,
  isCertified,
  onChanged,
}: {
  projectId: string;
  entityTable: string;
  entityId: string;
  attachments: AttachmentRow[];
  previewUrls: Record<string, string>;
  canManage: boolean;
  isCertified: boolean;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [docType, setDocType] = useState<string>(BILL_DOCUMENT_TYPES[0].value);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const images = useMemo(() => attachments.filter((a) => a.mime_type?.startsWith('image/')), [attachments]);
  const docs = useMemo(() => attachments.filter((a) => !a.mime_type?.startsWith('image/')), [attachments]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMessage(null);
    setProgress({ done: 0, total: files.length });

    const { data, error } = await uploadEntityAttachments(
      projectId, entityTable, entityId, docType, Array.from(files),
      { onProgress: (done, total) => setProgress({ done, total }) },
    );

    setUploading(false);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';

    if (error) {
      setMessage({ tone: 'error', text: error.message });
      return;
    }
    if (data) {
      const parts: string[] = [];
      if (data.uploaded.length) parts.push(`${data.uploaded.length} uploaded`);
      if (data.duplicates.length) parts.push(`${data.duplicates.length} already attached (flagged)`);
      if (data.failed.length) {
        parts.push(`${data.failed.length} failed: ${data.failed.map((f) => f.reason).join('; ')}`);
      }
      setMessage({
        tone: data.failed.length ? 'error' : data.duplicates.length ? 'warn' : 'ok',
        text: parts.join(' · '),
      });
    }
    onChanged();
  }

  async function verify(a: AttachmentRow, status: 'approved' | 'rejected') {
    const reason = status === 'rejected' ? window.prompt('Why is this document rejected?') : undefined;
    if (status === 'rejected' && !reason?.trim()) return;
    const { error } = await setAttachmentStatus(a.id, status, reason ?? undefined);
    if (error) setMessage({ tone: 'error', text: error.message });
    onChanged();
  }

  async function remove(a: AttachmentRow) {
    if (!window.confirm(`Remove "${a.file_name}"?`)) return;
    const { error } = await deleteAttachment(a);
    if (error) setMessage({ tone: 'error', text: error.message });
    onChanged();
  }

  return (
    <Section title={`Documents (${attachments.length})`} icon={Paperclip}>
      {canManage && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Document type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {BILL_DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs font-semibold hover:bg-muted">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading && progress ? `Uploading ${progress.done}/${progress.total}…` : 'Add PDFs or photos'}
            <input
              ref={fileInput}
              type="file"
              multiple
              accept=".pdf,image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </label>
          <span className="text-[10px] text-muted-foreground">PDF or image, up to 25 MB each</span>
        </div>
      )}

      {message && (
        <div
          className={`mb-3 rounded-md border p-2 text-[11px] ${
            message.tone === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : message.tone === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents attached yet.</p>
      ) : (
        <div className="space-y-3">
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => previewUrls[a.id] && setLightbox(previewUrls[a.id])}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border"
                  title={a.file_name}
                >
                  {previewUrls[a.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrls[a.id]} alt={a.file_name} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="m-auto h-6 w-6 text-muted-foreground" />
                  )}
                  <StatusDot status={a.status} />
                </button>
              ))}
            </div>
          )}

          <ul className="space-y-1.5">
            {docs.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[11px]">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold">{a.file_name}</span>
                    <StatusPill status={a.status} />
                    {a.is_duplicate && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-bold uppercase text-amber-700">
                        duplicate
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {(a.document_type || 'document').replaceAll('_', ' ')}
                    {a.size_bytes ? ` · ${(a.size_bytes / 1024 / 1024).toFixed(2)} MB` : ''}
                    {a.rejection_reason ? ` · ${a.rejection_reason}` : ''}
                  </div>
                </div>
                <AttachmentActions
                  attachment={a}
                  previewUrl={previewUrls[a.id]}
                  canManage={canManage}
                  isCertified={isCertified}
                  onVerify={verify}
                  onRemove={remove}
                />
              </li>
            ))}
          </ul>

          {images.length > 0 && canManage && (
            <ul className="space-y-1.5">
              {images.map((a) => (
                <li key={`row-${a.id}`} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[11px]">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{a.file_name}</span>
                      <StatusPill status={a.status} />
                    </div>
                  </div>
                  <AttachmentActions
                    attachment={a}
                    previewUrl={previewUrls[a.id]}
                    canManage={canManage}
                    isCertified={isCertified}
                    onVerify={verify}
                    onRemove={remove}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Attachment preview" className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </Section>
  );
}

function AttachmentActions({
  attachment,
  previewUrl,
  canManage,
  isCertified,
  onVerify,
  onRemove,
}: {
  attachment: AttachmentRow;
  previewUrl?: string;
  canManage: boolean;
  isCertified: boolean;
  onVerify: (a: AttachmentRow, status: 'approved' | 'rejected') => void;
  onRemove: (a: AttachmentRow) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {previewUrl && (
        <a href={previewUrl} target="_blank" rel="noreferrer" className="p-1 text-muted-foreground hover:text-foreground" title="Preview">
          <FileText className="h-3.5 w-3.5" />
        </a>
      )}
      <button
        type="button"
        title="Download"
        onClick={async () => {
          const url = await getAttachmentUrl(attachment.storage_bucket, attachment.storage_path, {
            download: attachment.file_name,
          });
          window.open(url, '_blank');
        }}
        className="p-1 text-muted-foreground hover:text-foreground"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {canManage && attachment.status !== 'approved' && (
        <button type="button" title="Mark verified" onClick={() => onVerify(attachment, 'approved')}
          className="p-1 text-emerald-600 hover:text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </button>
      )}
      {canManage && attachment.status !== 'rejected' && (
        <button type="button" title="Reject" onClick={() => onVerify(attachment, 'rejected')}
          className="p-1 text-red-500 hover:text-red-700">
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}
      {canManage && !isCertified && (
        <button type="button" title="Remove" onClick={() => onRemove(attachment)}
          className="p-1 text-red-500 hover:text-red-700">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Wallet;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background p-3">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">{children}</dl>;
}

function Field({ label, value, hidden }: { label: string; value?: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value || '—'}</dd>
    </div>
  );
}

function Row({ left, sub, right, strong }: { left: string; sub?: string; right: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className={strong ? 'font-bold' : ''}>{left}</span>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
      <span className={`shrink-0 ${strong ? 'font-bold' : ''}`}>{right}</span>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase text-muted-foreground">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-right font-mono text-[11px]"
      />
    </div>
  );
}

function Chain({ steps, note }: { steps: { label: string; value: string }[]; note?: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <div
              className={`rounded-md border px-2 py-1 ${
                step.value ? 'border-border bg-background' : 'border-dashed border-border text-muted-foreground'
              }`}
            >
              <span className="text-[9px] font-bold uppercase text-muted-foreground">{step.label}</span>
              <div className="font-semibold">{step.value || '—'}</div>
            </div>
            {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
          </React.Fragment>
        ))}
      </div>
      {note && <p className="mt-2 text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'approved'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'rejected'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className={`rounded-full border px-1.5 py-px text-[9px] font-bold uppercase ${cls}`}>
      {status === 'approved' ? 'verified' : status}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'approved' ? 'bg-emerald-500' : status === 'rejected' ? 'bg-red-500' : 'bg-amber-500';
  return <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-white ${cls}`} />;
}
