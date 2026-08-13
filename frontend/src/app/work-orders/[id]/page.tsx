'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, AlertTriangle, History, Wallet } from 'lucide-react';
import {
  currentProfileId,
  getWorkOrder,
  getWorkOrderBudget,
  getWorkOrderStatusHistory,
  setWorkOrderStatus,
  type WorkOrderBudgetPosition,
  type WorkOrderStatusHistoryRow,
} from '@/lib/work-orders';
import { FinancialPositionPanel } from '@/components/work-orders/financial-position-panel';
import { VariationsPanel } from '@/components/work-orders/variations-panel';
import { ContractTermsPanel } from '@/components/work-orders/contract-terms-panel';
import { BillingProgressPanel } from '@/components/work-orders/billing-progress-panel';
import { AttachmentsPanel } from '@/components/work-orders/attachments-panel';
import { formatIndianCurrency } from '@/utils/format-currency';
import { StatusActionBar, type StatusAction } from '@/components/work-orders/status-action-bar';
import { getWorkOrderPermissions } from '@/lib/work-order-permissions';
import { useAppStore } from '@/store/use-app-store';
import {
  WORK_ORDER_ACTION_LABELS,
  WORK_ORDER_STAGES,
  WORK_ORDER_STATUS_LABELS,
  canonicalWorkOrderStatus,
  nextWorkOrderStatuses,
  workOrderNeedsReason,
  type WorkOrderStatus,
} from '@/lib/erp/work-order/status';

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [wo, setWo] = useState<any>(null);
  const [budget, setBudget] = useState<WorkOrderBudgetPosition | null>(null);
  const [history, setHistory] = useState<WorkOrderStatusHistoryRow[]>([]);
  /** Bumped after any change that moves money, so the panels re-read. */
  const [financialRefresh, setFinancialRefresh] = useState(0);
  /**
   * For the segregation-of-duties checks on variations and on progress
   * verification: the person who recorded progress may not verify it.
   */
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    currentProfileId()
      .then((value) => {
        if (!cancelled) setProfileId(value);
      })
      .catch(() => {
        if (!cancelled) setProfileId(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRole = useAppStore((state) => state.activeRole);
  const permissions = useMemo(() => getWorkOrderPermissions(activeRole), [activeRole]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [woData, budgetData, historyData] = await Promise.all([
        getWorkOrder(id),
        getWorkOrderBudget(id).catch(() => null),
        getWorkOrderStatusHistory(id).catch(() => [] as WorkOrderStatusHistoryRow[]),
      ]);
      setWo(woData);
      setBudget(budgetData);
      setHistory(historyData || []);
      setFinancialRefresh((token) => token + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load Work Order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * All lifecycle changes go through the database RPC, which validates the
   * move, enforces approval authority, requires a reason where the contract
   * demands one, and stamps the actor server-side.
   */
  async function runTransition(next: WorkOrderStatus, reason?: string) {
    setActionLoading(true);
    setError(null);
    const result = await setWorkOrderStatus(id, next, reason);
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

  const woStatus = canonicalWorkOrderStatus(wo.wo_status) || 'draft';
  const currentStageIndex = WORK_ORDER_STAGES.indexOf(woStatus);
  const lines = wo.work_order_lines || [];
  const bills = wo.service_bills || [];
  const isDraftLike = woStatus === 'draft' || woStatus === 'submitted' || woStatus === 'rejected';
  const agencyName = wo.site_agencies?.agency_name || wo.vendor?.display_name || wo.vendor?.legal_name || 'Unassigned';

  // Every legal onward move the signed-in role holds. The database re-validates
  // each one, so this list is an affordance, not the authority.
  const actions: StatusAction<WorkOrderStatus>[] = nextWorkOrderStatuses(
    woStatus,
    permissions.canApproveWorkOrder,
  ).map((next) => ({
    status: next,
    label: WORK_ORDER_ACTION_LABELS[next],
    needsReason: workOrderNeedsReason(next),
    tone:
      next === 'rejected' || next === 'cancelled'
        ? 'danger'
        : next === 'issued' || next === 'active'
          ? 'primary'
          : 'neutral',
    hint:
      next === 'issued'
        ? 'Issues the contract and reserves its value against the budget head'
        : next === 'closed'
          ? 'Releases any residual commitment back to the budget'
          : undefined,
  }));

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
          <div className="flex flex-col items-end gap-2">
            {/* Read-only. Status changes only through the actions below, which
                the database validates and attributes. */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-semibold shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Status:</span>
              <span className="font-bold text-primary">{WORK_ORDER_STATUS_LABELS[woStatus]}</span>
            </div>

            <StatusActionBar<WorkOrderStatus>
              actions={actions}
              busy={actionLoading}
              onAction={runTransition}
              emptyLabel={
                woStatus === 'closed' || woStatus === 'cancelled'
                  ? 'This Work Order is closed to further changes.'
                  : 'You do not have rights to change this Work Order.'
              }
            />
          </div>
        </div>

        {/* Lifecycle timeline. Rejected and cancelled are off the happy path,
            so the stepper is replaced by an explicit terminal banner. */}
        {woStatus === 'rejected' || woStatus === 'cancelled' ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-950/20">
            <p className="text-xs font-bold uppercase text-red-700 dark:text-red-300">
              {WORK_ORDER_STATUS_LABELS[woStatus]}
            </p>
            <p className="mt-1 text-xs text-red-800 dark:text-red-200">
              {(woStatus === 'rejected' ? wo.rejection_reason : wo.cancellation_reason) ||
                'No reason recorded.'}
            </p>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-2">
            {WORK_ORDER_STAGES.map((stage, idx) => (
              <div key={stage} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
                    idx <= currentStageIndex ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
                  }`}
                >
                  {idx + 1}
                </div>
                <span className={`text-xs font-semibold uppercase ${idx <= currentStageIndex ? 'text-foreground' : 'text-gray-400'}`}>
                  {WORK_ORDER_STATUS_LABELS[stage]}
                </span>
                {idx < WORK_ORDER_STAGES.length - 1 && <div className={`h-0.5 flex-1 ${idx < currentStageIndex ? 'bg-primary' : 'bg-gray-100 dark:bg-gray-800'}`} />}
              </div>
            ))}
          </div>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 text-xs">
          <div><dt className="text-muted-foreground uppercase font-bold text-[10px]">Agency</dt><dd className="mt-1 font-semibold">{agencyName}</dd></div>
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

      {/* The five financial indicators plus the treasury releases that cap
          payment. Supersedes the four money cards that were here: those showed
          cost only and had nowhere to express the cash decision. */}
      <FinancialPositionPanel
        workOrderId={id}
        projectId={wo.project_id}
        permissions={permissions}
        refreshToken={financialRefresh}
      />

      {wo.has_billing_overrun && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            Certified billing on this Work Order exceeds its value. Raise an approved variation, or correct the bills.
          </div>
        </div>
      )}

      {/* Activity-by-activity progress and billing position: what is done, what
          is pending, what has been certified and billed, and what may be billed
          today. Progress is recorded here and confirmed by a second person —
          the overall percentage is derived from these rows, never typed, because
          the source certificates prove what a free-typed progress field
          becomes. */}
      <BillingProgressPanel
        workOrderId={id}
        permissions={permissions}
        isDraft={isDraftLike}
        isLive={woStatus === 'issued' || woStatus === 'active'}
        refreshToken={financialRefresh}
        currentProfileId={profileId}
        onChanged={refresh}
      />

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
          <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            No budget head on this Work Order — it reserves no budget, which is expected when the
            head is decided per bill. <strong>Choose the budget head when raising the Service Bill</strong>;
            that is what puts the cost against a budget line.
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-primary" /> Work Order Items (BOQ)
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

      {/* The commercial clauses every bill against this contract inherits.
          Retention, GST, TDS and the measurement tolerance are decided here
          once, not re-typed per bill. */}
      <ContractTermsPanel
        workOrderId={id}
        projectId={wo.project_id}
        permissions={permissions}
        isDraft={isDraftLike}
        onChanged={refresh}
      />

      {/* The only route by which a live contract's value or scope may change.
          Approving one posts the commitment delta through the Phase 2 path. */}
      <VariationsPanel
        workOrderId={id}
        projectId={wo.project_id}
        permissions={permissions}
        contractLines={lines.map((line: any) => ({
          id: line.id,
          description: line.description,
          unit: line.unit,
        }))}
        isLive={woStatus === 'issued' || woStatus === 'active'}
        currentProfileId={profileId}
        onApplied={refresh}
      />

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

      {/* Append-only trail from work_order_status_history. The table carries no
          UPDATE or DELETE policy, so what is shown is what happened. */}
      {permissions.canViewAuditTrail && (
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <h2 className="font-heading text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Approval &amp; Status History
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
                <tr>
                  <th className="pb-2">When</th>
                  <th className="pb-2">Transition</th>
                  <th className="pb-2">By</th>
                  <th className="pb-2">Reason</th>
                  <th className="pb-2 text-right">WO Value</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-50 dark:border-gray-850">
                    <td className="py-2 text-gray-500">
                      {new Date(entry.changedAt).toLocaleString('en-IN')}
                    </td>
                    <td className="py-2 font-semibold">
                      {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                    </td>
                    <td className="py-2 text-gray-500">{entry.changedByName || 'System'}</td>
                    <td className="py-2 text-gray-500">{entry.reason || '-'}</td>
                    <td className="py-2 text-right font-semibold">
                      {entry.totalAmountAtChange == null
                        ? '-'
                        : formatIndianCurrency(entry.totalAmountAtChange)}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">
                      No transitions recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Supporting documents: contract, quotation/BOQ, measurement working,
          progress photos, certificates. Deleting is restricted to the roles that
          may change the contract — evidence behind a certified bill is not
          working data, and the RLS policy refuses it outright at that point. */}
      <AttachmentsPanel
        projectId={wo.project_id}
        entityTable="work_orders"
        entityId={id}
        canUpload={permissions.canRecordExecution || permissions.canCreateWorkOrder}
        canDelete={permissions.canCreateWorkOrder && isDraftLike}
      />
    </div>
  );
}

