import React, { useState } from 'react';
import { PurchaseOrderRow, GrnRow } from '@/lib/procurement';
import { StatusBadge, EmptyState, formatCurrency } from './shared';
import { 
  PackageCheck, 
  FileText, 
  Plus, 
  Eye, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  ReceiptIndianRupee
} from 'lucide-react';
import { CreateBillModal } from '@/components/billing/create-bill-modal';

export function GrnWorkbench({
  purchaseOrders,
  grns,
  selectedPoId,
  onSelectPo,
  onPostGrn,
  onCreateGrn,
}: {
  purchaseOrders: PurchaseOrderRow[];
  grns: GrnRow[];
  selectedPoId: string | null;
  onSelectPo: (id: string | null) => void;
  onPostGrn: (grnId: string) => void;
  onCreateGrn: (po: PurchaseOrderRow) => void;
}) {
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [billTargetGrnId, setBillTargetGrnId] = useState<string | null>(null);

  const eligiblePos = purchaseOrders.filter(po => 
    po.status === 'sent' || 
    po.status === 'acknowledged' || 
    po.status === 'partially_delivered' ||
    po.status === 'delivered'
  );

  if (eligiblePos.length === 0) return <EmptyState message="No purchase orders ready for Goods Receipt." />;

  const selectedPo = eligiblePos.find((row) => row.id === selectedPoId) || eligiblePos[0];
  const vendor = selectedPo.vendors;
  const poGrns = grns.filter(g => g.purchase_order_id === selectedPo.id);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2.5fr]">
      <div className="max-h-[800px] space-y-2 overflow-y-auto pr-1">
        {eligiblePos.map((row) => {
          const isSelected = selectedPo.id === row.id;
          const relatedGrns = grns.filter(g => g.purchase_order_id === row.id);
          const hasPendingGrn = relatedGrns.some(g => g.status === 'received' || g.status === 'inspection_pending');

          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectPo(row.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${isSelected ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:bg-muted/50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-foreground">{row.po_number}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{row.vendors?.display_name || row.vendors?.legal_name || 'Vendor'}</p>
              
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{relatedGrns.length} GRNs created</span>
                {hasPendingGrn && <span className="text-amber-600 font-bold">Unposted GRN</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 pb-10">
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-8">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-1">Receipt for: {selectedPo.po_number}</h3>
              <p className="text-lg font-medium text-foreground">{vendor?.display_name || vendor?.legal_name || 'Vendor'}</p>
            </div>
            <div>
              <button 
                onClick={() => onCreateGrn(selectedPo)}
                className="inline-flex h-fit items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Create New GRN
              </button>
            </div>
          </div>

          <h4 className="font-bold text-foreground mb-4 border-b border-border pb-2">Existing Goods Receipt Notes</h4>
          
          {poGrns.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
              <PackageCheck className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-bold">No GRNs created yet</p>
              <p className="text-sm">Create a new GRN when material arrives at the site.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {poGrns.map((grn) => (
                <div key={grn.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between p-4 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground">{grn.grn_number}</span>
                      <StatusBadge status={grn.status} />
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Received: {grn.receipt_date}
                    </div>
                  </div>
                  
                  <div className="p-4">
                    <div className="flex gap-6 mb-4 text-sm">
                      <div>
                        <span className="text-muted-foreground block text-xs font-bold uppercase mb-1">Quality Check</span>
                        <span className="font-medium text-foreground capitalize">{grn.quality_decision?.replace('_', ' ') || 'Pending'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-xs font-bold uppercase mb-1">Lines</span>
                        <span className="font-medium text-foreground">{grn.goods_receipt_note_lines?.length || 0}</span>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="text-muted-foreground border-b border-border">
                          <tr>
                            <th className="py-2 font-semibold">Item</th>
                            <th className="py-2 font-semibold text-right">Received</th>
                            <th className="py-2 font-semibold text-right text-emerald-600">Accepted</th>
                            <th className="py-2 font-semibold text-right text-red-600">Rejected</th>
                            <th className="py-2 font-semibold text-right">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {grn.goods_receipt_note_lines?.map((line, idx) => {
                            // Find the corresponding PO line for the item description
                            const poLine = selectedPo.purchase_order_lines?.find(l => l.item_id === line.item_id);
                            return (
                              <tr key={line.id || idx}>
                                <td className="py-2 font-medium text-foreground">{poLine?.item_description || 'Unknown Item'}</td>
                                <td className="py-2 text-right font-bold">{line.received_qty}</td>
                                <td className="py-2 text-right text-emerald-600 font-bold">{line.accepted_qty}</td>
                                <td className="py-2 text-right text-red-600 font-bold">{line.rejected_qty}</td>
                                <td className="py-2 text-right text-muted-foreground">{line.remarks || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {grn.status !== 'posted' ? (
                      <div className="mt-4 pt-4 border-t border-border flex justify-end">
                        <button 
                          onClick={() => onPostGrn(grn.id)}
                          className="rounded-md bg-foreground px-4 py-2 text-sm font-bold text-background hover:opacity-90 flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Post to Inventory
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 pt-4 border-t border-border flex justify-end">
                        <button 
                          onClick={() => {
                            setBillTargetGrnId(grn.id);
                            setIsBillModalOpen(true);
                          }}
                          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-bold text-foreground hover:bg-muted flex items-center gap-2 shadow-sm"
                        >
                          <ReceiptIndianRupee className="w-4 h-4" />
                          Create Vendor Bill
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <CreateBillModal 
        isOpen={isBillModalOpen} 
        onClose={() => setIsBillModalOpen(false)} 
        onSuccess={() => setIsBillModalOpen(false)} 
        prefilledPoId={selectedPo.id}
        prefilledGrnId={billTargetGrnId || undefined}
        prefilledVendorId={vendor?.id}
      />
    </div>
  );
}
