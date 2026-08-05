'use client';

import { useState } from 'react';
import { CreditCard, ListChecks, Plus } from 'lucide-react';
import type { VendorBillRow as DbVendorBillRow, VendorOption, GrnOption } from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { BillsStatsBar, type VendorBillRow } from './bills-stats-bar';
import { BillsTableView } from './bills-table-view';
import { BillsForm, type FullBillsFormState } from './bills-form';

const APPROVED_STATUSES = new Set(['approved', 'paid', 'three_way_matched', 'matched', 'completed']);

// Bridge the flat Supabase vendor_bills row (with joined vendor + three-way match)
// to the rich display row the Bills table + form expect.
function toDisplayBill(b: DbVendorBillRow): VendorBillRow {
  const match = b.three_way_matches?.[0]?.match_status;
  const rawSt = (b.status || '').toLowerCase();

  let status: VendorBillRow['status'] = 'draft';
  if (APPROVED_STATUSES.has(rawSt)) {
    status = 'approved';
  } else if (rawSt === 'auto_draft_grn' || rawSt === 'auto_draft') {
    status = 'auto_draft_grn';
  } else if (rawSt === 'pending_verification') {
    status = 'pending_verification';
  } else if (rawSt === 'pending_approval') {
    status = 'pending_approval';
  } else if (rawSt === 'issue') {
    status = 'issue';
  } else {
    status = 'draft';
  }

  const supplier = b.vendors?.display_name || b.vendors?.legal_name || b.vendor_name || '—';
  const row = b as DbVendorBillRow & Record<string, unknown>;
  const projName = (row.projects as { name?: string })?.name || (row.project_name as string) || '—';
  const poNum = b.po_number || (row.from_pos as string) || null;
  const grnNum = b.grn_no || (row.from_challans as string) || null;

  return {
    id: b.id,
    bill_no: b.bill_number,
    accounting_date: (row.accounting_date as string) || b.bill_date,
    bill_no_of_supplier: (row.supplier_bill_no as string) || b.bill_book_number || '—',
    bill_date_of_supplier: (row.supplier_bill_date as string) || b.bill_date,
    project_name: projName,
    company_name: (row.company_name as string) || '—',
    supplier_name: supplier,
    total_tax_code_amount: Number(b.tax_amount) || 0,
    net_amt: Number(b.subtotal_amount) || 0,
    tax_code_amount_transportation: Number(row.stax_amount) || 0,
    tds_posting_amount: Number(row.other_deductions) || 0,
    total_bill_amount: Number(b.total_amount) || 0,
    // Net payable, not the gross total — the two differ once retention,
    // advance adjustment and other deductions are applied.
    final_bill_amount: Number(row.net_payable_amount) || Number(b.total_amount) || 0,
    status,
    raw_status: b.status,
    vendor_name: supplier,
    po_number: poNum,
    grn_no: grnNum,
    matching_status: match,
    raw_row: b,
  };
}

/** Maps the form's display status onto the vendor_bills workflow value. */
const FORM_STATUS_TO_DB: Record<string, string> = {
  Draft: 'draft',
  'Pending Verification': 'pending_verification',
  'Pending Approval': 'pending_approval',
  Approved: 'approved',
};

