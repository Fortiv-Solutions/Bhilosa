import React, { useState } from 'react';
import { PurchaseOrderRow, DeliveryTrackingRow } from '@/lib/procurement';
import { StatusBadge, EmptyState } from './shared';
import { 
  Truck, 
  MapPin, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  PackageCheck,
  Send
} from 'lucide-react';

export function DeliveryTrackingWorkbench({
  purchaseOrders,
  deliveryTrackings,
  selectedPoId,
  onSelectPo,
  onUpdateStatus,
}: {
  purchaseOrders: PurchaseOrderRow[];
  deliveryTrackings: DeliveryTrackingRow[];
  selectedPoId: string | null;
  onSelectPo: (id: string | null) => void;
  onUpdateStatus: (trackingId: string, status: string, reason?: string, vehicle?: string) => void;
}) {
  const [delayReason, setDelayReason] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const activePos = purchaseOrders.filter(po => 
    po.status === 'sent' || 
    po.status === 'acknowledged' || 
    po.status === 'partially_delivered'
  );

  if (activePos.length === 0) return <EmptyState message="No active purchase orders in transit." />;

  const selectedPo = activePos.find((row) => row.id === selectedPoId) || activePos[0];
  const tracking = deliveryTrackings.find((t) => t.purchase_order_id === selectedPo.id);

  const vendor = selectedPo.vendors;

  const handleStatusUpdate = (status: string) => {
    if (!tracking) return;
    onUpdateStatus(tracking.id, status, delayReason, vehicleNumber);
    setIsUpdating(false);
    setDelayReason('');
    setVehicleNumber('');
  };

  const steps = [
    { id: 'dispatched', label: 'Dispatched', icon: Send },
    { id: 'in_transit', label: 'In Transit', icon: Truck },
    { id: 'reached_site', label: 'Reached Site', icon: MapPin },
    { id: 'delivered', label: 'Delivered (GRN)', icon: PackageCheck }
  ];

  const currentStepIndex = tracking 
    ? steps.findIndex(s => s.id === tracking.transit_status) 
    : -1;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2.5fr]">
      <div className="max-h-[800px] space-y-2 overflow-y-auto pr-1">
        {activePos.map((row) => {
          const isSelected = selectedPo.id === row.id;
          const poTracking = deliveryTrackings.find(t => t.purchase_order_id === row.id);
          const isDelayed = poTracking?.transit_status === 'delayed';

          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectPo(row.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors ${isSelected ? 'border-indigo-500 bg-indigo-500/5' : 'border-border hover:bg-muted/50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-bold text-foreground">{row.po_number}</p>
                <StatusBadge status={poTracking?.transit_status || row.status} />
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{row.vendors?.display_name || row.vendors?.legal_name || 'Vendor'}</p>
              
              {isDelayed && (
                <div className="mt-2 text-[10px] text-red-700 bg-red-100 rounded px-2 py-0.5 inline-flex items-center gap-1 font-bold">
                  <AlertCircle className="w-3 h-3" /> Delayed
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 pb-10">
        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-8">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-1">Delivery: {selectedPo.po_number}</h3>
              <p className="text-lg font-medium text-foreground">{vendor?.display_name || vendor?.legal_name || 'Vendor'}</p>
            </div>
            {tracking && (
              <div className="text-right">
                <p className="text-sm font-bold text-muted-foreground uppercase">Expected Arrival</p>
                <p className="text-xl font-black text-foreground">{tracking.expected_delivery_date || selectedPo.delivery_date || 'N/A'}</p>
              </div>
            )}
          </div>

          {!tracking ? (
            <div className="rounded-xl border-2 border-dashed border-border p-8 text-center text-muted-foreground">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-bold">Tracking not started</p>
              <p className="text-sm">Start tracking from the Purchase Order Workbench</p>
            </div>
          ) : (
            <>
              {/* Timeline */}
              <div className="relative mb-12 mt-4 px-4">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-muted -translate-y-1/2 z-0"></div>
                <div 
                  className="absolute top-1/2 left-0 h-1 bg-indigo-600 -translate-y-1/2 z-0 transition-all duration-500"
                  style={{ width: `${Math.max(0, currentStepIndex) / (steps.length - 1) * 100}%` }}
                ></div>
                
                <div className="relative z-10 flex justify-between">
                  {steps.map((step, idx) => {
                    const isCompleted = idx <= currentStepIndex;
                    const isCurrent = idx === currentStepIndex;
                    const Icon = step.icon;
                    return (
                      <div key={step.id} className="flex flex-col items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                          isCompleted ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-card border-border text-muted-foreground'
                        } ${isCurrent && tracking.transit_status === 'delayed' ? 'bg-red-600 border-red-600' : ''}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <p className={`text-xs font-bold ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Status Update Actions */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h4 className="font-bold text-foreground mb-4">Update Delivery Status</h4>
                
                {tracking.transit_status === 'delayed' && (
                  <div className="mb-4 rounded-md bg-red-50 p-4 border border-red-200">
                    <p className="font-bold text-red-800 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" /> Currently Delayed
                    </p>
                    <p className="text-sm font-semibold text-amber-700 mt-1">{tracking.delay_reason || 'No reason provided.'}</p>
                  </div>
                )}

                {isUpdating ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-muted-foreground block mb-1">Vehicle Number</label>
                        <input 
                          value={vehicleNumber}
                          onChange={(e) => setVehicleNumber(e.target.value)}
                          placeholder="e.g. MH 12 AB 1234"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-muted-foreground block mb-1">Delay Reason (if any)</label>
                        <input 
                          value={delayReason}
                          onChange={(e) => setDelayReason(e.target.value)}
                          placeholder="e.g. Heavy traffic, Vehicle breakdown"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button onClick={() => handleStatusUpdate('in_transit')} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">In Transit</button>
                      <button onClick={() => handleStatusUpdate('delayed')} className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700">Mark Delayed</button>
                      <button onClick={() => handleStatusUpdate('reached_site')} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">Reached Site</button>
                      <button onClick={() => setIsUpdating(false)} className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted ml-auto">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsUpdating(true)}
                      className="rounded-md bg-secondary px-6 py-2.5 text-sm font-bold text-secondary-foreground hover:bg-secondary/80"
                    >
                      Update Status
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
