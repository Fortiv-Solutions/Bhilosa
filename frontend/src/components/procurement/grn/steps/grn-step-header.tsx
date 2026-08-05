'use client';

import React from 'react';
import { Calendar, Truck, CheckCircle2, ChevronRight, Scale, Search } from 'lucide-react';
import type { GrnWizardState } from '../hooks/use-grn-form';
import { usePurchaseOrderOptions, usePoLinesWithBalances } from '../hooks/use-po-lines';

interface GrnStepHeaderProps {
  state: GrnWizardState;
  updateField: <K extends keyof GrnWizardState>(key: K, value: GrnWizardState[K]) => void;
  onPoSelect: (po: any, lines: any[]) => void;
  onNext: () => void;
  isValid: boolean;
}

export function GrnStepHeader({ state, updateField, onPoSelect, onNext, isValid }: GrnStepHeaderProps) {
  const { options: poOptions, loading: poLoading } = usePurchaseOrderOptions();
  
  // When a PO is selected, we need to fetch its lines and call onPoSelect
  const handlePoChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const poId = e.target.value;
    if (!poId) return;
    
    const selectedPo = poOptions.find(p => p.id === poId);
    if (!selectedPo) return;

    // Fetch lines dynamically
    try {
      const { fetchPoLinesWithBalances } = await import('@/lib/procurement');
      const lines = await fetchPoLinesWithBalances(poId);
      onPoSelect(selectedPo, lines);
    } catch (err) {
      console.error('Failed to load PO lines:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selection Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-heading font-bold flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" /> Purchase Order Selection
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Select Purchase Order *</label>
            <select 
              value={state.po_id}
              onChange={handlePoChange}
              disabled={poLoading}
              className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3"
            >
              <option value="">{poLoading ? 'Loading...' : 'Search & Select PO...'}</option>
              {poOptions.map(po => (
                <option key={po.id} value={po.id}>{po.po_number} - {po.vendor_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">GRN Date *</label>
            <input 
              type="date"
              value={state.grn_date}
              onChange={e => updateField('grn_date', e.target.value)}
              className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3"
            />
          </div>
        </div>
        
        {state.po_id && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg bg-muted/30 p-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Vendor Name</label>
              <div className="text-xs font-semibold">{state.supplier_name || '—'}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Company</label>
              <div className="text-xs font-semibold">{state.company_name || '—'}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Delivery Location</label>
              <div className="text-xs font-semibold">{state.godown_name || '—'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Logistics Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-4 text-sm font-heading font-bold flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" /> Transport Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Challan / Invoice No</label>
            <input 
              type="text"
              value={state.challan_no}
              onChange={e => updateField('challan_no', e.target.value)}
              placeholder="Enter challan no"
              className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Vehicle No</label>
            <input 
              type="text"
              value={state.vehicle_no}
              onChange={e => updateField('vehicle_no', e.target.value)}
              placeholder="e.g. GJ-05-XX-1234"
              className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Transporter Name</label>
            <input 
              type="text"
              value={state.transporter_name}
              onChange={e => updateField('transporter_name', e.target.value)}
              placeholder="Enter transporter"
              className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Volume in Brass</label>
            <input 
              type="number"
              value={state.volume_in_brass || ''}
              onChange={e => updateField('volume_in_brass', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Weighbridge Section */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-heading font-bold flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" /> Weighbridge Readings
          </h3>
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
            <input 
              type="checkbox"
              checked={state.weighbridge_enabled}
              onChange={e => updateField('weighbridge_enabled', e.target.checked)}
              className="rounded border-border"
            />
            Record Weighbridge Data
          </label>
        </div>

        {state.weighbridge_enabled && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Gross Weight (In) kg</label>
              <input 
                type="number"
                value={state.in_weight || ''}
                onChange={e => updateField('in_weight', parseFloat(e.target.value) || 0)}
                className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3 font-mono"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Tare Weight (Out) kg</label>
              <input 
                type="number"
                value={state.out_weight || ''}
                onChange={e => updateField('out_weight', parseFloat(e.target.value) || 0)}
                className="w-full h-9 text-xs rounded-lg border border-border bg-background px-3 font-mono"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Net Weight kg (Auto)</label>
              <input 
                type="number"
                readOnly
                value={state.net_weight || ''}
                className="w-full h-9 text-xs rounded-lg border border-border bg-muted px-3 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          disabled={!isValid}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Item Quantities <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
