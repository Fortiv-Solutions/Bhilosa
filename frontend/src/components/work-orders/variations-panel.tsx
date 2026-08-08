'use client';

// ============================================================================
// VARIATION ORDERS
//
// The only document permitted to change a live contract. Stage 4's guards
// refuse a direct edit of the Work Order's value or of any contracted
// quantity/rate, so this is the whole path for scope growth — or reduction: a
// negative variation is legitimate and posts a negative commitment delta.
//
// Approving does not just record a decision. It rewrites the contract value,
// updates or inserts the scope lines, bumps revision_no, writes the change onto
// the append-only status history, and the existing Phase 2 trigger posts the
// commitment delta. All of that is server-side.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { FileDiff, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  createWorkOrderVariation,
  listWorkOrderVariations,
  nextVariationStatuses,
  setWorkOrderVariationStatus,
  VARIATION_ACTION_LABELS,
  VARIATION_STATUS_LABELS,
  type CreateVariationLineInput,
  type VariationStatus,
  type WorkOrderVariationRow,
} from '@/lib/work-order-variations';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { StatusActionBar, type StatusAction } from '@/components/work-orders/status-action-bar';
import { formatIndianCurrency } from '@/utils/format-currency';

type DraftLine = {
  key: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  workOrderLineId: string;
};

function newLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    description: '',
    unit: '',
    quantity: 0,
    rate: 0,
    workOrderLineId: '',
  };
}

