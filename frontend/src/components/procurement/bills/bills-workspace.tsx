'use client';

import { useState } from 'react';
import { CreditCard, ListChecks } from 'lucide-react';
import type { VendorBillRow as DbVendorBillRow } from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { BillsStatsBar, type VendorBillRow } from './bills-stats-bar';
import { BillsTableView } from './bills-table-view';
import { BillsForm, type FullBillsFormState } from './bills-form';

const APPROVED_STATUSES = new Set(['approved', 'paid', 'three_way_matched', 'matched', 'completed']);

// Bridge the flat Supabase vendor_bills row (with joined vendor + three-way match)
// to the rich display row the Bills table + form expect.
function toDisplayBill(b: DbVendorBillRow): VendorBillRow {
  const match = b.three_way_matches?.[0]?.match_status;
  const status: 'auto_draft_grn' | 'issue' | 'approved' = APPROVED_STATUSES.has((b.status || '').toLowerCase())
    ? 'approved'
    : 'auto_draft_grn';
  const supplier = b.vendors?.display_name || b.vendors?.legal_name || b.vendor_name || '—';
  return {
    id: b.id,
    bill_no: b.bill_number,
    accounting_date: b.bill_date,
    bill_no_of_supplier: b.bill_book_number || '—',
    bill_date_of_supplier: b.bill_date,
    project_name: '—',
    company_name: '—',
    supplier_name: supplier,
    total_tax_code_amount: Number(b.tax_amount) || 0,
    net_amt: Number(b.subtotal_amount) || 0,
    tax_code_amount_transportation: 0,
    tds_posting_amount: 0,
    total_bill_amount: Number(b.total_amount) || 0,
    final_bill_amount: Number(b.total_amount) || 0,
    status,
    vendor_name: supplier,
    po_number: b.po_number ?? null,
    grn_no: b.grn_no ?? null,
    matching_status: match,
  };
}

interface BillsWorkspaceProps {
  bills?: DbVendorBillRow[];
  activeRole?: Role;
  /** Generates the report-format Purchase Bill PDF and opens it in a new tab. */
  onPrintBill?: (billId: string) => void;
  onRefresh?: () => void | Promise<void>;
}

export function BillsWorkspace({ bills = [], onPrintBill, onRefresh }: BillsWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [activeBill, setActiveBill] = useState<VendorBillRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');

  const displayBills = bills.map(toDisplayBill);

  const handleOpenForm = (bill: VendorBillRow) => {
    setActiveBill(bill);
    setViewMode('form');
  };

  const handleFormSubmit = (_formData: FullBillsFormState) => {
    setViewMode('list');
    setActiveBill(null);
    void onRefresh?.();
  };

  const filteredBills = displayBills.filter((b) => {
    if (selectedTab === 'auto_draft') return b.status === 'auto_draft_grn';
    if (selectedTab === 'approved') return b.status === 'approved';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground font-heading">Vendor Bills &amp; Invoicing Workspace</span>
          <span className="text-muted-foreground">• Active Invoices ({displayBills.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setViewMode('list');
              setActiveBill(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${
              viewMode === 'list'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> Bills Landing Table ({filteredBills.length})
          </button>
        </div>
      </div>

      {viewMode === 'form' && activeBill ? (
        <BillsForm
          bill={activeBill}
          onPrint={onPrintBill ? () => onPrintBill(activeBill.id) : undefined}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setViewMode('list');
            setActiveBill(null);
          }}
        />
      ) : (
        <>
          {/* Operational Reminders Banner */}
          <BillsStatsBar
            bills={displayBills}
            onSelectTab={(tab) => setSelectedTab(tab)}
          />

          {/* Bills Landing Table View */}
          <BillsTableView
            bills={filteredBills}
            onOpenBillForm={handleOpenForm}
          />
        </>
      )}
    </div>
  );
}
