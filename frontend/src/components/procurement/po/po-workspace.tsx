'use client';

import { useState } from 'react';
import { ShoppingBag, ListChecks, Plus } from 'lucide-react';
import type { PurchaseOrderRow } from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { PoStatsBar } from './po-stats-bar';
import { PoTableView } from './po-table-view';
import { PoForm, type FullPoFormState } from './po-form';
import { POPdfPreviewModal } from './po-pdf-preview-modal';

interface POWorkspaceProps {
  purchaseOrders?: PurchaseOrderRow[];
  activeRole?: Role;
  onSavePo?: (poData: FullPoFormState) => void;
  onApprove?: (po: PurchaseOrderRow) => void;
  onPrintPo?: (po: PurchaseOrderRow) => void;
  onRefresh?: () => void | Promise<void>;
}

export function POWorkspace({ purchaseOrders = [], activeRole, onSavePo, onApprove, onPrintPo, onRefresh }: POWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [activePo, setActivePo] = useState<PurchaseOrderRow | null>(null);
  const [previewPo, setPreviewPo] = useState<PurchaseOrderRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');

  // Only management may approve & send a purchase order to the vendor.
  const canApprove = activeRole === 'UPPER_MANAGEMENT' || activeRole === 'PROJECT_MANAGER';

  const handleOpenForm = (po: PurchaseOrderRow) => {
    setActivePo(po);
    setViewMode('form');
  };

  const handleCreateNewPo = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dateFormatted = todayStr.replace(/-/g, '');
    const randomSeq = Math.floor(1000 + Math.random() * 9000);

    const newBlankPo: PurchaseOrderRow = {
      id: '',
      project_id: 'central-park',
      site_id: '',
      vendor_id: '',
      purchase_requisition_id: '',
      po_number: `PO-${dateFormatted}-${randomSeq}`,
      po_date: todayStr,
      delivery_date: todayStr,
      status: 'draft',
      total_amount: 0,
      subtotal_amount: 0,
      tax_amount: 0,
      payment_terms: '45 Days Credit',
      terms_and_conditions: '',
      vendors: null,
      purchase_order_lines: [],
    };

    setActivePo(newBlankPo);
    setViewMode('form');
  };

  const handleFormSubmit = (formData: FullPoFormState) => {
    onSavePo?.(formData);
    setViewMode('list');
    setActivePo(null);
    void onRefresh?.();
  };

  const filteredOrders = purchaseOrders.filter((po) => {
    const st = (po.status || '').toLowerCase();
    if (selectedTab === 'draft') return st === 'draft' || st === 'draft_auto';
    if (selectedTab === 'verification') return st === 'pending_approval' || st === 'verification' || st === 'under_review';
    if (selectedTab === 'issued') return st === 'issued' || st === 'approved' || st === 'sent_to_vendor';
    if (selectedTab === 'fulfilled') return st === 'fulfilled' || st === 'completed' || st === 'delivered';
    return true;
  });

  const activePoTitle = activePo?.po_number ? `Editing ${activePo.po_number}` : 'New PO Creation';

  return (
    <div className="space-y-4">
      {/* Workspace Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs">
          <ShoppingBag className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground font-heading">Purchase Order Workspace</span>
          <span className="text-muted-foreground font-mono text-[11px]">
            • Mode: {viewMode === 'form' ? activePoTitle : `All Records (${purchaseOrders.length})`}
          </span>
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
          po={activePo}
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
              if (onPrintPo) onPrintPo(po);
              setPreviewPo(po);
            }}
            onApprove={onApprove}
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
    </div>
  );
}
