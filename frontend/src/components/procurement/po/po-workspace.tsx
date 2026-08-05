'use client';

import { useState, useEffect } from 'react';
import { ShoppingBag, ListChecks, Plus, Building2 } from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { PoStatsBar } from './po-stats-bar';
import { type VendorOption, listProcurementProjects, type ProcurementProjectOption } from '@/lib/procurement';
import { PoTableView } from './po-table-view';
import { PoForm, type FullPoFormState } from './po-form';
import { POPdfPreviewModal } from './po-pdf-preview-modal';
import { poStatusGroup, poStatusLabel, type PoStatus } from '@/lib/erp/purchase-order/status';
import { PoRejectModal } from './po-reject-modal';

interface POWorkspaceProps {
  purchaseOrders?: PurchaseOrderRow[];
  /**
   * Live purchase orders matching the project filter, counted in the database.
   * `purchaseOrders` is capped at PROCUREMENT_PAGE_SIZE, so this is the only way
   * to know the list is a subset — otherwise the cap is invisible.
   */
  totalCount?: number;
  activeRole?: Role;
  /** Active suppliers, for the vendor dropdown on the PO form. */
  vendorOptions?: VendorOption[];
  /** Persists the order. Must resolve false when the save was rejected. */
  onSavePo?: (poData: FullPoFormState) => Promise<unknown>;
  onApprove?: (po: PurchaseOrderRow) => void;
  /** Applies a guarded workflow transition (reject, cancel, acknowledge, close). */
  onChangeStatus?: (po: PurchaseOrderRow, status: PoStatus, reason?: string) => void | Promise<void>;
  /** Opens the goods-receipt flow for an issued PO. */
  onReceiveGoods?: (po: PurchaseOrderRow) => void;
  onPrintPo?: (po: PurchaseOrderRow) => void;
  onRefresh?: () => void | Promise<void>;
}

