'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, AlertTriangle, Paperclip, CheckCircle2, XCircle, Wallet } from 'lucide-react';
import {
  getWorkOrder,
  getWorkOrderBudget,
  submitWorkOrderForApproval,
  approveWorkOrder,
  rejectWorkOrder,
  activateWorkOrder,
  closeWorkOrder,
  type WorkOrderBudgetPosition,
} from '@/lib/work-orders';
import { getEntityAttachments, getAttachmentUrl, uploadEntityAttachment } from '@/lib/documents';
import { formatIndianCurrency } from '@/utils/format-currency';

const WO_STAGES = ['draft', 'issued', 'active', 'closed'] as const;

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [wo, setWo] = useState<any>(null);
  const [budget, setBudget] = useState<WorkOrderBudgetPosition | null>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [woData, budgetData, attachmentData] = await Promise.all([
        getWorkOrder(id),
        getWorkOrderBudget(id).catch(() => null),
        getEntityAttachments('work_orders', id).catch(() => []),
      ]);
      setWo(woData);
      setBudget(budgetData);
      setAttachments(attachmentData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Work Order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function runAction(fn: () => Promise<{ error: Error | null }>) {
    setActionLoading(true);
    setError(null);
    const result = await fn();
    setActionLoading(false);
    if (result.error) setError(result.error.message);
    else refresh();
  }

  if (loading && !wo) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading Work Order…</div>;
  }
  if (!wo) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Work Order not found.</div>;
  }

  const woStatus = wo.wo_status || 'draft';
  const currentStageIndex = WO_STAGES.indexOf(woStatus as any);
  const lines = wo.work_order_lines || [];
  const bills = wo.service_bills || [];
  const agencyName = wo.site_agencies?.agency_name || wo.vendor?.display_name || wo.vendor?.legal_name || 'Unassigned';

  return (
    <div className="space-y-5">
      <Link href="/work-orders" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Work Orders
      </Link>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <header className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">
              {wo.wo_type === 'rate_based' ? 'Rate-based' : 'Fixed-scope'} Work Order
            </span>
            <h1 className="font-heading mt-2 text-2xl font-semibold">{wo.work_order_number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{wo.scope_of_work}</p>
          </div>
          <div className="flex gap-2">
            {woStatus === 'draft' && wo.status === 'draft' && (
              <button
                disabled={actionLoading}
                onClick={() => runAction(() => submitWorkOrderForApproval(id))}
                className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
              >
                Submit for Approval
              </button>
            )}
            {wo.status === 'submitted' && (
              <>
                <button
                  disabled={actionLoading}
                  onClick={() => runAction(() => approveWorkOrder(id))}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; Issue
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => {
                    const remarks = window.prompt('Reason for rejection:');
                    if (remarks) runAction(() => rejectWorkOrder(id, remarks));
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </>
            )}
            {woStatus === 'issued' && (
              <button disabled={actionLoading} onClick={() => runAction(() => activateWorkOrder(id))} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                Mark Active
              </button>
            )}
            {woStatus === 'active' && (
              <button disabled={actionLoading} onClick={() => runAction(() => closeWorkOrder(id))} className="rounded-md border border-border px-3 py-2 text-xs font-bold hover:bg-muted">
                Close Work Order
              </button>
            )}
          </div>
        </div>

        {/* Lifecycle timeline */}
        <div className="mt-5 flex items-center gap-2">
          {WO_STAGES.map((stage, idx) => (
            <div key={stage} className="flex items-center gap-2 flex-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
                  idx <= currentStageIndex ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                }`}
              >
                {idx + 1}
              </div>
              <span className={`text-xs font-semibold uppercase ${idx <= currentStageIndex ? 'text-foreground' : 'text-gray-400'}`}>{stage}</span>
              {idx < WO_STAGES.length - 1 && <div className={`h-0.5 flex-1 ${idx < currentStageIndex ? 'bg-primary' : 'bg-gray-100 dark:bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4 text-xs">
          <div><dt className="text-muted-foreground uppercase font-bold text-[10px]">Agency</dt><dd className="mt-1 font-semibold">{agencyName}</dd></div>
          <div><dt className="text-muted-foreground uppercase font-bold text-[10px]">Site / Activity</dt><dd className="mt-1 font-semibold">{wo.construction_activities?.title || wo.project_sites?.name || '-'}</dd></div>
          <div><dt className="text-muted-foreground uppercase font-bold text-[10px]">Issue Date</dt><dd className="mt-1 font-semibold">{wo.issue_date || '-'}</dd></div>
          <div><dt className="text-muted-foreground uppercase font-bold text-[10px]">Format</dt><dd className="mt-1 font-semibold">{wo.wo_templates?.name || 'Custom'}</dd></div>
        </dl>

        {wo.has_scope_variance && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">{wo.variance_notes || 'Executed scope exceeds planned scope on one or more lines.'}</div>
          </div>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyCard label="WO Value" value={Number(wo.total_amount || 0)} />
        <MoneyCard label="Certified Billed" value={Number(wo.billed_to_date || 0)} />
        <MoneyCard label="Claimed (uncertified)" value={Number(wo.claimed_to_date || 0)} />
        <MoneyCard label="Remaining Balance" value={Number(wo.remaining_balance ?? wo.total_amount ?? 0)} highlight />
      </section>

      {wo.has_billing_overrun && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            Certified billing on this Work Order exceeds its value. Raise an approved variation, or correct the bills.
          </div>
        </div>
      )}

      {/* Budget position. Commitment figures are read from budget_ledger via
          work_order_budget_view, so they always agree with the journal. */}
      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" /> Budget Position
        </h2>

        {budget?.budgetAllocationId ? (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4 text-xs">
              <div>
                <dt className="text-muted-foreground uppercase font-bold text-[10px]">Budget Head</dt>
                <dd className="mt-1 font-semibold">{budget.categoryName || budget.allocationName || '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground uppercase font-bold text-[10px]">Master Budget Line</dt>
                <dd className="mt-1 font-semibold">{budget.masterBudgetItem || 'Not linked'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground uppercase font-bold text-[10px]">Committed</dt>
                <dd className="mt-1 font-semibold">{formatIndianCurrency(budget.committedAmount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground uppercase font-bold text-[10px]">Open Commitment</dt>
                <dd className="mt-1 font-semibold text-primary">{formatIndianCurrency(budget.openCommitment)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Bill values draw this Work Order down on their{' '}
              <strong>{budget.taxInclusive ? 'gross (GST-inclusive)' : 'net-of-tax'}</strong> figure, matching how
              the WO value was entered.
            </p>
          </>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20">
            No budget head is set on this Work Order. It reserves no budget and cannot be issued unless this
            project explicitly permits unbudgeted Work Orders.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" /> Item / Service Description
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
              <tr>
                <th className="pb-2">Description</th>
                <th className="pb-2">Unit</th>
                {wo.wo_type !== 'rate_based' && <th className="pb-2">Qty</th>}
                {wo.wo_type !== 'rate_based' && <th className="pb-2">Executed Qty</th>}
                <th className="pb-2">Rate</th>
                <th className="pb-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line: any) => (
                <tr key={line.id} className="border-b border-gray-50 dark:border-gray-850">
                  <td className="py-2">{line.description}</td>
                  <td className="py-2 text-gray-500">{line.unit || '-'}</td>
                  {wo.wo_type !== 'rate_based' && <td className="py-2">{line.quantity}</td>}
                  {wo.wo_type !== 'rate_based' && (
                    <td className="py-2">
                      <span className={line.executed_quantity != null && line.executed_quantity > line.quantity ? 'font-bold text-amber-600' : ''}>
                        {line.executed_quantity ?? '-'}
                      </span>
                    </td>
                  )}
                  <td className="py-2">{formatIndianCurrency(Number(line.rate || 0))}</td>
                  <td className="py-2 font-bold">{formatIndianCurrency(Number(line.total_amount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold">Terms &amp; Conditions</h2>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{wo.terms_and_conditions || 'No terms recorded.'}</pre>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold">Linked Service Bills</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
              <tr>
                <th className="pb-2">Bill</th>
                <th className="pb-2">Date</th>
                <th className="pb-2">Amount</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((bill: any) => (
                <tr key={bill.id} className="border-b border-gray-50 dark:border-gray-850">
                  <td className="py-2 font-bold">{bill.bill_number}</td>
                  <td className="py-2 text-gray-500">{bill.bill_date}</td>
                  <td className="py-2 font-bold">{formatIndianCurrency(Number(bill.total_amount || 0))}</td>
                  <td className="py-2 uppercase text-gray-500">{bill.status}</td>
                </tr>
              ))}
              {bills.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-gray-400">No bills raised against this Work Order yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-primary" /> Attachments
        </h2>
        <ul className="mt-3 space-y-2 text-xs">
          {attachments.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span>{a.file_name}</span>
              <button
                className="font-semibold text-primary hover:underline"
                onClick={async () => {
                  const url = await getAttachmentUrl(a.storage_bucket, a.storage_path);
                  window.open(url, '_blank');
                }}
              >
                View
              </button>
            </li>
          ))}
          {attachments.length === 0 && <li className="text-gray-400">No attachments uploaded yet.</li>}
        </ul>
        <label className="mt-3 inline-block cursor-pointer text-xs font-semibold text-primary hover:underline">
          + Add attachment
          <input
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await uploadEntityAttachment(wo.project_id, 'work_orders', id, 'wo_supporting_document', file);
              refresh();
            }}
          />
        </label>
      </section>
    </div>
  );
}

function MoneyCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <p className={`mt-1 text-xl font-semibold ${highlight ? 'text-primary' : ''}`}>{formatIndianCurrency(value)}</p>
      <p className="mt-1 text-[10px] font-bold uppercase text-gray-400">{label}</p>
    </article>
  );
}
