'use client';

import { useAppStore } from '@/store/use-app-store';
import { 
  AlertTriangle, 
  Search, 
  Boxes,
  Truck
} from 'lucide-react';
import { useState } from 'react';

export default function MaterialsPage() {
  const { projects } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Aggregate all materials
  const allMaterials = projects.flatMap(p => 
    p.materials.map(m => ({ ...m, projectName: p.name, projectId: p.id }))
  );

  const lowStockItems = allMaterials.filter(m => m.quantity < m.reorderLevel);

  const filteredMaterials = allMaterials.filter(m => 
    m.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.projectName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (val: number) => {
    if (val >= 10000000) return `INR ${(val / 10000000).toFixed(2)} Cr`;
    return `INR ${(val / 100000).toFixed(2)} L`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
          Inventory Hub
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
          Inventory Management
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review site-wise inventory, material transfers, stock summaries, and consumption risk across all stores.
        </p>
      </div>

      {/* Warnings block */}
      {lowStockItems.length > 0 && (
        <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-danger">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-normal">Critical Low Stock Reorder Required ({lowStockItems.length})</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {lowStockItems.map(item => (
              <span key={item.id} className="text-xs font-bold bg-white dark:bg-gray-950 border border-red-200 dark:border-red-900/40 text-danger px-2.5 py-1 rounded-lg">
                {item.itemName} at {item.projectName} ({item.quantity} {item.unit} remaining)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Materials Table Card */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {['Site-wise Inventory', 'Material Transfers', 'Stock Summary', 'Consumption Analysis'].map((section) => (
                <span key={section} className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[10px] font-bold text-gray-500 dark:bg-gray-950 dark:text-gray-400">{section}</span>
              ))}
            </div>
            <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">Stores General Ledger</h3>
          </div>
          
          <div className="relative w-full md:max-w-xs">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by material, site, or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white rounded-xl border border-gray-200 dark:border-gray-800 focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                <th className="pb-3 font-semibold">Material Item</th>
                <th className="pb-3 font-semibold">Store Site Location</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Stock Quantity</th>
                <th className="pb-3 font-semibold">Stock Value</th>
                <th className="pb-3 font-semibold">Primary Supplier</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.map((mat) => {
                const isLow = mat.quantity < mat.reorderLevel;
                return (
                  <tr key={mat.id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/20">
                    <td className="py-3.5 font-bold text-gray-800 dark:text-gray-250 flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                      {mat.itemName}
                    </td>
                    <td className="py-3.5 font-medium">{mat.projectName}</td>
                    <td className="py-3.5 text-gray-405">{mat.category}</td>
                    <td className="py-3.5 font-bold">{mat.quantity} {mat.unit}</td>
                    <td className="py-3.5">{formatCurrency(mat.stockValue)}</td>
                    <td className="py-3.5 text-gray-400 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> {mat.supplierName}</td>
                    <td className="py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border
                        ${isLow ? 'bg-red-50 border-red-200 text-danger dark:bg-red-950/20' : 'bg-emerald-50 border-emerald-200 text-success dark:bg-emerald-950/20'}`}>
                        {isLow ? 'Below Safety' : 'Healthy'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {filteredMaterials.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    No matching material items found in logs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
