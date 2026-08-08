'use client';

// ============================================================================
// MEASUREMENT BOOK SHEET
//
// The site record that justifies an RA bill. Quantities are entered as the
// classic MB breakdown — nos x length x width x height, less deductions — and
// the total is computed by the database as a generated column. The figure shown
// here is a preview of what the server will store, never an independent
// calculation that could disagree with it.
//
// A VERIFIED sheet is a hard prerequisite for certifying a service bill.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Ruler, Loader2, AlertTriangle } from 'lucide-react';
import {
  createMeasurementSheet,
  getWorkOrderLineBillingPosition,
  type CreateMeasurementItemInput,
  type WorkOrderLineBillingPosition,
} from '@/lib/measurement-sheets';

type DraftItem = {
  key: string;
  description: string;
  unit: string;
  nos: number;
  length: number;
  width: number;
  heightDepth: number;
  deduction: number;
  workOrderLineId: string;
  remarks: string;
};

function newItem(): DraftItem {
  return {
    key: Math.random().toString(36).slice(2),
    description: '',
    unit: '',
    nos: 1,
    length: 1,
    width: 1,
    heightDepth: 1,
    deduction: 0,
    workOrderLineId: '',
    remarks: '',
  };
}

/** Mirrors the generated column exactly, including the floor at zero. */
function itemQuantity(item: DraftItem): number {
  const gross = (item.nos || 0) * (item.length || 0) * (item.width || 0) * (item.heightDepth || 0);
  return Math.max(gross - (item.deduction || 0), 0);
}

