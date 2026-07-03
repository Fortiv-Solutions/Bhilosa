// Finance service layer for dashboard overview, payment recording, vendor aging, and analytics.
import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export interface FinanceOverviewData {
  totalBilled: number;
  approvedSpend: number;
  paidSpend: number;
  outstandingSpend: number;
  billsCount: number;
  pendingBillsCount: number;
  alertsCount: number;
  budgetSummaries: {
    projectId: string;
    projectName: string;
    allocated: number;
    committed: number;
    spent: number;
    available: number;
  }[];
  monthlySpend: { month: string; amount: number }[];
}

export interface VendorOutstandingRow {
  vendorId: string;
  vendorName: string;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  aging0to30: number;
  aging31to60: number;
  aging61to90: number;
  aging90plus: number;
}

export interface PaymentRow {
  id: string;
  project_id: string;
  vendor_bill_id: string;
  payment_reference: string;
  payment_date: string;
  amount: number;
  status: string;
  payment_mode: string;
  remarks: string | null;
  created_at: string;
  vendor_bills?: {
    bill_number: string;
    total_amount: number;
    vendors?: {
      display_name: string | null;
      legal_name: string;
    } | null;
  } | null;
}

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

// Fetch general overview statistics and charts data
export async function listFinanceOverview(projectId?: string): Promise<FinanceOverviewData> {
  if (!isLiveSupabase()) {
    return {
      totalBilled: 0,
      approvedSpend: 0,
      paidSpend: 0,
      outstandingSpend: 0,
      billsCount: 0,
      pendingBillsCount: 0,
      alertsCount: 0,
      budgetSummaries: [],
      monthlySpend: [],
    };
  }

  const dbProjectId = projectId ? getDbSiteId(projectId) : null;
  
  // Build queries
  let billQuery = supabase
    .from('vendor_bills')
    .select('*, vendors(display_name, legal_name)');
  if (dbProjectId) billQuery = billQuery.eq('project_id', dbProjectId);

  let budgetQuery = supabase.from('portfolio_budget_summary').select('*');
  if (dbProjectId) budgetQuery = budgetQuery.eq('project_id', dbProjectId);

  let alertsQuery = supabase.from('budget_alerts').select('id').eq('status', 'pending');
  if (dbProjectId) alertsQuery = alertsQuery.eq('project_id', dbProjectId);

  const [billsRes, budgetRes, alertsRes] = await Promise.all([
    billQuery,
    budgetQuery,
    alertsQuery,
  ]);

  if (billsRes.error) throw new Error(billsRes.error.message);
  if (budgetRes.error) throw new Error(budgetRes.error.message);
  if (alertsRes.error) throw new Error(alertsRes.error.message);

  const bills = billsRes.data || [];
  const budgets = budgetRes.data || [];
  const alertsCount = alertsRes.data?.length || 0;

  // Aggregate metrics
  const totalBilled = bills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const approvedSpend = bills
    .filter((b) => b.status === 'approved' || b.status === 'paid')
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const paidSpend = bills
    .filter((b) => b.payment_status === 'paid' || b.status === 'paid')
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  const outstandingSpend = approvedSpend - paidSpend;
  const billsCount = bills.length;
  const pendingBillsCount = bills.filter((b) => b.status === 'submitted' || b.status === 'verified').length;

  const budgetSummaries = budgets.map((b: any) => {
    const allocated = Number(b.allocated_amount || 0);
    const committed = Number(b.committed_amount || 0);
    const spent = Number(b.spent_amount || 0);
    const available = Math.max(0, allocated - committed - spent);
    return {
      projectId: b.project_id,
      projectName: b.project_name || 'Project Site',
      allocated,
      committed,
      spent,
      available,
    };
  });

  // Calculate monthly spend from paid and approved bills
  const monthlyMap = new Map<string, number>();
  bills
    .filter((b) => b.status === 'approved' || b.status === 'paid')
    .forEach((b) => {
      const date = b.bill_date ? new Date(b.bill_date) : new Date(b.created_at);
      const key = date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + Number(b.total_amount || 0));
    });

  const monthlySpend = Array.from(monthlyMap.entries()).map(([month, amount]) => ({
    month,
    amount,
  })).reverse(); // Order chronically

  return {
    totalBilled,
    approvedSpend,
    paidSpend,
    outstandingSpend,
    billsCount,
    pendingBillsCount,
    alertsCount,
    budgetSummaries,
    monthlySpend,
  };
}