interface BillsWorkspaceProps {
  bills?: DbVendorBillRow[];
  activeRole?: Role;
  /** Active suppliers, for the supplier dropdown on the bill form. */
  vendorOptions?: VendorOption[];
  /** Approved GRNs available to select for billing */
  approvedGrns?: any[];
  /** Posted GRNs with no bill yet, offered as the source for a new bill. */
  billableGrns?: GrnOption[];
  /** Opens the Create PB flow. */
  onCreateBill?: () => void;
  /** Persists the whole bill form. */
  onSaveBill?: (billId: string, payload: Record<string, unknown>) => void | Promise<void>;
  /** Moves a bill through its workflow (role-checked server-side). */
  onStatusChange?: (billId: string, status: string) => void | Promise<void>;
  /** Generates the report-format Purchase Bill PDF and opens it in a new tab. */
  onPrintBill?: (billId: string) => void;
  onRefresh?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

export function BillsWorkspace({
  bills = [],
  activeRole,
  vendorOptions = [],
  approvedGrns = [],
  billableGrns = [],
  onCreateBill,
  onSaveBill,
  onStatusChange,
  onPrintBill,
  onRefresh,
  onError,
}: BillsWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [activeBill, setActiveBill] = useState<VendorBillRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');

  const displayBills = bills.map(toDisplayBill);
  const canApproveBills = activeRole === 'UPPER_MANAGEMENT';

  /** Lets the form's supplier name resolve back to a real vendor id. */
  const vendorByName = new Map(vendorOptions.map((v) => [v.display_name || v.legal_name, v.id]));

  const handleOpenForm = (bill: VendorBillRow) => {
    setActiveBill(bill);
    setViewMode('form');
  };

  /**
   * Persists the entire purchase-bill form.
   *
   * Previously this mapped `formData.status` and threw the rest away, so all
   * ten sections — entries, charges, retention, advance adjustments, payment
   * vouchers, PO details, GRN remarks, ledger postings — were discarded on
   * every save. Approval is applied as a separate, role-checked transition.
   */
  const handleFormSubmit = async (formData: FullBillsFormState) => {
    const dbStatus = FORM_STATUS_TO_DB[formData.status] || 'draft';

    // A non-approver may still edit the bill; they just cannot approve it.
    if (dbStatus === 'approved' && !canApproveBills) {
      onError?.('Saved without approval: only upper management may approve a purchase bill.');
    }

    const toNum = (v: unknown): number => {
      if (v === null || v === undefined || v === '') return 0;
      if (typeof v === 'string') {
        const cleaned = v.replace(/[^0-9.-]/g, '');
        const n = Number(cleaned);
        return isNaN(n) ? 0 : n;
      }
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    await onSaveBill?.(activeBill?.id || '', {
      vendor_id: formData.supplier_name && vendorByName.get(formData.supplier_name)
        ? vendorByName.get(formData.supplier_name)
        : undefined,
      bill_received_date: formData.bill_received_date || undefined,
      accounting_date: formData.accounting_date ? formData.accounting_date.slice(0, 10) : undefined,
      supplier_bill_no: formData.bill_no_of_supplier || formData.supplier_bill_no || undefined,
      supplier_bill_date: formData.bill_date_of_supplier || formData.supplier_bill_date || undefined,
      company_name: formData.company_name || undefined,
      contractor_name: formData.contractor_name || undefined,
      party_name: formData.party_name || undefined,
      company_status: formData.company_status || undefined,
      tax_status: formData.tax_status || undefined,
      work_order_type: formData.work_order_type || undefined,
      work_order_no: formData.work_order_no || undefined,
      area_work_order_no: formData.area_work_order_no || undefined,
      sub_project: formData.sub_project || undefined,
      from_pos: formData.from_pos || undefined,
      from_challans: formData.from_challans || undefined,
      payment_days: toNum(formData.payment_days) || 30,
      bill_due_date: formData.bill_due_date || undefined,
      auto_debit: !!formData.auto_debit,
      perc: toNum(formData.perc),
      lumpsum_other_charges: toNum(formData.lumpsum_other_charges),
      lumpsum_loading_unloading_charges: toNum(formData.lumpsum_loading_unloading_charges),
      lumpsum_freight_charges: toNum(formData.lumpsum_freight_charges),
      lumpsum_discount_amount: toNum(formData.lumpsum_discount_amount),
      roundoff_adjustment: toNum(formData.roundoff_adjustment),
      total_adjusted_amount: toNum(formData.total_adjusted_amount),
      cheque_amount: toNum(formData.cheque_amount),
      total_cheque_payments: toNum(formData.total_cheque_payments),
      debit_details: toNum(formData.debit_details),
      credit_details: toNum(formData.credit_details),
      lbt_payable_by_us: !!formData.lbt_payable_by_us,
      additional_transportation_stax_applicable:
        !!formData.additional_transportation_service_tax_applicable,
      stax_principal_amount: toNum(formData.stax_principal_amount),
      transportation_stax_rate: toNum(formData.transportation_stax_rate),
      stax_amount: toNum(formData.stax_amount),
      lbt_principal_amount: toNum(formData.lbt_principal_amount),
      lbt_tax_rate: toNum(formData.lbt_tax_rate),
      lbt_amount: toNum(formData.lbt_amount),
      project_location: formData.project_location || undefined,
      supplier_location: formData.supplier_location || undefined,
      narration: formData.narration || undefined,
      assigned_approval_role: formData.assigned_approval_role || undefined,
      bill_has_already_signed: !!formData.bill_has_already_signed,
      status_issue_relation_count: formData.status_issue_relation_count || undefined,
      unlocked_fy: toNum(formData.unlocked_fy) || new Date().getFullYear(),
      // Save requested status directly to database
      status: dbStatus,
      lines: (formData.purchase_bill_entries || []).map((entry) => ({
        ...entry,
        received_qty: toNum(entry.received_qty),
        po_basic_rate: toNum(entry.po_basic_rate),
        po_discount_perc: toNum(entry.po_discount_perc),
        po_discount_amt: toNum(entry.po_discount_amt),
        po_rate: toNum(entry.po_rate),
        bill_rate: toNum(entry.bill_rate),
        bill_discount_perc: toNum(entry.bill_discount_perc),
        bill_discount_amt: toNum(entry.bill_discount_amt),
        gross_amount: toNum(entry.gross_amount),
        po_excise_duty_rate: toNum(entry.po_excise_duty_rate),
        loading_unloading_chgs: toNum(entry.loading_unloading_chgs),
        freight_chgs: toNum(entry.freight_chgs),
        others_chgs: toNum(entry.others_chgs),
        po_vat_rate: toNum(entry.po_vat_rate),
        vat_amt: toNum(entry.vat_amt),
        po_lbt_rate: toNum(entry.po_lbt_rate),
        net_amount: toNum(entry.net_amount),
      })),
      form_payload: {
        advance_payment_entries: formData.advance_payment_entries || [],
        payment_vouchers: formData.payment_vouchers || [],
        po_details_all: formData.po_details_all || [],
        grn_remarks_list: formData.grn_remarks_list || [],
        ledger_posting_info: formData.ledger_posting_info || [],
        ledger_present: formData.ledger_present,
        not_a_valid_bill_no: formData.not_a_valid_bill_no,
      },
    });

    await onRefresh?.();
    setViewMode('list');
    setActiveBill(null);
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
          <button
            type="button"
            onClick={() => {
              setActiveBill({
                id: '',
                bill_no: '',
                accounting_date: new Date().toISOString().slice(0, 10),
                bill_no_of_supplier: '',
                bill_date_of_supplier: new Date().toISOString().slice(0, 10),
                project_name: '',
                company_name: 'Pramukh Group',
                supplier_name: '',
                total_tax_code_amount: 0,
                net_amt: 0,
                tax_code_amount_transportation: 0,
                tds_posting_amount: 0,
                total_bill_amount: 0,
                final_bill_amount: 0,
                status: 'draft',
                vendor_name: '',
                po_number: null,
                grn_no: null,
                matching_status: 'unmatched',
              });
              setViewMode('form');
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Create PB
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
