'use client';

import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  Truck,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Loader2,
  RefreshCcw,
  Check,
  Pencil,
  Search,
  PackageCheck,
  CalendarClock,
  ClipboardList,
  ReceiptIndianRupee,
  Building2,
  MapPin,
  MoreVertical,
  History,
  ChevronLeft,
  ChevronRight,
  FilterX,
} from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import {
  createVendor,
  updateVendor,
  updateVendorComplianceStatus,
  listVendorProfiles,
  validateVendorInput,
  type VendorProfileRow,
  type VendorInput,
} from '@/lib/procurement';
import { VendorScorecard } from '@/components/vendors/vendor-scorecard';

const EMPTY_FORM: VendorInput = {
  legal_name: '',
  display_name: '',
  phone: '',
  contact_person: '',
  email: '',
  address: '',
  location: '',
  city: '',
  pincode: '',
  pan_number: '',
  gst_number: '',
  vendor_code: '',
  compliance_status: 'pending',
  rating: 0,
};

const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
const LABEL = 'block text-xs font-bold uppercase text-muted-foreground mb-1';
const CONTROL =
  'h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary';

type SortKey = 'name_asc' | 'name_desc' | 'newest' | 'oldest';

interface VendorFilters {
  search: string;
  compliance: string;
  city: string;
  gst: string; // all | with | without
  sort: SortKey;
}

const DEFAULT_FILTERS: VendorFilters = {
  search: '',
  compliance: 'all',
  city: 'all',
  gst: 'all',
  sort: 'name_asc',
};

const PAGE_SIZE = 15;

