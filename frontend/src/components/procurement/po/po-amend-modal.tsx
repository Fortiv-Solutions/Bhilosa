'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  FileEdit,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
} from 'lucide-react';
import {
  submitPoAmendment,
  approvePoAmendment,
  rejectPoAmendment,
  fetchPoAmendments,
  fetchPoRevisions,
  type PoAmendmentRecord,
  type PoRevisionRecord,
} from '@/lib/procurement';

interface PoAmendModalProps {
  poId: string;
  poNumber: string;
  currentRevision: number;
  isAmendmentPending: boolean;
  lines: Array<{
    id: string;
    item_description: string;
    unit_rate: number;
    quantity: number;
    approved_qty?: number;
    received_qty?: number;
    accepted_qty?: number;
    unit: string;
  }>;
  onSuccess: () => void;
  onClose: () => void;
}

export function PoAmendModal({
  poId,
  poNumber,
  currentRevision,
  isAmendmentPending,
  lines,
  onSuccess,
  onClose,
}: PoAmendModalProps) {
  const [activeTab, setActiveTab] = useState<'amend' | 'history'>('amend');
  const [reason, setReason] = useState('');
  const [amendmentType, setAmendmentType] = useState<'rate_change' | 'qty_change' | 'terms_change'>('rate_change');
  
  // Edited rates / quantities per line
  const [editedLines, setEditedLines] = useState<
    Record<string, { new_rate: number; new_qty: number }>
  >(() => {
    const map: Record<string, { new_rate: number; new_qty: number }> = {};
    lines.forEach((l) => {
      map[l.id] = { new_rate: l.unit_rate, new_qty: l.quantity };
    });
    return map;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History & Pending Amendment states
  const [amendments, setAmendments] = useState<PoAmendmentRecord[]>([]);
  const [revisions, setRevisions] = useState<PoRevisionRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState('');

  useEffect(() => {
    let isMounted = true;
    setLoadingHistory(true);
    Promise.all([fetchPoAmendments(poId), fetchPoRevisions(poId)])
      .then(([amendList, revList]) => {
        if (isMounted) {
          setAmendments(amendList);
          setRevisions(revList);
          setLoadingHistory(false);
        }
      })
      .catch((err) => {
        if (isMounted) setLoadingHistory(false);
      });
    return () => {
      isMounted = false;
    };
  }, [poId]);

  const pendingAmendment = amendments.find((a) => a.status === 'pending');

  const calculateTotals = () => {
    let origTotal = 0;
    let newTotal = 0;
    lines.forEach((l) => {
      origTotal += l.quantity * l.unit_rate;
      const ed = editedLines[l.id] || { new_rate: l.unit_rate, new_qty: l.quantity };
      newTotal += ed.new_qty * ed.new_rate;
    });
    return { origTotal, newTotal, delta: newTotal - origTotal };
  };

  const totals = calculateTotals();

  const handleSubmitAmendment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a reason for the amendment.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const lineDiffs = lines.map((l) => {
      const ed = editedLines[l.id] || { new_rate: l.unit_rate, new_qty: l.quantity };
      return {
        id: l.id,
        item_description: l.item_description,
        old_unit_rate: l.unit_rate,
        unit_rate: ed.new_rate,
        old_quantity: l.quantity,
        quantity: ed.new_qty,
      };
    });

    const diffPayload = {
      lines: lineDiffs,
      original_total: totals.origTotal,
      amended_total: totals.newTotal,
      price_delta: totals.delta,
    };

    const { error: err } = await submitPoAmendment(poId, amendmentType, reason, diffPayload);

    setSubmitting(false);

    if (err) {
      setError(err.message || 'Failed to submit PO amendment.');
      return;
    }

    onSuccess();
  };

  const handleApproveAmendment = async (amendmentId: string) => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await approvePoAmendment(amendmentId, reviewRemarks);
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Failed to approve amendment.');
      return;
    }
    onSuccess();
  };

  const handleRejectAmendment = async (amendmentId: string) => {
    if (!reviewRemarks.trim()) {
      setError('Please enter rejection remarks.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await rejectPoAmendment(amendmentId, reviewRemarks);
    setSubmitting(false);
    if (err) {
      setError(err.message || 'Failed to reject amendment.');
      return;
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-primary/10 shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <FileEdit className="h-5 w-5" />
            <div>
              <h2 className="font-heading text-base font-bold uppercase tracking-wider">
                PO Revision Studio ({poNumber})
              </h2>
              <p className="text-[11px] font-semibold text-muted-foreground">
                Current Active Version: Rev {currentRevision}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-muted/40 px-5 pt-2 shrink-0 gap-2">
          <button
            onClick={() => setActiveTab('amend')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'amend'
                ? 'border-primary text-primary bg-card'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {pendingAmendment ? '⚡ Pending Amendment Review' : '✏️ Initiate New Amendment'}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-primary text-primary bg-card'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="h-3.5 w-3.5" /> Revision Audit History ({revisions.length})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'amend' && (
            <>
              {pendingAmendment ? (
                /* PENDING AMENDMENT REVIEW MODE */
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                        Pending Revision {pendingAmendment.revision_number} Request
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                        Submitted on {new Date(pendingAmendment.requested_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-foreground">
                      <strong className="text-muted-foreground">Reason:</strong> {pendingAmendment.reason}
                    </p>
                  </div>

                  {/* Lines Diff Display */}
                  <div className="rounded-xl border border-border bg-background p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase text-muted-foreground">Proposed Commercial Line Changes</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-muted/60 font-bold uppercase text-[10px] text-muted-foreground">
                          <tr>
                            <th className="p-2">Item Description</th>
                            <th className="p-2 text-right">Old Rate</th>
                            <th className="p-2 text-right">New Rate</th>
                            <th className="p-2 text-right">Old Qty</th>
                            <th className="p-2 text-right">New Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {(pendingAmendment.changes_diff?.lines || []).map((l: any, idx: number) => (
                            <tr key={idx} className="font-mono text-xs">
                              <td className="p-2 font-sans font-bold text-foreground">{l.item_description}</td>
                              <td className="p-2 text-right text-muted-foreground">₹{Number(l.old_unit_rate || 0).toFixed(2)}</td>
                              <td className="p-2 text-right font-bold text-primary">₹{Number(l.unit_rate || 0).toFixed(2)}</td>
                              <td className="p-2 text-right text-muted-foreground">{l.old_quantity}</td>
                              <td className="p-2 text-right font-bold text-primary">{l.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3 font-mono text-xs">
                      <span className="font-sans font-bold text-muted-foreground">Total Value Impact:</span>
                      <span className={`font-extrabold ${pendingAmendment.changes_diff?.price_delta > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                        {pendingAmendment.changes_diff?.price_delta > 0 ? '+' : ''}₹{Number(pendingAmendment.changes_diff?.price_delta || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Review Remarks */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">
                      Reviewer Remarks / Feedback
                    </label>
                    <input
                      type="text"
                      value={reviewRemarks}
                      onChange={(e) => setReviewRemarks(e.target.value)}
                      placeholder="Optional remarks for approval or mandatory reason for rejection..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {/* Approval / Rejection Actions */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={() => handleRejectAmendment(pendingAmendment.id)}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                    >
                      <XCircle className="h-4 w-4" /> Reject Amendment
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveAmendment(pendingAmendment.id)}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Approve Revision {pendingAmendment.revision_number}
                    </button>
                  </div>
                </div>
              ) : (
                /* INITIATE NEW AMENDMENT FORM */
                <form onSubmit={handleSubmitAmendment} className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-primary mb-1">Amendment Type</label>
                      <select
                        value={amendmentType}
                        onChange={(e) => setAmendmentType(e.target.value as any)}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground cursor-pointer"
                      >
                        <option value="rate_change">Unit Rate Adjustment (Price Revision)</option>
                        <option value="qty_change">Quantity Adjustment</option>
                        <option value="terms_change">Commercial / Terms Revision</option>
                      </select>
                    </div>

                    <div className="text-right font-mono text-xs">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Net Delta</span>
                      <span className={`font-extrabold text-sm ${totals.delta > 0 ? 'text-destructive' : totals.delta < 0 ? 'text-emerald-600' : 'text-foreground'}`}>
                        {totals.delta > 0 ? '+' : ''}₹{totals.delta.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Line Rate & Quantity Edit Grid */}
                  <div className="rounded-xl border border-border shadow-2xs overflow-hidden">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-muted/60 font-bold uppercase text-[10px] text-muted-foreground border-b border-border">
                        <tr>
                          <th className="p-2.5">Item Description</th>
                          <th className="p-2.5 text-right">Current Rate (₹)</th>
                          <th className="p-2.5 text-right font-bold text-primary">New Rate (₹)</th>
                          <th className="p-2.5 text-right">Ordered Qty</th>
                          <th className="p-2.5 text-right font-bold text-primary">New Qty</th>
                          <th className="p-2.5 text-right">Line Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lines.map((line) => {
                          const ed = editedLines[line.id] || { new_rate: line.unit_rate, new_qty: line.quantity };
                          const lineTotal = ed.new_qty * ed.new_rate;
                          return (
                            <tr key={line.id} className="hover:bg-muted/30 font-mono">
                              <td className="p-2.5 font-sans font-bold text-foreground">{line.item_description}</td>
                              <td className="p-2.5 text-right text-muted-foreground">₹{line.unit_rate.toFixed(2)}</td>
                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={ed.new_rate}
                                  onChange={(e) => {
                                    const val = Number(e.target.value || 0);
                                    setEditedLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...ed, new_rate: val },
                                    }));
                                  }}
                                  className="w-24 rounded border-2 border-primary/50 bg-background px-2 py-1 text-right text-xs font-bold text-primary outline-none"
                                />
                              </td>
                              <td className="p-2.5 text-right text-muted-foreground">{line.quantity} {line.unit}</td>
                              <td className="p-2.5 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={ed.new_qty}
                                  onChange={(e) => {
                                    const val = Number(e.target.value || 0);
                                    setEditedLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...ed, new_qty: val },
                                    }));
                                  }}
                                  className="w-20 rounded border border-border bg-background px-2 py-1 text-right text-xs font-bold text-foreground outline-none"
                                />
                              </td>
                              <td className="p-2.5 text-right font-extrabold text-foreground">
                                ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-foreground mb-1.5">
                      Amendment Rationale / Reason <span className="text-destructive">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="State justification for supplier price adjustment or quantity modification..."
                      rows={3}
                      required
                      className="w-full rounded-lg border border-border bg-background p-3 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !reason.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <ShieldCheck className="h-4 w-4" /> Submit Amendment Request (Rev {currentRevision + 1})
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {loadingHistory ? (
                <p className="text-xs font-medium text-muted-foreground text-center py-6">Loading audit trail…</p>
              ) : revisions.length === 0 && amendments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs font-bold">No Previous Revisions Found</p>
                  <p className="text-[11px] mt-1">This Purchase Order is currently on its original Revision 0 release.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {amendments.map((am) => (
                    <div key={am.id} className="rounded-xl border border-border bg-background p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold font-mono text-primary">Revision {am.revision_number} Amendment</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          am.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' :
                          am.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
                        }`}>
                          {am.status}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-foreground">
                        <strong className="text-muted-foreground">Reason:</strong> {am.reason}
                      </p>
                      {am.review_remarks && (
                        <p className="text-xs font-medium text-muted-foreground italic">
                          Remarks: "{am.review_remarks}"
                        </p>
                      )}
                      <div className="text-[10px] text-muted-foreground flex justify-between pt-1 border-t border-border/50">
                        <span>Requested: {new Date(am.requested_at).toLocaleString()}</span>
                        {am.reviewed_at && <span>Reviewed: {new Date(am.reviewed_at).toLocaleString()}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
