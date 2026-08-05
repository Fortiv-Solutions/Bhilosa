'use client';

import { useState } from 'react';
import {
  FileText,
  RotateCcw,
  X,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Building2,
  DollarSign,
} from 'lucide-react';

export interface VendorBillRow {
  id: string;
  bill_no: string;
  accounting_date: string;
  bill_no_of_supplier: string;
  bill_date_of_supplier: string;
  project_name: string;
  company_name: string;
  supplier_name: string;
  total_tax_code_amount: number;
  net_amt: number;
  tax_code_amount_transportation: number;
  tds_posting_amount: number;
  total_bill_amount: number;
  final_bill_amount: number;
  status: 'auto_draft_grn' | 'issue' | 'approved' | 'draft' | 'pending_verification' | 'pending_approval';
  raw_status?: string;
  // Legacy alias helpers for workspace compatibility
  invoice_no?: string;
  net_payable?: number;
  matching_status?: string;
  raw_row?: unknown;
  // Denormalised source references carried from PO/GRN (used by the bill form prefill)
  vendor_name?: string | null;
  po_number?: string | null;
  grn_no?: string | null;
}

export function BillsStatsBar({ bills, onSelectTab }: { bills: VendorBillRow[]; onSelectTab?: (tab: string) => void }) {
  const [isBannerVisible, setIsBannerVisible] = useState(true);

  const autoDraftCount = bills.filter((b) => b.status === 'auto_draft_grn').length;
  const issueCount = bills.filter((b) => b.status === 'issue').length;
  const approvedCount = bills.filter((b) => b.status === 'approved').length;

  const totalPayableVal = bills.reduce((sum, b) => sum + Number(b.net_payable || 0), 0);

  return (
    <div className="space-y-3">
      {/* Top Restore Button when Banner is Dismissed */}
      {!isBannerVisible && (
        <div className="flex justify-end">
          <button
            onClick={() => setIsBannerVisible(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all shadow-2xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Show Bills Operational Banner
          </button>
        </div>
      )}

      {/* Interactive Summary Banner */}
      {isBannerVisible && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-4 shadow-sm">
          <button
            onClick={() => setIsBannerVisible(false)}
            className="absolute top-3 right-3 rounded-lg border border-border/50 bg-background/60 p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Dismiss Operational Banner"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between pr-8">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider font-heading">
                  <CreditCard className="h-3 w-3" /> Vendor Bills &amp; Invoicing
                </span>
                <span className="text-xs font-bold text-foreground">
                  3-Way Matching &amp; Payment Clearance
                </span>
              </div>
              <p className="text-xs font-semibold text-foreground/90">
                {autoDraftCount} auto-drafted bill(s) from GRN • {issueCount} issued bill(s) • {approvedCount} approved bill(s) cleared.
              </p>
            </div>

            {/* Quick Action Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                onClick={() => onSelectTab?.('auto_draft')}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 font-extrabold text-purple-800 dark:text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                <span>📝 {autoDraftCount} Auto Draft from GRN</span>
              </button>

              <button
                onClick={() => onSelectTab?.('approved')}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-extrabold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                <span>✅ {approvedCount} Approved</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4 Stats Cards Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-muted-foreground block font-heading">Total Vendor Bills</span>
          <span className="text-lg font-extrabold text-foreground font-mono">{bills.length}</span>
        </div>

        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300 block font-heading">Auto Draft from GRN</span>
          <span className="text-lg font-extrabold text-purple-700 dark:text-purple-300 font-mono">{autoDraftCount}</span>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300 block font-heading">Issued Bills</span>
          <span className="text-lg font-extrabold text-amber-700 dark:text-amber-300 font-mono">{issueCount}</span>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block font-heading">Approved Bills</span>
          <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">{approvedCount}</span>
        </div>
      </div>
    </div>
  );
}
