import React from 'react';
import { 
  RfqRow, 
  PurchaseRequisitionRow, 
  QuotationRow, 
  PurchaseOrderRow,
  VendorSelectionRow
} from '@/lib/procurement';
import { formatCurrency, StatusBadge, EmptyState } from './shared';
import { BadgeCheck, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { QuotationComparison } from './quotation-comparison';

function ReviewTile({ label, value, highlight = false, alert = false }: { label: string; value: string; highlight?: boolean; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-primary bg-primary/5' : alert ? 'border-red-200 bg-red-50' : 'border-border bg-card'}`}>
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? 'text-primary' : alert ? 'text-red-700' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

export function RfqWorkbench({
  rfqs,
  prs,
  quotations,
  selections,
  purchaseOrders,
  selectedRfqId,
  onSelectRfq,
  onRecordQuote,
  onRecommend,
  onApproveSelection,
  onGeneratePo,
  canApprove,
}: {
  rfqs: RfqRow[];
  prs: PurchaseRequisitionRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  purchaseOrders: PurchaseOrderRow[];
  selectedRfqId: string | null;
  onSelectRfq: (id: string | null) => void;
  onRecordQuote: (row: RfqRow, vendorId?: string) => void;
  onRecommend: (row: QuotationRow) => void;
  onApproveSelection: (row: VendorSelectionRow) => void;
  onGeneratePo: (pr: PurchaseRequisitionRow, quotation: QuotationRow, selection: VendorSelectionRow) => void;
  canApprove: boolean;
}) {
  if (rfqs.length === 0) return <EmptyState message="No RFQs found. Create an RFQ from an approved PR first." />;

  const selectedRfq = rfqs.find((row) => row.id === selectedRfqId) || rfqs[0];
  const selectedPr = prs.find((row) => row.id === selectedRfq.purchase_requisition_id) || null;
  
  const rfqQuotations = quotations
    .filter((quotation) => quotation.rfq_id === selectedRfq.id)
    .sort((a, b) => Number(b.quotation_scores?.[0]?.weighted_score || 0) - Number(a.quotation_scores?.[0]?.weighted_score || 0));
    
  const selection = selections.find((row) => row.purchase_requisition_id === selectedRfq.purchase_requisition_id) || null;
  
  const selectedQuotation = selection
    ? rfqQuotations.find((quotation) => quotation.id === selection.selected_quotation_id) || selection.vendor_quotations || null
    : null;
    
  const existingPo = purchaseOrders.find((po) => po.vendor_selection_id === selection?.id);
  const canGeneratePo = Boolean(selectedPr && selectedQuotation && selection?.status === 'approved' && !existingPo);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2.5fr]">
      <div className="max-h-[800px] space-y-2 overflow-y-auto pr-1">
        {rfqs.map((row) => {
          const isSelected = selectedRfq.id === row.id;
          const qCount = quotations.filter(q => q.rfq_id === row.id).length;
          const vCount = row.rfq_vendors?.length || 0;
          
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectRfq(row.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-foreground">{row.rfq_number}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{row.title}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-semibold text-muted-foreground">
                <span className="rounded-md bg-muted px-2 py-1 border border-border/50 text-center">{vCount} vendor(s)</span>
                <span className={`rounded-md px-2 py-1 border text-center ${qCount > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-muted border-border/50'}`}>
                  {qCount} quote(s)
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 pb-10">
        {/* RFQ Header */}
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold text-foreground">{selectedRfq.rfq_number}</h3>
                <StatusBadge status={selectedRfq.status} />
              </div>
              <p className="text-lg font-medium text-foreground">{selectedRfq.title}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 text-sm text-muted-foreground">
                <p>Linked PR: <span className="font-semibold text-foreground">{selectedPr?.pr_number || 'not linked'}</span></p>
                <p>Issued: <span className="font-semibold text-foreground">{selectedRfq.issue_date}</span></p>
                <p>Due: <span className={`font-semibold ${!selectedRfq.due_date ? 'text-red-500' : 'text-foreground'}`}>{selectedRfq.due_date || 'Not set'}</span></p>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => onRecordQuote(selectedRfq)} 
              disabled={!selectedRfq.rfq_vendors?.length} 
              className="inline-flex h-fit items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              Add Quotation
            </button>
          </div>

          <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-4">
            <ReviewTile label="Invited Vendors" value={`${selectedRfq.rfq_vendors?.length || 0}`} />
            <ReviewTile label="Quotations Received" value={`${rfqQuotations.length}`} highlight={rfqQuotations.length > 0} />
            <ReviewTile 
              label="Finalization" 
              value={selection ? (selection.status === 'approved' ? 'Approved' : 'Pending Approval') : 'Pending'} 
              highlight={selection?.status === 'approved'}
            />
            <ReviewTile 
              label="PO Status" 
              value={existingPo ? existingPo.po_number : 'Pending'} 
              highlight={!!existingPo} 
            />
          </div>
        </div>

        {/* Vendor Recommendation / Selection Card */}
        {selection && (
          <div className="rounded-xl border-2 border-emerald-500/20 bg-emerald-50/30 p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <BadgeCheck className="h-6 w-6 text-emerald-600" />
                  <h3 className="text-lg font-bold text-foreground">Vendor Recommendation</h3>
                  <StatusBadge status={selection.status} />
                  {selection.status === 'pending_approval' && (
                    <span className="ml-2 text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                      Requires Management Approval
                    </span>
                  )}
                </div>
                <p className="mt-2 text-base text-foreground font-medium">
                  {selection.vendors?.display_name || selection.vendors?.legal_name || selectedQuotation?.vendors?.display_name || selectedQuotation?.vendors?.legal_name || 'Vendor'} 
                  <span className="mx-2 text-muted-foreground">|</span> 
                  <span className="text-emerald-700 font-bold">{formatCurrency(selection.final_amount ?? 0)}</span>
                </p>
                <div className="mt-3 p-3 rounded-lg bg-background border border-border">
                  <span className="text-xs font-bold uppercase text-muted-foreground block mb-1">Reason for Selection</span>
                  <p className="text-sm text-foreground">{selection.reason_for_selection || 'No remarks recorded.'}</p>
                </div>
              </div>
              
              <div className="flex flex-col gap-2 min-w-[200px]">
                <button 
                  type="button" 
                  onClick={() => onApproveSelection(selection)} 
                  disabled={!canApprove || selection.status === 'approved'} 
                  className="w-full rounded-md border border-emerald-600 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 disabled:border-border disabled:text-muted-foreground disabled:bg-muted"
                >
                  {selection.status === 'approved' ? 'Approval Granted' : 'Approve Finalization'}
                </button>
                <button 
                  type="button" 
                  onClick={() => selectedPr && selectedQuotation && onGeneratePo(selectedPr, selectedQuotation, selection)} 
                  disabled={!canGeneratePo} 
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {existingPo ? (
                    <><CheckCircle2 className="w-4 h-4" /> PO Issued</>
                  ) : (
                    'Generate PO'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vendors and Comparisons */}
        <div className="space-y-4">
          <QuotationComparison 
            quotations={rfqQuotations} 
            selection={selection} 
            onRecommend={onRecommend} 
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-bold uppercase text-foreground mb-4">Invited Vendors Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedRfq.rfq_vendors?.map((rfqVendor) => {
                const vendorQuote = rfqQuotations.find((quote) => quote.vendor_id === rfqVendor.vendor_id);
                const isBlacklisted = rfqVendor.vendors?.compliance_status === 'blacklisted';
                
                return (
                  <div key={rfqVendor.id} className={`rounded-lg border p-4 ${isBlacklisted ? 'border-red-200 bg-red-50/50' : 'border-border'}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className={`font-bold truncate ${isBlacklisted ? 'text-red-700' : 'text-foreground'}`}>
                        {rfqVendor.vendors?.display_name || rfqVendor.vendors?.legal_name || 'Vendor'}
                      </p>
                      {vendorQuote ? (
                        <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">Quoted</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border/50">Pending</span>
                      )}
                    </div>
                    
                    <div className="space-y-1 mb-4">
                      <p className="text-xs text-muted-foreground">
                        Rating: <span className="font-semibold text-foreground">{rfqVendor.vendors?.rating || 0}/5</span>
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        Status: 
                        {isBlacklisted ? (
                          <span className="font-semibold text-red-600 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Blacklisted</span>
                        ) : (
                          <span className="font-semibold text-foreground">{rfqVendor.vendors?.compliance_status ? rfqVendor.vendors.compliance_status.replaceAll('_', ' ') : 'compliance pending'}</span>
                        )}
                      </p>
                    </div>

                    <button 
                      type="button" 
                      onClick={() => onRecordQuote(selectedRfq, rfqVendor.vendor_id)} 
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-bold hover:bg-muted transition-colors"
                    >
                      {vendorQuote ? 'Revise Quote Details' : 'Record Quotation'}
                    </button>
                  </div>
                );
              })}
              {(!selectedRfq.rfq_vendors || selectedRfq.rfq_vendors.length === 0) && (
                <div className="col-span-full">
                  <EmptyState message="No vendors have been invited to this RFQ yet." />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