export function POWorkspace({
  purchaseOrders = [],
  totalCount,
  activeRole,
  vendorOptions = [],
  onSavePo,
  onApprove,
  onChangeStatus,
  onReceiveGoods,
  onPrintPo,
  onRefresh,
}: POWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [activePo, setActivePo] = useState<PurchaseOrderRow | null>(null);
  const [previewPo, setPreviewPo] = useState<PurchaseOrderRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [projectOptions, setProjectOptions] = useState<ProcurementProjectOption[]>([]);
  /** The order awaiting a reject/cancel reason, if any. */
  const [reasonPrompt, setReasonPrompt] = useState<
    { po: PurchaseOrderRow; action: Extract<PoStatus, 'rejected' | 'cancelled'> } | null
  >(null);

  useEffect(() => {
    let active = true;
    listProcurementProjects().then((projs) => {
      if (active && projs) {
        setProjectOptions(projs);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Only management may approve & send a purchase order to the vendor.
  const canApprove = activeRole === 'UPPER_MANAGEMENT' || activeRole === 'PROJECT_MANAGER';

  const handleOpenForm = (po: PurchaseOrderRow) => {
    setActivePo(po);
    setViewMode('form');
  };

  /**
   * Opens a blank draft.
   *
   * The PO number is left empty so `next_document_number('PO')` allocates
   * it atomically on save. This used to mint `PO-<date>-<Math.random 4
   * digits>` in the browser, which collides at roughly one in nine thousand
   * per day and, with the unique index now in place, would simply fail the
   * insert after the user had filled in the whole form.
   */
  const handleCreateNewPo = () => {
    const todayStr = new Date().toISOString().slice(0, 10);

    const newBlankPo: PurchaseOrderRow = {
      id: '',
      project_id: selectedProject !== 'all' ? selectedProject : (projectOptions[0]?.id ?? ''),
      site_id: null,
      vendor_id: '',
      purchase_requisition_id: null,
      po_number: '',
      po_date: todayStr,
      delivery_date: null,
      status: 'draft',
      total_amount: 0,
      subtotal_amount: 0,
      tax_amount: 0,
      payment_terms: null,
      terms_and_conditions: null,
      vendors: null,
      purchase_order_lines: [],
    };

    setActivePo(newBlankPo);
    setViewMode('form');
  };

  /**
   * Saves, and only closes the form when the save actually succeeded.
   *
   * This used to call `onSavePo` without awaiting it, then immediately
   * close the form and fire a refresh that raced the write — so a rejected
   * save (an illegal transition, a permission error, an enum failure)
   * discarded everything the user had typed with the form already gone.
   */
  const handleFormSubmit = async (formData: FullPoFormState): Promise<boolean> => {
    if (!onSavePo) return false;
    const res = await onSavePo(formData);
    if (res === false || (res && typeof res === 'object' && 'error' in res && (res as any).error)) return false;

    await onRefresh?.();

    // Do NOT automatically close the form. Update activePo with the newly saved ID/status
    // so the form remains open and reactive to further edits or actions.
    if (res && typeof res === 'object' && 'data' in res && res.data) {
      const savedData = res.data as any;
      setActivePo((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          id: savedData.purchaseOrderId || savedData.id || prev.id,
          po_number: savedData.poNumber || savedData.po_number || prev.po_number,
          status: savedData.status || formData.status,
        };
      });
    } else {
      setActivePo((prev) => (prev ? { ...prev, status: formData.status } : null));
    }
    return true;
  };

  const filteredOrders = purchaseOrders.filter((po) => {
    if (selectedProject !== 'all' && po.project_id !== selectedProject) {
      return false;
    }
    if (selectedTab === 'all') return true;
    return poStatusGroup(po.status) === selectedTab;
  });

  const activePoTitle = activePo?.po_number ? `Editing ${activePo.po_number}` : 'New PO Creation';

  // Truncation must be stated, not implied. Anything summarising this page —
  // the stats bar included — is describing a subset once this fires.
  const hiddenCount = Math.max(0, (totalCount ?? purchaseOrders.length) - purchaseOrders.length);

  return (
    <div className="space-y-4">
      {hiddenCount > 0 && viewMode === 'list' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Showing the {purchaseOrders.length} most recent of {totalCount} purchase orders
            {' — '}
            <span className="font-bold">{hiddenCount} not loaded.</span>{' '}
            <span className="font-medium">
              Counts below describe the loaded orders only. Narrow the project filter to see the rest.
            </span>
          </p>
        </div>
      )}

      {/* Workspace Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-1 text-xs">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" />
            <span className="font-bold text-foreground font-heading">Purchase Order Workspace</span>
            <span className="text-muted-foreground font-mono text-[11px]">
              • Mode: {viewMode === 'form' ? activePoTitle : `Filtered (${filteredOrders.length}/${purchaseOrders.length})`}
            </span>
          </div>

          {/* Project Dropdown Filter */}
          {viewMode === 'list' && (
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <label className="text-[11px] font-bold text-muted-foreground uppercase shrink-0">Project:</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="h-7 rounded-lg border border-border bg-background px-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="all">All Projects</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.code ? `(${p.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setViewMode('list');
              setActivePo(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> View All PO Records ({purchaseOrders.length})
          </button>

          <button
            onClick={handleCreateNewPo}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'form' && !activePo?.id
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <Plus className="h-3.5 w-3.5" /> New PO Form
          </button>
        </div>
      </div>

      {viewMode === 'form' && activePo ? (
        <PoForm
          // Remount when a different order is opened, so the form's
          // initial state is rebuilt from the new row rather than kept
          // from the previous one.
          key={activePo.id || 'new-purchase-order'}
          po={activePo}
          vendorOptions={vendorOptions}
          canApprove={canApprove}
          onPrint={() => {
            if (activePo) setPreviewPo(activePo);
          }}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setViewMode('list');
            setActivePo(null);
          }}
        />
      ) : (
        <>
          {/* Operational Reminders Banner */}
          <PoStatsBar
            purchaseOrders={purchaseOrders}
            onSelectTab={(tab) => setSelectedTab(tab)}
          />

          {/* PO Table View */}
          <PoTableView
            purchaseOrders={filteredOrders}
            onOpenPoForm={handleOpenForm}
            onPrintPo={(po) => {
              setPreviewPo(po);
            }}
            onApprove={onApprove}
            onReject={onChangeStatus ? (po) => setReasonPrompt({ po, action: 'rejected' }) : undefined}
            onCancel={onChangeStatus ? (po) => setReasonPrompt({ po, action: 'cancelled' }) : undefined}
            onAcknowledge={
              onChangeStatus ? (po) => void onChangeStatus(po, 'acknowledged') : undefined
            }
            onReceiveGoods={onReceiveGoods}
            canApprove={canApprove}
          />
        </>
      )}

      {/* PO PDF PREVIEW MODAL */}
      {previewPo && (
        <POPdfPreviewModal
          po={previewPo}
          onClose={() => setPreviewPo(null)}
        />
      )}

      {/* Reason prompt for reject / cancel, which the database requires. */}
      {reasonPrompt && onChangeStatus && (
        <PoRejectModal
          po={reasonPrompt.po}
          action={reasonPrompt.action}
          onConfirm={async (reason) => {
            await onChangeStatus(reasonPrompt.po, reasonPrompt.action, reason);
            await onRefresh?.();
          }}
          onClose={() => setReasonPrompt(null)}
        />
      )}
    </div>
  );
}
