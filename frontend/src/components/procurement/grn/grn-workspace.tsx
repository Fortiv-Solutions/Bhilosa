'use client';

import { useState } from 'react';
import { Truck, ListChecks, Smartphone, ArrowLeft, Plus } from 'lucide-react';
import {
  createFullGoodsReceiptNote,
  updateGrnStatus,
  createAutoDraftPurchaseBillFromGrn,
  type GrnRow as DbGrnRow,
  type PurchaseOrderRow,
  type VendorOption,
} from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { GrnStatsBar, type GrnRow } from './grn-stats-bar';
import { GrnTableView } from './grn-table-view';
import { GrnForm, type FullGrnFormState } from './grn-form';
import { GrnWizard } from './grn-wizard';

const APPROVED_STATUSES = new Set(['posted', 'approved', 'accepted', 'completed']);

// Bridge the flat Supabase GRN row to display format
function toDisplayGrn(g: DbGrnRow): GrnRow {
  const lines = g.goods_receipt_note_lines ?? [];
  const status: GrnRow['status'] = APPROVED_STATUSES.has((g.status || '').toLowerCase())
    ? 'approved'
    : 'site_engineer';
  return {
    id: g.id,
    grn_number: g.grn_number,
    po_number: g.purchase_orders?.po_number || '—',
    gate_entry_no: g.qc_no || (g.grn_number ? `GE-${g.grn_number.slice(-4)}` : 'GE-001'),
    vehicle_no: g.vehicle_no || g.physical_inspection || '—',
    received_date: g.receipt_date ? g.receipt_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    vendor_name: g.vendors?.display_name || g.vendors?.legal_name || '—',
    project_name: (g as any).projects?.name || (g as any).project_name || 'Main Site',
    godown_name: g.godown_name || 'Main Site Store',
    challan_no: g.challan_no || g.quantity_verification || '—',
    status,
    raw_status: g.status,
    raw_lines: lines,
    items_received: lines.length,
    total_val: lines.reduce((sum, l) => sum + (Number(l.accepted_qty) || 0) * (Number(l.unit_rate) || 0), 0),
    uploaded_challan_url: g.uploaded_challan_url || undefined,
    uploaded_invoice_url: g.uploaded_invoice_url || undefined,
  };
}

interface GrnWorkspaceProps {
  grns?: DbGrnRow[];
  activeRole?: Role;
  /** Active suppliers, for the supplier dropdown on the GRN form. */
  vendorOptions?: VendorOption[];
  /** Issued purchase orders a receipt can be linked to. */
  purchaseOrders?: PurchaseOrderRow[];
  onApproveGrn?: (grnId: string) => void;
  /** Raises a purchase bill from a posted GRN. */
  onCreateBill?: (grnId: string) => void;
  onDownloadReport?: (grnId: string) => void;
  onRefresh?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

export function GrnWorkspace({
  grns = [],
  activeRole,
  vendorOptions = [],
  purchaseOrders = [],
  onApproveGrn,
  onCreateBill,
  onDownloadReport,
  onRefresh,
  onError,
}: GrnWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [activeGrn, setActiveGrn] = useState<GrnRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');

  const canApprove = activeRole === 'UPPER_MANAGEMENT' || activeRole === 'PROJECT_MANAGER';
  const displayGrns = grns.map(toDisplayGrn);

  const handleOpenForm = (grn: GrnRow) => {
    setActiveGrn(grn);
    setViewMode('form');
  };

  const handleCreateNewGrn = () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    // The GRN number is allocated by the database on save (a client-side
    // Math.random() suffix used to risk duplicates), so it starts blank.
    const newBlankGrn: GrnRow = {
      id: '',
      grn_number: '',
      po_number: '',
      gate_entry_no: '',
      vehicle_no: '',
      received_date: todayStr,
      vendor_name: '',
      project_name: '',
      godown_name: 'Main Site Store',
      challan_no: '',
      status: 'site_engineer',
      items_received: 0,
      total_val: 0,
    };

    setActiveGrn(newBlankGrn);
    setViewMode('form');
  };

  const handleStatusToggle = (id: string, newStatus: 'site_engineer' | 'approved') => {
    if (newStatus === 'approved') onApproveGrn?.(id);
  };

