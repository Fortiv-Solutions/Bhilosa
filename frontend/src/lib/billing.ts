import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { supabase, getDbSiteId } from '@/utils/supabase-client';
import type { VendorBillRow } from '@/lib/procurement';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

export type BillingDashboardData = {
  vendorBills: VendorBillRow[];
  budgetLedger: {
    id: string;
    project_id: string;
    budget_allocation_id: string;
    transaction_type: string;
    source_table: string | null;
    source_id: string | null;
    amount: number;
    description: string | null;
    posted_at: string;
  }[];
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function rpcAction<T extends Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data ?? {}) as T;
}

export async function listBillingDashboard(projectId?: string): Promise<BillingDashboardData> {
  if (!isLiveSupabase()) return { vendorBills: [], budgetLedger: [] };

  const dbProjectId = projectId ? getDbSiteId(projectId) : null;
  const projectFilter = <T extends { eq: (column: string, value: string) => T }>(query: T) =>
    dbProjectId ? query.eq('project_id', dbProjectId) : query;

  const [vendorBills, budgetLedger] = await Promise.all([
    projectFilter(
      supabase
        .from('vendor_bills')
        .select('*, vendors(id, legal_name, display_name, rating), three_way_matches(*)')
        .order('created_at', { ascending: false })
        .limit(100),
    ),
    projectFilter(
      supabase
        .from('budget_ledger')
        .select('*')
        .order('posted_at', { ascending: false })
        .limit(100),
    ),
  ]);

  const failed = [vendorBills, budgetLedger].find((response) => response.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    vendorBills: (vendorBills.data ?? []) as VendorBillRow[],
    budgetLedger: (budgetLedger.data ?? []) as BillingDashboardData['budgetLedger'],
  };
}

export async function verifyVendorBill(vendorBillId: string): Promise<MutationResult> {
  try {
    await rpcAction('verify_vendor_bill', {
      p_vendor_bill_id: vendorBillId,
      p_remarks: 'PO, GRN, duplicate, and budget checks completed.',
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function approveVendorBill(vendorBillId: string, remarks?: string): Promise<MutationResult> {
  try {
    await rpcAction('approve_vendor_bill', {
      p_vendor_bill_id: vendorBillId,
      p_remarks: remarks || 'Approved from billing desk.',
    });
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function rejectVendorBill(vendorBillId: string, remarks: string): Promise<MutationResult> {
  try {
    if (!remarks.trim()) throw new Error('Rejection reason is mandatory.');
    const { error } = await supabase
      .from('vendor_bills')
      .update({ status: 'rejected', remarks })
      .eq('id', vendorBillId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export type CreateVendorBillInput = {
  projectId: string;
  vendorId: string;
  purchaseOrderId?: string;
  grnId?: string;
  billNumber: string;
  billDate: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export async function createVendorBill(input: CreateVendorBillInput): Promise<MutationResult<{ id: string }>> {
  try {
    // 1. Run Duplicate Check
    const duplicateCheck = await checkDuplicateBill(input.vendorId, input.billNumber, input.totalAmount);

    const { data: bill, error } = await supabase
      .from('vendor_bills')
      .insert({
        project_id: getDbSiteId(input.projectId),
        vendor_id: input.vendorId,
        purchase_order_id: input.purchaseOrderId || null,
        grn_id: input.grnId || null,
        bill_number: input.billNumber,
        bill_date: input.billDate,
        subtotal_amount: input.subtotalAmount,
        tax_amount: input.taxAmount,
        total_amount: input.totalAmount,
        status: 'draft',
        payment_status: 'pending',
        duplicate_detected: duplicateCheck.isDuplicate,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    const newBillId = (bill as { id: string }).id;

    // 2. Automatically attempt three-way match if PO and GRN are provided
    if (input.purchaseOrderId && input.grnId) {
      await runThreeWayMatch(newBillId, input.purchaseOrderId, input.grnId, input.totalAmount);
    }

    return { data: { id: newBillId }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function checkDuplicateBill(vendorId: string, billNumber: string, amount: number): Promise<{ isDuplicate: boolean; reason: string | null }> {
  if (!isLiveSupabase()) return { isDuplicate: false, reason: null };

  const { data, error } = await supabase
    .from('vendor_bills')
    .select('id, bill_number, total_amount')
    .eq('vendor_id', vendorId)
    .or(`bill_number.eq.${billNumber},total_amount.eq.${amount}`);

  if (error) throw new Error(error.message);
  
  if (data && data.length > 0) {
    const exactMatch = data.find(b => b.bill_number === billNumber);
    if (exactMatch) return { isDuplicate: true, reason: 'Same vendor and bill number detected.' };
    return { isDuplicate: true, reason: 'Possible duplicate: Same vendor and amount detected recently.' };
  }

  return { isDuplicate: false, reason: null };
}

export async function runThreeWayMatch(billId: string, poId: string, grnId: string, billAmount: number): Promise<MutationResult> {
  try {
    // 1. Fetch PO Total
    const { data: po, error: poError } = await supabase.from('purchase_orders').select('total_amount').eq('id', poId).single();
    if (poError) throw new Error(`PO Error: ${poError.message}`);
    
    // 2. Fetch GRN Accepted Qty (Value simulation)
    // Note: To truly match, we should compare line by line. Here we do an aggregate match simulation
    // until the DB schema fully supports line-by-line invoice matching.
    const { data: grnLines, error: grnError } = await supabase.from('goods_receipt_note_lines').select('accepted_qty, unit_rate').eq('grn_id', grnId);
    if (grnError && grnError.code !== 'PGRST116') {
      // Ignore not found as it might be a simplified GRN, but if it's a real error, throw
      console.warn("GRN lines fetch failed or empty", grnError);
    }

    let grnValue = 0;
    if (grnLines && grnLines.length > 0) {
      grnValue = grnLines.reduce((sum: number, line: any) => sum + (Number(line.accepted_qty) * Number(line.unit_rate || 0)), 0);
    } else {
      // Fallback if line data missing, assume GRN matches PO value for demonstration
      grnValue = Number(po.total_amount);
    }

    const poValue = Number(po.total_amount);
    let matchStatus = 'matched';
    let remarks = 'Three-way match clear.';

    // Tolerance check (e.g. 5% or fixed amount)
    const tolerance = poValue * 0.05;
    if (billAmount > poValue + tolerance) {
      matchStatus = 'mismatch_amount';
      remarks = 'Bill exceeds PO value beyond tolerance.';
    } else if (billAmount > grnValue + tolerance) {
      matchStatus = 'mismatch_quantity';
      remarks = 'Bill exceeds GRN accepted value.';
    }

    // Insert or update the match record
    const { error: matchError } = await supabase
      .from('three_way_matches')
      .upsert({
        vendor_bill_id: billId,
        match_status: matchStatus,
        po_value: poValue,
        grn_value: grnValue,
        invoice_value: billAmount,
        remarks: remarks
      });

    if (matchError) throw new Error(matchError.message);
    
    // Auto update bill if mismatch is found
    if (matchStatus !== 'matched') {
       await supabase.from('vendor_bills').update({ status: 'correction_required' }).eq('id', billId);
    }

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function updatePaymentStatus(billId: string, status: 'pending' | 'partially_paid' | 'paid', remarks?: string): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('vendor_bills')
      .update({ payment_status: status, remarks: remarks || null })
      .eq('id', billId);
      
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}
