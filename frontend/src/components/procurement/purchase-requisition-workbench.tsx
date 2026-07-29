import React from 'react';
import { FileDown, Eye, UserPlus, Truck, FileText, CheckCircle2, Pencil } from 'lucide-react';
import { 
  PurchaseRequisitionRow, 
  EntityAttachmentRow,
  MaterialRequestRow,
  RfqRow,
  QuotationRow,
  VendorSelectionRow
} from '@/lib/procurement';
import { formatCurrency, StatusBadge, EmptyState } from './shared';

export function PurchaseRequisitionWorkbench({
  rows,
  attachments,
  materialRequests,
  rfqs,
  quotations,
  selections,
  selectedPrId,
  onSelectPr,
  onAssign,
  onApprove,
  onRfq,
  onPdf,
  onOpenPdf,
  onGeneratePo,
  onEdit,
}: {
  rows: PurchaseRequisitionRow[];
  attachments: EntityAttachmentRow[];
  materialRequests: MaterialRequestRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  selectedPrId: string | null;
  onSelectPr: (id: string | null) => void;
  onAssign: (row: PurchaseRequisitionRow) => void;
  onApprove: (row: PurchaseRequisitionRow) => void;
  onRfq: (row: PurchaseRequisitionRow) => void;
  onPdf: (row: PurchaseRequisitionRow) => void;
  onOpenPdf: (row: PurchaseRequisitionRow) => void;
  onGeneratePo: (row: PurchaseRequisitionRow) => void;
  onEdit?: (prId: string) => void;
}) {
  if (rows.length === 0) return <EmptyState message="No purchase requisitions found." />;
  
  const selectedRow = rows.find(r => r.id === selectedPrId) || rows[0];
  const linkedMr = materialRequests.find(mr => mr.id === selectedRow.material_request_id);
  const linkedRfq = rfqs.find(rfq => rfq.purchase_requisition_id === selectedRow.id);
  const linkedQuotes = linkedRfq ? quotations.filter(q => q.rfq_id === linkedRfq.id) : [];
  const linkedSelection = selections.find(s => s.purchase_requisition_id === selectedRow.id);

  // Timeline derivation
  const timeline = [
    { label: 'MR Created', date: linkedMr?.created_at, active: !!linkedMr },
    { label: 'Converted to PR', date: selectedRow.created_at, active: true },
    { label: 'PR Assigned', date: null, active: ['in_review', 'assigned', 'approved', 'rfq_sent', 'vendor_selected', 'po_issued'].includes(selectedRow.status) },
    { label: 'PR Approved', date: null, active: ['approved', 'rfq_sent', 'vendor_selected', 'po_issued'].includes(selectedRow.status) },
    { label: 'RFQ Created', date: linkedRfq?.created_at, active: !!linkedRfq },
    { label: 'Quotes Received', date: linkedQuotes[0]?.created_at, active: linkedQuotes.length > 0 },
    { label: 'Vendor Selected', date: linkedSelection?.created_at, active: !!linkedSelection },
    { label: 'PO Issued', date: null, active: selectedRow.status === 'po_issued' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2fr]">
      <div className="space-y-2 max-h-[700px] overflow-y-auto pr-2">
        {rows.map((row) => (
          <div 
            key={row.id} 
            onClick={() => onSelectPr(row.id)}
            className={`cursor-pointer rounded-lg border p-3 transition-colors ${selectedRow?.id === row.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
          >
            <div className="flex justify-between items-start mb-1">
              <p className="font-bold text-foreground">{row.pr_number}</p>
              <StatusBadge status={row.status} />
            </div>
            <p className="text-sm text-muted-foreground truncate">{row.title}</p>
            <div className="mt-2 flex justify-between items-center text-xs">
              <p className="font-semibold text-primary">{formatCurrency(row.estimated_cost)}</p>
              <span className="text-muted-foreground">{row.purchase_requisition_lines?.length || 0} items</span>
            </div>
          </div>
        ))}
      </div>

      {selectedRow && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm overflow-y-auto max-h-[800px]">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start border-b border-border pb-4 mb-6 gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold">{selectedRow.pr_number}</h3>
                <StatusBadge status={selectedRow.status} />
              </div>
              <p className="text-foreground font-medium text-lg">{selectedRow.title}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                <p>Requested: <span className="font-medium text-foreground">{new Date(selectedRow.requested_date).toLocaleDateString()}</span></p>
                <p>Required By: <span className={`font-medium ${!selectedRow.required_date ? 'text-red-500' : 'text-foreground'}`}>{selectedRow.required_date ? new Date(selectedRow.required_date).toLocaleDateString() : 'Missing!'}</span></p>
              </div>
            </div>
            <div className="text-right lg:min-w-[150px]">
              <p className="text-2xl font-bold text-primary">{formatCurrency(selectedRow.estimated_cost)}</p>
              {selectedRow.finance_required && (
                <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded mt-2 inline-block">Finance Review Required</span>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="mb-6">
            <h4 className="text-sm font-bold uppercase text-muted-foreground mb-3">Procurement Timeline</h4>
            <div className="flex items-center overflow-x-auto pb-2 gap-1 scrollbar-thin">
              {timeline.map((step, idx) => (
                <div key={step.label} className="flex items-center min-w-max">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${step.active ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-muted text-muted-foreground border border-border'}`}>
                    {step.active ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current" />}
                    {step.label}
                  </div>
                  {idx < timeline.length - 1 && <div className={`w-6 h-0.5 mx-1 ${step.active ? 'bg-primary/50' : 'bg-border'}`} />}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Purchase Reason & Context */}
            <div>
              <h4 className="text-sm font-bold uppercase text-muted-foreground mb-3">Purchase Context</h4>
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                {linkedMr?.justification && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Site Engineer's Reason:</span>
                    <p className="text-sm text-foreground">{linkedMr.justification}</p>
                  </div>
                )}
                {selectedRow.assigned_team_notes ? (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">PR Team Notes:</span>
                    <p className="text-sm text-foreground">{selectedRow.assigned_team_notes}</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">PR Team Notes:</span>
                    <p className="text-sm italic text-muted-foreground">No notes added.</p>
                  </div>
                )}
                {linkedMr?.stock_decision && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Stock Decision:</span>
                    <p className="text-sm text-foreground">{linkedMr.stock_decision}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Linked Material Request */}
            <div>
              <h4 className="text-sm font-bold uppercase text-muted-foreground mb-3">Linked Material Request</h4>
              {linkedMr ? (
                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-primary">{linkedMr.mr_number}</span>
                    <StatusBadge status={linkedMr.status} />
                  </div>
                  <p className="text-sm">Raised By: <span className="font-medium">{linkedMr.profiles?.name || 'Unknown'}</span></p>
                  <p className="text-sm">Priority: <span className="font-medium uppercase">{linkedMr.priority}</span></p>
                </div>
              ) : (
                <EmptyState message="No linked Material Request found." />
              )}
            </div>
          </div>

          {/* Line Items */}
          <div className="mb-6">
            <h4 className="text-sm font-bold uppercase text-muted-foreground mb-3">Material Items ({selectedRow.purchase_requisition_lines?.length || 0})</h4>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 font-semibold text-right">Qty</th>
                    <th className="px-3 py-2 font-semibold text-right">Est. Rate</th>
                    <th className="px-3 py-2 font-semibold text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedRow.purchase_requisition_lines?.map(line => (
                    <tr key={line.id} className="hover:bg-muted/50">
                      <td className="px-3 py-2">
                        {line.item_description}
                        {!line.item_description.trim() && <span className="text-xs text-red-500 ml-2">(Unclear detail)</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{line.quantity}</td>
                      <td className="px-3 py-2 text-right">
                        {line.estimated_rate ? formatCurrency(line.estimated_rate) : <span className="text-amber-500 text-xs">Rate Pending</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {line.estimated_rate ? formatCurrency(line.estimated_rate * line.quantity) : '-'}
                      </td>
                    </tr>
                  ))}
                  {(!selectedRow.purchase_requisition_lines || selectedRow.purchase_requisition_lines.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-red-500 font-medium">No items found. Cannot move forward.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex gap-2">
              {onEdit && (
                <button type="button" onClick={() => onEdit(selectedRow.id)} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">
                  <Pencil className="h-4 w-4" />
                  Open PR
                </button>
              )}
              <button type="button" onClick={() => onPdf(selectedRow)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                <FileDown className="h-4 w-4" />
                {attachments.some(a => a.entity_id === selectedRow.id) ? 'Regenerate PDF' : 'Generate PDF'}
              </button>
              <button type="button" onClick={() => onOpenPdf(selectedRow)} disabled={!attachments.some(a => a.entity_id === selectedRow.id)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                <Eye className="h-4 w-4" />
                Preview PDF
              </button>
            </div>
            
            <div className="flex gap-2">
              <button type="button" onClick={() => onAssign(selectedRow)} disabled={selectedRow.status !== 'submitted'} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                Assign to Me
              </button>
              <button type="button" onClick={() => onApprove(selectedRow)} disabled={selectedRow.status === 'approved' || selectedRow.status === 'rfq_sent' || selectedRow.status === 'vendor_selected'} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">
                Approve
              </button>
              
              {!linkedRfq ? (
                <button 
                  type="button" 
                  onClick={() => onRfq(selectedRow)} 
                  disabled={selectedRow.status !== 'approved' || !selectedRow.purchase_requisition_lines?.length} 
                  className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <UserPlus className="h-4 w-4" />
                  Create RFQ
                </button>
              ) : (
                <button 
                  type="button" 
                  disabled
                  className="rounded-md border border-primary text-primary bg-primary/5 px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  RFQ Linked: {linkedRfq.rfq_number}
                </button>
              )}

              {selectedRow.status === 'vendor_selected' && (
                <button type="button" onClick={() => onGeneratePo(selectedRow)} className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-bold text-white inline-flex items-center gap-1.5">
                  <Truck className="h-4 w-4" />
                  Generate PO
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