export function MeasurementSheetModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  workOrderId,
  workOrderNumber,
  activityId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  workOrderId: string;
  workOrderNumber?: string | null;
  activityId?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<WorkOrderLineBillingPosition[]>([]);

  const [sheetNumber, setSheetNumber] = useState('');
  const [measurementDate, setMeasurementDate] = useState(new Date().toISOString().split('T')[0]);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [locationReference, setLocationReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [items, setItems] = useState<DraftItem[]>([newItem()]);

  const reset = useCallback(() => {
    setSheetNumber('');
    setMeasurementDate(new Date().toISOString().split('T')[0]);
    setPeriodStart('');
    setPeriodEnd('');
    setLocationReference('');
    setRemarks('');
    setItems([newItem()]);
    setError(null);
  }, []);

  useEffect(() => {
    if (!isOpen || !workOrderId) return;
    reset();
    getWorkOrderLineBillingPosition(workOrderId)
      .then(setPositions)
      .catch(() => setPositions([]));
  }, [isOpen, workOrderId, reset]);

  const total = useMemo(() => items.reduce((sum, item) => sum + itemQuantity(item), 0), [items]);

  if (!isOpen) return null;

  function update(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  /** Picking a contracted line pre-fills its description and unit. */
  function attachLine(key: string, lineId: string) {
    const line = positions.find((position) => position.workOrderLineId === lineId);
    update(key, {
      workOrderLineId: lineId,
      description: line?.description || '',
      unit: line?.unit || '',
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const measured = items.filter((item) => item.description.trim() && itemQuantity(item) > 0);
    if (measured.length === 0) {
      setError('Enter at least one item with a quantity greater than zero.');
      return;
    }
    if (!sheetNumber.trim()) {
      setError('A sheet number is required.');
      return;
    }

    setLoading(true);
    const payload: CreateMeasurementItemInput[] = measured.map((item) => ({
      description: item.description,
      unit: item.unit || undefined,
      nos: item.nos,
      length: item.length,
      width: item.width,
      heightDepth: item.heightDepth,
      deduction: item.deduction,
      workOrderLineId: item.workOrderLineId || undefined,
      remarks: item.remarks || undefined,
    }));

    const result = await createMeasurementSheet({
      projectId,
      workOrderId,
      activityId: activityId || undefined,
      sheetNumber,
      measurementDate,
      periodStartDate: periodStart || undefined,
      periodEndDate: periodEnd || undefined,
      locationReference: locationReference || undefined,
      remarks: remarks || undefined,
      items: payload,
    });
    setLoading(false);

    if (result.error) setError(result.error.message);
    else {
      onSuccess();
      onClose();
    }
  }

  const numberInput =
    'w-full rounded border border-border bg-background px-1.5 py-1 text-right text-xs outline-none focus:border-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-bold">Record Measurement Sheet</h2>
              {workOrderNumber && (
                <p className="text-xs text-muted-foreground">Work Order {workOrderNumber}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Sheet No. *">
                <input
                  value={sheetNumber}
                  onChange={(event) => setSheetNumber(event.target.value)}
                  placeholder="MS-001"
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Measurement Date *">
                <input
                  type="date"
                  value={measurementDate}
                  onChange={(event) => setMeasurementDate(event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Location / Block / Floor">
                <input
                  value={locationReference}
                  onChange={(event) => setLocationReference(event.target.value)}
                  placeholder="Tower A, Floors 1-6"
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Period From">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(event) => setPeriodStart(event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Period To">
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(event) => setPeriodEnd(event.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                />
              </Field>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <h3 className="text-sm font-bold">Measured Items</h3>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, newItem()])}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" /> Add row
              </button>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-border text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2">Contracted line</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Unit</th>
                    <th className="pb-2 text-right">Nos</th>
                    <th className="pb-2 text-right">Length</th>
                    <th className="pb-2 text-right">Width</th>
                    <th className="pb-2 text-right">Ht/Depth</th>
                    <th className="pb-2 text-right">Deduct</th>
                    <th className="pb-2 text-right">Quantity</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const position = positions.find(
                      (entry) => entry.workOrderLineId === item.workOrderLineId,
                    );
                    // Contracted minus already-certified. Warn here; the
                    // database enforces it at certification.
                    const exceeds =
                      position != null && itemQuantity(item) > position.remainingQuantity;

                    return (
                      <tr key={item.key} className="border-b border-border/50">
                        <td className="py-1.5 pr-2">
                          <select
                            value={item.workOrderLineId}
                            onChange={(event) => attachLine(item.key, event.target.value)}
                            className="w-40 rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
                          >
                            <option value="">— unlinked —</option>
                            {positions.map((entry) => (
                              <option key={entry.workOrderLineId} value={entry.workOrderLineId}>
                                {entry.description.slice(0, 40)}
                              </option>
                            ))}
                          </select>
                          {position && (
                            <p
                              className={`mt-0.5 text-[10px] ${exceeds ? 'font-bold text-red-600' : 'text-muted-foreground'}`}
                            >
                              {exceeds ? 'Exceeds ' : ''}
                              {position.remainingQuantity.toLocaleString('en-IN')} {position.unit || ''} left
                            </p>
                          )}
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            value={item.description}
                            onChange={(event) => update(item.key, { description: event.target.value })}
                            placeholder="Item measured"
                            className="w-full min-w-[150px] rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input
                            value={item.unit}
                            onChange={(event) => update(item.key, { unit: event.target.value })}
                            placeholder="Rft"
                            className="w-16 rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary"
                          />
                        </td>
                        {(
                          [
                            ['nos', item.nos],
                            ['length', item.length],
                            ['width', item.width],
                            ['heightDepth', item.heightDepth],
                            ['deduction', item.deduction],
                          ] as const
                        ).map(([field, value]) => (
                          <td key={field} className="py-1.5 pr-2">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              value={value}
                              onChange={(event) =>
                                update(item.key, { [field]: Number(event.target.value) } as Partial<DraftItem>)
                              }
                              className={`w-20 ${numberInput}`}
                            />
                          </td>
                        ))}
                        <td className="py-1.5 pr-2 text-right font-bold">
                          {itemQuantity(item).toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                        </td>
                        <td className="py-1.5">
                          <button
                            type="button"
                            disabled={items.length === 1}
                            onClick={() => setItems((prev) => prev.filter((row) => row.key !== item.key))}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[11px] text-muted-foreground">
              Quantity = Nos × Length × Width × Height − Deduction, computed by the database. Leave a
              dimension at 1 when it does not apply (for example a simple count).
            </p>

            <div className="mt-3">
              <Field label="Remarks">
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-primary"
                />
              </Field>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border p-4">
            <div className="text-sm">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Total measured</span>
              <p className="text-lg font-bold text-primary">
                {total.toLocaleString('en-IN', { maximumFractionDigits: 3 })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Save as Draft
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
