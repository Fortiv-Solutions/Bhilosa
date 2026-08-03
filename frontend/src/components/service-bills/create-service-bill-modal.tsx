'use client';

import { useEffect, useState } from 'react';
import { X, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { createServiceBill } from '@/lib/service-bills';
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
  remaining_balance: number;
  site_agencies?: { agency_name: string } | null;
};

export function CreateServiceBillModal({ isOpen, onClose, onSuccess }: CreateServiceBillModalProps) {
  const { activeProjectId, projects } = useAppStore();
  const projectId = activeProjectId || projects[0]?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workOrders, setWorkOrders] = useState<BillableWorkOrder[]>([]);

  const [vendorId, setVendorId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');

  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);

  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);

  useEffect(() => {
    if (!isOpen || !projectId) return;
    getBillableWorkOrders(projectId)
      .then((rows) => setWorkOrders((rows || []) as unknown as BillableWorkOrder[]))
      .catch(() => setWorkOrders([]));
  }, [isOpen, projectId]);

  const selectedWorkOrder = workOrders.find((wo) => wo.id === workOrderId) || null;

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('No active project selected.');
      return;
    }
    if (!workOrderId) {
      setError('A Work Order is mandatory — no WO, no bill.');
      return;
    }
    if (!vendorId) {
      setError('Vendor is required.');
      return;
    }
    if (!billNumber) {
      setError('Bill number is required.');
      return;
    }

    setLoading(true);
    setError(null);

    const totalAmount = subtotal + tax;

    const result = await createServiceBill({
      projectId,
      vendorId,
      workOrderId,
      billNumber,
      billDate,
      serviceDescription,
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
    } else {
      onSuccess();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh]">
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
                <label className="text-xs font-semibold text-muted-foreground">Vendor / Contractor ID <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={vendorId}
                  onChange={e => setVendorId(e.target.value)}
                  placeholder="e.g. VEND-1001"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Work Order <span className="text-red-500">*</span></label>
                <select
                  required
                  value={workOrderId}
                  onChange={e => setWorkOrderId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Select an issued/active Work Order…</option>
                  {workOrders.map((wo) => (
                    <option key={wo.id} value={wo.id}>
                      {wo.work_order_number} — {wo.site_agencies?.agency_name || 'Agency'} ({formatIndianCurrency(wo.remaining_balance)} left)
                    </option>
                  ))}
                </select>
                {workOrders.length === 0 && (
                  <p className="text-[11px] text-amber-600">No issued/active Work Orders for this project — no WO, no bill.</p>
                )}
              </div>
            </div>

            {selectedWorkOrder && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <span className="font-semibold text-muted-foreground">{selectedWorkOrder.scope_of_work}</span>
                <div className="mt-1 font-bold text-foreground">Remaining balance: {formatIndianCurrency(selectedWorkOrder.remaining_balance)}</div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Service Description</label>
              <input
                type="text"
                value={serviceDescription}
                onChange={e => setServiceDescription(e.target.value)}
                placeholder="e.g. Scaffolding erection - Tower B, Aug 2026"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Bill Number <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={billNumber}
                  onChange={e => setBillNumber(e.target.value)}
                  placeholder="SB-XXXXX"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Bill Date <span className="text-red-500">*</span></label>
                <input
                  required
                  type="date"
                  value={billDate}
                  onChange={e => setBillDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-sm font-semibold mb-3">Amount Summary</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Subtotal <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={subtotal}
                    onChange={e => setSubtotal(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tax Amount <span className="text-red-500">*</span></label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={tax}
                    onChange={e => setTax(Number(e.target.value))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Total (Auto-calc)</label>
                  <input
                    disabled
                    type="text"
                    value={(subtotal + tax).toFixed(2)}
                    className="w-full rounded-md border border-transparent bg-muted px-3 py-2 text-sm font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 flex items-start gap-3 mt-4">
              <CheckCircle2 className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-800">
                This bill draws down the selected Work Order&apos;s remaining balance immediately, notifies accounts the moment it&apos;s raised, and cannot be approved until QC on the linked activity has passed.
              </div>
            </div>

            {workOrders.length === 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  No Work Order is issued/active for this project yet — issue one from the Work Orders page first.
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-3 bg-muted/20">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-semibold rounded-md border border-border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" form="create-service-bill-form" disabled={loading} className="px-4 py-2 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2">
            {loading ? <span className="animate-spin">⏳</span> : <FileText className="h-4 w-4" />}
            Submit Bill
          </button>
        </div>
      </div>
    </div>
  );
}
