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
    <div className="space-y-3">
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

                const projectName =
                  pr.project_id === 'central-park'
                    ? 'Central Park'
                    : pr.project_id === 'riverside-heights'
                    ? 'Riverside Heights'
                    : pr.project_id === 'skyline-towers'
                    ? 'Skyline Towers'
                    : pr.company_name?.includes('Electrical')
                    ? 'Skyline Towers'
                    : 'Central Park';

                return (
                  <tr
                    key={pr.id}
                    className="group hover:bg-muted/30 transition-colors align-middle"
                  >
                    {/* Column 1: RFQ No. & Source Approved PR */}
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-foreground text-xs truncate max-w-[200px]">
                          {pr.company_name || 'Pramukh Group Infrastructure Ltd.'}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground/60" />
                          {projectName}
                        </span>
                      </div>
                    </td>

                    {/* Column 3: Work Activity & Site */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground text-xs truncate max-w-[220px]">
                          {pr.activity_name || 'General Construction'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {pr.wbs_code || pr.activity_code || 'WBS-BLK-A-SL6'}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Prepared By / Date */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground text-xs truncate max-w-[180px]">
                          {pr.department || 'Site Engineer'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {formatDate(pr.created_at || pr.requested_date)}
                        </span>
                      </div>
                    </td>

                    {/* Column 5: Items & Value */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-extrabold text-foreground text-xs">
                          {formatCurrency(totalAmt)}
                        </span>
                        <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                          <Layers className="h-3 w-3 text-primary" />
                          {lineCount} Line Item(s)
                        </span>
                      </div>
                    </td>

                    {/* Column 6: RFQ & Sourcing Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const prSt = (pr.status || '').toLowerCase();
                          const rfqSt = (linkedRfq?.status || '').toLowerCase();

                          if (prSt === 'po_issued' || rfqSt === 'po issued') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="h-3.5 w-3.5" /> PO Issued
                              </span>
                            );
                          }

                          if (prSt === 'vendor_selected' || rfqSt === 'awarded') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-[11px] font-extrabold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Awarded
                              </span>
                            );
                          }

                          if (prSt === 'under_evaluation' || rfqSt === 'under evaluation') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-100 px-2.5 py-1 text-[11px] font-extrabold text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
                                <SlidersHorizontal className="h-3.5 w-3.5" /> Under Evaluation
                              </span>
                            );
                          }

                          if (prSt === 'quotes_received' || rfqSt === 'quotes received') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-extrabold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                <FileCheck2 className="h-3.5 w-3.5" /> Quotes Received
                              </span>
                            );
                          }

                          if (prSt === 'rfq_sent' || rfqSt === 'rfq sent') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-100 px-2.5 py-1 text-[11px] font-extrabold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                                <Send className="h-3.5 w-3.5" /> RFQ Sent
                              </span>
                            );
                          }

                          if (rfqSt === 'cancelled') {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-100 px-2.5 py-1 text-[11px] font-extrabold text-red-800 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800">
                                <X className="h-3.5 w-3.5" /> Cancelled
                              </span>
                            );
                          }

                          if (rfqSt === 'auto-draft' || (!linkedRfq && prSt === 'approved')) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-100 px-2.5 py-1 text-[11px] font-extrabold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800">
                                ⚡ Auto-Draft
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
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onCreateRfq(pr)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs cursor-pointer"
                        >
                          {pr.status === 'vendor_selected' || pr.status === 'po_issued' ? (
                            <>
                              <Eye className="h-3.5 w-3.5 text-emerald-600" />
                              <span>View RFQ Form</span>
                            </>
                          ) : (
                            <>
                              <Edit3 className="h-3.5 w-3.5" />
                              <span>{linkedRfq ? 'Edit RFQ' : 'Open RFQ Form'}</span>
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
                              company_name: pr.company_name || 'Pramukh Group Infrastructure Ltd.',
                              project_name: projectName,
                              site_location: pr.site_id || 'Tower 2 - Commercial',
                              contractor_name: pr.department || 'Site Engineer',
                              date: new Date().toISOString().split('T')[0],
                              goal_delivery_date: pr.required_date || new Date().toISOString().split('T')[0],
                              process_type: 'Quotation Request' as const,
                              delivery_address: pr.delivery_address || 'Project site store',
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
                                unit: l.unit || 'BAGS',
                                required_date: pr.required_date || new Date().toISOString().split('T')[0],
                                remarks: '',
                              })),
                            };
                            const pdfBlob = await generateRfqPdfBlob(rfqData);
                            downloadRfqPdfFile(rfqData, pdfBlob);
                          }}
                          title="Print / Download RFQ PDF Report"
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-1.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs cursor-pointer"
                        >
                          <Printer className="h-4 w-4" />
                        </button>

                        {rfqQuotes.length > 0 && (
                          <button
                            onClick={() => onViewComparison(linkedRfq!.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-purple-700 transition-all shadow-2xs cursor-pointer"
                          >
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                            <span>Compare Quotes</span>
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
