'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { 
  Truck, 
  Star, 
  CheckCircle2, 
  AlertCircle,
  Plus,
  X,
  Loader2,
  RefreshCcw,
  Check,
  Ban
} from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { supabase } from '@/utils/supabase-client';
import { createVendor, updateVendorComplianceStatus, type VendorRow } from '@/lib/procurement';

export default function VendorsPage() {
  const liveMode = isLiveSupabase();
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal form state
  const [modalOpen, setModalOpen] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [complianceStatus, setComplianceStatus] = useState('pending');
  const [rating, setRating] = useState(4.0);

  // Dynamic KPI States
  const [kpis, setKpis] = useState({
    totalValue: 0,
    paidValue: 0,
    balanceValue: 0,
  });

  const formatCurrency = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    return `₹${Number(val || 0).toLocaleString('en-IN')}`;
  };

  const refreshData = useCallback(async () => {
    if (!liveMode) {
      setVendors([]);
      setKpis({ totalValue: 0, paidValue: 0, balanceValue: 0 });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: vList, error: vError } = await supabase
        .from('vendors')
        .select('*')
        .eq('is_active', true)
        .order('legal_name');
      if (vError) throw new Error(vError.message);

      const { data: poList, error: poError } = await supabase
        .from('purchase_orders')
        .select('total_amount, status');
      if (poError) throw new Error(poError.message);

      const { data: billList, error: billError } = await supabase
        .from('vendor_bills')
        .select('total_amount, status');
      if (billError) throw new Error(billError.message);

      const totalPOVal = (poList || []).reduce((sum, po) => sum + Number(po.total_amount || 0), 0);
      const paidVal = (billList || []).filter(b => b.status === 'paid').reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
      const outstandingVal = (billList || []).filter(b => b.status !== 'paid').reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

      setVendors(vList || []);
      setKpis({
        totalValue: totalPOVal,
        paidValue: paidVal,
        balanceValue: outstandingVal,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load live registry data.');
    } finally {
      setLoading(false);
    }
  }, [liveMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshData();
  }, [refreshData]);

  async function handleOnboardSubmit(e: FormEvent) {
    e.preventDefault();
    if (!liveMode) {
      setError('Supabase is not configured. Vendor onboarding requires the live vendor registry.');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);

    const result = await createVendor({
      legal_name: legalName,
      display_name: displayName || null,
      vendor_code: vendorCode,
      gst_number: gstNumber || null,
      pan_number: panNumber || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      compliance_status: complianceStatus,
      rating: Number(rating || 0),
    });

    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    setSuccess(`Vendor "${legalName}" onboarded successfully.`);
    setModalOpen(false);
    setLegalName('');
    setDisplayName('');
    setVendorCode('');
    setGstNumber('');
    setPanNumber('');
    setEmail('');
    setPhone('');
    setAddress('');
    setComplianceStatus('pending');
    setRating(4.0);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal bg-orange-50 dark:bg-orange-950/30 px-3 py-1 rounded-full border border-orange-100 dark:border-orange-900/40">
            Supply Chain
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-normal text-gray-900 dark:text-white mt-2">
            Vendor & Supplier Registry
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Audit supplier performance scores, evaluate contract margins, and track invoice disbursements.
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
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white shadow hover:bg-primary/95"
          >
            <Plus className="h-4 w-4" />
            Onboard Vendor
          </button>
        </div>
      </div>

      {!liveMode && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Supabase is not configured. Vendor registry requires live vendor, PO, bill, and scorecard tables.
        </div>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</div>}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Cumulative PO Value</p>
          <h3 className="font-heading text-2xl font-semibold text-gray-950 dark:text-white mt-2">{formatCurrency(kpis.totalValue)}</h3>
          <p className="text-xs text-gray-400 mt-1">Global contracted sum</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Total Disbursed Paid</p>
          <h3 className="font-heading text-2xl font-semibold text-orange-600 dark:text-orange-400 mt-2">
            {formatCurrency(kpis.paidValue)}
          </h3>
          <p className="text-xs text-orange-500 font-medium mt-1">Settled payments to date</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-normal">Outstanding Vendor Balance</p>
          <h3 className="font-heading text-2xl font-semibold text-red-650 dark:text-red-400 mt-2">{formatCurrency(kpis.balanceValue)}</h3>
          <p className="text-xs text-red-500 font-medium mt-1">Unbilled/pending certifications</p>
        </div>
      </div>

      {/* Vendors List Table */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-850 shadow-sm space-y-4">
        <h3 className="font-heading font-semibold text-gray-900 dark:text-white text-base">Registered Supplier Ledger</h3>
        
        <div className="overflow-x-auto">
          {vendors.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground border border-dashed border-border rounded-xl">No suppliers registered yet. Click Onboard Vendor to add one.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-850 text-gray-400">
                  <th className="pb-3 font-semibold">Vendor Company</th>
                  <th className="pb-3 font-semibold">GST / Contact Details</th>
                  <th className="pb-3 font-semibold">Rating</th>
                  <th className="pb-3 font-semibold">Address</th>
                  <th className="pb-3 font-semibold">Compliance Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className="border-b border-gray-50 dark:border-gray-850/50 hover:bg-gray-50/20">
                    <td className="py-3.5 font-bold text-gray-850 dark:text-gray-250 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-primary" />
                      <div>
                        <p>{vendor.legal_name}</p>
                        {vendor.display_name && <p className="text-[10px] text-muted-foreground font-normal">{vendor.display_name} ({vendor.vendor_code || 'N/A'})</p>}
                      </div>
                    </td>
                    <td className="py-3.5">
                      <p className="font-semibold">{vendor.gst_number || 'No GST Record'}</p>
                      <p className="text-muted-foreground text-[10px]">{vendor.email} • {vendor.phone}</p>
                    </td>
                    <td className="py-3.5">
                      <span className="flex items-center gap-1 text-amber-500 font-bold">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        {Number(vendor.rating || 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3.5 text-muted-foreground">{vendor.address || '-'}</td>
                    <td className="py-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 w-fit uppercase
                        ${vendor.compliance_status === 'approved' 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20' 
                          : vendor.compliance_status === 'rejected' || vendor.compliance_status === 'blocked'
                            ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20'
                            : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20'}`}>
                        {vendor.compliance_status === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                        {vendor.compliance_status || 'pending'}
                      </span>
                    </td>
                    <td className="py-3.5 text-right space-x-1.5">
                      {vendor.compliance_status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(vendor.id, 'approved')}
                          className="inline-flex items-center gap-1 rounded bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-2 py-1 font-bold text-[10px] transition-colors"
                        >
                          <Check className="h-3 w-3" />
                          Approve
                        </button>
                      )}
                      {vendor.compliance_status !== 'rejected' && vendor.compliance_status !== 'blocked' && (
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(vendor.id, 'blocked')}
                          className="inline-flex items-center gap-1 rounded bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 px-2 py-1 font-bold text-[10px] transition-colors"
                        >
                          <Ban className="h-3 w-3" />
                          Block
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Onboarding Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <h3 className="text-xl font-bold">Onboard New Supplier</h3>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Company Legal Name *</label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={e => setLegalName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. UltraTech Cement Ltd"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Display Name (Short)</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. UltraTech"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Vendor Code</label>
                  <input
                    type="text"
                    value={vendorCode}
                    onChange={e => setVendorCode(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="Auto-generated if empty"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">GST Number</label>
                  <input
                    type="text"
                    value={gstNumber}
                    onChange={e => setGstNumber(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. 27AADCU1234F1Z5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={panNumber}
                    onChange={e => setPanNumber(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. ABCDE1234F"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. contact@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="e.g. +91 99999 99999"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Company Registered Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Street, City, State, ZIP"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Compliance Status</label>
                  <select
                    value={complianceStatus}
                    onChange={e => setComplianceStatus(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="pending">Pending Audit</option>
                    <option value="approved">Approved / compliant</option>
                    <option value="rejected">Rejected / Non-compliant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-muted-foreground mb-1">Performance Rating (1.0 - 5.0)</label>
                  <input
                    type="number"
                    min="1.0"
                    max="5.0"
                    step="0.1"
                    value={rating}
                    onChange={e => setRating(Number(e.target.value))}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm font-bold hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white shadow hover:bg-primary/95"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Register & Onboard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
