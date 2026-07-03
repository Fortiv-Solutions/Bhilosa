'use client';

import { useAppStore } from '@/store/use-app-store';
import { motion } from 'framer-motion';
import { 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle,
  FolderOpen
} from 'lucide-react';

export default function BOQPage() {
  const { projects } = useAppStore();

  // Aggregate all BOQ items
  const allBOQ = projects.flatMap(p => 
    p.boqItems.map(b => ({ ...b, projectName: p.name, projectId: p.id }))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
          Contract Baseline
        </span>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
          Global Bill of Quantities (BOQ)
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review structural measurements, unit rates, baseline estimates, and actual quantity absorption logs.
        </p>
      </div>

      {/* BOQ Table */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
        <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">Authorized BOQ Baseline Registers</h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                <th className="pb-3 font-semibold">BOQ Code</th>
                <th className="pb-3 font-semibold">Scope Description</th>
                <th className="pb-3 font-semibold">Project Site</th>
                <th className="pb-3 font-semibold">Unit Rate</th>
                <th className="pb-3 font-semibold">Est. Quantity</th>
                <th className="pb-3 font-semibold">Consumed Quantity</th>
                <th className="pb-3 font-semibold">Workflow status</th>
              </tr>
            </thead>
            <tbody>
              {allBOQ.map((boq) => (
                <tr key={boq.id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/20">
                  <td className="py-3.5 font-bold text-gray-800 dark:text-gray-250 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    {boq.code}
                  </td>
                  <td className="py-3.5 font-medium">{boq.description}</td>
                  <td className="py-3.5 text-primary font-semibold">{boq.projectName}</td>
                  <td className="py-3.5">₹{boq.rate} / {boq.unit}</td>
                  <td className="py-3.5 font-semibold text-gray-650 dark:text-gray-250">{boq.estimatedQty}</td>
                  <td className="py-3.5 font-semibold text-orange-600 dark:text-orange-400">{boq.consumedQty}</td>
                  <td className="py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1 w-fit
                      ${boq.approved 
                        ? 'bg-emerald-50 border-emerald-200 text-success dark:bg-emerald-950/20' 
                        : 'bg-amber-50 border-amber-200 text-warning dark:bg-amber-950/20'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {boq.approved ? 'Approved Baseline' : 'Pending Audit'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