  /**
   * Saves the GRN form.
   *
   * A GRN must carry the links that make it meaningful — the project (a NOT
   * NULL column the old client-side insert never set, so every create failed),
   * the supplier, and ideally the purchase order it is received against.
   * `Approved` is applied as a separate role-checked transition rather than
   * being written directly, which previously let a receipt be created already
   * posted and skip inspection.
   */
  const handleFormSubmit = async (formData: FullGrnFormState) => {
    const workflowStatus =
      formData.status === 'Draft' ? 'draft' :
      formData.status === 'Pending Verification' ? 'pending_verification' :
      formData.status === 'Pending Approval' ? 'pending_approval' :
      formData.status === 'Approved' ? 'posted' : 'draft';

    const createStatus = formData.status;

    // The PO is identified either by the header's "from POs" reference or by
    // the PO number on the first purchase entry line.
    const poReference = formData.from_pos?.trim() || formData.purchase_entries?.[0]?.po_no?.trim() || '';
    const linkedPo = poReference
      ? purchaseOrders.find((po) => po.po_number === poReference || po.id === poReference)
      : undefined;
    const vendorId =
      vendorOptions.find((v) => (v.display_name || v.legal_name) === formData.supplier_name)?.id ||
      linkedPo?.vendor_id;

    let savedGrnId = activeGrn?.id || '';

    if (!activeGrn?.id && !linkedPo && !vendorId) {
      onError?.('Select the purchase order or the supplier this goods receipt is against.');
      return;
    }

    const res = await createFullGoodsReceiptNote({
      id: activeGrn?.id || undefined,
      grn_number: formData.gr_no || '',
      grn_date: formData.grn_date,
      purchase_order_id: linkedPo?.id,
      vendor_id: vendorId,
      project_id: linkedPo?.project_id,
      challan_no: formData.challan_no,
      vehicle_no: formData.vehicle_no,
      supplier_name: formData.supplier_name,
      godown_name: formData.godown_name,
      transporter_name: formData.transporter_name,
      dealer_name: formData.dealer_name,
      qc_no: formData.qc_no,
      in_weight: formData.in_wt1 ? String(formData.in_wt1) : undefined,
      out_weight: formData.out_wt1 ? String(formData.out_wt1) : undefined,
      net_weight: formData.net_weight1 ? String(formData.net_weight1) : undefined,
      volume_in_brass: formData.volume_in_brass ? String(formData.volume_in_brass) : undefined,
      asset_item: formData.asset_item,
      asset_amount: formData.asset_amount,
      remarks: formData.remarks,
      status: createStatus,
      uploaded_invoice_url: formData.uploaded_invoice_url,
      uploaded_invoice_path: formData.uploaded_invoice_path,
      uploaded_invoice_name: formData.uploaded_invoice_name,
      /* The challan triplet was missing here, so the file reached storage and
         the reference was dropped on save — the GRN came back with no challan
         attached and no error anywhere. save_goods_receipt_note has always
         accepted these three keys. */
      uploaded_challan_url: formData.uploaded_challan_url,
      uploaded_challan_path: formData.uploaded_challan_path,
      uploaded_challan_name: formData.uploaded_challan_name,
      lines: (formData.purchase_entries || [])
        .filter((entry) => (Number(entry.received_qty) || 0) > 0)
        .map((entry) => {
          const received = Number(entry.received_qty) || 0;
          const returned = Number(entry.return_qty) || 0;
          const poLine = linkedPo?.purchase_order_lines?.find(
            (l) => l.id === (entry as any).purchase_order_line_id || l.item_description === entry.item_description,
          );
          return {
            item_id: (entry as any).item_id || poLine?.item_id || null,
            purchase_order_line_id: (entry as any).purchase_order_line_id || poLine?.id || null,
            received_qty: received,
            rejected_qty: returned,
            accepted_qty: Math.max(received - returned, 0),
            unit_rate: Number((entry as any).unit_rate || poLine?.unit_rate || 0),
            remarks: entry.test_report_no || undefined,
            po_number: entry.po_no || linkedPo?.po_number || null,
            pr_number: entry.pr_no || null,
            item_group: entry.item_group || null,
            item_code: entry.item_code || null,
            item_brand: entry.item_brand || null,
            item_description: entry.item_description || null,
            /* Fall back to the PO line: a receipt whose entries were restored
               from a saved draft carries the description but not always the
               lineage, and the PO line is the authority for both. */
            item_specification:
              entry.item_specification
              || poLine?.item_specification
              // PO lines carry the spec under either name; the insert accepts both.
              || poLine?.specification
              || null,
            activity_name: entry.activity_name || poLine?.activity_name || null,
            sub_activity_name: entry.sub_activity_name || poLine?.sub_activity_name || null,
            location: entry.location || null,
            purchase_category: entry.purchase_category || null,
            unit: entry.unit || null,
            approved_qty: Number(entry.approved_qty || 0),
            po_balance_qty: Number(entry.as_on_date_po_balance_qty || 0),
            return_qty: returned,
            challan_qty: Number(entry.challan_qty || received),
            balance_allowed: entry.balance_quantity_allowed ? 1 : 0,
            current_balance_qty: Number(entry.current_balance_qty || 0),
            test_report_no: entry.test_report_no || null,
            expiry_date: entry.expiry_date || null,
          };
        }),
    });

    if (res.error) {
      onError?.(`Could not save the goods receipt note: ${res.error.message}`);
      return;
    }
    if (res.data?.id) savedGrnId = res.data.id;

    if ((formData as any).auto_create_pb && savedGrnId) {
      const pbRes = await createAutoDraftPurchaseBillFromGrn(savedGrnId);
      if (pbRes.error) {
        console.warn('Auto draft Purchase Bill creation notice:', pbRes.error.message);
      }
    }

    setViewMode('list');
    setActiveGrn(null);
    void onRefresh?.();
  };

