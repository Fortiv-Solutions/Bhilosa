'use client';

import { ClipboardList } from 'lucide-react';
import { MrpWorkspace } from '@/components/mrp/mrp-workspace';

export default function MrpPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Supply Chain
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Material Requirement Planning
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Net BOQ requirements against on-hand stock and open purchase orders, and flag materials that need
            reordering before they block execution.
          </p>
        </div>
      </div>

      <MrpWorkspace />
    </div>
  );
}
