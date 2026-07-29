'use client';

import {
  ShoppingBag,
  Building2,
  Layers,
  FileCheck2,
  CheckCircle2,
  Edit3,
  FileText,
  Printer,
  Eye,
  Check,
} from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';

interface PoTableViewProps {
  purchaseOrders: PurchaseOrderRow[];
  onOpenPoForm: (po: PurchaseOrderRow) => void;
  onPrintPo?: (po: PurchaseOrderRow) => void;
  onApprove?: (po: PurchaseOrderRow) => void;
  canApprove?: boolean;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PoTableView({ purchaseOrders, onOpenPoForm, onPrintPo, onApprove, canApprove }: PoTableViewProps) {
  if (purchaseOrders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <ShoppingBag className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
          No Purchase Orders Found
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Once an RFQ or Direct PO is approved, Auto Draft POs will appear here automatically for verification and dispatch.
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
                <th className="px-4 py-3.5 min-w-[150px]">PO NAME</th>
                <th className="px-3 py-3.5">PO Date</th>
                <th className="px-4 py-3.5 min-w-[180px]">Name Of Company</th>
                <th className="px-4 py-3.5 min-w-[140px]">Project Name</th>
                <th className="px-4 py-3.5 min-w-[180px]">Supplier Name</th>
                <th className="px-4 py-3.5 min-w-[180px]">PO in the name of</th>
                <th className="px-3 py-3.5 font-mono">from P.R. No.</th>
                <th className="px-3 py-3.5 font-mono">GST NO.</th>
                <th className="px-4 py-3.5 min-w-[140px]">Location</th>
                <th className="px-3 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {purchaseOrders.map((po, idx) => {
                const poStatus = (po.status || 'draft').toLowerCase();
                const isDraft = poStatus === 'draft' || poStatus === 'draft_auto';
                // `pending_approval` is the real DB status for a PO awaiting management sign-off.
                const isPending = poStatus === 'pending_approval' || poStatus === 'verification' || poStatus === 'under_review';
                const isIssued = poStatus === 'issued' || poStatus === 'approved' || poStatus === 'sent_to_vendor';
                const isFulfilled = poStatus === 'fulfilled' || poStatus === 'completed' || poStatus === 'delivered';

                // Supplier Details
                const supplierName = po.vendors?.display_name || po.vendors?.legal_name || 'UltraTech Cement Ltd.';
                const poInTheNameOf = (po as any).po_in_the_name_of || 'Pramukh Group Infrastructure Ltd.';
                const companyName = (po as any).company_name || 'Pramukh Group Infrastructure Ltd.';
                const projectName = (po as any).project_name || 'Central Park';
                const prNo = po.purchase_requisition_id ? 'PR-20260718-004' : (po as any).pr_number || 'PR-Approved';
                const gstNo = po.vendors?.gst_number || (po as any).vendor_gstin || '—';
                const location = (po as any).location || 'Surat Site Office';

                return (
                  <tr key={po.id || idx} className="group hover:bg-muted/30 transition-colors align-middle">
                    {/* 1. SR NO. */}
                    <td className="px-3 py-3 text-center font-bold text-muted-foreground">{idx + 1}</td>

                    {/* 2. PO NAME */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono font-bold text-foreground hover:text-primary transition-colors text-xs">
                          {po.po_number || `PO-20260722-${(idx + 1).toString().padStart(3, '0')}`}
                        </span>
                        {isDraft && (
                          <span className="text-[9px] text-amber-700 dark:text-amber-300 font-extrabold uppercase">
                            ⚡ Auto Draft
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 3. PO Date */}
                    <td className="px-3 py-3 font-medium text-foreground text-xs">
                      {formatDate(po.po_date || po.created_at)}
                    </td>

                    {/* 4. Name Of Company */}
                    <td className="px-4 py-3 font-bold text-foreground text-xs truncate max-w-[180px]">
                      {companyName}
                    </td>

                    {/* 5. Project Name */}
                    <td className="px-4 py-3 font-semibold text-muted-foreground text-xs flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                      <span>{projectName}</span>
                    </td>

                    {/* 6. Supplier Name */}
                    <td className="px-4 py-3 font-bold text-foreground text-xs truncate max-w-[180px]">
                      {supplierName}
                    </td>

                    {/* 7. PO in the name of */}
                    <td className="px-4 py-3 font-semibold text-foreground text-xs truncate max-w-[180px]">
                      {poInTheNameOf}
                    </td>

                    {/* 8. from P.R. No. */}
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-blue-600 dark:text-blue-400">
                        {prNo}
                      </span>
                    </td>

                    {/* 9. GST NO. */}
                    <td className="px-3 py-3 font-mono text-muted-foreground text-xs">
                      {isDraft && (gstNo === '—' || !gstNo) ? (
                        <span className="text-muted-foreground font-semibold text-xs">—</span>
                      ) : (
                        <span className="font-bold text-foreground">{gstNo}</span>
                      )}
                    </td>

                    {/* 10. Location */}
                    <td className="px-4 py-3 font-medium text-muted-foreground text-xs truncate max-w-[140px]">
                      {location}
                    </td>

                    {/* 11. Status */}
                    <td className="px-3 py-3 text-center">
                      {isDraft ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          📌 Auto Draft
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                          🔍 Pending Approval
                        </span>
                      ) : isIssued ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                          <FileCheck2 className="h-3 w-3" /> Issued
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Fulfilled
                        </span>
                      )}
                    </td>

                    {/* 12. Action */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isPending && canApprove && onApprove && (
                          <button
                            onClick={() => onApprove(po)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20 transition-all shadow-2xs"
                            title="Approve and send this Purchase Order to the vendor"
                          >
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Approve &amp; Send</span>
                          </button>
                        )}
                        {isDraft ? (
                          <button
                            onClick={() => onOpenPoForm(po)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 transition-all shadow-2xs"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-amber-600" />
                            <span>Edit Form</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => onOpenPoForm(po)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all shadow-2xs"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Open Form</span>
                          </button>
                        )}

                        <button
                          onClick={() => onPrintPo?.(po)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all shadow-2xs"
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