export default function VendorsPage() {
  const liveMode = isLiveSupabase();
  const [vendors, setVendors] = useState<VendorProfileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters + pagination
  const [filters, setFilters] = useState<VendorFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  // Create / edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorInput>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Vendor profile / history panel
  const [profileVendor, setProfileVendor] = useState<VendorProfileRow | null>(null);

  // Row-actions menu, anchored in viewport coordinates and rendered through a
  // portal on document.body so no table/overflow ancestor can clip it.
  const [menuOpen, setMenuOpen] = useState<{ id: string; x: number; y: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const setField = <K extends keyof VendorInput>(key: K, value: VendorInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setFilter = <K extends keyof VendorFilters>(key: K, value: VendorFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const formatCurrency = (val: number) => {
    const n = Number(val || 0);
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  const formatDate = (val: string | null) =>
    val ? new Date(val).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const refreshData = useCallback(async () => {
    if (!liveMode) {
      setVendors([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setVendors(await listVendorProfiles());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load live registry data.');
    } finally {
      setLoading(false);
    }
  }, [liveMode]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Close the row-actions menu whenever the page shifts under it.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(null);
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuOpen]);

  // Distinct cities for the city filter.
  const cityOptions = useMemo(
    () => Array.from(new Set(vendors.map((v) => v.city).filter((c): c is string => !!c))).sort(),
    [vendors],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    let rows = vendors.filter((v) => {
      if (q) {
        const haystack = [
          v.legal_name, v.display_name, v.vendor_code, v.contact_person,
          v.phone, v.email, v.gst_number, v.pan_number, v.city, v.location, v.pincode,
        ];
        if (!haystack.filter(Boolean).some((f) => String(f).toLowerCase().includes(q))) return false;
      }
      if (filters.compliance !== 'all' && (v.compliance_status || 'pending') !== filters.compliance) return false;
      if (filters.city !== 'all' && v.city !== filters.city) return false;
      if (filters.gst === 'with' && !v.gst_number) return false;
      if (filters.gst === 'without' && v.gst_number) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      switch (filters.sort) {
        case 'name_desc':
          return b.legal_name.localeCompare(a.legal_name);
        case 'newest':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        case 'oldest':
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
        default:
          return a.legal_name.localeCompare(b.legal_name);
      }
    });
    return rows;
  }, [vendors, filters]);

  const activeFilterCount =
    (filters.search.trim() ? 1 : 0) +
    (filters.compliance !== 'all' ? 1 : 0) +
    (filters.city !== 'all' ? 1 : 0) +
    (filters.gst !== 'all' ? 1 : 0);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors([]);
    setModalOpen(true);
  }

  function openEdit(v: VendorProfileRow) {
    setEditingId(v.vendor_id);
    setForm({
      legal_name: v.legal_name || '',
      display_name: v.display_name || '',
      phone: v.phone || '',
      contact_person: v.contact_person || '',
      email: v.email || '',
      address: v.address || '',
      location: v.location || '',
      city: v.city || '',
      pincode: v.pincode || '',
      pan_number: v.pan_number || '',
      gst_number: v.gst_number || '',
      vendor_code: v.vendor_code || '',
      compliance_status: v.compliance_status || 'pending',
      rating: Number(v.rating || 0),
    });
    setFormErrors([]);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!liveMode) {
      setError('Supabase is not configured. Vendor management requires the live vendor registry.');
      return;
    }
    const problems = validateVendorInput(form);
    if (problems.length > 0) {
      setFormErrors(problems);
      return;
    }
    setFormErrors([]);
    setError(null);
    setSuccess(null);
    setSaving(true);

    const result = editingId ? await updateVendor(editingId, form) : await createVendor(form);
    setSaving(false);
    if (result.error) {
      setFormErrors([result.error.message]);
      return;
    }

    setSuccess(
      editingId
        ? `Vendor "${form.legal_name}" updated successfully.`
        : `Vendor "${form.legal_name}" added successfully.`,
    );
    setModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    void refreshData();
  }

  async function handleStatusChange(vId: string, newStatus: string) {
    if (!liveMode) {
      setError('Supabase is not configured. Vendor compliance changes require the live vendor registry.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);
    const result = await updateVendorComplianceStatus(vId, newStatus);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setSuccess(`Vendor compliance status updated to ${newStatus}.`);
    void refreshData();
  }

  const complianceBadge = (status: string | null) => {
    const s = status || 'pending';
    const cls =
      s === 'approved'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20'
        : s === 'rejected' || s === 'blocked'
          ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20'
          : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20';
    return (
      <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
        {s === 'approved' ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Supply Chain
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
            Vendor &amp; Supplier Registry
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Maintain supplier master data, compliance state, and the full procurement history behind every vendor.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refreshData()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow hover:bg-primary/95"
          >
            <Plus className="h-4 w-4" />
            Add Vendor
          </button>
        </div>
      </div>

      {!liveMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Supabase is not configured. Vendor registry requires the live vendor, PO, GRN, and bill tables.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</div>}

      {/* Search + Filters */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="Search company, ledger name, contact, mobile, email, GSTIN, PAN, city…"
              aria-label="Search vendors"
              className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-xs outline-none focus:border-primary"
            />
          </div>

          <select
            value={filters.compliance}
            onChange={(e) => setFilter('compliance', e.target.value)}
            aria-label="Filter by compliance status"
            className={CONTROL}
          >
            <option value="all">All Compliance</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={filters.city}
            onChange={(e) => setFilter('city', e.target.value)}
            aria-label="Filter by city"
            className={CONTROL}
          >
            <option value="all">All Cities</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filters.gst}
            onChange={(e) => setFilter('gst', e.target.value)}
            aria-label="Filter by GSTIN presence"
            className={CONTROL}
          >
            <option value="all">GSTIN: Any</option>
            <option value="with">Has GSTIN</option>
            <option value="without">Missing GSTIN</option>
          </select>

          <select
            value={filters.sort}
            onChange={(e) => setFilter('sort', e.target.value as SortKey)}
            aria-label="Sort vendors"
            className={CONTROL}
          >
            <option value="name_asc">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold text-muted-foreground hover:bg-muted"
            >
              <FilterX className="h-3.5 w-3.5" />
              Clear ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Vendors List Table */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">
            Registered Supplier Ledger{' '}
            <span className="font-normal text-muted-foreground">
              ({filtered.length}{filtered.length !== vendors.length ? ` of ${vendors.length}` : ''})
            </span>
          </h3>
          {totalPages > 1 && (
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          {paged.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">
              {vendors.length === 0
                ? 'No vendors registered yet. Click Add Vendor to create one.'
                : 'No vendors match the current search or filters.'}
            </div>
          ) : (
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                  <th className="px-2 pb-3 font-semibold">Name of Company</th>
                  <th className="px-2 pb-3 font-semibold">Vendor/Ledger Name</th>
                  <th className="px-2 pb-3 font-semibold">Contact Person</th>
                  <th className="px-2 pb-3 font-semibold">Mobile No.</th>
                  <th className="px-2 pb-3 font-semibold">Email Id</th>
                  <th className="px-2 pb-3 font-semibold">Address</th>
                  <th className="px-2 pb-3 font-semibold">Location</th>
                  <th className="px-2 pb-3 font-semibold">City</th>
                  <th className="px-2 pb-3 font-semibold">Pincode</th>
                  <th className="px-2 pb-3 font-semibold">PAN No.</th>
                  <th className="px-2 pb-3 font-semibold">GSTIN No.</th>
                  <th className="px-2 pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((vendor) => (
                  <tr key={vendor.vendor_id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/20">
                    <td className="px-2 py-3.5 font-bold text-gray-850 dark:text-gray-250">
                      <button
                        type="button"
                        onClick={() => setProfileVendor(vendor)}
                        className="flex max-w-55 items-center gap-2 text-left transition-colors hover:text-primary"
                        title="View vendor profile & history"
                      >
                        <Truck className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{vendor.legal_name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-3.5 font-semibold">{vendor.display_name || '—'}</td>
                    <td className="px-2 py-3.5">{vendor.contact_person || '—'}</td>
                    <td className="px-2 py-3.5 font-mono">{vendor.phone || '—'}</td>
                    <td className="max-w-45 truncate px-2 py-3.5 text-muted-foreground" title={vendor.email || ''}>
                      {vendor.email || '—'}
                    </td>
                    <td className="max-w-55 truncate px-2 py-3.5 text-muted-foreground" title={vendor.address || ''}>
                      {vendor.address || '—'}
                    </td>
                    <td className="px-2 py-3.5 text-muted-foreground">{vendor.location || '—'}</td>
                    <td className="px-2 py-3.5 text-muted-foreground">{vendor.city || '—'}</td>
                    <td className="px-2 py-3.5 font-mono text-muted-foreground">{vendor.pincode || '—'}</td>
                    <td className="px-2 py-3.5 font-mono">{vendor.pan_number || '—'}</td>
                    <td className="px-2 py-3.5 font-mono">{vendor.gst_number || '—'}</td>
                    <td className="px-2 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuOpen?.id === vendor.vendor_id) {
                            setMenuOpen(null);
                            return;
                          }
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenuOpen({ id: vendor.vendor_id, x: r.right, y: r.bottom });
                        }}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen?.id === vendor.vendor_id}
                        aria-label={`Actions for ${vendor.legal_name}`}
                        className={`rounded-lg border p-1.5 transition-colors ${
                          menuOpen?.id === vendor.vendor_id
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination — scales to hundreds of vendors */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((p, idx, arr) => (
                  <span key={p} className="flex items-center">
                    {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
                    <button
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === currentPage ? 'page' : undefined}
                      className={`min-w-8 rounded-lg border px-2 py-1.5 text-xs font-bold ${
                        p === currentPage
                          ? 'border-primary bg-primary text-white'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {p}
                    </button>
                  </span>
                ))}
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============ ROW ACTIONS MENU — portalled to <body> so nothing clips it ============ */}
      {mounted && menuOpen && (() => {
        const vendor = filtered.find((v) => v.vendor_id === menuOpen.id);
        if (!vendor) return null;
        const MENU_W = 208;
        const left = Math.max(8, Math.min(menuOpen.x - MENU_W, window.innerWidth - MENU_W - 8));
        const top = Math.min(menuOpen.y + 6, window.innerHeight - 110);
        return createPortal(
          <div
            role="menu"
            aria-label={`Actions for ${vendor.legal_name}`}
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', left, top, width: MENU_W, zIndex: 9999 }}
            className="overflow-hidden rounded-xl border border-border bg-card py-1 text-left shadow-2xl"
          >
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(null); openEdit(vendor); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <Pencil className="h-3.5 w-3.5 text-primary" /> Edit Vendor
            </button>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(null); setProfileVendor(vendor); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <History className="h-3.5 w-3.5 text-blue-500" /> View History &amp; Profile
            </button>
            {vendor.compliance_status !== 'approved' && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(null); void handleStatusChange(vendor.vendor_id, 'approved'); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                >
                  <Check className="h-3.5 w-3.5" /> Approve Compliance
                </button>
              </>
            )}
          </div>,
          document.body,
        );
      })()}

      {/* ===================== VENDOR PROFILE / HISTORY PANEL ===================== */}
      {profileVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border bg-muted/30 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">{profileVendor.legal_name}</h3>
                  <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{profileVendor.display_name || '—'} • {profileVendor.vendor_code || 'No code'}</span>
                    {complianceBadge(profileVendor.compliance_status)}
                  </p>
                </div>
              </div>
              <button onClick={() => setProfileVendor(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Procurement history */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Procurement History</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { icon: ClipboardList, label: 'Purchase Orders', value: String(profileVendor.total_pos), tone: 'text-foreground' },
                    { icon: PackageCheck, label: 'Deliveries (GRN)', value: String(profileVendor.total_deliveries), tone: 'text-emerald-600' },
                    { icon: ReceiptIndianRupee, label: 'Vendor Bills', value: String(profileVendor.total_bills), tone: 'text-orange-600' },
                    { icon: CalendarClock, label: 'Last Delivery', value: formatDate(profileVendor.last_delivery_date), tone: 'text-foreground' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                        <s.icon className="h-3.5 w-3.5" /> {s.label}
                      </div>
                      <p className={`mt-1 font-heading text-lg font-bold ${s.tone}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Total PO Value', value: formatCurrency(profileVendor.total_po_value) },
                    { label: 'Total Billed', value: formatCurrency(profileVendor.total_billed_value) },
                    { label: 'RFQs Invited', value: String(profileVendor.total_rfqs_invited) },
                    { label: 'Linked MRs', value: String(profileVendor.linked_mr_count) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">{s.label}</p>
                      <p className="mt-1 font-heading text-base font-bold text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Linked MRs are counted through PO → PR → Material Request, since material requests are not raised against a vendor directly.
                </p>
              </div>

              {/* Vendor performance scorecard (OTIF + rejection rate) */}
              <VendorScorecard
                vendorId={profileVendor.vendor_id}
                vendorName={profileVendor.display_name || profileVendor.legal_name}
              />

              {/* Master details */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Vendor Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-border p-4 text-sm">
                  {[
                    ['Name of Company', profileVendor.legal_name],
                    ['Vendor / Ledger Name', profileVendor.display_name],
                    ['Contact Person', profileVendor.contact_person],
                    ['Mobile No.', profileVendor.phone],
                    ['Email Id', profileVendor.email],
                    ['GSTIN No.', profileVendor.gst_number],
                    ['PAN No.', profileVendor.pan_number],
                    ['Location', profileVendor.location],
                    ['City', profileVendor.city],
                    ['Pincode', profileVendor.pincode],
                    ['Registered On', formatDate(profileVendor.created_at)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between gap-3 border-b border-border/50 py-1 last:border-0">
                      <span className="text-muted-foreground text-xs font-semibold">{label}</span>
                      <span className="text-foreground text-xs font-bold text-right">{value || '—'}</span>
                    </div>
                  ))}
                </div>
                {profileVendor.address && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {profileVendor.address}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border bg-muted/20 p-4">
              <button
                type="button"
                onClick={() => setProfileVendor(null)}
                className="rounded-md border border-border px-4 py-2 text-xs font-bold hover:bg-muted"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const v = profileVendor;
                  setProfileVendor(null);
                  openEdit(v);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary/95"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Vendor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CREATE / EDIT VENDOR DIALOG ===================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-xl font-bold">{editingId ? 'Edit Vendor' : 'Add New Vendor'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                <ul className="list-disc pl-4 space-y-0.5">
                  {formErrors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Name of Company *</label>
                  <input
                    type="text"
                    value={form.legal_name}
                    onChange={(e) => setField('legal_name', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. UltraTech Cement Ltd"
                    required
                  />
                </div>
                <div>
                  <label className={LABEL}>Vendor / Ledger Name *</label>
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setField('display_name', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. UltraTech"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>Contact Person</label>
                  <input
                    type="text"
                    value={form.contact_person ?? ''}
                    onChange={(e) => setField('contact_person', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. Rakesh Sharma"
                  />
                </div>
                <div>
                  <label className={LABEL}>Mobile No. *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. 98252 97970"
                    required
                  />
                </div>
                <div>
                  <label className={LABEL}>Email Id</label>
                  <input
                    type="email"
                    value={form.email ?? ''}
                    onChange={(e) => setField('email', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. contact@company.com"
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Address</label>
                <input
                  type="text"
                  value={form.address ?? ''}
                  onChange={(e) => setField('address', e.target.value)}
                  className={FIELD}
                  placeholder="Street / building / area"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>Location</label>
                  <input
                    type="text"
                    value={form.location ?? ''}
                    onChange={(e) => setField('location', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. Vesu"
                  />
                </div>
                <div>
                  <label className={LABEL}>City</label>
                  <input
                    type="text"
                    value={form.city ?? ''}
                    onChange={(e) => setField('city', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. Surat"
                  />
                </div>
                <div>
                  <label className={LABEL}>Pincode</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.pincode ?? ''}
                    onChange={(e) => setField('pincode', e.target.value)}
                    className={FIELD}
                    placeholder="e.g. 395007"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>PAN No.</label>
                  <input
                    type="text"
                    value={form.pan_number ?? ''}
                    onChange={(e) => setField('pan_number', e.target.value.toUpperCase())}
                    className={FIELD}
                    placeholder="e.g. ABCDE1234F"
                  />
                </div>
                <div>
                  <label className={LABEL}>GSTIN No.</label>
                  <input
                    type="text"
                    value={form.gst_number ?? ''}
                    onChange={(e) => setField('gst_number', e.target.value.toUpperCase())}
                    className={FIELD}
                    placeholder="e.g. 24AADCU1234F1Z5"
                  />
                </div>
                <div>
                  <label className={LABEL}>Vendor Code</label>
                  <input
                    type="text"
                    value={form.vendor_code ?? ''}
                    onChange={(e) => setField('vendor_code', e.target.value)}
                    className={FIELD}
                    placeholder="Auto-generated if empty"
                  />
                </div>
              </div>

              <div>
                <label className={LABEL}>Compliance Status</label>
                <select
                  value={form.compliance_status ?? 'pending'}
                  onChange={(e) => setField('compliance_status', e.target.value)}
                  className={FIELD}
                >
                  <option value="pending">Pending Audit</option>
                  <option value="approved">Approved / Compliant</option>
                  <option value="rejected">Rejected / Non-compliant</option>
                </select>
              </div>

              <div className="flex items-center justify-between gap-2 pt-4 border-t border-border">
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-bold">*</span> Name of Company, Vendor / Ledger Name and Mobile No. are mandatory.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white shadow hover:bg-primary/95 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingId ? 'Save Changes' : 'Add Vendor'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
