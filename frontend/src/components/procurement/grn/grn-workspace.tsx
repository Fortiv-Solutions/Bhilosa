'use client';

import { useState } from 'react';
import { Truck, ListChecks, Smartphone, ArrowLeft } from 'lucide-react';
import type { GrnRow as DbGrnRow } from '@/lib/procurement';
import type { Role } from '@/lib/roles';
import { GrnStatsBar, type GrnRow } from './grn-stats-bar';
import { GrnTableView } from './grn-table-view';
import { GrnForm, type FullGrnFormState } from './grn-form';

const APPROVED_STATUSES = new Set(['posted', 'approved', 'accepted', 'completed']);

// Bridge the flat Supabase GRN row (with joined vendor/PO/lines) to the rich display row
// the GRN table + form components expect.
function toDisplayGrn(g: DbGrnRow): GrnRow {
  const lines = g.goods_receipt_note_lines ?? [];
  const status: 'site_engineer' | 'approved' = APPROVED_STATUSES.has((g.status || '').toLowerCase())
    ? 'approved'
    : 'site_engineer';
  return {
    id: g.id,
    grn_number: g.grn_number,
    po_number: g.purchase_orders?.po_number || '—',
    gate_entry_no: '—',
    vehicle_no: g.vehicle_no || g.physical_inspection || '—',
    received_date: g.receipt_date,
    vendor_name: g.vendors?.display_name || g.vendors?.legal_name || '—',
    project_name: '—',
    godown_name: g.godown_name || '—',
    challan_no: g.challan_no || g.quantity_verification || '—',
    status,
    items_received: lines.length,
    total_val: lines.reduce((sum, l) => sum + (Number(l.accepted_qty) || 0) * (Number(l.unit_rate) || 0), 0),
  };
}

interface GrnWorkspaceProps {
  grns?: DbGrnRow[];
  activeRole?: Role;
  /** Approve a GRN: posts to inventory and auto-generates the vendor bill. */
  onApproveGrn?: (grnId: string) => void;
  /** Generate + open the server-side report-format GRN PDF. */
  onDownloadReport?: (grnId: string) => void;
  onRefresh?: () => void | Promise<void>;
}

export function GrnWorkspace({ grns = [], activeRole, onApproveGrn, onDownloadReport, onRefresh }: GrnWorkspaceProps) {
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [activeGrn, setActiveGrn] = useState<GrnRow | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');

  // Only management may approve a GRN (posts to inventory + creates the vendor bill).
  const canApprove = activeRole === 'UPPER_MANAGEMENT' || activeRole === 'PROJECT_MANAGER';

  const displayGrns = grns.map(toDisplayGrn);

  const handleOpenForm = (grn: GrnRow) => {
    setActiveGrn(grn);
    setViewMode('form');
  };

  const handleStatusToggle = (id: string, newStatus: 'site_engineer' | 'approved') => {
    if (newStatus === 'approved') onApproveGrn?.(id);
  };

  const handleFormSubmit = (formData: FullGrnFormState) => {
    if (formData.status === 'Approve' && activeGrn) onApproveGrn?.(activeGrn.id);
    setViewMode('list');
    setActiveGrn(null);
    void onRefresh?.();
  };

  const filteredGrns = displayGrns.filter((g) => {
    if (selectedTab === 'site_engineer') return g.status === 'site_engineer';
    if (selectedTab === 'approved') return g.status === 'approved';
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <div className="flex items-center gap-2 px-1 text-xs">
          <Truck className="h-4 w-4 text-primary" />
          <span className="font-bold text-foreground font-heading">Site Material Receipt (GRN) &amp; Mobile Submissions Workspace</span>
          <span className="text-muted-foreground">• Logged GRNs ({displayGrns.length})</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setViewMode('list');
              setActiveGrn(null);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-all ${
              viewMode === 'list'
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-background text-foreground hover:bg-muted'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" /> GRN Overview Table ({filteredGrns.length})
          </button>
        </div>
      </div>

      {viewMode === 'form' && activeGrn ? (
        <div className="space-y-4">
          {/* Mobile App Submission Badge */}
          <div className="flex items-center justify-between rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 text-xs text-blue-900 dark:text-blue-200">
            <div className="flex items-center gap-2.5 font-semibold">
              <Smartphone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>
                📱 <strong>Site Submission:</strong> GRN{' '}
                <strong className="text-foreground">{activeGrn.grn_number}</strong> received against PO{' '}
                <strong className="text-foreground">{activeGrn.po_number}</strong>.
              </span>
            </div>

            <button
              onClick={() => {
                setViewMode('list');
                setActiveGrn(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard Table
            </button>
          </div>

          <GrnForm
            grn={activeGrn}
            onPrint={onDownloadReport ? () => onDownloadReport(activeGrn.id) : undefined}
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
