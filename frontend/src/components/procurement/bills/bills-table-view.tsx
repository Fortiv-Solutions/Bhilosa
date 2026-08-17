'use client';

import {
  CreditCard,
  Building2,
  CheckCircle2,
  Clock,
  Edit3,
  FileCheck2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import type { VendorBillRow } from './bills-stats-bar';

interface BillsTableViewProps {
  bills: VendorBillRow[];
  onOpenBillForm: (bill: VendorBillRow) => void;
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '₹0';
  return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function BillsTableView({ bills, onOpenBillForm }: BillsTableViewProps) {
  if (bills.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-xs">
        <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-semibold text-muted-foreground font-heading">
          No Vendor Purchase Bills Found
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70 font-medium">
          Create a Purchase Bill (PB) from an approved Goods Receipt Note (GRN) to manage 3-way matching and payment clearance.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      {/* 15 Landing Table Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap font-sans">
            <thead>
              <tr className="border-b border-border bg-muted/60 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3.5 text-center w-10">Sr</th>
                <th className="px-3.5 py-3.5 font-bold text-primary">Bill No.</th>
                <th className="px-3.5 py-3.5">Accounting Date</th>
                <th className="px-3.5 py-3.5 font-mono">Bill No. of Supplier</th>
                <th className="px-3.5 py-3.5 font-mono">Bill Date of Supplier</th>
                <th className="px-3.5 py-3.5">Project Name</th>
                <th className="px-3.5 py-3.5">Name of Company</th>
                <th className="px-3.5 py-3.5">Supplier Name</th>
                <th className="px-3.5 py-3.5 text-right">Total Tax Code Amount</th>
                <th className="px-3.5 py-3.5 text-right font-bold text-foreground">Net Amt</th>
                <th className="px-3.5 py-3.5 text-right">Tax Code Amt (Transportation)</th>
                <th className="px-3.5 py-3.5 text-right font-mono">TDS Posting Amount</th>
                <th className="px-3.5 py-3.5 text-right font-mono font-bold">Total Bill Amount</th>
                <th className="px-3.5 py-3.5 text-right font-mono font-extrabold text-primary">Final Bill Amount</th>
                <th className="px-3.5 py-3.5 text-center">Status</th>
                <th className="px-3.5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {bills.map((bill, index) => {
                const isApproved = bill.status === 'approved';
                const isDraft = bill.status === 'draft' || bill.status === 'auto_draft_grn';

                return (
                  <tr key={bill.id} className="group hover:bg-muted/30 transition-colors align-top">
                    {/* 1. Sr */}
                    <td className="px-3 py-4 text-center font-mono font-bold text-muted-foreground">
                      {index + 1}
                    </td>

                    {/* 2. Bill No. */}
                    <td className="px-3.5 py-4">
                      <span className="font-mono font-extrabold text-primary text-xs">
                        {bill.bill_no}
                      </span>
                    </td>

                    {/* 3. Accounting Date */}
                    <td className="px-3.5 py-4">
                      <span className="font-semibold text-foreground text-xs">
                        {bill.accounting_date}
                      </span>
                    </td>

                    {/* 4. Bill No. of Supplier */}
                    <td className="px-3.5 py-4 font-mono font-bold text-foreground">
                      {bill.bill_no_of_supplier}
                    </td>

                    {/* 5. Bill Date of Supplier */}
                    <td className="px-3.5 py-4 font-mono text-muted-foreground">
                      {bill.bill_date_of_supplier}
                    </td>

                    {/* 6. Project Name */}
                    <td className="px-3.5 py-4 font-bold text-foreground text-xs">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground/70" />
                        {bill.project_name || 'Silvassa Unit I'}
                      </span>
                    </td>

                    {/* 7. Name of Company */}
                    <td className="px-3.5 py-4 font-semibold text-muted-foreground text-xs">
                      {bill.company_name || 'Bhilosa Industries Private Limited'}
                    </td>

                    {/* 8. Supplier Name */}
                    <td className="px-3.5 py-4 font-bold text-foreground text-xs truncate max-w-[200px]">
                      {bill.supplier_name || 'Reliance Polyester Raw Materials Ltd'}
                    </td>

                    {/* 9. Total Tax Code Amount */}
                    <td className="px-3.5 py-4 text-right font-mono text-muted-foreground">
                      {formatCurrency(bill.total_tax_code_amount)}
                    </td>

                    {/* 10. Net Amt */}
                    <td className="px-3.5 py-4 text-right font-mono font-extrabold text-foreground">
                      {formatCurrency(bill.net_amt)}
                    </td>

                    {/* 11. Tax Code Amount for Tax on Transportation */}
                    <td className="px-3.5 py-4 text-right font-mono text-muted-foreground">
                      {formatCurrency(bill.tax_code_amount_transportation)}
                    </td>

                    {/* 12. TDS Posting Amount */}
                    <td className="px-3.5 py-4 text-right font-mono font-bold text-amber-600">
                      {formatCurrency(bill.tds_posting_amount)}
                    </td>

                    {/* 13. Total Bill Amount */}
                    <td className="px-3.5 py-4 text-right font-mono font-bold text-foreground">
                      {formatCurrency(bill.total_bill_amount)}
                    </td>

                    {/* 14. Final Bill Amount */}
                    <td className="px-3.5 py-4 text-right font-mono font-extrabold text-primary text-xs">
                      {formatCurrency(bill.final_bill_amount)}
                    </td>

                    {/* 15. Status */}
                    <td className="px-3.5 py-4 text-center">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                        </span>
                      ) : isDraft ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/15 px-2.5 py-1 text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                          <Clock className="h-3.5 w-3.5" /> Draft
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-300">
                          <Clock className="h-3.5 w-3.5" /> Issue
                        </span>
                      )}
                    </td>

                    {/* Actions Column */}
                    <td className="px-3.5 py-4 text-right">
                      <button
                        onClick={() => onOpenBillForm(bill)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background min-w-[65px] px-3 pr-6 py-1.5 text-xs font-bold text-foreground hover:bg-primary hover:text-primary-foreground transition-all shadow-2xs cursor-pointer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Form</span>
                      </button>
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
