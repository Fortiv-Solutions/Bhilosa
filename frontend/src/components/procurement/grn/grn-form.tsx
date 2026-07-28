'use client';

import React, { useState } from 'react';
import {
  Truck,
  Building2,
  Calendar,
  Send,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Layers,
  X,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  Scale,
  Edit3,
  Printer,
} from 'lucide-react';
import type { GrnRow } from './grn-stats-bar';

export interface GrnPurchaseEntry {
  po_no: string;
  item_group: string;
  item_description: string;
  item_code: string;
  item_brand: string;
  location: string;
  unit: string;
  purchase_category: string;
  open: boolean;
  approved_qty: number;
  as_on_date_po_balance_qty: number;
  return_qty: number;
  challan_qty: number;
  received_qty: number;
  balance_quantity_allowed: boolean;
  pr_no: string;
  test_report_no: string;
  expiry_date: string;
  current_balance_qty: number;
}

export interface GrnExtraItem {
  sr: number;
  po_no: string;
  item_group: string;
  item_desc: string;
  item_brand: string;
  purchase_category: string;
  quantity: number;
  grn_stock_unit: string;
  loading_unloading_chgs: number;
  test_report_no: string;
}

export interface GrnPoRemark {
  sr: number;
  po_no: string;
  remarks: string;
}

export interface FullGrnFormState {
  // Header Fields (in exact order)
  qc_no: string;
  gr_no: string;
  grn_date: string;
  project_name: string;
  company_name: string;
  supplier_name: string;
  phone_no: string;
  mobile_no: string;
  godown_name: string;
  dealer_name: string;
  challan_no: string;
  transporter_name: string;
  vehicle_measure_required: boolean;
  vehicle_no: string;
  length_in_inches: number;
  breadth_in_inches: number;
  height_in_inches: number;
  volume_in_brass: number;
  weight_required: boolean;
  name_of_weight: string;
  in_wt1: number;
  out_wt1: number;
  net_weight1: number;
  name_of_weight2: string;
  in_wt2: number;
  out_wt2: number;
  net_weight2: number;
  avg_weight: number;
  grn_weight: number;
  weight_difference: number;
  allow_wt_difference: number;
  net_wt_difference: number;
  from_pos: string;

  // Tables
  purchase_entries: GrnPurchaseEntry[];
  extra_items: GrnExtraItem[];

  // Post-Table Fields
  total_extra_items_received: number;
  remarks: string;
  account_posting_material_amount: number;
  asset_amount: number;
  asset_item: string;

  // PO Remarks Table
  po_remarks_list: GrnPoRemark[];

  // Footer Fields
  pb_lines_created: number;
  unlocked_fy: number;
  status: 'Approve' | 'Pending QC' | 'Stored' | 'Rejected';
}

interface GrnFormProps {
  grn: GrnRow;
  onSubmit: (formData: FullGrnFormState) => void;
  /** Generates the report-format Goods Received Note PDF and opens it in a new tab. */
  onPrint?: () => void;
  onCancel: () => void;
}

