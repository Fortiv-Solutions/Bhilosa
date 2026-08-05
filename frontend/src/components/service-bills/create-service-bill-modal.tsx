'use client';

// ============================================================================
// RECORD SERVICE BILL (contractor RA bill)
//
// Raises a bill against an issued/active Work Order. Two shapes are supported:
//   * MEASURED — lines drawn from the Work Order's scope, each carrying the
//     cumulative quantity to date. This bill is the difference from what was
//     previously certified, which is what an RA bill actually is.
//   * LUMP SUM — a header amount, for trades billed as a single figure.
//
// Header totals for a measured bill are rolled up by a database trigger, so the
// figures shown here are a preview of what the server will compute, never an
// independent calculation that could disagree with it.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, FileText, CheckCircle2, AlertTriangle, Plus, Trash2, Ruler } from 'lucide-react';
import {
  createServiceBill,
  listBillableVendors,
  getWorkOrderLinesForBilling,
  getPreviouslyCertifiedQuantities,
  type BillableVendorOption,
  type CreateServiceBillLineInput,
} from '@/lib/service-bills';
import { getBillableWorkOrders } from '@/lib/work-orders';
import { useAppStore } from '@/store/use-app-store';
import { formatIndianCurrency } from '@/utils/format-currency';

export type CreateServiceBillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type BillableWorkOrder = {
  id: string;
  work_order_number: string;
  scope_of_work: string;
  total_amount: number;
  billed_to_date: number;
  claimed_to_date: number;
  remaining_balance: number;
  tax_inclusive: boolean;
  vendor_id: string | null;
  contractor_id: string | null;
  activity_id: string | null;
  master_budget_item_id: string | null;
  site_agencies?: { agency_name: string } | null;
};

type WoLine = {
  id: string;
  description: string;
  unit: string | null;
  quantity: number;
  rate: number;
};

type DraftLine = {
  key: string;
  workOrderLineId?: string;
  description: string;
  unit: string;
  /** Quantity certified to date across all bills, including this one. */
  cumulativeQuantity: number;
  /** Certified on earlier bills — read-only, from the database. */
  previousQuantity: number;
  rate: number;
  taxRate: number;
};

function newLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    description: '',
    unit: '',
    cumulativeQuantity: 0,
    previousQuantity: 0,
    rate: 0,
    taxRate: 0,
  };
}

/** This bill's quantity is the RA difference, never the cumulative figure. */
function thisBillQty(line: DraftLine): number {
  return Math.max(0, (line.cumulativeQuantity || 0) - (line.previousQuantity || 0));
}