// Fetch Accounts Payable Outstanding & Aging Report
export async function listVendorOutstanding(projectId?: string): Promise<VendorOutstandingRow[]> {
  if (!isLiveSupabase()) return [];

  const dbProjectId = projectId ? getDbSiteId(projectId) : null;
  let query = supabase
    .from('vendor_bills')
    .select('*, vendors(id, legal_name, display_name)');
  
  if (dbProjectId) {
    query = query.eq('project_id', dbProjectId);
  }

  const { data: bills, error } = await query;
  if (error) throw new Error(error.message);

  const vendorMap = new Map<string, VendorOutstandingRow>();
  const now = new Date();

  (bills || []).forEach((bill: any) => {
    const vendor = bill.vendors;
    if (!vendor) return;

    const vendorId = vendor.id;
    const vendorName = vendor.display_name || vendor.legal_name || 'Unknown Vendor';
    const amount = Number(bill.total_amount || 0);
    const isPaid = bill.payment_status === 'paid' || bill.status === 'paid';
    const paidAmount = isPaid ? amount : 0;
    const outstandingAmount = isPaid ? 0 : amount;

    // Calculate aging in days
    const billDate = bill.bill_date ? new Date(bill.bill_date) : new Date(bill.created_at);
    const ageInMs = now.getTime() - billDate.getTime();
    const ageInDays = Math.floor(ageInMs / (1000 * 60 * 60 * 24));

    let aging0to30 = 0;
    let aging31to60 = 0;
    let aging61to90 = 0;
    let aging90plus = 0;

    if (!isPaid) {
      if (ageInDays <= 30) aging0to30 = amount;
      else if (ageInDays <= 60) aging31to60 = amount;
      else if (ageInDays <= 90) aging61to90 = amount;
      else aging90plus = amount;
    }

    const existing = vendorMap.get(vendorId);
    if (existing) {
      existing.totalBilled += amount;
      existing.totalPaid += paidAmount;
      existing.totalOutstanding += outstandingAmount;
      existing.aging0to30 += aging0to30;
      existing.aging31to60 += aging31to60;
      existing.aging61to90 += aging61to90;
      existing.aging90plus += aging90plus;
    } else {
      vendorMap.set(vendorId, {
        vendorId,
        vendorName,
        totalBilled: amount,
        totalPaid: paidAmount,
        totalOutstanding: outstandingAmount,
        aging0to30,
        aging31to60,
        aging61to90,
        aging90plus,
      });
    }
  });

  return Array.from(vendorMap.values()).sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

// Fetch historical recorded payments
export async function listPayments(projectId?: string): Promise<PaymentRow[]> {
  if (!isLiveSupabase()) return [];

  const dbProjectId = projectId ? getDbSiteId(projectId) : null;
  let query = supabase
    .from('payments')
    .select('*, vendor_bills(bill_number, total_amount, vendors(display_name, legal_name))')
    .order('payment_date', { ascending: false });

  if (dbProjectId) {
    query = query.eq('project_id', dbProjectId);
  }

  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);

  return (data || []) as unknown as PaymentRow[];
}

// Record full payment transaction against an approved vendor bill
export async function recordVendorPayment(input: {
  billId: string;
  reference: string;
  amount: number;
  mode: string;
  date: string;
  remarks?: string;
}): Promise<MutationResult> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const { data: bill, error: billError } = await supabase
      .from('vendor_bills')
      .select('project_id, total_amount, status, payment_status')
      .eq('id', input.billId)
      .single();

    if (billError || !bill) {
      throw new Error(billError?.message || 'Vendor bill not found.');
    }

    if (bill.status !== 'approved') {
      throw new Error('Only approved bills can move to payment approval/paid.');
    }

    if (bill.payment_status === 'paid') {
      throw new Error('This vendor bill is already fully paid.');
    }

    const { data: user } = await supabase.auth.getUser();
    const userId = user.user?.id || null;

    // 1. Insert into payments ledger
    const { error: payError } = await supabase
      .from('payments')
      .insert({
        project_id: bill.project_id,
        vendor_bill_id: input.billId,
        payment_reference: input.reference,
        payment_date: input.date,
        amount: input.amount,
        status: 'paid',
        payment_mode: input.mode,
        remarks: input.remarks || null,
        created_by: userId,
        updated_by: userId,
      });

    if (payError) throw new Error(payError.message);

    // 2. Transition vendor_bill status and payment_status to 'paid'
    const { error: billUpdateError } = await supabase
      .from('vendor_bills')
      .update({
        payment_status: 'paid',
        status: 'paid',
        updated_by: userId,
      })
      .eq('id', input.billId);

    if (billUpdateError) throw new Error(billUpdateError.message);

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
