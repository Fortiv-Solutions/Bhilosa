'use client';

import { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2 } from 'lucide-react';
import { createVendorBill } from '@/lib/billing';
import { useAppStore } from '@/store/use-app-store';

export type CreateBillModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefilledPoId?: string;
  prefilledGrnId?: string;
  prefilledVendorId?: string;
};

export function CreateBillModal({ isOpen, onClose, onSuccess, prefilledPoId, prefilledGrnId, prefilledVendorId }: CreateBillModalProps) {
  const { activeProjectId, projects } = useAppStore();
  const projectId = activeProjectId || projects[0]?.id;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [vendorId, setVendorId] = useState(prefilledVendorId || '');
  const [poId, setPoId] = useState(prefilledPoId || '');
  const [grnId, setGrnId] = useState(prefilledGrnId || '');
  
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('No active project selected.');
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

    const result = await createVendorBill({
      projectId,
      vendorId,
      purchaseOrderId: poId,
      grnId: grnId,
      billNumber,
      billDate,
      subtotalAmount: subtotal,
      taxAmount: tax,
      totalAmount
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
            <h2 className="text-lg font-bold">Create Vendor Bill</h2>
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

          <form id="create-bill-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Vendor ID <span className="text-red-500">*</span></label>
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
                <label className="text-xs font-semibold text-muted-foreground">PO ID (Optional)</label>
                <input 
                  type="text" 
                  value={poId}
                  onChange={e => setPoId(e.target.value)}
                  placeholder="e.g. PO-2026..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">GRN ID (Required for Material Bills)</label>
                <input 
                  type="text" 
                  value={grnId}
                  onChange={e => setGrnId(e.target.value)}
                  placeholder="e.g. GRN-2026..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" 
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Bill Number <span className="text-red-500">*</span></label>
                <input 
                  required
                  type="text" 
                  value={billNumber}
                  onChange={e => setBillNumber(e.target.value)}
                  placeholder="INV-XXXXX"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm uppercase" 
                />
              </div>
              
              {/* Document upload mock field */}
              <div className="space-y-1">
                 <label className="text-xs font-semibold text-muted-foreground">Upload Invoice Document</label>
                 <div className="flex h-[38px] w-full items-center justify-center rounded-md border border-dashed border-input bg-muted/50 text-sm text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
                   <UploadCloud className="mr-2 h-4 w-4" /> Choose File...
                 </div>
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
                <strong>Duplicate check active.</strong> The system will verify if this bill number or identical amount was already submitted for this vendor.
              </div>
            </div>

          </form>
        </div>

        <div className="border-t border-border p-4 flex justify-end gap-3 bg-muted/20">
          <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-semibold rounded-md border border-border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button type="submit" form="create-bill-form" disabled={loading} className="px-4 py-2 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2">
            {loading ? <span className="animate-spin">⏳</span> : <FileText className="h-4 w-4" />}
            Submit Bill
          </button>
        </div>
      </div>
    </div>
  );
}
