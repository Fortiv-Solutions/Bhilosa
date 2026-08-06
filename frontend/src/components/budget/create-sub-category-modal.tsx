'use client';

import { useState } from 'react';
import { X, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { createDynamicSubCategory } from '@/lib/supabase-budget';

interface CreateSubCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newItem: { id: string; item_description: string; category_id: string }) => void;
  projectId: string;
  categoryId: string;
  categoryName: string;
  defaultItemName?: string;
}

const COMMON_UOMS = ['BAGS', 'MT', 'CUM', 'SQFT', 'NOS', 'KG', 'LTR', 'LS', 'RMT', 'TON', 'TRIP'];

export function CreateSubCategoryModal({
  isOpen,
  onClose,
  onCreated,
  projectId,
  categoryId,
  categoryName,
  defaultItemName = '',
}: CreateSubCategoryModalProps) {
  const [itemDescription, setItemDescription] = useState(defaultItemName);
  const [unit, setUnit] = useState('BAGS');
  const [customUnit, setCustomUnit] = useState('');
  const [estimatedRate, setEstimatedRate] = useState<string>('');
  const [scopeTag, setScopeTag] = useState('General');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemDescription.trim()) {
      setError('Item description is required.');
      return;
    }
    if (!categoryId) {
      setError('Please select a valid Budget Head before creating a sub-category.');
      return;
    }

    const finalUnit = unit === 'OTHER' ? (customUnit.trim().toUpperCase() || 'NOS') : unit;
    const rateNum = parseFloat(estimatedRate) || 0;

    setLoading(true);
    setError(null);

    try {
      const createdItem = await createDynamicSubCategory({
        projectId,
        categoryId,
        itemDescription: itemDescription.trim(),
        unit: finalUnit,
        estimatedRate: rateNum,
        scopeTag,
        source: 'bill_booking',
      });

      onCreated(createdItem);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create sub-category item. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-heading text-base font-semibold">New Sub-Category Item</h3>
              <p className="text-xs text-muted-foreground">Add item under <span className="font-bold text-foreground">{categoryName || 'Selected Budget Head'}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground">
              Sub-Category Item Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. M30 Grade Readymix Concrete"
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">Unit of Measure (UOM)</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {COMMON_UOMS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value="OTHER">Custom UOM…</option>
              </select>
            </div>

            {unit === 'OTHER' ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Custom UOM</label>
                <input
                  type="text"
                  placeholder="e.g. PKT"
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Base Rate (₹ / UOM)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Optional rate"
                  value={estimatedRate}
                  onChange={(e) => setEstimatedRate(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground">Scope Tag</label>
            <select
              value={scopeTag}
              onChange={(e) => setScopeTag(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="General">General</option>
              <option value="RCC">RCC Works</option>
              <option value="Finishes">Finishes & Architectural</option>
              <option value="Infra">Site Infrastructure</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !itemDescription.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create & Select'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
