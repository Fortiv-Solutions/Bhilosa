'use client';

import { useState, useEffect } from 'react';
import { ClipboardList, Plus, Trash2, X } from 'lucide-react';
import type { MaterialRequestRow, ProcurementProjectOption } from '@/lib/erp/material-request/types';
import type { MaterialRequestLineInput } from '@/lib/procurement';
import { supabase } from '@/utils/supabase-client';

interface CreateMRModalProps {
  projectOptions: ProcurementProjectOption[];
  onClose: () => void;
  onSubmit: (
    projectId: string,
    title: string,
    priority: MaterialRequestRow['priority'],
    requiredDate: string,
    lines: MaterialRequestLineInput[]
  ) => Promise<void>;
}

const BLANK_LINE: MaterialRequestLineInput = {
  itemDescription: '',
  quantity: 1,
  estimatedRate: 0,
  unit: 'nos',
  itemGroup: '',
  itemBrand: '',
  activityName: '',
  subActivityName: '',
};

export function CreateMRModal({ projectOptions, onClose, onSubmit }: CreateMRModalProps) {
  const [projectId, setProjectId] = useState(projectOptions[0]?.id || 'central-park');
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<MaterialRequestRow['priority']>('high');
  const [requiredDate, setRequiredDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [lines, setLines] = useState<MaterialRequestLineInput[]>([{ ...BLANK_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [itemGroups, setItemGroups] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('item_groups')
      .select('name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setItemGroups(data.map((g: any) => g.name).filter(Boolean));
      });
  }, []);

  const handleAddLine = () => {
    setLines([...lines, { ...BLANK_LINE }]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, field: string, val: string | number) => {
    const next = [...lines];
    next[index] = { ...next[index], [field]: val };
    setLines(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await onSubmit(projectId, title, priority, requiredDate, lines);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ClipboardList className="h-4 w-4" />
            </span>
            <h3 className="font-heading text-base font-bold text-foreground">Raise New Material Request</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-muted-foreground block mb-1">Project Site</label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium outline-none focus:border-primary"
              >
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-muted-foreground block mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as MaterialRequestRow['priority'])}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium outline-none focus:border-primary"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-muted-foreground block mb-1">Justification / Activity Description</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Concrete pour for Block A slab casting"
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="font-bold text-muted-foreground block mb-1">Required On Site By</label>
            <input
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium outline-none focus:border-primary"
            />
          </div>

          {/* Line Items */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <label className="font-bold text-muted-foreground">Requested Materials</label>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 text-primary font-bold hover:underline"
              >
                <Plus className="h-3 w-3" /> Add Item
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Activity, Sub-Activity, Group and Brand carry through to the Purchase Requisition
              exactly as entered here.
            </p>

            {lines.map((line, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={line.itemDescription}
                    onChange={(e) => handleLineChange(idx, 'itemDescription', e.target.value)}
                    placeholder="Material description"
                    required
                    className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 font-semibold outline-none focus:border-primary"
                  />
                  {lines.length > 1 && (
                    <button type="button" onClick={() => handleRemoveLine(idx)} title="Remove item" className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pl-7">
                  <input
                    type="text"
                    value={line.activityName ?? ''}
                    onChange={(e) => handleLineChange(idx, 'activityName', e.target.value)}
                    placeholder="Activity name"
                    className="rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={line.subActivityName ?? ''}
                    onChange={(e) => handleLineChange(idx, 'subActivityName', e.target.value)}
                    placeholder="Sub-activity"
                    className="rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                  />
                  <input
                    list={`item-groups-list-${idx}`}
                    value={line.itemGroup ?? ''}
                    onChange={(e) => handleLineChange(idx, 'itemGroup', e.target.value)}
                    placeholder="Item group"
                    className="rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                  />
                  <datalist id={`item-groups-list-${idx}`}>
                    {itemGroups.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                  <input
                    type="text"
                    value={line.itemBrand ?? ''}
                    onChange={(e) => handleLineChange(idx, 'itemBrand', e.target.value)}
                    placeholder="Preferred brand"
                    className="rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                  />
                </div>

                <div className="flex items-center gap-2 pl-7">
                  <input
                    type="text"
                    value={line.unit ?? 'nos'}
                    onChange={(e) => handleLineChange(idx, 'unit', e.target.value)}
                    placeholder="Unit"
                    className="w-20 rounded-md border border-border bg-background px-2 py-1.5 outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    value={line.quantity}
                    onChange={(e) => handleLineChange(idx, 'quantity', Number(e.target.value))}
                    placeholder="Qty"
                    required
                    min={0.0001}
                    step="any"
                    className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-right outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    value={line.estimatedRate}
                    onChange={(e) => handleLineChange(idx, 'estimatedRate', Number(e.target.value))}
                    placeholder="Rate (₹)"
                    min={0}
                    step="any"
                    className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-right outline-none focus:border-primary"
                  />
                  <span className="ml-auto text-[11px] font-semibold text-muted-foreground tabular-nums">
                    ₹{((Number(line.quantity) || 0) * (Number(line.estimatedRate) || 0)).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 font-bold hover:bg-muted">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Material Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