export function GrnForm({ grn, onSubmit, onPrint, onCancel }: GrnFormProps) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<FullGrnFormState>(() => ({
    qc_no: 'QC-2026-0881',
    gr_no: grn.grn_number || 'TI/PRGRN202600025',
    grn_date: grn.received_date || '20/07/2026 15:13',
    project_name: grn.project_name || 'Pramukh Revanta',
    company_name: 'TANVI INFRACON PROJECT REVANTA',
    supplier_name: grn.vendor_name || 'MODERN ENGINEERING CO.',
    phone_no: '',
    mobile_no: '9825297970',
    godown_name: 'Revanta C.O.P Store',
    dealer_name: '',
    challan_no: '159',
    transporter_name: '',
    vehicle_measure_required: false,
    vehicle_no: grn.vehicle_no || 'GJ-05-BX-4421',
    length_in_inches: 0.0,
    breadth_in_inches: 0.0,
    height_in_inches: 0.0,
    volume_in_brass: 0.0,
    weight_required: false,
    name_of_weight: 'Bridge Scale 1',
    in_wt1: 0.0,
    out_wt1: 0.0,
    net_weight1: 0.0,
    name_of_weight2: '',
    in_wt2: 0.0,
    out_wt2: 0.0,
    net_weight2: 0.0,
    avg_weight: 0.0,
    grn_weight: 242.0,
    weight_difference: -242.0,
    allow_wt_difference: 0.05,
    net_wt_difference: -241.95,
    from_pos: grn.po_number || 'TI/PR/PO/2026/0021',

    // Purchase Entries Table (19 Columns)
    purchase_entries: [
      {
        po_no: 'TI/PR/PO/2026/0021',
        item_group: 'Pumps & Plumbing',
        item_description: 'Hydropneumatics Pump Connection Line Assembly',
        item_code: 'ITM-PUMP-99',
        item_brand: 'Modern Eng',
        location: 'Revanta C.O.P Store',
        unit: 'NOS',
        purchase_category: 'Direct Construction Material',
        open: true,
        approved_qty: 12,
        as_on_date_po_balance_qty: 12,
        return_qty: 0,
        challan_qty: 12,
        received_qty: 12,
        balance_quantity_allowed: true,
        pr_no: 'TI/PR/PR/2026/0045',
        test_report_no: 'TR-ME-2026-09',
        expiry_date: '—',
        current_balance_qty: 12,
      },
    ],

    // Extra Item Received Table (10 Columns)
    extra_items: [],

    // Post-Table Fields
    total_extra_items_received: 0.0,
    remarks: 'MATERIAL USE FOR HYDROPNEUMATICS PUMP EXTRA CONNECTION LINE, ORDER BY TEJAS JASANI, AT PRAMUKH REVANTA, SURAT',
    account_posting_material_amount: 72250.0,
    asset_amount: 0.0,
    asset_item: '',

    // PO Remarks Table
    po_remarks_list: [
      {
        sr: 1,
        po_no: 'TI/PR/PO/2026/0021',
        remarks: 'MATERIAL USE FOR HYDROPNEUMATICS PUMP EXTRA CONNECTION LINE, ORDER BY TEJAS JASANI, AT PRAMUKH REVANTA, SURAT',
      },
    ],

    // Footer Fields
    pb_lines_created: 12.0,
    unlocked_fy: 1.0,
    status: 'Approve',
  }));

  const [newPoRemark, setNewPoRemark] = useState({ po_no: '', remarks: '' });

  const updateHeader = <K extends keyof FullGrnFormState>(key: K, value: FullGrnFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePurchaseEntryChange = (index: number, field: keyof GrnPurchaseEntry, value: any) => {
    setForm((prev) => {
      const updated = [...prev.purchase_entries];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, purchase_entries: updated };
    });
  };

  const handleAddPoRemark = () => {
    if (!newPoRemark.remarks.trim()) return;
    setForm((prev) => ({
      ...prev,
      po_remarks_list: [
        ...prev.po_remarks_list,
        {
          sr: prev.po_remarks_list.length + 1,
          po_no: newPoRemark.po_no || form.from_pos,
          remarks: newPoRemark.remarks.trim(),
        },
      ],
    }));
    setNewPoRemark({ po_no: '', remarks: '' });
  };

  const handleRemovePoRemark = (sr: number) => {
    setForm((prev) => ({
      ...prev,
      po_remarks_list: prev.po_remarks_list.filter((r) => r.sr !== sr),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-6 space-y-6">
      {/* Header Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold text-foreground">
              Goods Receipt Note (GRN) Entry Form
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Site Material Receipt, Vehicle Weighbridge Measurement &amp; QC Audit Log
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              title="Generate the Goods Received Note report PDF"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
            >
              <Printer className="h-3.5 w-3.5 text-primary" /> Print Report
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* ========================================================================= */}
        {/* SECTION 1: HEADER FIELDS (Exact Field Order as Specified)                 */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border/50 pb-2">
            1. Goods Receipt &amp; Vehicle Weighbridge Logistics Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. QC No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">QC No.</label>
              <input
                type="text"
                value={form.qc_no}
                onChange={(e) => updateHeader('qc_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 2. GR No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GR No.</label>
              <input
                type="text"
                value={form.gr_no}
                onChange={(e) => updateHeader('gr_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-extrabold text-foreground"
              />
            </div>

            {/* 3. GRN Date* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">GRN Date*</label>
              <input
                type="text"
                value={form.grn_date}
                onChange={(e) => updateHeader('grn_date', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-semibold text-foreground"
                required
              />
            </div>

            {/* 4. Project Name* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Project Name*</label>
              <input
                type="text"
                value={form.project_name}
                onChange={(e) => updateHeader('project_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 5. Name of Company */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Company</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => updateHeader('company_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 6. Supplier Name* */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Supplier Name*</label>
              <input
                type="text"
                value={form.supplier_name}
                onChange={(e) => updateHeader('supplier_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-extrabold text-foreground"
                required
              />
            </div>

            {/* 7. Phone No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Phone No.</label>
              <input
                type="text"
                value={form.phone_no}
                onChange={(e) => updateHeader('phone_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 8. Mobile No. */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Mobile No.</label>
              <input
                type="text"
                value={form.mobile_no}
                onChange={(e) => updateHeader('mobile_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 9. Godown Name* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Godown Name*</label>
              <input
                type="text"
                value={form.godown_name}
                onChange={(e) => updateHeader('godown_name', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-bold text-foreground"
                required
              />
            </div>

            {/* 10. Dealer Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Dealer Name</label>
              <input
                type="text"
                value={form.dealer_name}
                onChange={(e) => updateHeader('dealer_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 11. Challan No.* */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Challan No.*</label>
              <input
                type="text"
                value={form.challan_no}
                onChange={(e) => updateHeader('challan_no', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-foreground"
                required
              />
            </div>

            {/* 12. Transporter Name */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Transporter Name</label>
              <input
                type="text"
                value={form.transporter_name}
                onChange={(e) => updateHeader('transporter_name', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 13. Vehicle Measure Required */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="vehicle_measure_required"
                checked={form.vehicle_measure_required}
                onChange={(e) => updateHeader('vehicle_measure_required', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="vehicle_measure_required" className="font-bold text-foreground text-xs cursor-pointer">
                Vehicle Measure Required
              </label>
            </div>

            {/* 14. Vehicle No */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Vehicle No</label>
              <input
                type="text"
                value={form.vehicle_no}
                onChange={(e) => updateHeader('vehicle_no', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-bold text-foreground"
              />
            </div>

            {/* 15. Length In Inches */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Length In Inches</label>
              <input
                type="number"
                step="0.01"
                value={form.length_in_inches}
                onChange={(e) => updateHeader('length_in_inches', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 16. Breadth In Inches */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Breadth In Inches</label>
              <input
                type="number"
                step="0.01"
                value={form.breadth_in_inches}
                onChange={(e) => updateHeader('breadth_in_inches', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 17. Height In Inches */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Height In Inches</label>
              <input
                type="number"
                step="0.01"
                value={form.height_in_inches}
                onChange={(e) => updateHeader('height_in_inches', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 18. Volume In Brass */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Volume In Brass</label>
              <input
                type="number"
                step="0.01"
                value={form.volume_in_brass}
                onChange={(e) => updateHeader('volume_in_brass', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 19. Weight Required */}
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="weight_required"
                checked={form.weight_required}
                onChange={(e) => updateHeader('weight_required', e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="weight_required" className="font-bold text-foreground text-xs cursor-pointer">
                Weight Required
              </label>
            </div>

            {/* 20. Name of Weight */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Weight</label>
              <input
                type="text"
                value={form.name_of_weight}
                onChange={(e) => updateHeader('name_of_weight', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-semibold text-foreground"
              />
            </div>

            {/* 21. In Wt1 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">In Wt1</label>
              <input
                type="number"
                step="0.01"
                value={form.in_wt1}
                onChange={(e) => updateHeader('in_wt1', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 22. Out Wt1 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Out Wt1</label>
              <input
                type="number"
                step="0.01"
                value={form.out_wt1}
                onChange={(e) => updateHeader('out_wt1', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 23. Net Weight1 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Weight1</label>
              <input
                type="number"
                step="0.01"
                value={form.net_weight1}
                onChange={(e) => updateHeader('net_weight1', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 24. Name of Weight2 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Name of Weight2</label>
              <input
                type="text"
                value={form.name_of_weight2}
                onChange={(e) => updateHeader('name_of_weight2', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* 25. In Wt2 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">In Wt2</label>
              <input
                type="number"
                step="0.01"
                value={form.in_wt2}
                onChange={(e) => updateHeader('in_wt2', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 26. Out Wt2 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Out Wt2</label>
              <input
                type="number"
                step="0.01"
                value={form.out_wt2}
                onChange={(e) => updateHeader('out_wt2', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 27. Net Weight2 */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Weight2</label>
              <input
                type="number"
                step="0.01"
                value={form.net_weight2}
                onChange={(e) => updateHeader('net_weight2', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 28. Avg Weight */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Avg Weight</label>
              <input
                type="number"
                step="0.01"
                value={form.avg_weight}
                onChange={(e) => updateHeader('avg_weight', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 29. GRN Weight */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">GRN Weight</label>
              <input
                type="number"
                step="0.01"
                value={form.grn_weight}
                onChange={(e) => updateHeader('grn_weight', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-extrabold text-foreground"
              />
            </div>

            {/* 30. Weight Difference */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Weight Difference</label>
              <input
                type="number"
                step="0.01"
                value={form.weight_difference}
                onChange={(e) => updateHeader('weight_difference', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-red-600"
              />
            </div>

            {/* 31. Allow Wt Difference */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Allow Wt Difference</label>
              <input
                type="number"
                step="0.01"
                value={form.allow_wt_difference}
                onChange={(e) => updateHeader('allow_wt_difference', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* 32. Net Wt Difference */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Net Wt Difference</label>
              <input
                type="number"
                step="0.01"
                value={form.net_wt_difference}
                onChange={(e) => updateHeader('net_wt_difference', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-red-600"
              />
            </div>

            {/* 33. From P.O.s */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">From P.O.s</label>
              <input
                type="text"
                value={form.from_pos}
                onChange={(e) => updateHeader('from_pos', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: PURCHASE ENTRIES TABLE (19 Columns)                            */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              2. Purchase Entries Table ({form.purchase_entries.length})
            </h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Quantity Verification &amp; Expiry Audit
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-3 font-bold text-primary min-w-[140px]">1. PO No.*</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[140px]">2. Item Group*</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[200px]">3. Item Description*</th>
                  <th className="px-3 py-3 min-w-[110px]">4. Item Code</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[130px]">5. Item Brand*</th>
                  <th className="px-3 py-3 min-w-[140px]">6. Location</th>
                  <th className="px-3 py-3 font-bold text-primary text-center min-w-[80px]">7. Unit*</th>
                  <th className="px-3 py-3 min-w-[140px]">8. Purchase Category</th>
                  <th className="px-3 py-3 text-center min-w-[70px]">9. Open</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">10. Approved Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[150px]">11. As on Date PO Balance Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">12. Return Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[100px]">13. Challan Qty.</th>
                  <th className="px-3 py-3 text-right min-w-[110px]">14. Received Qty.</th>
                  <th className="px-3 py-3 text-center min-w-[140px]">15. Balance Quantity Allowed</th>
                  <th className="px-3 py-3 font-bold text-primary min-w-[120px]">16. P.RNo*</th>
                  <th className="px-3 py-3 min-w-[120px]">17. Test Report No</th>
                  <th className="px-3 py-3 min-w-[100px]">18. Expiry Date</th>
                  <th className="px-3 py-3 text-right min-w-[130px]">19. Current Balance Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {form.purchase_entries.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                    {/* 1. PO No.* */}
                    <td className="px-3 py-2 font-sans font-bold text-primary">{item.po_no}</td>
                    {/* 2. Item Group* */}
                    <td className="px-3 py-2 font-sans font-semibold text-foreground">{item.item_group}</td>
                    {/* 3. Item Description* */}
                    <td className="px-3 py-2 font-sans font-bold text-foreground">{item.item_description}</td>
                    {/* 4. Item Code */}
                    <td className="px-3 py-2 text-muted-foreground">{item.item_code}</td>
                    {/* 5. Item Brand* */}
                    <td className="px-3 py-2 font-sans font-bold text-foreground">{item.item_brand}</td>
                    {/* 6. Location */}
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.location}</td>
                    {/* 7. Unit* */}
                    <td className="px-3 py-2 text-center font-sans font-bold text-muted-foreground">{item.unit}</td>
                    {/* 8. Purchase Category */}
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.purchase_category}</td>
                    {/* 9. Open */}
                    <td className="px-3 py-2 text-center">{item.open ? 'Yes' : 'No'}</td>
                    {/* 10. Approved Qty. */}
                    <td className="px-3 py-2 text-right font-extrabold text-foreground">{item.approved_qty}</td>
                    {/* 11. As on Date PO Balance Qty. */}
                    <td className="px-3 py-2 text-right font-bold text-muted-foreground">{item.as_on_date_po_balance_qty}</td>
                    {/* 12. Return Qty. */}
                    <td className="px-3 py-2 text-right text-red-600 font-bold">{item.return_qty}</td>
                    {/* 13. Challan Qty. */}
                    <td className="px-3 py-2 text-right font-extrabold text-primary">{item.challan_qty}</td>
                    {/* 14. Received Qty. */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        value={item.received_qty}
                        onChange={(e) => handlePurchaseEntryChange(idx, 'received_qty', Number(e.target.value))}
                        className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right font-extrabold text-foreground"
                      />
                    </td>
                    {/* 15. Balance Quantity Allowed */}
                    <td className="px-3 py-2 text-center">{item.balance_quantity_allowed ? 'Allowed' : 'No'}</td>
                    {/* 16. P.RNo* */}
                    <td className="px-3 py-2 font-sans font-bold text-primary">{item.pr_no}</td>
                    {/* 17. Test Report No */}
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.test_report_no}</td>
                    {/* 18. Expiry Date */}
                    <td className="px-3 py-2 font-sans text-muted-foreground">{item.expiry_date}</td>
                    {/* 19. Current Balance Qty */}
                    <td className="px-3 py-2 text-right font-bold text-foreground">{item.current_balance_qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: EXTRA ITEM RECEIVED TABLE (10 Columns)                        */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              3. Extra Item Received Table ({form.extra_items.length})
            </h3>
            <span className="text-[11px] font-semibold text-muted-foreground">
              Unscheduled / Bonus Material Items
            </span>
          </div>

          {form.extra_items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No extra un-ordered items received in this shipment.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-3 text-center">1. Sr</th>
                    <th className="px-3 py-3">2. P.O. No</th>
                    <th className="px-3 py-3">3. Item Group</th>
                    <th className="px-3 py-3 min-w-[180px]">4. Item Desc</th>
                    <th className="px-3 py-3">5. Item Brand</th>
                    <th className="px-3 py-3">6. Purchase Category</th>
                    <th className="px-3 py-3 text-right">7. Quantity</th>
                    <th className="px-3 py-3 text-center">8. GRN Stock Unit</th>
                    <th className="px-3 py-3 text-right">9. Loading / Unloading Chgs</th>
                    <th className="px-3 py-3">10. Test Report No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.extra_items.map((ex) => (
                    <tr key={ex.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2 text-center font-bold text-muted-foreground">{ex.sr}</td>
                      <td className="px-3 py-2 font-sans font-bold text-primary">{ex.po_no}</td>
                      <td className="px-3 py-2 font-sans font-semibold text-foreground">{ex.item_group}</td>
                      <td className="px-3 py-2 font-sans font-bold text-foreground">{ex.item_desc}</td>
                      <td className="px-3 py-2 font-sans font-bold text-foreground">{ex.item_brand}</td>
                      <td className="px-3 py-2 font-sans text-muted-foreground">{ex.purchase_category}</td>
                      <td className="px-3 py-2 text-right font-extrabold text-foreground">{ex.quantity}</td>
                      <td className="px-3 py-2 text-center font-sans font-bold text-muted-foreground">{ex.grn_stock_unit}</td>
                      <td className="px-3 py-2 text-right">₹{ex.loading_unloading_chgs}</td>
                      <td className="px-3 py-2 font-sans text-muted-foreground">{ex.test_report_no}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: POST-TABLE FIELDS & PO REMARKS TABLE                           */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            4. Post-Receipt Accounting &amp; PO Remarks Summary (Total {form.po_remarks_list.length})
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Extra Items Received */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Total Extra Items Received</label>
              <input
                type="number"
                step="0.01"
                value={form.total_extra_items_received}
                onChange={(e) => updateHeader('total_extra_items_received', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Account Posting Material Amount */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Account Posting Material Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.account_posting_material_amount}
                onChange={(e) => updateHeader('account_posting_material_amount', Number(e.target.value))}
                className="w-full rounded-lg border-2 border-primary/50 bg-background px-3 py-2 font-mono font-extrabold text-primary text-base"
              />
            </div>

            {/* Asset Amount */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Asset Amount</label>
              <input
                type="number"
                step="0.01"
                value={form.asset_amount}
                onChange={(e) => updateHeader('asset_amount', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Asset Item */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Asset Item</label>
              <input
                type="text"
                value={form.asset_item}
                onChange={(e) => updateHeader('asset_item', e.target.value)}
                placeholder="Asset Tag (If applicable)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground"
              />
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">Remarks</label>
              <textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => updateHeader('remarks', e.target.value)}
                className="w-full rounded-lg border-2 border-primary/50 bg-background p-2.5 font-medium text-foreground"
                required
              />
            </div>
          </div>

          {/* PO Remarks Table (Add or edit options only) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h4 className="font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                PO Remarks Summary (Total {form.po_remarks_list.length})
              </h4>
              <span className="text-[11px] font-semibold text-muted-foreground">
                Add or Edit Options Only
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border shadow-2xs">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/60 font-heading text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-12">Sr</th>
                    <th className="px-3 py-2.5 min-w-[150px]">PO No.</th>
                    <th className="px-3 py-2.5 min-w-[300px]">Remarks</th>
                    <th className="px-3 py-2.5 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {form.po_remarks_list.map((rem) => (
                    <tr key={rem.sr} className="hover:bg-muted/30 transition-colors align-middle font-mono">
                      <td className="px-3 py-2 text-center font-bold text-muted-foreground">{rem.sr}</td>
                      <td className="px-3 py-2 font-sans font-bold text-primary">{rem.po_no}</td>
                      <td className="px-3 py-2 font-sans font-medium text-foreground truncate max-w-[400px]">{rem.remarks}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemovePoRemark(rem.sr)}
                          className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                          title="Remove Remark"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add PO Remark Control */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                placeholder="PO No (e.g. TI/PR/PO/2026/0021)"
                value={newPoRemark.po_no}
                onChange={(e) => setNewPoRemark((prev) => ({ ...prev, po_no: e.target.value }))}
                className="w-48 rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground text-xs"
              />
              <input
                type="text"
                placeholder="Enter PO remark detail..."
                value={newPoRemark.remarks}
                onChange={(e) => setNewPoRemark((prev) => ({ ...prev, remarks: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground text-xs"
              />
              <button
                type="button"
                onClick={handleAddPoRemark}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shrink-0"
              >
                <Plus className="h-3.5 w-3.5" /> Add Remark
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 5: FOOTER FORM TABULAR FIELDS                                     */}
        {/* ========================================================================= */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
            5. Final GRN Status &amp; FY Release Parameters
          </h3>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* PB Lines Created */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">PB Lines Created</label>
              <input
                type="number"
                step="0.01"
                value={form.pb_lines_created}
                onChange={(e) => updateHeader('pb_lines_created', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Unlocked FY */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-muted-foreground mb-1">Unlocked FY</label>
              <input
                type="number"
                step="0.01"
                value={form.unlocked_fy}
                onChange={(e) => updateHeader('unlocked_fy', Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono font-bold text-foreground"
              />
            </div>

            {/* Status */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-primary mb-1">GRN Status</label>
              <select
                value={form.status}
                onChange={(e) => updateHeader('status', e.target.value as any)}
                className="w-full rounded-lg border-2 border-primary bg-background px-3 py-2 font-extrabold text-foreground text-xs"
              >
                <option value="Approve">Approve (QC Passed &amp; Inventory Posted)</option>
                <option value="Pending QC">Pending QC Inspection</option>
                <option value="Stored">Stored in Site Warehouse</option>
                <option value="Rejected">Material Batch Rejected</option>
              </select>
            </div>
          </div>
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div className="text-xs font-bold text-muted-foreground">
            Posting Material Amount: <span className="font-mono text-sm text-primary font-extrabold">₹{form.account_posting_material_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border bg-background px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-md transition-all"
            >
              <ShieldCheck className="h-4 w-4" /> Save GRN Entry &amp; Approve Status
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
