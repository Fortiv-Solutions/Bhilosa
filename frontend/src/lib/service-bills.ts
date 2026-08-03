import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { supabase, getDbSiteId } from '@/utils/supabase-client';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

export type ServiceBillRow = {
  id: string;
  project_id: string;
  work_order_id: string | null;
  vendor_id: string | null;
  activity_id: string | null;
  qc_inspection_id: string | null;
  bill_number: string;
  bill_date: string;
  service_description: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  payment_status: string;
  remarks: string | null;
  created_at: string;
  vendors?: { id: string; legal_name: string | null; display_name: string | null } | null;
  work_orders?: { id: string; work_order_number: string | null; wo_status: string; remaining_balance: number } | null;
};

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export async function listServiceBills(projectId?: string): Promise<ServiceBillRow[]> {
  if (!isLiveSupabase()) return [];

  const dbProjectId = projectId ? getDbSiteId(projectId) : null;

  let query = supabase
    .from('service_bills')
    .select('*, vendors(id, legal_name, display_name), work_orders(id, work_order_number, wo_status, remaining_balance)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (dbProjectId) {
    query = query.eq('project_id', dbProjectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ServiceBillRow[];
}

export type CreateServiceBillInput = {
  projectId: string;
  vendorId: string;
  /** Mandatory: "No WO, no bill." The DB also enforces this (trg_service_bill_require_active_wo). */
  workOrderId: string;
  activityId?: string;
  qcInspectionId?: string;
  billNumber: string;
  billDate: string;
  serviceDescription?: string;
  subtotalAmount: number;
  taxAmount: number;
  totalAmount: number;
};

export async function createServiceBill(input: CreateServiceBillInput): Promise<MutationResult<{ id: string }>> {
  try {
    if (!input.workOrderId) {
      throw new Error('A Work Order must be selected before a bill can be raised (no WO, no bill).');
    }

    const { data, error } = await supabase
      .from('service_bills')
      .insert({
        project_id: getDbSiteId(input.projectId),
        vendor_id: input.vendorId,
        work_order_id: input.workOrderId,
        activity_id: input.activityId || null,
        qc_inspection_id: input.qcInspectionId || null,
        bill_number: input.billNumber,
        bill_date: input.billDate,
        service_description: input.serviceDescription || null,
        subtotal_amount: input.subtotalAmount,
        tax_amount: input.taxAmount,
        total_amount: input.totalAmount,
        status: 'submitted',
        payment_status: 'pending',
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return { data: { id: (data as { id: string }).id }, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function approveServiceBill(billId: string, remarks?: string): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('service_bills')
      .update({ status: 'approved', remarks: remarks || null })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function rejectServiceBill(billId: string, remarks: string): Promise<MutationResult> {
  try {
    if (!remarks.trim()) throw new Error('Rejection reason is mandatory.');
    const { error } = await supabase
      .from('service_bills')
      .update({ status: 'rejected', remarks })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

export async function updateServiceBillPaymentStatus(
  billId: string,
  status: 'pending' | 'partially_paid' | 'paid',
  remarks?: string,
): Promise<MutationResult> {
  try {
    const { error } = await supabase
      .from('service_bills')
      .update({ payment_status: status, remarks: remarks || null })
      .eq('id', billId);
    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/** Live remaining balance for a Work Order, for the create-bill form to show before submission. */
export async function getWorkOrderBalance(
  workOrderId: string,
): Promise<{ totalAmount: number; billedToDate: number; remainingBalance: number; woStatus: string } | null> {
  if (!isLiveSupabase()) return null;

  const { data, error } = await supabase
    .from('work_orders')
    .select('total_amount, billed_to_date, remaining_balance, wo_status')
    .eq('id', workOrderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    totalAmount: Number(data.total_amount || 0),
    billedToDate: Number(data.billed_to_date || 0),
    remainingBalance: Number(data.remaining_balance || 0),
    woStatus: data.wo_status,
  };
}
