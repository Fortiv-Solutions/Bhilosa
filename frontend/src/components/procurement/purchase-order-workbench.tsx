import React, { useState } from 'react';
import { 
  PurchaseOrderRow, 
  PurchaseRequisitionRow, 
  VendorSelectionRow
} from '@/lib/procurement';
import { formatCurrency, StatusBadge, EmptyState } from './shared';
import { 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Send, 
  FileDown, 
  Eye, 
  AlertTriangle 
} from 'lucide-react';

function ReviewTile({ label, value, highlight = false, alert = false }: { label: string; value: string; highlight?: boolean; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-primary bg-primary/5' : alert ? 'border-red-200 bg-red-50' : 'border-border bg-card'}`}>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? 'text-primary' : alert ? 'text-red-700' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

export function PurchaseOrderWorkbench({
  purchaseOrders,
  prs,
  selections,
  selectedPoId,
  onSelectPo,
  onApprovePo,
  onRejectPo,
  onSendPo,
  onAcknowledgePo,
  onPdf,
  onOpenPdf,
  canApprove,
}: {
  purchaseOrders: PurchaseOrderRow[];
  prs: PurchaseRequisitionRow[];
  selections: VendorSelectionRow[];
  selectedPoId: string | null;
  onSelectPo: (id: string | null) => void;
  onApprovePo: (po: PurchaseOrderRow) => void;
  onRejectPo: (po: PurchaseOrderRow, reason: string) => void;
  onSendPo: (po: PurchaseOrderRow) => void;
  onAcknowledgePo: (po: PurchaseOrderRow) => void;
  onPdf: (po: PurchaseOrderRow) => void;
  onOpenPdf: (po: PurchaseOrderRow) => void;
  canApprove: boolean;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  if (purchaseOrders.length === 0) return <EmptyState message="No Purchase Orders found." />;

  const selectedPo = purchaseOrders.find((row) => row.id === selectedPoId) || purchaseOrders[0];
  const relatedPr = prs.find((row) => row.id === selectedPo.purchase_requisition_id) || null;
  const selection = selections.find((row) => row.id === selectedPo.vendor_selection_id) || null;
  const vendor = selectedPo.vendors;

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    onRejectPo(selectedPo, rejectReason);
    setIsRejecting(false);
    setRejectReason('');
  };

  const isHighValue = selectedPo.total_amount > 100000;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2.5fr]">
      <div className="max-h-[800px] space-y-2 overflow-y-auto pr-1">
        {purchaseOrders.map((row) => {
          const isSelected = selectedPo.id === row.id;
          const isPendingApproval = row.status === 'pending_approval';
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectPo(row.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-foreground">{row.po_number}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{row.vendors?.display_name || row.vendors?.legal_name || 'Vendor'}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] font-semibold">
                <span className="text-foreground">{formatCurrency(row.total_amount)}</span>
                <span className="text-muted-foreground">{row.po_date}</span>
              </div>
              {isPendingApproval && row.total_amount > 100000 && (
                <div className="mt-2 text-[10px] text-amber-700 bg-amber-100 rounded px-2 py-0.5 inline-flex items-center gap-1 font-bold">
                  <AlertTriangle className="w-3 h-3" /> High Value - Needs Approval
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 pb-10">
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold text-foreground">{selectedPo.po_number}</h3>
                <StatusBadge status={selectedPo.status} />
                {isHighValue && selectedPo.status === 'pending_approval' && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase border border-amber-200">
                    <AlertTriangle className="w-3 h-3" />
                    High Value
                  </span>
                )}
              </div>
              <p className="text-lg font-medium text-foreground">{vendor?.display_name || vendor?.legal_name || 'Vendor'}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                <p>Linked PR: <span className="font-semibold text-foreground">{relatedPr?.pr_number || 'not linked'}</span></p>
                <p>Date: <span className="font-semibold text-foreground">{selectedPo.po_date}</span></p>
                <p>Delivery: <span className="font-semibold text-foreground">{selectedPo.delivery_date || 'Not set'}</span></p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                type="button" 
                onClick={() => onOpenPdf(selectedPo)} 
                className="inline-flex h-fit items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2.5 text-sm font-bold text-secondary-foreground"
              >
                <Eye className="h-4 w-4" />
                View PDF
              </button>
              <button 
                type="button" 
                onClick={() => onPdf(selectedPo)} 
                className="inline-flex h-fit items-center justify-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
              >
                <FileDown className="h-4 w-4" />
                Generate PDF
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
            <ReviewTile label="PO Amount" value={formatCurrency(selectedPo.total_amount)} highlight />
            <ReviewTile label="Items" value={`${selectedPo.purchase_order_lines?.length || 0}`} />
            <ReviewTile label="Payment Terms" value={selectedPo.payment_terms || 'N/A'} />
            <ReviewTile label="Selection Reason" value={selection?.reason_for_selection || 'Auto'} />
          </div>
        </div>

        {selectedPo.status === 'pending_approval' && canApprove && (
          <div className="rounded-xl border-2 border-amber-500/20 bg-amber-50/30 p-5 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-amber-600" /> 
              Approval Required
            </h3>
            {isRejecting ? (
              <div className="space-y-3">
                <textarea 
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  className="w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button 
                    onClick={handleReject}
                    disabled={!rejectReason.trim()}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm Rejection
                  </button>
                  <button 
                    onClick={() => setIsRejecting(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button 
                  onClick={() => onApprovePo(selectedPo)}
                  className="rounded-md bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Approve PO
                </button>
                <button 
                  onClick={() => setIsRejecting(true)}
                  className="rounded-md border border-red-200 bg-red-50 text-red-700 px-6 py-2.5 text-sm font-bold hover:bg-red-100"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}

        {(selectedPo.status === 'approved' || (selectedPo.status as string) === 'sent_to_vendor') && (
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" /> 
              Vendor Communication
            </h3>
            <div className="flex flex-wrap gap-3">
              <button 
                onClick={() => onSendPo(selectedPo)}
                disabled={(selectedPo.status as string) === 'sent_to_vendor'}
                className="rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {(selectedPo.status as string) === 'sent_to_vendor' ? 'Sent to Vendor' : 'Mark as Sent'}
              </button>
              {(selectedPo.status as string) === 'sent_to_vendor' && (
                <button 
                  onClick={() => onAcknowledgePo(selectedPo)}
                  className="rounded-md border border-border bg-card px-6 py-2.5 text-sm font-bold hover:bg-muted"
                >
                  Mark as Acknowledged
                </button>
              )}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-3 font-semibold">Item Description</th>
                <th className="px-4 py-3 font-semibold text-right">Quantity</th>
                <th className="px-4 py-3 font-semibold text-right">Rate</th>
                <th className="px-4 py-3 font-semibold text-right">Tax %</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selectedPo.purchase_order_lines?.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td className="px-4 py-3 font-medium text-foreground">{line.item_description}</td>
                  <td className="px-4 py-3 text-right">{line.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(line.unit_rate || 0)}</td>
                  <td className="px-4 py-3 text-right">{line.tax_rate}%</td>
                  <td className="px-4 py-3 font-bold text-right">{formatCurrency(line.line_total || 0)}</td>
                </tr>
              ))}
              <tr className="bg-muted/20">
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-muted-foreground">Subtotal</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(selectedPo.subtotal_amount || 0)}</td>
              </tr>
              <tr className="bg-muted/20">
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-muted-foreground">Tax Amount</td>
                <td className="px-4 py-3 text-right font-bold text-foreground">{formatCurrency(selectedPo.tax_amount || 0)}</td>
              </tr>
              <tr className="bg-muted/40 border-t-2 border-border">
                <td colSpan={4} className="px-4 py-4 text-right font-black text-foreground uppercase tracking-wider">Grand Total</td>
                <td className="px-4 py-4 text-right font-black text-primary text-lg">{formatCurrency(selectedPo.total_amount)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
