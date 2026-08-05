'use client';

import React, { useState } from 'react';
import { FileCheck, ChevronLeft, Save, Send, Plus, Upload, Trash2 } from 'lucide-react';
import type { GrnWizardState } from '../hooks/use-grn-form';
import type { GrnExtraItem } from '../grn-form';

interface GrnStepReviewProps {
  state: GrnWizardState;
  updateField: <K extends keyof GrnWizardState>(key: K, value: GrnWizardState[K]) => void;
  onBack: () => void;
  onSubmit: (status: 'Draft' | 'Pending Verification') => void;
}

export function GrnStepReview({ state, updateField, onBack, onSubmit }: GrnStepReviewProps) {
  const itemsReceived = state.items.filter(item => (Number(item.received_qty) || 0) > 0);
  const totalAcceptedValue = itemsReceived.reduce((sum, item) => sum + ((Number(item.received_qty) - Number(item.return_qty || 0)) * (item.unit_rate || 0)), 0);
  
  const addExtraItem = () => {
    const newItem: GrnExtraItem = {
      sr: state.extra_items.length + 1,
      po_no: state.po_no,
      item_group: '',
      item_desc: '',
      item_brand: '',
      purchase_category: '',
      quantity: 0,
      grn_stock_unit: 'NOS',
      loading_unloading_chgs: 0,
      test_report_no: ''
    };
    updateField('extra_items', [...state.extra_items, newItem]);
  };

  const removeExtraItem = (index: number) => {
    const newExtras = [...state.extra_items];
    newExtras.splice(index, 1);
    updateField('extra_items', newExtras);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Summary Card */}
        <div className="col-span-1 md:col-span-2 rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-heading font-bold flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-primary" /> Receipt Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 rounded-lg p-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Items Received</label>
              <div className="text-lg font-bold font-mono">{itemsReceived.length}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Total Value</label>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ₹{totalAcceptedValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Extra Items</label>
              <div className="text-lg font-bold font-mono">{state.extra_items.length}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Transport</label>
              <div className="text-xs font-semibold">{state.vehicle_no || 'N/A'}</div>
              <div className="text-[10px] text-muted-foreground">{state.transporter_name}</div>
            </div>
          </div>
          
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">General Remarks / Notes</label>
            <textarea 
              value={state.remarks}
              onChange={e => updateField('remarks', e.target.value)}
              placeholder="Enter any additional notes about this receipt..."
              className="w-full h-20 text-xs rounded-lg border border-border bg-background p-3 resize-none"
            />
          </div>
        </div>

        {/* Upload Card */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-4 text-sm font-heading font-bold flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Document Upload
          </h3>
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <div className="text-xs font-semibold">Upload Delivery Challan</div>
              <div className="text-[10px] text-muted-foreground mt-1">PDF, JPG or PNG</div>
            </div>
            <div className="rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
              <div className="text-xs font-semibold">Upload Invoice</div>
              <div className="text-[10px] text-muted-foreground mt-1">OCR scanning available</div>
            </div>
          </div>
        </div>
      </div>

      {/* Extra Items */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-heading font-bold">Unscheduled / Extra Items</h3>
          <button 
            onClick={addExtraItem}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" /> Add Extra Item
          </button>
        </div>
        
        {state.extra_items.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">
            No extra items recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">Description</th>
                  <th className="px-3 py-2 font-semibold">Brand</th>
                  <th className="px-3 py-2 font-semibold w-24">Qty</th>
                  <th className="px-3 py-2 font-semibold w-24">Unit</th>
                  <th className="px-3 py-2 font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {state.extra_items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={item.item_desc}
                        onChange={e => {
                          const newExtras = [...state.extra_items];
                          newExtras[idx].item_desc = e.target.value;
                          updateField('extra_items', newExtras);
                        }}
                        className="w-full h-8 text-xs rounded border border-border bg-background px-2"
                        placeholder="Item description"
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={item.item_brand}
                        onChange={e => {
                          const newExtras = [...state.extra_items];
                          newExtras[idx].item_brand = e.target.value;
                          updateField('extra_items', newExtras);
                        }}
                        className="w-full h-8 text-xs rounded border border-border bg-background px-2"
                        placeholder="Brand"
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="number" 
                        value={item.quantity || ''}
                        onChange={e => {
                          const newExtras = [...state.extra_items];
                          newExtras[idx].quantity = parseFloat(e.target.value) || 0;
                          updateField('extra_items', newExtras);
                        }}
                        className="w-full h-8 text-xs rounded border border-border bg-background px-2 text-right font-mono"
                        placeholder="0.00"
                      />
                    </td>
                    <td className="p-2">
                      <input 
                        type="text" 
                        value={item.grn_stock_unit}
                        onChange={e => {
                          const newExtras = [...state.extra_items];
                          newExtras[idx].grn_stock_unit = e.target.value;
                          updateField('extra_items', newExtras);
                        }}
                        className="w-full h-8 text-xs rounded border border-border bg-background px-2"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button 
                        onClick={() => removeExtraItem(idx)}
                        className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-bold transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Items
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onSubmit('Draft')}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-4 text-xs font-bold transition-colors hover:bg-muted"
          >
            <Save className="h-4 w-4" /> Save as Draft
          </button>
          <button
            onClick={() => onSubmit('Pending Verification')}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-6 text-xs font-bold text-white transition-colors hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" /> Submit for Verification
          </button>
        </div>
      </div>
    </div>
  );
}
