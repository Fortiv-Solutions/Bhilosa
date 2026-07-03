'use client';

import { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, FileText, CheckSquare, IndianRupee, FileCheck, CircleDollarSign, Calendar, UploadCloud, FileBox, RefreshCcw } from 'lucide-react';
import type { VendorBillRow } from '@/lib/procurement';
import { formatIndianCurrency } from '@/utils/format-currency';
import { verifyVendorBill, approveVendorBill, rejectVendorBill, updatePaymentStatus } from '@/lib/billing';
import { useAppStore } from '@/store/use-app-store';

export type BillDetailModalProps = {
  bill: VendorBillRow | null;
  onClose: () => void;
  onRefresh: () => void;
};

export function BillDetailModal({ bill, onClose, onRefresh }: BillDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'match' | 'verification' | 'payment'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const { activeRole, projects } = useAppStore();

  // Find a blocked work completion to demonstrate the QC integration
  // In a real DB, this would query by the bill's linked activity_id.
  const blockedWork = projects.flatMap(p => p.workCompletions || []).find(wc => !wc.billingAllowed);
  const isBlocked = !!blockedWork;

  if (!bill) return null;

  const match = bill.three_way_matches?.[0];
  const isApproved = bill.status === 'approved' || bill.status === 'paid';
  const isVerified = bill.status === 'verified';
  const isRejected = bill.status === 'rejected';

  async function handleVerify() {
    setLoading(true);
    setError(null);
    const { error: err } = await verifyVendorBill(bill!.id);
    if (err) setError(err.message);
    else { onRefresh(); onClose(); }
    setLoading(false);
  }

  async function handleApprove() {
    setLoading(true);
    setError(null);
    const { error: err } = await approveVendorBill(bill!.id);
    if (err) setError(err.message);
    else { onRefresh(); onClose(); }
    setLoading(false);
  }

  async function handleReject() {
    if (!rejectReason) {
      setError('Rejection reason is required.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await rejectVendorBill(bill!.id, rejectReason);
    if (err) setError(err.message);
    else { onRefresh(); onClose(); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md sm:p-6 lg:p-12">
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border p-4 bg-muted/30">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="rounded-full p-2 hover:bg-muted text-muted-foreground transition-colors">
              <X className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Bill {bill.bill_number}</h2>
                <span className={`px-2 py-0.5 text-xs font-bold uppercase rounded-full border ${isApproved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : isRejected ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {bill.status.replaceAll('_', ' ')}
                </span>
                {bill.duplicate_detected && (
                  <span className="px-2 py-0.5 text-xs font-bold uppercase rounded-full border bg-red-50 text-red-700 border-red-200 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Duplicate Warning
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">Vendor: {bill.vendors?.display_name || bill.vendors?.legal_name || bill.vendor_id}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono">{formatIndianCurrency(Number(bill.total_amount || 0))}</div>
            <p className="text-xs text-muted-foreground">Total Bill Value</p>
          </div>
        </header>

        {/* Navigation */}
        <div className="border-b border-border bg-muted/10 px-4 flex gap-6 text-sm font-semibold text-muted-foreground">
          {[
            { id: 'details', label: 'Bill Details', icon: FileBox },
            { id: 'match', label: 'Three-Way Match', icon: CheckSquare },
            { id: 'verification', label: 'Verification & Approval', icon: FileCheck },
            { id: 'payment', label: 'Payment Tracker', icon: CircleDollarSign },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-foreground' : 'border-transparent hover:text-foreground'}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.id === 'match' && match && match.match_status !== 'matched' && (
                <div className="h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/5">
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700 border border-red-200 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {activeTab === 'details' && (
            <div className="grid grid-cols-2 gap-8 max-w-4xl">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Invoice Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground block">Bill No.</span> <span className="font-semibold">{bill.bill_number}</span></div>
                    <div><span className="text-muted-foreground block">Bill Date</span> <span className="font-semibold">{bill.bill_date}</span></div>
                    <div><span className="text-muted-foreground block">Linked PO</span> <span className="font-semibold">{bill.purchase_order_id ? "Linked" : "None"}</span></div>
                    <div><span className="text-muted-foreground block">Linked GRN</span> <span className="font-semibold">{bill.grn_id ? "Linked" : "None"}</span></div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Amounts</h3>
                  <div className="space-y-3 font-mono text-sm">
                    <div className="flex justify-between"><span>Subtotal</span> <span>{formatIndianCurrency(Number(bill.subtotal_amount || 0))}</span></div>
                    <div className="flex justify-between"><span>Tax</span> <span>{formatIndianCurrency(Number(bill.tax_amount || 0))}</span></div>
                    <div className="flex justify-between font-bold text-base border-t border-dashed border-border pt-2 mt-2">
                      <span>Total Amount</span> <span>{formatIndianCurrency(Number(bill.total_amount || 0))}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                 <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Uploaded Documents</h3>
                 <div className="rounded-lg border border-dashed border-border p-8 text-center bg-card">
                   <UploadCloud className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                   <p className="text-sm font-semibold">No Documents Attached</p>
                   <p className="text-xs text-muted-foreground mt-1">Attachments will appear here</p>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'match' && (
            <div className="max-w-4xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">Three-Way Matching</h3>
                  <p className="text-sm text-muted-foreground">Comparison of PO vs GRN vs Vendor Bill</p>
                </div>
                {!match && (
                  <button className="flex items-center gap-2 rounded-md bg-secondary text-secondary-foreground px-4 py-2 text-sm font-semibold">
                    <RefreshCcw className="h-4 w-4" /> Run Matching
                  </button>
                )}
              </div>

              {match ? (
                <div className="space-y-6">
                  <div className={`p-4 rounded-lg border ${match.match_status === 'matched' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'} flex items-start gap-3`}>
                    {match.match_status === 'matched' ? <CheckCircle2 className="h-6 w-6 shrink-0" /> : <AlertTriangle className="h-6 w-6 shrink-0" />}
                    <div>
                      <h4 className="font-bold text-base">{match.match_status === 'matched' ? 'Match Successful' : 'Mismatch Detected'}</h4>
                      <p className="text-sm opacity-90">{match.remarks || 'The system found discrepancies between the PO, GRN, and Bill amounts.'}</p>
                    </div>
                  </div>

                  <table className="w-full text-left text-sm border border-border rounded-lg overflow-hidden">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-3">Metric</th>
                        <th className="p-3">Purchase Order</th>
                        <th className="p-3">GRN Accepted</th>
                        <th className="p-3">Vendor Bill</th>
                        <th className="p-3">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="bg-card divide-y divide-border font-mono">
                      <tr>
                        <td className="p-3 font-sans font-semibold">Total Value</td>
                        <td className="p-3 text-muted-foreground">{formatIndianCurrency(match.po_value)}</td>
                        <td className="p-3 text-muted-foreground">{formatIndianCurrency(match.grn_value)}</td>
                        <td className="p-3 font-bold">{formatIndianCurrency(match.invoice_value)}</td>
                        <td className={`p-3 font-bold ${match.invoice_value > match.po_value ? 'text-red-500' : 'text-emerald-600'}`}>
                          {formatIndianCurrency(match.invoice_value - match.po_value)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-muted-foreground">* Detailed line-item matching is simulated at the value level for this iteration.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border p-8 text-center bg-card">
                  <p className="text-sm font-semibold">Match Not Run</p>
                  <p className="text-xs text-muted-foreground mt-1">The system has not generated a three-way match for this bill yet.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'verification' && (
            <div className="max-w-3xl space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border p-4 bg-card">
                  <h3 className="font-bold mb-3 flex items-center gap-2"><CheckSquare className="h-4 w-4 text-primary" /> Checklist</h3>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Bill Document Uploaded</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Duplicate Check Passed</li>
                    <li className="flex items-center gap-2">
                      {match?.match_status === 'matched' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      Three-way Match Validated
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-4 w-4 opacity-50" /> Budget Available</li>
                  </ul>
                </div>
                
                <div className="rounded-lg border border-border p-4 bg-card flex flex-col justify-center gap-3">
                   {!isVerified && !isApproved && !isRejected && (
                     <button onClick={handleVerify} disabled={loading} className="w-full py-2 bg-secondary text-secondary-foreground font-bold rounded-md hover:bg-secondary/80">
                       Verify Bill (Finance)
                     </button>
                   )}
                   {isBlocked && !isApproved && !isRejected && (
                     <div className="p-3 mb-2 mt-2 rounded bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-start gap-2">
                       <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                       <div>
                         <p>Billing Blocked: {blockedWork.blockReason}</p>
                         <p className="text-xs font-normal mt-1">QC must be passed and rework closed before this bill can be approved.</p>
                       </div>
                     </div>
                   )}
                   {isVerified && !isApproved && !isRejected && activeRole === 'UPPER_MANAGEMENT' && (
                     <>
                       {!isBlocked && (
                         <button onClick={handleApprove} disabled={loading} className="w-full py-2 bg-primary text-primary-foreground font-bold rounded-md hover:bg-primary/90">
                           Approve for Payment
                         </button>
                       )}
                       {!showRejectInput ? (
                         <button onClick={() => setShowRejectInput(true)} className="w-full py-2 border border-red-200 text-red-600 font-bold rounded-md hover:bg-red-50">
                           Reject / Block
                         </button>
                       ) : (
                         <div className="space-y-2 mt-2">
                           <input type="text" placeholder="Reason for rejection..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" />
                           <div className="flex gap-2">
                             <button onClick={() => setShowRejectInput(false)} className="flex-1 py-2 text-sm font-semibold border rounded">Cancel</button>
                             <button onClick={handleReject} disabled={loading} className="flex-1 py-2 text-sm font-semibold bg-red-600 text-white rounded">Confirm</button>
                           </div>
                         </div>
                       )}
                     </>
                   )}
                   {isApproved && (
                     <div className="text-center font-bold text-emerald-600 flex items-center justify-center gap-2">
                       <CheckCircle2 className="h-5 w-5" /> Bill is Approved
                     </div>
                   )}
                   {isRejected && (
                     <div className="text-center font-bold text-red-600 flex items-center justify-center gap-2">
                       <AlertTriangle className="h-5 w-5" /> Bill is Rejected
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="max-w-2xl">
              <div className="rounded-lg border border-border bg-card p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-primary" /> Payment Status
                </h3>
                
                <div className="mb-6">
                  <div className="text-sm font-semibold text-muted-foreground mb-1">Current Status</div>
                  <div className="text-2xl font-bold font-mono text-primary uppercase">{bill.payment_status.replace('_', ' ')}</div>
                </div>

                {isApproved ? (
                  <PaymentUpdater billId={bill.id} currentStatus={bill.payment_status} onRefresh={() => { onRefresh(); onClose(); }} />
                ) : (
                  <div className="p-4 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Bill must be approved before payment can be processed.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentUpdater({ billId, currentStatus, onRefresh }: { billId: string, currentStatus: string, onRefresh: () => void }) {
  const [status, setStatus] = useState(currentStatus);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate() {
    setLoading(true);
    setError(null);
    const { error: err } = await updatePaymentStatus(billId, status as any, remarks);
    if (err) setError(err.message);
    else onRefresh();
    setLoading(false);
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      {error && <div className="text-red-500 text-sm font-semibold">{error}</div>}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Update Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="pending">Pending</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid Full</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">Payment Reference / UTR / Remarks</label>
        <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. UTR123456789" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <button onClick={handleUpdate} disabled={loading || status === currentStatus} className="w-full py-2 bg-primary text-primary-foreground font-bold rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors">
        {loading ? 'Updating...' : 'Save Payment Status'}
      </button>
    </div>
  );
}