export function CreateServiceBillModal({ isOpen, onClose, onSuccess }: CreateServiceBillModalProps) {
  const { activeProjectId, projects } = useAppStore();
  const projectId = activeProjectId || projects[0]?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workOrders, setWorkOrders] = useState<BillableWorkOrder[]>([]);
  const [vendors, setVendors] = useState<BillableVendorOption[]>([]);
  const [woLines, setWoLines] = useState<WoLine[]>([]);
  const [previousQty, setPreviousQty] = useState<Record<string, number>>({});

  const [billMode, setBillMode] = useState<'measured' | 'lumpsum'>('measured');
  const [vendorId, setVendorId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierBillNo, setSupplierBillNo] = useState('');

  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [lumpSubtotal, setLumpSubtotal] = useState(0);
  const [lumpTax, setLumpTax] = useState(0);

  const [retentionPercent, setRetentionPercent] = useState(0);
  const [advanceAdjusted, setAdvanceAdjusted] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);

  const resetForm = useCallback(() => {
    setBillMode('measured');
    setVendorId('');
    setWorkOrderId('');
    setServiceDescription('');
    setBillNumber('');
    setBillDate(new Date().toISOString().split('T')[0]);
    setSupplierBillNo('');
    setLines([newLine()]);
    setLumpSubtotal(0);
    setLumpTax(0);
    setRetentionPercent(0);
    setAdvanceAdjusted(0);
    setOtherDeductions(0);
    setWoLines([]);
    setPreviousQty({});
    setError(null);
  }, []);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    resetForm();
    getBillableWorkOrders(projectId)
      .then((rows) => setWorkOrders((rows || []) as unknown as BillableWorkOrder[]))
      .catch(() => setWorkOrders([]));
    listBillableVendors()
      .then(setVendors)
      .catch(() => setVendors([]));
  }, [isOpen, projectId, resetForm]);

  const selectedWorkOrder = useMemo(
    () => workOrders.find((wo) => wo.id === workOrderId) || null,
    [workOrders, workOrderId],
  );

  // Selecting a Work Order pulls its scope lines and everything already certified
  // against them, so the measured grid opens pre-filled rather than blank.
  useEffect(() => {
    if (!workOrderId) {
      setWoLines([]);
      setPreviousQty({});
      return;
    }

    let cancelled = false;
    Promise.all([
      getWorkOrderLinesForBilling(workOrderId).catch(() => []),
      getPreviouslyCertifiedQuantities(workOrderId).catch(() => ({} as Record<string, number>)),
    ]).then(([woLineRows, prior]) => {
      if (cancelled) return;
      const rows = (woLineRows || []) as unknown as WoLine[];
      setWoLines(rows);
      setPreviousQty(prior);
      setLines(
        rows.length > 0
          ? rows.map((l) => ({
              key: l.id,
              workOrderLineId: l.id,
              description: l.description,
              unit: l.unit || '',
              previousQuantity: prior[l.id] ?? 0,
              cumulativeQuantity: prior[l.id] ?? 0,
              rate: Number(l.rate || 0),
              taxRate: 0,
            }))
          : [newLine()],
      );
    });

    return () => {
      cancelled = true;
    };
  }, [workOrderId]);

  // Default the vendor to whoever holds the Work Order.
  useEffect(() => {
    if (!selectedWorkOrder || vendorId) return;
    const woVendor = selectedWorkOrder.contractor_id || selectedWorkOrder.vendor_id;
    if (woVendor && vendors.some((v) => v.id === woVendor)) setVendorId(woVendor);
  }, [selectedWorkOrder, vendors, vendorId]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const subtotal = useMemo(() => {
    if (billMode === 'lumpsum') return lumpSubtotal;
    return lines.reduce((sum, l) => sum + thisBillQty(l) * (l.rate || 0), 0);
  }, [billMode, lines, lumpSubtotal]);

  const taxAmount = useMemo(() => {
    if (billMode === 'lumpsum') return lumpTax;
    return lines.reduce((sum, l) => sum + (thisBillQty(l) * (l.rate || 0) * (l.taxRate || 0)) / 100, 0);
  }, [billMode, lines, lumpTax]);

  const totalAmount = subtotal + taxAmount;
  // Matches fn_compute_service_bill_net exactly: ROUND(subtotal * pct / 100, 2).
  // Retention is charged on the ex-tax base and deducted from the gross.
  const retentionAmount = Math.round(((subtotal * (retentionPercent || 0)) / 100) * 100) / 100;
  const netPayable = Math.max(0, totalAmount - retentionAmount - advanceAdjusted - otherDeductions);

  // The Work Order draws down on the basis its value was entered on.
  const drawdownValue = selectedWorkOrder?.tax_inclusive ? totalAmount : subtotal;
  const exceedsWorkOrder =
    selectedWorkOrder != null && drawdownValue > Number(selectedWorkOrder.remaining_balance || 0);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return setError('No active project selected.');
    if (!workOrderId) return setError('A Work Order is mandatory — no WO, no bill.');
    if (!vendorId) return setError('Select the vendor or contractor this bill is from.');
    if (!billNumber.trim()) return setError('Bill number is required.');

    const billableLines: CreateServiceBillLineInput[] =
      billMode === 'measured'
        ? lines
            .filter((l) => l.description.trim() && thisBillQty(l) > 0)
            .map((l) => ({
              description: l.description,
              unit: l.unit || undefined,
              quantity: thisBillQty(l),
              rate: l.rate,
              taxRate: l.taxRate,
              cumulativeQuantity: l.cumulativeQuantity,
              previousQuantity: l.previousQuantity,
              workOrderLineId: l.workOrderLineId,
            }))
        : [];

    if (billMode === 'measured' && billableLines.length === 0) {
      return setError('Enter a cumulative quantity greater than what was previously certified on at least one line.');
    }
    if (billMode === 'lumpsum' && totalAmount <= 0) {
      return setError('Enter the bill amount.');
    }

    setLoading(true);
    setError(null);

    const result = await createServiceBill({
      projectId,
      vendorId,
      workOrderId,
      activityId: selectedWorkOrder?.activity_id || undefined,
      masterBudgetItemId: selectedWorkOrder?.master_budget_item_id || undefined,
      billNumber,
      billDate,
      supplierBillNo: supplierBillNo || undefined,
      serviceDescription,
      retentionPercent,
      advanceAdjusted,
      otherDeductions,
      ...(billMode === 'lumpsum'
        ? { subtotalAmount: lumpSubtotal, taxAmount: lumpTax, totalAmount: lumpSubtotal + lumpTax }
        : { lines: billableLines }),
    });

    setLoading(false);

    if (result.error) setError(result.error.message);
    else {
      onSuccess();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Record Service Bill</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form id="create-service-bill-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Work Order <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select an issued/active Work Order…</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.work_order_number} — {wo.site_agencies?.agency_name || 'Agency'} (
                      {formatIndianCurrency(wo.remaining_balance)} left)
                    </option>
                  ))}
                </select>
                {workOrders.length === 0 && (
                  <p className="text-[11px] text-amber-600">
                    No issued/active Work Orders for this project — no WO, no bill.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Vendor / Contractor <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select a vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.vendorCode ? ` (${v.vendorCode})` : ''}
                      {v.vendorType === 'contractor' ? ' — contractor' : ''}
                    </option>
                  ))}
                </select>
                {vendors.length === 0 && (
                  <p className="text-[11px] text-amber-600">No active vendors on record. Add one under Vendors first.</p>
                )}
              </div>
            </div>

            {selectedWorkOrder && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <span className="font-semibold text-muted-foreground">{selectedWorkOrder.scope_of_work}</span>
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1">
                  <span>WO Value <strong>{formatIndianCurrency(selectedWorkOrder.total_amount)}</strong></span>
                  <span>Certified <strong>{formatIndianCurrency(selectedWorkOrder.billed_to_date)}</strong></span>
                  <span>Remaining <strong>{formatIndianCurrency(selectedWorkOrder.remaining_balance)}</strong></span>
                  <span className="text-muted-foreground">
                    Draws down on {selectedWorkOrder.tax_inclusive ? 'gross (GST incl.)' : 'net-of-tax'} value
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Bill Number <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  placeholder="SB-XXXXX"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Contractor&apos;s Bill No.</label>
                <input
                  type="text"
                  value={supplierBillNo}
                  onChange={(e) => setSupplierBillNo(e.target.value)}
                  placeholder="Their reference"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  Bill Date <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Service Description</label>
              <input
                type="text"
                value={serviceDescription}
                onChange={(e) => setServiceDescription(e.target.value)}
                placeholder="e.g. Scaffolding erection - Tower B, Aug 2026"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-4 border-t border-border pt-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={billMode === 'measured'} onChange={() => setBillMode('measured')} />
                Measured (RA bill)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={billMode === 'lumpsum'} onChange={() => setBillMode('lumpsum')} />
                Lump sum
              </label>
            </div>

            {billMode === 'measured' ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Ruler className="h-3.5 w-3.5 text-primary" /> Measurement
                  </h3>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => [...prev, newLine()])}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add line
                  </button>
                </div>

                {woLines.length === 0 && workOrderId && (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    This Work Order has no scope lines — add measurement lines manually.
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-[11px]">
                    <thead className="border-b border-border text-muted-foreground">
                      <tr>
                        <th className="pb-1.5">Description</th>
                        <th className="pb-1.5">Unit</th>
                        <th className="pb-1.5 text-right">Prev. certified</th>
                        <th className="pb-1.5 text-right">Cumulative</th>
                        <th className="pb-1.5 text-right">This bill</th>
                        <th className="pb-1.5 text-right">Rate</th>
                        <th className="pb-1.5 text-right">GST %</th>
                        <th className="pb-1.5 text-right">Amount</th>
                        <th className="pb-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => {
                        const qty = thisBillQty(line);
                        return (
                          <tr key={line.key} className="border-b border-border/50">
                            <td className="py-1 pr-2">
                              <input
                                className="w-full rounded border border-input bg-background px-1.5 py-1"
                                value={line.description}
                                onChange={(e) => updateLine(line.key, { description: e.target.value })}
                                placeholder="Work description"
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                className="w-14 rounded border border-input bg-background px-1.5 py-1"
                                value={line.unit}
                                onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                              />
                            </td>
                            <td className="py-1 pr-2 text-right text-muted-foreground">
                              {line.previousQuantity.toLocaleString('en-IN')}
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="number"
                                min={line.previousQuantity}
                                step="0.01"
                                className="w-20 rounded border border-input bg-background px-1.5 py-1 text-right"
                                value={line.cumulativeQuantity}
                                onChange={(e) =>
                                  updateLine(line.key, { cumulativeQuantity: Number(e.target.value) })
                                }
                              />
                            </td>
                            <td className="py-1 pr-2 text-right font-bold">{qty.toLocaleString('en-IN')}</td>
                            <td className="py-1 pr-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="w-20 rounded border border-input bg-background px-1.5 py-1 text-right"
                                value={line.rate}
                                onChange={(e) => updateLine(line.key, { rate: Number(e.target.value) })}
                              />
                            </td>
                            <td className="py-1 pr-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                className="w-14 rounded border border-input bg-background px-1.5 py-1 text-right"
                                value={line.taxRate}
                                onChange={(e) => updateLine(line.key, { taxRate: Number(e.target.value) })}
                              />
                            </td>
                            <td className="py-1 pr-2 text-right font-bold">
                              {formatIndianCurrency(qty * (line.rate || 0))}
                            </td>
                            <td className="py-1">
                              <button
                                type="button"
                                onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev))}
                                className="text-red-500 hover:text-red-700"
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
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Subtotal (ex-GST) <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={lumpSubtotal}
                    onChange={(e) => setLumpSubtotal(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">GST Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={lumpTax}
                    onChange={(e) => setLumpTax(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-semibold">Deductions &amp; Settlement</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Retention %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={retentionPercent}
                    onChange={(e) => setRetentionPercent(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Advance Recovered</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={advanceAdjusted}
                    onChange={(e) => setAdvanceAdjusted(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Other Deductions</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherDeductions}
                    onChange={(e) => setOtherDeductions(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>Subtotal <strong>{formatIndianCurrency(subtotal)}</strong></span>
                  <span>GST <strong>{formatIndianCurrency(taxAmount)}</strong></span>
                  <span>Gross <strong>{formatIndianCurrency(totalAmount)}</strong></span>
                  <span>Retention <strong>−{formatIndianCurrency(retentionAmount)}</strong></span>
                  <span className="text-primary">Net payable <strong>{formatIndianCurrency(netPayable)}</strong></span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Budget cost is recorded at the <strong>gross</strong> value on certification. Retention is a payment
                  withholding, tracked separately — it does not reduce project cost.
                </p>
              </div>
            </div>

            {exceedsWorkOrder && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-xs text-amber-800">
                  This bill exceeds the Work Order&apos;s remaining balance by{' '}
                  {formatIndianCurrency(drawdownValue - Number(selectedWorkOrder?.remaining_balance || 0))}. It can
                  still be raised — over-billing is flagged for approval rather than blocked — but it needs an approved
                  variation.
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
              <div className="text-xs text-orange-800">
                Submitting records a claim. Cost hits the budget only on <strong>approval</strong>, which also releases
                the Work Order&apos;s commitment and cannot happen until QC on the linked activity has passed.
              </div>
            </div>
          </form>
        </div>

        <div className="flex justify-end gap-3 border-t border-border bg-muted/20 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-service-bill-form"
            disabled={loading || workOrders.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            {loading ? 'Submitting…' : 'Submit Bill'}
          </button>
        </div>
      </div>
    </div>
  );
}