export function VariationsPanel({
  workOrderId,
  projectId,
  permissions,
  /** Live contract lines, so a variation can revise one instead of adding. */
  contractLines,
  isLive,
  currentProfileId,
  onApplied,
}: {
  workOrderId: string;
  projectId: string;
  permissions: WorkOrderPermissions;
  contractLines: { id: string; description: string; unit: string | null }[];
  isLive: boolean;
  currentProfileId: string | null;
  onApplied: () => void;
}) {
  const [variations, setVariations] = useState<WorkOrderVariationRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [variationNumber, setVariationNumber] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [lumpAmount, setLumpAmount] = useState(0);
  const [useLines, setUseLines] = useState(true);

  const load = useCallback(async () => {
    try {
      setVariations(await listWorkOrderVariations(workOrderId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load variations.');
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  // With lines the amount is their sum; otherwise it is entered directly.
  const linesTotal = lines.reduce((sum, line) => sum + (line.quantity || 0) * (line.rate || 0), 0);
  const amount = useLines ? linesTotal : lumpAmount;

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!variationNumber.trim()) return setError('A variation number is required.');
    if (!reason.trim()) return setError('A reason is required — a variation changes a signed contract.');
    if (!amount) return setError('The variation amount must be non-zero.');

    const payload: CreateVariationLineInput[] = useLines
      ? lines
          .filter((line) => line.description.trim())
          .map((line) => ({
            description: line.description,
            unit: line.unit || undefined,
            quantity: line.quantity,
            rate: line.rate,
            workOrderLineId: line.workOrderLineId || undefined,
          }))
      : [];

    setBusy(true);
    const result = await createWorkOrderVariation({
      projectId,
      workOrderId,
      variationNumber,
      amount,
      reason,
      lines: payload,
    });
    setBusy(false);

    if (result.error) setError(result.error.message);
    else {
      setShowForm(false);
      setVariationNumber('');
      setReason('');
      setLines([newLine()]);
      setLumpAmount(0);
      void load();
    }
  }

  async function runAction(id: string, status: VariationStatus, actionReason?: string) {
    setBusy(true);
    setError(null);
    const result = await setWorkOrderVariationStatus(id, status, actionReason);
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      await load();
      // Approving moved the contract value and the commitment.
      if (status === 'approved') onApplied();
    }
  }

  const field = 'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary';

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
          <FileDiff className="h-4 w-4 text-primary" /> Variation Orders
        </h2>
        {permissions.canProposeVariation && isLive && (
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Raise Variation
          </button>
        )}
      </div>

      {!isLive && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          A variation can only be applied to an issued or active contract.
        </p>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 rounded-lg border border-border bg-background p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={variationNumber}
              onChange={(event) => setVariationNumber(event.target.value)}
              placeholder="Variation no. (VO-001)"
              className={field}
            />
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (required)"
              className={field}
            />
          </div>

          <div className="mt-3 flex gap-4 text-xs">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={useLines} onChange={() => setUseLines(true)} />
              Scope lines
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!useLines} onChange={() => setUseLines(false)} />
              Lump sum
            </label>
          </div>

          {useLines ? (
            <>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-[11px]">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="pb-1.5">Revises</th>
                      <th className="pb-1.5">Description</th>
                      <th className="pb-1.5">Unit</th>
                      <th className="pb-1.5 text-right">Qty</th>
                      <th className="pb-1.5 text-right">Rate</th>
                      <th className="pb-1.5 text-right">Amount</th>
                      <th className="pb-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.key} className="border-b border-border/50">
                        <td className="py-1 pr-2">
                          <select
                            value={line.workOrderLineId}
                            onChange={(event) => {
                              const existing = contractLines.find((l) => l.id === event.target.value);
                              updateLine(line.key, {
                                workOrderLineId: event.target.value,
                                description: existing?.description ?? line.description,
                                unit: existing?.unit ?? line.unit,
                              });
                            }}
                            className="w-32 rounded border border-input bg-card px-1.5 py-1"
                          >
                            <option value="">— new line —</option>
                            {contractLines.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.description.slice(0, 30)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            value={line.description}
                            onChange={(event) => updateLine(line.key, { description: event.target.value })}
                            placeholder="Scope"
                            className="w-full min-w-[120px] rounded border border-input bg-card px-1.5 py-1"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            value={line.unit}
                            onChange={(event) => updateLine(line.key, { unit: event.target.value })}
                            className="w-14 rounded border border-input bg-card px-1.5 py-1"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            type="number"
                            step="any"
                            value={line.quantity}
                            onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })}
                            className="w-20 rounded border border-input bg-card px-1.5 py-1 text-right"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            type="number"
                            step="any"
                            value={line.rate}
                            onChange={(event) => updateLine(line.key, { rate: Number(event.target.value) })}
                            className="w-20 rounded border border-input bg-card px-1.5 py-1 text-right"
                          />
                        </td>
                        <td className="py-1 pr-2 text-right font-bold">
                          {formatIndianCurrency((line.quantity || 0) * (line.rate || 0))}
                        </td>
                        <td className="py-1">
                          <button
                            type="button"
                            disabled={lines.length === 1}
                            onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                            className="text-red-500 hover:text-red-700 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setLines((prev) => [...prev, newLine()])}
                className="mt-1 text-[11px] font-semibold text-primary hover:underline"
              >
                + Add line
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Revising an existing line? Enter its <strong>new total</strong> contracted quantity,
                not the increase.
              </p>
            </>
          ) : (
            <input
              type="number"
              step="any"
              value={lumpAmount}
              onChange={(event) => setLumpAmount(Number(event.target.value))}
              placeholder="Amount (negative for omitted scope)"
              className={`${field} mt-2 text-right font-mono`}
            />
          )}

          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs">
              Variation value{' '}
              <strong className={amount < 0 ? 'text-red-600' : 'text-primary'}>
                {formatIndianCurrency(amount)}
              </strong>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                Save as Draft
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-gray-200 text-gray-400 dark:border-gray-800">
            <tr>
              <th className="pb-2">Variation</th>
              <th className="pb-2">Date</th>
              <th className="pb-2 text-right">Amount</th>
              <th className="pb-2">Contract</th>
              <th className="pb-2">Reason</th>
              <th className="pb-2">Status</th>
              <th className="pb-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {variations.map((variation) => {
              // Mirrors the database SoD rule: the raiser may not approve.
              const selfRaised =
                currentProfileId != null && variation.created_by === currentProfileId;

              const actions: StatusAction<VariationStatus>[] = nextVariationStatuses(
                variation.status,
                permissions.canApproveVariation,
              ).map((next) => ({
                status: next,
                label: VARIATION_ACTION_LABELS[next],
                needsReason: next === 'rejected',
                tone: next === 'rejected' || next === 'cancelled' ? 'danger' : next === 'approved' ? 'primary' : 'neutral',
                disabledReason:
                  next === 'approved' && selfRaised
                    ? 'You raised this variation. Segregation of duties requires someone else to approve it.'
                    : null,
              }));

              return (
                <tr key={variation.id} className="border-b border-gray-50 dark:border-gray-850">
                  <td className="py-2 font-bold">{variation.variation_number}</td>
                  <td className="py-2 text-gray-500">{variation.variation_date}</td>
                  <td
                    className={`py-2 text-right font-semibold ${Number(variation.amount) < 0 ? 'text-red-600' : ''}`}
                  >
                    {formatIndianCurrency(Number(variation.amount || 0))}
                  </td>
                  <td className="py-2 text-gray-500">
                    {variation.contract_value_after != null
                      ? `${formatIndianCurrency(Number(variation.contract_value_before || 0))} → ${formatIndianCurrency(Number(variation.contract_value_after))}`
                      : '-'}
                  </td>
                  <td className="py-2 text-gray-500">
                    {variation.status === 'rejected'
                      ? variation.rejection_reason || variation.reason
                      : variation.reason}
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        variation.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : variation.status === 'rejected' || variation.status === 'cancelled'
                            ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                      }`}
                    >
                      {VARIATION_STATUS_LABELS[variation.status]}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end">
                      <StatusActionBar<VariationStatus>
                        size="sm"
                        busy={busy}
                        actions={actions}
                        onAction={(status, actionReason) =>
                          runAction(variation.id, status, actionReason)
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {variations.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-400">
                  No variations raised. A live contract&apos;s value and scope can only change
                  through one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
