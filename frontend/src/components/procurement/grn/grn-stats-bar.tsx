'use client';

import { useState } from 'react';
import {
  Truck,
  RotateCcw,
  X,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Building2,
  Layers,
} from 'lucide-react';

export interface GrnRow {
  id: string;
  grn_number: string;
  po_number: string;
  gate_entry_no: string;
  vehicle_no: string;
  received_date: string;
  vendor_name: string;
  project_name: string;
  godown_name: string;
  challan_no: string;
  status: 'site_engineer' | 'approved' | 'draft' | 'pending_verification' | 'pending_approval' | 'posted' | 'rejected';
  raw_status?: string;
  raw_lines?: any[];
  items_received: number;
  total_val: number;
  challan_pdf_name?: string;
  site_engineer_name?: string;
  qc_no?: string;
  uploaded_challan_url?: string;
  uploaded_challan_path?: string;
  uploaded_challan_name?: string;
  uploaded_invoice_url?: string;
  uploaded_invoice_path?: string;
  uploaded_invoice_name?: string;
  remarks?: string | null;
  in_weight?: string | null;
  out_weight?: string | null;
  net_weight?: string | null;
}

export function GrnStatsBar({ grns, onSelectTab }: { grns: GrnRow[]; onSelectTab?: (tab: string) => void }) {
  const [isBannerVisible, setIsBannerVisible] = useState(true);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = grns.filter((g) => g.received_date === todayStr).length;

  const siteEngineerCount = grns.filter((g) => g.status === 'site_engineer').length;
  const approvedCount = grns.filter((g) => g.status === 'approved').length;

  return (
    <div className="space-y-3">
      {/* Top Restore Button when Banner is Dismissed */}
      {!isBannerVisible && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsBannerVisible(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all shadow-2xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Show Mobile App Sync Notice
          </button>
        </div>
      )}

      {/* Interactive Summary Banner for Mobile App Sync */}
      {isBannerVisible && (
        <div className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent p-4 shadow-xs">
          <button
            onClick={() => setIsBannerVisible(false)}
            className="absolute top-3 right-3 rounded-lg border border-border/50 bg-background/60 p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Dismiss Banner"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pr-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-extrabold text-blue-700 dark:text-blue-300 uppercase tracking-wider font-heading">
                  <Truck className="h-3 w-3" /> Mobile App Integration Active
                </span>
                <span className="text-xs font-bold text-foreground">
                  Site Engineer Field Submissions
                </span>
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                📱 GRNs are filled on-site by Site Engineers via the Pramukh Mobile App upon material delivery. The Web Dashboard provides HQ oversight, Challan PDF downloads, inspection audits, and report generation.
              </p>
            </div>

            {/* Quick Action Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => onSelectTab?.('site_engineer')}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-extrabold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                <span>📲 {siteEngineerCount} Site Engineer Pending</span>
              </button>

              <button
                onClick={() => onSelectTab?.('approved')}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-extrabold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                <span>✅ {approvedCount} HQ Approved</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Stats Cards Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground block font-heading">Total Mobile GRNs</span>
          <span className="text-lg font-extrabold text-foreground font-mono">{grns.length}</span>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block font-heading">Site Engineer Submissions</span>
          <span className="text-lg font-extrabold text-amber-700 dark:text-amber-300 font-mono">{siteEngineerCount}</span>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block font-heading">HQ Approved GRNs</span>
          <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">{approvedCount}</span>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300 block font-heading">Today's Site Receipts</span>
          <span className="text-lg font-extrabold text-blue-700 dark:text-blue-300 font-mono">{todayCount}</span>
        </div>
      </div>
    </div>
  );
}
