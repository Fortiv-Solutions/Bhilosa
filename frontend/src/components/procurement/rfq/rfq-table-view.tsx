'use client';

import {
  FileText,
  Building2,
  Layers,
  Send,
  FileCheck2,
  Users,
  CheckCircle2,
  Edit3,
  Eye,
  Printer,
  FileSpreadsheet,
  Award,
  Clock,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { PurchaseRequisitionRow, RfqRow, QuotationRow, VendorSelectionRow } from '@/lib/procurement';

interface RfqTableViewProps {
  approvedPrs: PurchaseRequisitionRow[];
  rfqs: RfqRow[];
  quotations: QuotationRow[];
  selections: VendorSelectionRow[];
  onCreateRfq: (pr: PurchaseRequisitionRow) => void;
  onRecordQuote: (rfq: RfqRow) => void;
  onViewComparison: (rfqId: string) => void;
  onOpenAwardMatrix?: (rfqId: string) => void;
  onPrintRfq?: (pr: PurchaseRequisitionRow) => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '₹0';
  return `₹${val.toLocaleString('en-IN')}`;
}

export function RfqTableView({
  approvedPrs,
  rfqs,
  quotations,
  selections,
  onCreateRfq,
  onRecordQuote,
  onViewComparison,
  onOpenAwardMatrix,
}: RfqTableViewProps) {
  if (approvedPrs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
          No Approved Requisitions found for RFQ
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Once a Purchase Requisition is approved, an RFQ Draft is automatically created and displayed here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead>
              <tr className="border-b border-border bg-muted/50 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3.5">RFQ No. &amp; Source Approved PR</th>
                <th className="px-4 py-3.5">Company &amp; Project</th>
                <th className="px-4 py-3.5">Work Activity &amp; Site</th>
                <th className="px-4 py-3.5">Prepared By / Date</th>
                <th className="px-4 py-3.5">Items &amp; Value</th>
                <th className="px-4 py-3.5">RFQ &amp; Vendor Sourcing Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {approvedPrs.map((pr, idx) => {
                const lineCount = pr.purchase_requisition_lines?.length || 0;
                const totalAmt = Number(pr.total_amount || pr.subtotal_amount || 0);
                const sourceMr = pr.purchase_requisition_lines?.[0]?.source_mr_number || null;

                const linkedRfq = rfqs.find((r) => r.purchase_requisition_id === pr.id) || null;
                const rfqQuotes = linkedRfq ? quotations.filter((q) => q.rfq_id === linkedRfq.id) : [];
                const linkedSelection = selections.find((s) => s.purchase_requisition_id === pr.id) || null;

                const rfqNumber = linkedRfq?.rfq_number || `RFQ-20260722-00${idx + 1}`;
                const projectName = (pr as any).projects?.name || 'Silvassa Unit I - Polyester Division';

                return (
                  <tr
                    key={pr.id}
                    className="group hover:bg-muted/30 transition-colors align-top"
                  >
                    {/* Column 1: RFQ No. & Source Approved PR */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono font-bold text-foreground hover:text-primary transition-colors text-xs">
                          {rfqNumber}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold font-mono text-blue-600 dark:text-blue-400">
                            From {pr.pr_number || 'PR-Approved'}
                          </span>
                          {sourceMr && (
                            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                              {sourceMr}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Column 2: Company & Project */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-foreground text-xs truncate max-w-[200px]">
                          {pr.company_name || 'Bhilosa Industries Private Limited'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground/60" />
                          {projectName}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: Work Activity & Site */}
                    <td className="px-4 py-4 font-semibold text-muted-foreground text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-foreground font-medium truncate max-w-[160px]">
                          {pr.activity_name || pr.purchase_requisition_lines?.[0]?.activity_name || 'Yarn Spinning'}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                          {pr.delivery_address || 'Silvassa Unit I'}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Prepared By / Date */}
                    <td className="px-4 py-4 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{(pr as any).created_by_name || 'Bhilosa Admin'}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(pr.created_at || pr.requested_date)}</span>
                      </div>
                    </td>

                    {/* Column 5: Items & Value */}
                    <td className="px-4 py-4 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold font-mono text-foreground">{formatCurrency(totalAmt)}</span>
                        <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                          <Layers className="h-3 w-3 text-primary" />
                          {lineCount} Items
                        </span>
                      </div>
                    </td>

                    {/* Column 6: RFQ & Vendor Sourcing Status */}
                    <td className="px-4 py-4 text-xs">
                      <div className="flex flex-col gap-1.5">
                        {(() => {
                          if (linkedSelection || pr.status === 'vendor_selected' || pr.status === 'po_issued') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                <Award className="h-3.5 w-3.5" /> Vendor Awarded
                              </span>
                            );
                          }
                          if (rfqQuotes.length > 0) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-extrabold text-purple-600 dark:text-purple-400">
                                <Users className="h-3.5 w-3.5" /> {rfqQuotes.length} Quote{rfqQuotes.length > 1 ? 's' : ''} Received
                              </span>
                            );
                          }
                          if (linkedRfq) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-extrabold text-blue-600 dark:text-blue-400">
                                <Send className="h-3.5 w-3.5" /> RFQ Issued
                              </span>
                            );
                          }

                          return (
                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold text-slate-700 dark:bg-slate-950/40 dark:text-slate-300 dark:border-slate-800">
                              <Clock className="h-3.5 w-3.5" /> Draft
                            </span>
                          );
                        })()}
                      </div>
                    </td>

                    {/* Column 7: Actions */}
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onCreateRfq(pr)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background min-w-[65px] px-3 pr-6 py-1.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs cursor-pointer"
                        >
                          {pr.status === 'vendor_selected' || pr.status === 'po_issued' ? (
                            <>
                              <Eye className="h-3.5 w-3.5 text-emerald-600" />
                              <span>View</span>
                            </>
                          ) : (
                            <>
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>Form</span>
                            </>
                          )}
                        </button>

                        {/* Print PDF Report Direct Download Icon Button */}
                        <button
                          onClick={async () => {
                            const { generateRfqPdfBlob, downloadRfqPdfFile } = await import('@/lib/rfq-pdf');
                            const rfqData = {
                              quotation_registration_no: linkedRfq?.rfq_number || `RFQ-${pr.pr_number}`,
                              source_pr_number: pr.pr_number,
                              company_name: pr.company_name || 'Bhilosa Industries Private Limited',
                              project_name: projectName,
                              site_location: pr.site_id || 'Silvassa Unit I',
                              contractor_name: pr.department || 'Plant Store',
                              date: new Date().toISOString().split('T')[0],
                              goal_delivery_date: pr.required_date || new Date().toISOString().split('T')[0],
                              process_type: 'Quotation Request' as const,
                              delivery_address: pr.delivery_address || 'Silvassa Unit I Store',
                              remarks: (pr as any).remarks || '',
                              status: (pr.status || 'Draft') as any,
                              suppliers: [],
                              items: (pr.purchase_requisition_lines || []).map((l, lIdx) => ({
                                key: `item-${lIdx}`,
                                item_id: l.item_id ?? null,
                                item_code: l.item_code || `ITEM-00${lIdx + 1}`,
                                item_group: l.item_group || '',
                                item_brand: l.preferred_brand || l.item_brand || '',
                                item_description: l.item_description,
                                specification: l.specification || l.item_description,
                                activity_name: l.activity_name || '',
                                sub_activity_name: l.sub_activity_name || '',
                                quantity: Number(l.quantity || 1),
                                pr_balance_qty: Number(l.quantity || 1),
                                previous_rate: Number(l.estimated_rate || 0),
                                unit: l.unit || 'kg',
                                required_date: pr.required_date || new Date().toISOString().split('T')[0],
                                remarks: '',
                              })),
                            };
                            const pdfBlob = await generateRfqPdfBlob(rfqData);
                            downloadRfqPdfFile(rfqData, pdfBlob);
                          }}
                          title="Print / Download RFQ PDF Report"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background min-w-[65px] px-2.5 pr-6 py-1.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>

                        {rfqQuotes.length > 0 && (
                          <button
                            onClick={() => onViewComparison(linkedRfq!.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-purple-700 transition-all shadow-2xs cursor-pointer"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span>Compare</span>
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
      </div>
    </div>
  );
}
