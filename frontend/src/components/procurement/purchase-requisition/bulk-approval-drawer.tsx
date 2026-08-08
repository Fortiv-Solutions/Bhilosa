'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, ShieldCheck, AlertTriangle, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { transitionPurchaseRequisition, getBudgetSnapshotForPr, computeBudgetStatus } from '@/lib/erp/purchase-requisition/service';
import type { PurchaseRequisitionRow } from '@/lib/procurement';

interface BulkApprovalDrawerProps {
  open: boolean;
  selectedPrs: PurchaseRequisitionRow[];
  projectOptions: { id: string; name: string }[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onClearSelection: () => void;
}

export function BulkApprovalDrawer({
  open,
  selectedPrs,
  projectOptions,
  onClose,
  onRefresh,
  onClearSelection,
}: BulkApprovalDrawerProps) {
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [budgetStatuses, setBudgetStatuses] = useState<
    Record<string, { status: string; remaining: number; loading: boolean }>
  >({});

  // Reset states on open/close change
  useEffect(() => {
    if (open) {
      setRemarks('');
      setResults({});
      setBudgetStatuses({});
      
      // Fetch budget snapshots for each selected PR
      selectedPrs.forEach(async (pr) => {
        setBudgetStatuses((prev) => ({
          ...prev,
          [pr.id]: { status: 'loading', remaining: 0, loading: true },
        }));

        try {
          const snap = await getBudgetSnapshotForPr(pr.project_id, pr.budget_head_id);
          const lines = pr.purchase_requisition_lines || [];
          const computedLinesTotal = lines.reduce(
            (sum, l) => sum + Number(l.line_total || (Number(l.quantity || 0) * Number(l.estimated_rate || 0))),
            0
          );
          const totalAmt = Number(pr.estimated_cost || pr.total_amount || pr.subtotal_amount || computedLinesTotal);
          
          const budget = computeBudgetStatus(snap, totalAmt);
          setBudgetStatuses((prev) => ({
            ...prev,
            [pr.id]: { status: budget.status, remaining: budget.remaining, loading: false },
          }));
        } catch (e) {
          console.error(`Failed to fetch budget for PR ${pr.pr_number}:`, e);
          setBudgetStatuses((prev) => ({
            ...prev,
            [pr.id]: { status: 'error', remaining: 0, loading: false },
          }));
        }
      });
    }
  }, [open, selectedPrs]);

  // Compute if any selected PR is over budget or requires comments
  const requiresRemarks = useMemo(() => {
    return selectedPrs.some((pr) => {
      const bStatus = budgetStatuses[pr.id];
      if (bStatus && bStatus.status === 'over_budget') return true;
      if (pr.priority === 'urgent' || pr.priority === 'critical') return true;
      const lines = pr.purchase_requisition_lines || [];
      return lines.some((l) => l.is_non_mr_item || l.is_modified);
    });
  }, [selectedPrs, budgetStatuses]);

  const handleConfirmApproval = async () => {
    if (requiresRemarks && !remarks.trim()) {
      alert('Remarks are required for items that are over budget, urgent/critical, or modified.');
      return;
    }

    setSubmitting(true);
    const runResults: Record<string, { success: boolean; error?: string }> = {};

    for (const pr of selectedPrs) {
      try {
        const res = await transitionPurchaseRequisition(pr.id, {
          action: 'Requisition Approved (Bulk)',
          newStatus: 'approved',
          comment: remarks || 'Bulk approved by Manager',
        });
        if (res.error) {
          runResults[pr.id] = { success: false, error: res.error.message };
        } else {
          runResults[pr.id] = { success: true };
        }
      } catch (e) {
        runResults[pr.id] = { success: false, error: e instanceof Error ? e.message : 'Approval failed' };
      }
    }

    setResults(runResults);
    setSubmitting(false);
    await onRefresh();
  };

  const handleFinish = () => {
    onClearSelection();
    onClose();
  };

  if (!open) return null;

  const showReport = Object.keys(results).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300" onClick={showReport ? handleFinish : onClose} />

      {/* Slide-over Content */}
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-heading text-base font-bold text-foreground">Bulk Requisition Approval</h3>
              <p className="text-[11px] text-muted-foreground">Approve multiple purchase requisitions granularly</p>
            </div>
          </div>
          <button
            onClick={showReport ? handleFinish : onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!showReport ? (
            <>
              {/* Selected List */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Requisitions to Approve ({selectedPrs.length})
                </span>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-muted/10">
                  {selectedPrs.map((pr) => {
                    const lines = pr.purchase_requisition_lines || [];
                    const bStatus = budgetStatuses[pr.id];
                    
                    // Look up actual project name
                    const project = projectOptions.find((p) => p.id === pr.project_id);
                    const projectName = project ? project.name : (pr.project_id || 'Project Site');
                    const raisedBy = pr.created_by_name || (pr as any).profiles?.name || 'Site Engineer';
                    const siteLocation = pr.delivery_address || pr.wbs_code || 'Project Block Site';

                    return (
                      <div key={pr.id} className="p-3 text-xs hover:bg-muted/30 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono font-bold text-foreground text-sm">{pr.pr_number}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                              pr.priority === 'critical' || pr.priority === 'high' || pr.priority === 'urgent'
                                ? 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/20 dark:border-red-900/35 dark:text-red-400'
                                : 'bg-muted/80 text-muted-foreground border border-border/50'
                            }`}>
                              {pr.priority || 'NORMAL'}
                            </span>
                            <span className="rounded bg-primary/5 text-primary border border-primary/10 px-1.5 py-0.5 text-[9px] font-bold">
                              Items: {lines.length}
                            </span>
                            {bStatus?.loading ? (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/60" />
                              </span>
                            ) : bStatus?.status === 'over_budget' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-red-50 dark:bg-red-950/20 border border-red-200 px-1.5 py-0.5 text-[9px] font-extrabold text-red-600 dark:text-red-400">
                                Over Budget
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400">
                                Within Budget
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Condensed Inline Metadata Row */}
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground font-medium">
                          <span>
                            <strong className="text-foreground/75">By:</strong> {raisedBy}
                          </span>
                          <span>·</span>
                          <span>
                            <strong className="text-foreground/75">Project:</strong> {projectName}
                          </span>
                          <span>·</span>
                          <span className="truncate max-w-[200px]" title={siteLocation}>
                            <strong className="text-foreground/75">Site:</strong> {siteLocation}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Warnings */}
              {requiresRemarks && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-bold">Remarks Required</span>
                    <p className="mt-0.5 text-[11px] text-amber-700/90 dark:text-amber-400/90 leading-relaxed">
                      One or more selected requisitions are either over budget, urgent/critical, or contain custom items. You must provide explanation comments below to confirm approval.
                    </p>
                  </div>
                </div>
              )}

              {/* Remarks Field */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">
                  Approval Remarks {requiresRemarks && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter approval remarks..."
                  className="w-full min-h-[96px] rounded-lg border border-border bg-background p-2.5 text-xs outline-none focus:border-primary font-medium"
                />
              </div>
            </>
          ) : (
            /* Post-run Detailed Report */
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <h4 className="mt-2 text-sm font-bold text-foreground">Bulk Run Completed</h4>
                <p className="text-xs text-muted-foreground">
                  Approved {Object.values(results).filter((r) => r.success).length} out of {selectedPrs.length} requisitions
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Processing Results
                </span>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
                  {selectedPrs.map((pr) => {
                    const res = results[pr.id];
                    return (
                      <div key={pr.id} className="flex items-center justify-between p-3.5 text-xs">
                        <div>
                          <span className="font-mono font-bold text-foreground block">{pr.pr_number}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{pr.company_name}</span>
                        </div>
                        <div>
                          {res?.success ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                            </span>
                          ) : (
                            <span
                              title={res?.error || 'Failed'}
                              className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/40 px-2.5 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Failed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-2">
            {!showReport ? (
              <>
                <button
                  disabled={submitting}
                  onClick={onClose}
                  className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  disabled={submitting || (requiresRemarks && !remarks.trim())}
                  onClick={handleConfirmApproval}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40 shadow-sm"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Confirm Approval</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={handleFinish}
                className="rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                Close Drawer
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
