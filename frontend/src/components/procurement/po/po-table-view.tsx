'use client';

import { ShoppingBag, Building2, Edit3, Printer, Eye, Check, PackageCheck, XCircle, Ban } from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';
import {
  normalizePoStatus,
  poStatusLabel,
  poStatusTone,
  isPoReceivable,
  isPoEditable,
  PO_TRANSITIONS,
} from '@/lib/erp/purchase-order/status';
import { getDeliveryUrgency, DELIVERY_URGENCY_TONE_CLASSES } from '@/lib/erp/purchase-order/delivery-urgency';

interface PoTableViewProps {
  purchaseOrders: PurchaseOrderRow[];
  onOpenPoForm: (po: PurchaseOrderRow) => void;
  onPrintPo?: (po: PurchaseOrderRow) => void;
  onApprove?: (po: PurchaseOrderRow) => void;
  /** Opens the reason prompt; rejection is refused server-side without one. */
  onReject?: (po: PurchaseOrderRow) => void;
  onCancel?: (po: PurchaseOrderRow) => void;
  /** Records the supplier's confirmation of an issued order. */
  onAcknowledge?: (po: PurchaseOrderRow) => void;
  onReceiveGoods?: (po: PurchaseOrderRow) => void;
  canApprove?: boolean;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatAmount(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** An em dash for anything the record genuinely does not carry. */
function orDash(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  return trimmed || '—';
}

export function PoTableView({
  purchaseOrders,
  onOpenPoForm,
  onPrintPo,
  onApprove,
  onReject,
  onCancel,
  onAcknowledge,
  onReceiveGoods,
  canApprove,
}: PoTableViewProps) {
  if (purchaseOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
          No Purchase Orders Found
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Draft purchase orders appear here once they are generated from an approved RFQ award, or
          created directly with the New PO Form.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/50 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3.5 w-12 text-center">SR NO.</th>
                <th className="px-4 py-3.5 min-w-[150px]">PO No. & Date</th>
                <th className="px-4 py-3.5 min-w-[140px]">Project</th>
                <th className="px-4 py-3.5 min-w-[180px]">Supplier</th>
                <th className="px-3 py-3.5 min-w-[150px]">Linked Source</th>
                <th className="px-3 py-3.5 min-w-[120px]">Delivery</th>
                <th className="px-3 py-3.5 text-right">Discount (₹)</th>
                <th className="px-3 py-3.5 text-right">Amount (₹)</th>
                <th className="px-3 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {purchaseOrders.map((po, idx) => {
                const status = normalizePoStatus(po.status);
                const supplierName =
                  po.supplier_name || po.vendors?.display_name || po.vendors?.legal_name;
                const gstNo = po.gst_no || po.vendors?.gst_number;
                const prNo = po.purchase_requisitions?.pr_number;
                const rfqNo = po.comparative_statement_no || (po.rfq_id ? `RFQ-${po.rfq_id.slice(0, 6).toUpperCase()}` : null);

                return (
                  <tr key={po.id || idx} className="group hover:bg-muted/30 transition-colors align-middle">
                    <td className="px-3 py-3 text-center font-bold text-muted-foreground">{idx + 1}</td>

                    {/* PO No. & Date */}
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-foreground text-xs flex items-center gap-1.5">
                        <span>{orDash(po.po_number)}</span>
                        {((po as any).revision_number ?? 0) > 0 && (
                          <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary border border-primary/20">
                            Rev {(po as any).revision_number}
                          </span>
                        )}
                        {Boolean((po as any).is_amendment_pending) && (
                          <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-600 border border-amber-500/20">
                            Amend Pending
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground">
                        {formatDate(po.po_date || po.created_at)}
                      </div>
                    </td>

                    {/* Project */}
                    <td className="px-4 py-3 font-semibold text-muted-foreground text-xs">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                        <span className="truncate max-w-[140px]">{orDash(po.projects?.name)}</span>
                      </span>
                    </td>

                    {/* Supplier with GST */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-foreground text-xs truncate max-w-[180px]">
                        {orDash(supplierName)}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {gstNo ? `GST: ${gstNo}` : 'GST: —'}
                      </div>
                    </td>

                    {/* Linked Source (PR & RFQ) */}
                    <td className="px-3 py-3 font-mono text-xs">
                      <div className="flex flex-col gap-0.5">
                        {prNo ? (
                          <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 w-max">
                            PR: {prNo}
                          </span>
                        ) : null}
                        {rfqNo ? (
                          <span className="inline-flex items-center rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400 w-max">
                            RFQ: {rfqNo}
                          </span>
                        ) : null}
                        {!prNo && !rfqNo ? (
                          <span className="text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </td>

                    {/* Delivery */}
                    <td className="px-3 py-3">
                      {(() => {
                        const urgency = getDeliveryUrgency(po);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {formatDate(po.delivery_date)}
                            </span>
                            <span
                              className={`inline-flex w-max items-center rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold ${DELIVERY_URGENCY_TONE_CLASSES[urgency.tone]}`}
                            >
                              {urgency.label}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Discount Amount */}
                    <td className="px-3 py-3 text-right font-mono font-bold text-foreground text-xs">
                      {formatAmount(po.discount_amount)}
                    </td>

                    {/* Amount */}
                    <td className="px-3 py-3 text-right font-mono font-bold text-foreground text-xs">
                      {formatAmount(po.total_amount)}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-extrabold ${poStatusTone(po.status)}`}
                        title={po.rejection_reason || po.cancellation_reason || undefined}
                      >
                        {poStatusLabel(po.status)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isPoEditable(po.status) ? (
                          <button
                            onClick={() => onOpenPoForm(po)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 transition-all shadow-2xs cursor-pointer"
                            title="Edit Purchase Order"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                            <span>Edit</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenPoForm(po)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all shadow-2xs cursor-pointer"
                            title="View Purchase Order Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                        )}

                        <button
                          onClick={() => onPrintPo?.(po)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all shadow-2xs cursor-pointer"
                          title="Print Purchase Order PDF"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
