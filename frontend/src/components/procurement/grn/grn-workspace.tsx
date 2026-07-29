'use client';

import { useState } from 'react';
import { Truck, ListChecks, Smartphone, ArrowLeft, Plus } from 'lucide-react';
import { createFullGoodsReceiptNote, updateGrnStatus, type GrnRow as DbGrnRow } from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { GrnStatsBar, type GrnRow } from './grn-stats-bar';
import { GrnTableView } from './grn-table-view';
import { GrnForm, type FullGrnFormState } from './grn-form';

const APPROVED_STATUSES = new Set(['posted', 'approved', 'accepted', 'completed']);

// Bridge the flat Supabase GRN row to display format
function toDisplayGrn(g: DbGrnRow): GrnRow {
  const lines = g.goods_receipt_note_lines ?? [];
  const status: 'site_engineer' | 'approved' = APPROVED_STATUSES.has((g.status || '').toLowerCase())
    ? 'approved'
    : 'site_engineer';
  return {
    id: g.id,
    grn_number: g.grn_number,
    po_number: g.purchase_orders?.po_number || '—',
    gate_entry_no: 'GE-001',
    vehicle_no: g.vehicle_no || g.physical_inspection || '—',
    received_date: g.receipt_date ? g.receipt_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    vendor_name: g.vendors?.display_name || g.vendors?.legal_name || '—',
    project_name: 'Pramukh Orbit 3',
    godown_name: g.godown_name || 'Main Site Store',
    challan_no: g.challan_no || g.quantity_verification || '—',
    status,
    items_received: lines.length,
    total_val: lines.reduce((sum, l) => sum + (Number(l.accepted_qty) || 0) * (Number(l.unit_rate) || 0), 0),
  };
}

interface GrnWorkspaceProps {
  grns?: DbGrnRow[];
  activeRole?: Role;
  onApproveGrn?: (grnId: string) => void;
  onDownloadReport?: (grnId: string) => void;
  onRefresh?: () => void | Promise<void>;
}

export function GrnWorkspace({ grns = [], activeRole, onApproveGrn, onDownloadReport, onRefresh }: GrnWorkspaceProps) {
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
    const dateFormatted = todayStr.replace(/-/g, '');
    const randomSeq = Math.floor(1000 + Math.random() * 9000);

    const newBlankGrn: GrnRow = {
      id: '',
      grn_number: `GRN-${dateFormatted}-${randomSeq}`,
      po_number: '',
      gate_entry_no: 'GE-001',
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

  const handleFormSubmit = async (formData: FullGrnFormState) => {
    try {
      // Map workflow status to Supabase status
      const supabaseStatus = 
        formData.status === 'Draft' ? 'draft' :
        formData.status === 'Pending Verification' ? 'pending_verification' :
        formData.status === 'Pending Approval' ? 'pending_approval' :
        formData.status === 'Approved' ? 'posted' : 'draft';

      if (!activeGrn?.id) {
        // Creating new GRN connected to Supabase
        const res = await createFullGoodsReceiptNote({
          grn_number: formData.gr_no || activeGrn?.grn_number || 'GRN-NEW',
          grn_date: formData.grn_date,
          challan_no: formData.challan_no,
          vehicle_no: formData.vehicle_no,
          supplier_name: formData.supplier_name,
          godown_name: formData.godown_name,
          remarks: formData.remarks,
          status: supabaseStatus,
          uploaded_invoice_url: formData.uploaded_invoice_url,
        });

        if (res.error) {
          alert(`Failed to save GRN to Supabase: ${res.error.message}`);
          return;
        }
      } else {
        // Updating existing GRN status in Supabase
        const res = await updateGrnStatus(activeGrn.id, supabaseStatus);
        if (res.error) {
          alert(`Failed to update GRN status: ${res.error.message}`);
          return;
        }

        if (formData.status === 'Approved') {
          onApproveGrn?.(activeGrn.id);
        }
      }
    } catch (err: any) {
      alert(`Error saving GRN: ${err?.message || 'Failed'}`);
      return;
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
