import React from 'react';
import { InventorySnapshotRow } from '@/lib/procurement';
import { formatCurrency, EmptyState } from './shared';
import { 
  Warehouse, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle 
} from 'lucide-react';

export function InventoryWorkbench({
  snapshots
}: {
  snapshots: InventorySnapshotRow[];
}) {
  if (snapshots.length === 0) return <EmptyState message="No inventory snapshots available." />;

  const totalValue = snapshots.reduce((sum, s) => sum + (s.stock_value || 0), 0);
  const totalItems = snapshots.length;
  const lowStockItems = snapshots.filter(s => (s.available_qty || 0) < 100); // Threshold logic can be improved

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <Warehouse className="w-5 h-5" />
            <h4 className="font-bold uppercase text-xs">Total Stock Value</h4>
          </div>
          <p className="text-3xl font-black text-foreground">{formatCurrency(totalValue)}</p>
        </div>
        
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-muted-foreground">
            <TrendingUp className="w-5 h-5" />
            <h4 className="font-bold uppercase text-xs">Unique Items Tracked</h4>
          </div>
          <p className="text-3xl font-black text-foreground">{totalItems}</p>
        </div>

        <div className={`rounded-xl border p-5 shadow-sm ${lowStockItems.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-border bg-card'}`}>
          <div className={`flex items-center gap-3 mb-2 ${lowStockItems.length > 0 ? 'text-amber-800' : 'text-muted-foreground'}`}>
            <AlertTriangle className="w-5 h-5" />
            <h4 className="font-bold uppercase text-xs">Low Stock Alerts</h4>
          </div>
          <p className={`text-3xl font-black ${lowStockItems.length > 0 ? 'text-amber-700' : 'text-foreground'}`}>{lowStockItems.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="p-5 border-b border-border bg-muted/30">
          <h4 className="font-bold text-lg text-foreground">Current Stock Balance</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted text-muted-foreground border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Item Name</th>
                <th className="px-6 py-4 font-semibold text-right">Available Qty</th>
                <th className="px-6 py-4 font-semibold text-right">Consumed Qty</th>
                <th className="px-6 py-4 font-semibold text-right">Avg Rate</th>
                <th className="px-6 py-4 font-semibold text-right">Total Value</th>
                <th className="px-6 py-4 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {snapshots.map((row) => {
                const available = Number(row.available_qty || 0);
                const isLow = available < 100; // Arbitrary for demo, should use reorder_level if exists
                
                return (
                  <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{row.item_master?.name || 'Unknown Item'}</td>
                    <td className="px-6 py-4 text-right font-bold text-foreground">{available}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{row.consumed_qty || 0}</td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{formatCurrency((row.stock_value || 0) / (available || 1))}</td>
                    <td className="px-6 py-4 text-right font-bold text-primary">{formatCurrency(row.stock_value || 0)}</td>
                    <td className="px-6 py-4 text-center">
                      {isLow ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                          Adequate
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