  const filteredGrns = displayGrns.filter((g) => {
    if (selectedTab === 'site_engineer') return g.status === 'site_engineer';
    if (selectedTab === 'approved') return g.status === 'approved';
    return true;
  });

  const activeGrnTitle = activeGrn?.grn_number ? `Editing ${activeGrn.grn_number}` : 'New GRN Creation';

  return (
    <div className="space-y-4">
      {/* Workspace Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs">
          <Truck className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground font-heading">Goods Receipt Note (GRN) Workspace</span>
          <span className="text-muted-foreground font-mono text-[11px]">
            • Mode: {viewMode === 'form' ? activeGrnTitle : `All Records (${displayGrns.length})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setViewMode('list');
              setActiveGrn(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> View All GRN Records ({displayGrns.length})
          </button>

          <button
            onClick={handleCreateNewGrn}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'form' && !activeGrn?.id
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <Plus className="h-3.5 w-3.5" /> New GRN Form
          </button>
        </div>
      </div>

      {viewMode === 'form' && activeGrn ? (
        <div className="space-y-4">
          {activeGrn.id && (
            <div className="flex items-center justify-between rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 text-xs text-blue-900 dark:text-blue-200">
              <div className="flex items-center gap-2.5 font-semibold">
                <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>
                  📱 <strong>Site Submission:</strong> GRN{' '}
                  <strong className="text-foreground">{activeGrn.grn_number}</strong> received against PO{' '}
                  <strong className="text-foreground">{activeGrn.po_number || 'Direct Receipt'}</strong>.
                </span>
              </div>

              <button
                onClick={() => {
                  setViewMode('list');
                  setActiveGrn(null);
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Records Overview
              </button>
            </div>
          )}

          <GrnForm
            grn={activeGrn}
            canApprove={canApprove}
            vendorOptions={vendorOptions}
            onPrint={() => {
              if (onDownloadReport && activeGrn.id) {
                onDownloadReport(activeGrn.id);
              } else {
                window.print();
              }
            }}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setViewMode('list');
              setActiveGrn(null);
            }}
          />
        </div>
      ) : (
        <>
          {/* Operational Reminders Banner */}
          <GrnStatsBar
            grns={displayGrns}
            onSelectTab={(tab) => setSelectedTab(tab)}
          />

          {/* GRN Table View */}
          <GrnTableView
            grns={filteredGrns}
            onOpenGrnForm={handleOpenForm}
            onStatusToggle={canApprove ? handleStatusToggle : undefined}
            onDownloadReport={onDownloadReport}
          />
        </>
      )}
    </div>
  );
}
