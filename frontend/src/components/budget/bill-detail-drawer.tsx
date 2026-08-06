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
  Building,
  CheckCircle2,
  Coins,
  CreditCard,
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
  getBillVarianceBookings,
  linkBillToBudgetHead,
  saveVarianceReconciliation,
  updateBillSettlement,
  type BillDetail,
  type BillSource,
  type BillVarianceBooking,
} from '@/lib/supabase-budget';
import { useBudgetData } from './budget-data-context';
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
import { formatIndianCurrency, numberToIndianWords } from '@/utils/format-currency';
import { CreateSubCategoryModal } from './create-sub-category-modal';

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
              {header.head_activity ? ` · Activity: ${s(header.head_activity)}` : ''}
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
              {/* ② Classification & Procurement References */}
              <Section
                title={billSource === 'service' ? 'Service Classification & WO References' : 'Budget Classification & References'}
                icon={Wallet}
              >
                <Grid>
                  <Field label="Activity Name" value={s(header.head_activity) || s(header.activity_name) || s(header.category_name) || s(header.allocation_name) || 'Unallocated Activity'} />
                  <Field label="Budget Head" value={s(header.category_name) || s(header.allocation_name) || 'Unallocated'} />
                  <Field label="Master Budget Line" value={s(header.master_budget_item) || 'Not linked'} />
                  <Field
                    label={billSource === 'service' ? 'Work Order' : 'Purchase Order'}
                    value={s(header.work_order_number) || s(header.po_number) || '—'}
                  />
                  <Field
                    label={billSource === 'service' ? "Contractor's Bill No" : 'Supplier Bill No'}
                    value={s(header.supplier_bill_no) || s(header.bill_number) || '—'}
                  />
                  <Field
                    label={billSource === 'service' ? 'RA Bill Date' : 'Supplier Bill Date'}
                    value={dmy(header.supplier_bill_date ?? header.bill_date)}
                  />
                  <Field
                    label={billSource === 'service' ? 'Contractor / Agency Name' : 'Party Name'}
                    value={s(header.party_name) || s(header.vendor_name) || '—'}
                  />
                  <Field label="Company Status" value={s(header.company_status) || 'PARTNERSHIP FIRM'} />
                  <Field label="Project Location" value={s(header.project_location) || 'Vesu'} />
                  {billSource === 'material' && (
                    <Field label="Supplier Location" value={s(header.supplier_location) || 'Local'} />
                  )}
                  {billSource === 'service' && Boolean(header.wo_total_amount) && (
                    <Field label="Work Order Value" value={formatIndianCurrency(n(header.wo_total_amount))} />
                  )}
                  {billSource === 'service' && Boolean(header.wo_billed_to_date) && (
                    <Field label="Certified to Date" value={formatIndianCurrency(n(header.wo_billed_to_date))} />
                  )}
                  {billSource === 'material' && Boolean(header.source_doc_rate ?? header.po_rate) && (
                    <Field label="PO Unit Rate" value={formatIndianCurrency(n(header.source_doc_rate ?? header.po_rate))} />
                  )}
                  {billSource === 'material' && (
                    <Field label="GRN Number" value={s(header.grn_number) || '—'} />
                  )}
                  {billSource === 'material' && (
                    <Field label="Supplier GSTIN" value={s(header.supplier_gst) || '—'} />
                  )}
                  <Field label="Narration / Note" value={s(header.narration) || s(header.ledger_remarks) || '—'} />
                </Grid>
              </Section>

              {/* ③ Financial Summary & Charges */}
              <Section
                title={billSource === 'service' ? 'RA Bill Financial Summary' : 'Financial Summary & Adjustments'}
                icon={Coins}
              >
                <Grid>
                  <Field
                    label={billSource === 'service' ? 'Gross Service Amount' : 'Total Gross Amount'}
                    value={formatIndianCurrency(n(header.gross_bill_amount) || n(header.subtotal_amount) || n(header.total_amount))}
                  />
                  {billSource === 'material' && (
                    <Field label="Lumpsum Freight Charges" value={formatIndianCurrency(n(header.lumpsum_freight_charges))} />
                  )}
                  {billSource === 'material' && (
                    <Field label="Lumpsum Loading/Unloading" value={formatIndianCurrency(n(header.lumpsum_loading_unloading_charges))} />
                  )}
                  {billSource === 'material' && (
                    <Field label="Lumpsum Other Charges" value={formatIndianCurrency(n(header.lumpsum_other_charges))} />
                  )}
                  {billSource === 'service' && Boolean(header.wo_total_amount) && (
                    <Field label="Work Order Value" value={formatIndianCurrency(n(header.wo_total_amount))} />
                  )}
                  <Field label="Lump-sum Discount Amount" value={formatIndianCurrency(n(header.lumpsum_discount_amount))} />
                  <Field label="Total Amount Before Roundoff" value={formatIndianCurrency(n(header.total_amount_before_roundoff) || (n(header.total_amount) - n(header.roundoff_adjustment)))} />
                  <Field label="Roundoff Adjustment" value={n(header.roundoff_adjustment) !== 0 ? formatIndianCurrency(n(header.roundoff_adjustment)) : '0.00'} />
                  <Field
                    label={billSource === 'service' ? 'Total Net Service Amount (RA Bill)' : 'Total Net Amount (PB)'}
                    value={formatIndianCurrency(n(header.total_amount) || n(header.net_payable_amount))}
                  />
                </Grid>
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                  <div className="text-[10px] font-bold uppercase text-primary">Amount in Words</div>
                  <div className="text-xs font-bold text-foreground">
                    {numberToIndianWords(n(header.total_amount) || n(header.net_payable_amount))}
                  </div>
                </div>
              </Section>

              {/* ④ Advance Payment Adjustment Entries */}
              <Section
                title={billSource === 'service' ? 'Advance Recovery & Adjustment' : 'Advance Payment Entries'}
                icon={CreditCard}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="py-1">Voucher No</th>
                        <th className="py-1">Voucher Date</th>
                        <th className="py-1">{billSource === 'service' ? 'W.O. No' : 'P.O. No'}</th>
                        <th className="py-1 text-right">Advanced Payment</th>
                        <th className="py-1 text-right">Adjusted Payment</th>
                        <th className="py-1 text-right">Balance Amt</th>
                        <th className="py-1 text-right">Adjust Amt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {Array.isArray((header.form_payload as Record<string, unknown>)?.advance_payment_entries) &&
                      ((header.form_payload as Record<string, unknown>).advance_payment_entries as Record<string, unknown>[]).length > 0 ? (
                        ((header.form_payload as Record<string, unknown>).advance_payment_entries as Record<string, unknown>[]).map((adv, idx) => (
                          <tr key={idx}>
                            <td className="py-1 font-mono font-medium">{s(adv.voucher_no) || '—'}</td>
                            <td className="py-1">{dmy(adv.voucher_date)}</td>
                            <td className="py-1 font-mono">{s(adv.po_no) || s(header.work_order_number) || s(header.po_number) || '—'}</td>
                            <td className="py-1 text-right font-mono">{formatIndianCurrency(n(adv.advanced_payment))}</td>
                            <td className="py-1 text-right font-mono">{formatIndianCurrency(n(adv.adjusted_payment))}</td>
                            <td className="py-1 text-right font-mono">{formatIndianCurrency(n(adv.balance_amt))}</td>
                            <td className="py-1 text-right font-mono font-bold">{formatIndianCurrency(n(adv.adjust_amt))}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-2 text-center text-xs text-muted-foreground">
                            {n(header.total_adjusted_amount) > 0 || n(header.advance_adjusted) > 0
                              ? `Advance payment adjusted: ${formatIndianCurrency(n(header.total_adjusted_amount) || n(header.advance_adjusted))}`
                              : 'No advance payment adjustment entries recorded.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="border-t border-border font-bold">
                      <tr>
                        <td colSpan={6} className="py-1.5 text-right uppercase text-[10px] text-muted-foreground">
                          Total Adjusted Amount:
                        </td>
                        <td className="py-1.5 text-right font-mono text-primary">
                          {formatIndianCurrency(n(header.total_adjusted_amount) || n(header.advance_adjusted))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Section>

              {/* ⑤ Payments & Cheque Details */}
              <Section
                title={billSource === 'service' ? 'Service Bill Payments & Settlements' : 'Purchase Bill Payments'}
                icon={Receipt}
              >
                <Grid>
                  <Field
                    label={billSource === 'service' ? "Contractor's Bill No" : 'Supplier Bill No'}
                    value={s(header.supplier_bill_no) || s(header.bill_number) || '—'}
                  />
                  <Field
                    label={billSource === 'service' ? 'RA Bill Date' : 'Supplier Bill Date'}
                    value={dmy(header.supplier_bill_date ?? header.bill_date)}
                  />
                  <Field
                    label={billSource === 'service' ? 'Contractor / Agency Name' : 'Party Name'}
                    value={s(header.party_name) || s(header.vendor_name) || '—'}
                  />
                  <Field label="Company Status" value={s(header.company_status) || 'PARTNERSHIP FIRM'} />
                  <Field label="Total Bill Amount" value={formatIndianCurrency(n(header.total_amount))} />
                  <Field label="Total Cheque Payments" value={formatIndianCurrency(n(header.total_cheque_payments) || n(header.cheque_amount))} />
                  <Field label="Debit or Credit Details" value={`Dr ${formatIndianCurrency(n(header.debit_details))} | Cr ${formatIndianCurrency(n(header.credit_details))}`} />
                  <Field label="Final Bill Amount" value={formatIndianCurrency(n(header.total_amount))} />
                </Grid>
              </Section>

              {/* ⑥ Statutory & Tax Details (Material-only or relevant) */}
              {billSource === 'material' && (
                <Section title="Statutory & Tax Details (LBT / S.Tax)" icon={Building}>
                  <Grid>
                    <Field label="LBT Payable By Us" value={header.lbt_payable_by_us ? 'Yes' : 'No'} />
                    <Field label="Additional Transport S.Tax" value={header.additional_transportation_stax_applicable ? 'Yes' : 'No'} />
                    <Field label="S.Tax Principal Amount" value={formatIndianCurrency(n(header.stax_principal_amount))} />
                    <Field label="Transportation S.Tax Rate" value={`${n(header.transportation_stax_rate)}% (${formatIndianCurrency(n(header.stax_amount))})`} />
                    <Field label="LBT Principal Amount" value={formatIndianCurrency(n(header.lbt_principal_amount))} />
                    <Field label="LBT Tax Rate" value={`${n(header.lbt_tax_rate)}% (${formatIndianCurrency(n(header.lbt_amount))})`} />
                  </Grid>
                </Section>
              )}

              {/* ③ Book Bill & Post to Variance Action Card */}
              <BookBillToVarianceCard
                projectId={s(header.project_id)}
                header={header}
                lines={detail.lines}
                billSource={billSource}
                billId={billId}
                onCommitted={() => {
                  void load();
                  onChanged();
                }}
              />

              {/* ③ Line items with Variance Details */}
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
                          <th className="pb-1.5 text-right">Bill Rate</th>
                          {billSource === 'material' && <th className="pb-1.5 text-right">PO Rate</th>}
                          <th className="pb-1.5 text-right">GST %</th>
                          <th className="pb-1.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line, index) => {
                          const poRate = n(line.po_rate ?? header.source_doc_rate);
                          const billRate = n(line.rate);
                          const rateDiff = poRate > 0 ? billRate - poRate : 0;
                          return (
                            <tr key={s(line.id) || index} className="border-b border-border/40">
                              <td className="py-1.5">
                                <div className="font-medium">{s(line.description)}</div>
                                {rateDiff !== 0 && (
                                  <div className={`text-[9.5px] ${rateDiff > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                    {rateDiff > 0 ? `+${formatIndianCurrency(rateDiff)} over PO rate` : `−${formatIndianCurrency(Math.abs(rateDiff))} under PO rate`}
                                  </div>
                                )}
                              </td>
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
                              <td className="py-1.5 text-right font-semibold">{formatIndianCurrency(billRate)}</td>
                              {billSource === 'material' && (
                                <td className="py-1.5 text-right text-muted-foreground">
                                  {poRate > 0 ? formatIndianCurrency(poRate) : '—'}
                                </td>
                              )}
                              <td className="py-1.5 text-right text-muted-foreground">{n(line.tax_rate)}%</td>
                              <td className="py-1.5 text-right font-bold">
                                {formatIndianCurrency(n(line.line_total))}
                              </td>
                            </tr>
                          );
                        })}
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

              {/* ⑤ Budget Impact */}
              {detail.ledger.length > 0 && (
                <Section title="Budget Impact" icon={Wallet}>
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
                </Section>
              )}

              {/* ⑥ Payments + retention releases */}
              {(detail.payments.length > 0 || detail.retentionReleases.length > 0) && (
                <Section title="Payments & Retention" icon={Receipt}>
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
                </Section>
              )}

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

function BookBillToVarianceCard({
  projectId,
  header,
  lines,
  billSource,
  billId,
  onCommitted,
}: {
  projectId: string | null;
  header: Record<string, unknown>;
  lines: Record<string, unknown>[];
  billSource: string;
  billId: string;
  onCommitted: () => void;
}) {
  const { variance, refresh } = useBudgetData();
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [isCreateSubCatModalOpen, setIsCreateSubCatModalOpen] = useState<boolean>(false);
  const [justification, setJustification] = useState<string>('Billed via Purchase Bill booking');
  const [booking, setBooking] = useState(false);
  const [bookSuccess, setBookSuccess] = useState<string | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  // ─── Booking status tracking from Supabase ───────────────────────────────
  const [existingBookings, setExistingBookings] = useState<BillVarianceBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  const loadBookings = useCallback(async () => {
    if (!billId) return;
    setLoadingBookings(true);
    try {
      const bookings = await getBillVarianceBookings(billId);
      setExistingBookings(bookings);
    } catch {
      // Non-critical — don't block the UI
      setExistingBookings([]);
    } finally {
      setLoadingBookings(false);
    }
  }, [billId]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const isFullyBooked = existingBookings.length > 0;
  const bookedVarianceItemIds = useMemo(
    () => new Set(existingBookings.map((b) => b.variance_item_id)),
    [existingBookings]
  );

  // ─── Bill-level computations ─────────────────────────────────────────────
  const billTotalQty = useMemo(
    () => lines.reduce((acc, line) => acc + (n(line.quantity) || 0), 0),
    [lines]
  );

  const billGrossAmount = useMemo(
    () => n(header.gross_bill_amount) || n(header.total_amount) || lines.reduce((acc, line) => acc + (n(line.line_total) || 0), 0),
    [header, lines]
  );

  const selectedCat = useMemo(
    () => variance.find((c) => c.id === selectedCatId || c.categoryName === selectedCatId),
    [variance, selectedCatId]
  );

  const availableItems = useMemo(() => selectedCat?.items ?? [], [selectedCat]);

  const selectedItem = useMemo(
    () => availableItems.find((i) => i.id === selectedItemId),
    [availableItems, selectedItemId]
  );

  // Check if selected item was already booked from THIS bill
  const isSelectedItemAlreadyBooked = useMemo(() => {
    if (!selectedItem) return false;
    const targetId = selectedItem.varianceItemId ?? selectedItem.id;
    return bookedVarianceItemIds.has(targetId);
  }, [selectedItem, bookedVarianceItemIds]);

  const mergedQty = useMemo(() => {
    if (!selectedItem) return 0;
    return selectedItem.actualBillQty + billTotalQty;
  }, [selectedItem, billTotalQty]);

  const mergedCost = useMemo(() => {
    if (!selectedItem) return 0;
    return selectedItem.actualTotalCost + billGrossAmount;
  }, [selectedItem, billGrossAmount]);

  const mergedRate = useMemo(() => {
    if (mergedQty <= 0) return 0;
    return Number((mergedCost / mergedQty).toFixed(4));
  }, [mergedCost, mergedQty]);

  const mergedCostVariance = useMemo(() => {
    if (!selectedItem) return 0;
    return selectedItem.budgetCost - mergedCost;
  }, [selectedItem, mergedCost]);

  const handleBookBill = async () => {
    if (!projectId) {
      setBookError('Please select a specific project before booking to variance.');
      return;
    }
    if (!selectedItem) {
      setBookError('Please select both a Budget Head and Sub-Category item.');
      return;
    }
    if (isSelectedItemAlreadyBooked) {
      setBookError(`This bill has already been booked to "${selectedItem.subActivity}". Duplicate booking is not allowed.`);
      return;
    }

    setBooking(true);
    setBookError(null);
    setBookSuccess(null);

    try {
      await saveVarianceReconciliation(projectId, justification, [
        {
          id: selectedItem.varianceItemId ?? selectedItem.id,
          actual_bill_qty: mergedQty,
          actual_bill_rate: mergedRate,
          remark: `Merged PB ${s(header.bill_number)}: ${justification}`,
          bill_id: billId,
          bill_source: billSource === 'service' ? 'service' : 'material',
          bill_number: s(header.bill_number),
          booked_qty: billTotalQty,
          booked_amount: billGrossAmount,
        },
      ]);

      // Link and store the selected budget head and master budget line in Supabase
      await linkBillToBudgetHead(
        billSource as BillSource,
        billId,
        selectedItem.masterItemId ?? selectedItem.id,
        selectedCatId
      );

      await refresh();
      await loadBookings(); // Refresh booking status
      setBookSuccess(`Bill successfully booked & merged into "${selectedItem.subActivity}"!`);
      onCommitted();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to book bill variance';
      if (msg.includes('Duplicate booking') || msg.includes('already been booked')) {
        setBookError(`⚠️ ${msg}`);
        await loadBookings(); // Refresh to show current state
      } else {
        setBookError(msg);
      }
    } finally {
      setBooking(false);
    }
  };

  // ─── Status badge logic ──────────────────────────────────────────────────
  const statusBadge = useMemo(() => {
    if (loadingBookings) return { label: 'Checking…', color: 'bg-muted text-muted-foreground' };
    if (existingBookings.length === 0) return { label: 'Not Booked to Variance', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' };
    return { label: `✓ Booked to Variance (${existingBookings.length} posting${existingBookings.length > 1 ? 's' : ''})`, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' };
  }, [loadingBookings, existingBookings]);

  return (
    <Section title="Book Bill & Update Variance" icon={CheckCircle2}>
      <div className="space-y-3 text-[11px]">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusBadge.color}`}>
            {loadingBookings && <Loader2 className="h-3 w-3 animate-spin" />}
            {statusBadge.label}
          </span>
        </div>

        {/* Existing Bookings Audit Trail */}
        {existingBookings.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 dark:border-emerald-800 dark:bg-emerald-950/20">
            <div className="mb-1.5 text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300">
              Booking History
            </div>
            <div className="space-y-1.5">
              {existingBookings.map((bk) => (
                <div
                  key={bk.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-emerald-200/50 bg-white/60 px-2.5 py-1.5 dark:border-emerald-800/30 dark:bg-emerald-950/30"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">
                      {bk.sub_activity}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {bk.category_name} · {bk.booked_qty.toLocaleString('en-IN')} qty · {formatIndianCurrency(bk.booked_amount)}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <div className="font-medium">{bk.booked_by_name ?? 'System'}</div>
                    <div>{new Date(bk.booked_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Select the Budget Head and Sub-Category item. The bill amount and quantity will automatically merge with existing actuals without overwriting previous data.
        </p>

        {/* Dropdowns */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">1. Select Budget Head</label>
            <select
              value={selectedCatId}
              onChange={(e) => {
                setSelectedCatId(e.target.value);
                setSelectedItemId('');
                setBookError(null);
                setBookSuccess(null);
              }}
              className="mt-1 w-full rounded-md border border-input bg-background p-1.5 text-[11px] font-semibold"
            >
              <option value="">-- Choose Category / Head --</option>
              {variance.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.categoryName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-muted-foreground">2. Select Sub-Category Item</label>
            <select
              value={selectedItemId}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'CREATE_NEW') {
                  setIsCreateSubCatModalOpen(true);
                  return;
                }
                setSelectedItemId(val);
                setBookError(null);
                setBookSuccess(null);
              }}
              disabled={!selectedCatId}
              className="mt-1 w-full rounded-md border border-input bg-background p-1.5 text-[11px] font-semibold disabled:opacity-50"
            >
              <option value="">-- Choose Sub-Category Item --</option>
              <option value="CREATE_NEW" className="font-bold text-primary">
                + Add New Sub-Category Item...
              </option>
              {availableItems.map((item) => {
                const alreadyBooked = bookedVarianceItemIds.has(item.varianceItemId ?? item.id);
                return (
                  <option key={item.id} value={item.id} disabled={alreadyBooked}>
                    {alreadyBooked ? '✓ ' : ''}{item.srNo} {item.subActivity} ({item.unit}){alreadyBooked ? ' — Already Booked' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <CreateSubCategoryModal
          isOpen={isCreateSubCatModalOpen}
          onClose={() => setIsCreateSubCatModalOpen(false)}
          projectId={projectId || ''}
          categoryId={selectedCatId}
          categoryName={selectedCat?.categoryName || ''}
          onCreated={async (newItem) => {
            await refresh();
            setSelectedItemId(newItem.id);
            setBookSuccess(`Created new sub-category "${newItem.item_description}" under ${selectedCat?.categoryName}!`);
          }}
        />

        {/* Duplicate Warning */}
        {isSelectedItemAlreadyBooked && selectedItem && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 dark:border-red-800 dark:bg-red-950/20">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-600" />
            <div>
              <div className="text-xs font-bold text-red-700 dark:text-red-400">Duplicate Booking Prevented</div>
              <div className="text-[10.5px] text-red-600 dark:text-red-400">
                This bill has already been booked to &quot;{selectedItem.subActivity}&quot;. Each bill can only be posted once to a given variance line item.
              </div>
            </div>
          </div>
        )}

        {/* Merged Cumulative Preview Card */}
        {selectedItem && !isSelectedItemAlreadyBooked && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between font-bold text-primary">
              <span>Cumulative Merging Preview</span>
              <span className="text-[10px] uppercase bg-primary/10 px-2 py-0.5 rounded-full font-bold">Accumulate Active</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10.5px]">
              <div>
                <div className="text-muted-foreground">Billed Quantity:</div>
                <div className="font-mono">
                  {selectedItem.actualBillQty.toLocaleString('en-IN')} + <span className="font-bold text-primary">{billTotalQty.toLocaleString('en-IN')}</span> = <span className="font-bold">{mergedQty.toLocaleString('en-IN')} {selectedItem.unit}</span>
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">Actual Cost (₹):</div>
                <div className="font-mono">
                  {formatIndianCurrency(selectedItem.actualTotalCost)} + <span className="font-bold text-primary">{formatIndianCurrency(billGrossAmount)}</span> = <span className="font-bold">{formatIndianCurrency(mergedCost)}</span>
                </div>
              </div>

              <div>
                <div className="text-muted-foreground">New Effective Rate:</div>
                <div className="font-mono font-semibold">{formatIndianCurrency(mergedRate)} / {selectedItem.unit}</div>
              </div>

              <div>
                <div className="text-muted-foreground">Updated Cost Variance:</div>
                <div className={`font-mono font-bold ${mergedCostVariance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {mergedCostVariance < 0 ? `−${formatIndianCurrency(Math.abs(mergedCostVariance))} (Overrun)` : `+${formatIndianCurrency(mergedCostVariance)} (Savings)`}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Justification & Action */}
        {selectedItem && !isSelectedItemAlreadyBooked && (
          <div className="space-y-2 pt-1">
            <input
              type="text"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Booking Remark / Audit Note"
              className="w-full rounded-md border border-input bg-background p-1.5 text-[11px]"
            />

            {bookError && <div className="text-xs font-semibold text-red-600">{bookError}</div>}
            {bookSuccess && <div className="text-xs font-semibold text-emerald-600">{bookSuccess}</div>}

            <button
              type="button"
              onClick={handleBookBill}
              disabled={booking || isSelectedItemAlreadyBooked}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
            >
              {booking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {booking ? 'Booking Bill to Variance…' : 'Book Bill & Post to Variance'}
            </button>
          </div>
        )}

        {/* Already-booked success state */}
        {bookSuccess && isFullyBooked && !selectedItem && (
          <div className="text-xs font-semibold text-emerald-600">{bookSuccess}</div>
        )}
      </div>
    </Section>
  );
}
