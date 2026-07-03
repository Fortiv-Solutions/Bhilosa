import { supabase, getDbSiteId, isSupabaseConfigured } from '@/utils/supabase-client';
import type { BOQItem, DailyActivity, ProcurementReq } from '@/utils/mock-data';

type MutationResult<T = unknown> = {
  data: T | null;
  error: Error | null;
};

type TableRow = Record<string, unknown>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLiveSupabase(): boolean {
  return isSupabaseConfigured;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function makeSequence(prefix: string): string {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${ymd}-${date.getTime().toString().slice(-6)}`;
}

async function currentProfileId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function maybeDefaultProjectSite(projectId: string): Promise<string | null> {
  const dbProjectId = getDbSiteId(projectId);
  const { data } = await supabase
    .from('project_sites')
    .select('id')
    .eq('project_id', dbProjectId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function findOrCreateVendor(name?: string | null): Promise<string | null> {
  const vendorName = name?.trim() || 'Unassigned Vendor';
  const duplicateKey = vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned-vendor';

  const { data: existing } = await supabase
    .from('vendors')
    .select('id')
    .or(`duplicate_key.eq.${duplicateKey},legal_name.eq.${vendorName},display_name.eq.${vendorName}`)
    .limit(1)
    .maybeSingle();

  if ((existing as { id?: string } | null)?.id) {
    return (existing as { id: string }).id;
  }

  const profileId = await currentProfileId();
  const vendorCode = `V-${duplicateKey.slice(0, 24).toUpperCase()}-${Date.now().toString().slice(-4)}`;
  const { data, error } = await supabase
    .from('vendors')
    .insert({
      vendor_code: vendorCode,
      legal_name: vendorName,
      display_name: vendorName,
      duplicate_key: duplicateKey,
      compliance_status: 'pending',
      created_by: profileId,
      updated_by: profileId,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

async function createModuleNotification(input: {
  projectId: string;
  title: string;
  message: string;
  notificationType: string;
  entityTable?: string;
  entityId?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}) {
  const recipientId = await currentProfileId();
  if (!recipientId) return;

  await supabase.from('notifications').insert({
    project_id: getDbSiteId(input.projectId),
    recipient_id: recipientId,
    title: input.title,
    message: input.message,
    notification_type: input.notificationType,
    priority: input.priority ?? 'medium',
    entity_table: input.entityTable,
    entity_id: input.entityId,
    created_by: recipientId,
    updated_by: recipientId,
  });
}

export async function createDailyProgressReport(
  projectId: string,
  activity: Omit<DailyActivity, 'id' | 'date'>
): Promise<MutationResult<{ dprId: string }>> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const profileId = await currentProfileId();
    const dbProjectId = getDbSiteId(projectId);
    const siteId = await maybeDefaultProjectSite(projectId);
    const reportDate = today();
    const reportNo = makeSequence('DPR');

    const { data, error } = await supabase
      .from('daily_progress_reports')
      .insert({
        project_id: dbProjectId,
        site_id: siteId,
        report_no: reportNo,
        report_date: reportDate,
        weather: activity.weather,
        activities_completed: activity.workCompleted,
        delays: activity.issues,
        delay_reason: activity.risks,
        engineer_remarks: `Progress delta: ${activity.progressDelta}%. Engineer: ${activity.engineerName}.`,
        submitted_by: profileId,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    const dprId = (data as { id: string }).id;

    await supabase.from('dpr_activity_lines').insert({
      dpr_id: dprId,
      project_id: dbProjectId,
      completed_work: activity.workCompleted,
      delay_reason: activity.issues ?? activity.risks,
      remarks: activity.risks,
      created_by: profileId,
      updated_by: profileId,
    });

    await createModuleNotification({
      projectId,
      title: 'DPR Submitted',
      message: `${activity.engineerName} submitted ${reportNo}.`,
      notificationType: 'dpr_submitted',
      entityTable: 'daily_progress_reports',
      entityId: dprId,
    });

    return { data: { dprId }, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createProcurementWorkflowRequest(
  projectId: string,
  req: Omit<ProcurementReq, 'id' | 'requisitionNo' | 'requestedDate'>
): Promise<MutationResult<{ materialRequestId: string; purchaseRequisitionId: string }>> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const profileId = await currentProfileId();
    const dbProjectId = getDbSiteId(projectId);
    const siteId = await maybeDefaultProjectSite(projectId);
    const requiredDate = req.deliveryDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const mrNumber = makeSequence('MR');
    const prNumber = makeSequence('PR');

    const { data: mr, error: mrError } = await supabase
      .from('material_requests')
      .insert({
        project_id: dbProjectId,
        site_id: siteId,
        mr_number: mrNumber,
        justification: req.title,
        required_date: requiredDate,
        priority: 'medium',
        status: 'submitted',
        raised_by: profileId,
        submitted_at: new Date().toISOString(),
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();

    if (mrError) throw new Error(mrError.message);
    const materialRequestId = (mr as { id: string }).id;

    const { data: pr, error: prError } = await supabase
      .from('purchase_requisitions')
      .insert({
        project_id: dbProjectId,
        site_id: siteId,
        material_request_id: materialRequestId,
        pr_number: prNumber,
        title: req.title,
        estimated_cost: req.cost,
        finance_required: req.cost >= 500000,
        status: req.status === 'DRAFT' ? 'draft' : 'submitted',
        requested_date: today(),
        required_date: requiredDate,
        assigned_team_notes: req.vendorName ? `Suggested vendor: ${req.vendorName}` : null,
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();

    if (prError) throw new Error(prError.message);
    const purchaseRequisitionId = (pr as { id: string }).id;

    await createModuleNotification({
      projectId,
      title: 'Purchase Requisition Created',
      message: `${prNumber} was created for ${req.title}.`,
      notificationType: 'purchase_requisition_created',
      entityTable: 'purchase_requisitions',
      entityId: purchaseRequisitionId,
      priority: req.cost >= 500000 ? 'high' : 'medium',
    });

    return { data: { materialRequestId, purchaseRequisitionId }, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createBoqRecord(projectId: string, item: Omit<BOQItem, 'id' | 'approved' | 'consumedQty'>) {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const profileId = await currentProfileId();
    const { data, error } = await supabase
      .from('boq_items')
      .insert({
        project_id: getDbSiteId(projectId),
        code: item.code,
        description: item.description,
        unit: item.unit,
        rate: item.rate,
        estimated_qty: item.estimatedQty,
        consumed_qty: 0,
        approved: false,
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createQcInspection(projectId: string, title: string): Promise<MutationResult<{ inspectionId: string }>> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const profileId = await currentProfileId();
    const dbProjectId = getDbSiteId(projectId);
    const inspectionNumber = makeSequence('QC');
    const { data, error } = await supabase
      .from('qc_inspections')
      .insert({
        project_id: dbProjectId,
        site_id: await maybeDefaultProjectSite(projectId),
        inspection_number: inspectionNumber,
        inspection_date: today(),
        status: 'pending',
        remarks: title,
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    const inspectionId = (data as { id: string }).id;

    await supabase.from('qc_inspection_items').insert({
      inspection_id: inspectionId,
      project_id: dbProjectId,
      description: title,
      result: 'pending',
      created_by: profileId,
      updated_by: profileId,
    });

    await createModuleNotification({
      projectId,
      title: 'QC Inspection Created',
      message: `${inspectionNumber}: ${title}`,
      notificationType: 'qc_inspection_created',
      entityTable: 'qc_inspections',
      entityId: inspectionId,
    });

    return { data: { inspectionId }, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function createVendorBill(projectId: string, amount: number, description: string): Promise<MutationResult<{ billId: string }>> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const profileId = await currentProfileId();
    const vendorId = await findOrCreateVendor('Unassigned Vendor');
    if (!vendorId) throw new Error('Unable to resolve vendor');

    const dbProjectId = getDbSiteId(projectId);
    const billNumber = makeSequence('BILL');
    const { data, error } = await supabase
      .from('vendor_bills')
      .insert({
        project_id: dbProjectId,
        site_id: await maybeDefaultProjectSite(projectId),
        vendor_id: vendorId,
        bill_number: billNumber,
        bill_date: today(),
        subtotal_amount: amount,
        tax_amount: 0,
        total_amount: amount,
        required_documents_received: false,
        work_completion_verified: false,
        qc_approval_verified: false,
        status: 'draft',
        created_by: profileId,
        updated_by: profileId,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    const billId = (data as { id: string }).id;

    await supabase.from('vendor_bill_lines').insert({
      vendor_bill_id: billId,
      project_id: dbProjectId,
      description,
      quantity: 1,
      rate: amount,
      line_total: amount,
      created_by: profileId,
      updated_by: profileId,
    });

    await createModuleNotification({
      projectId,
      title: 'Vendor Bill Drafted',
      message: `${billNumber} for Rs. ${amount.toLocaleString('en-IN')} requires verification.`,
      notificationType: 'vendor_bill_created',
      entityTable: 'vendor_bills',
      entityId: billId,
      priority: amount >= 500000 ? 'high' : 'medium',
    });

    return { data: { billId }, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function addProjectMemberByName(projectId: string, name: string, role: string): Promise<MutationResult> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const profileId = await currentProfileId();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('name', name)
      .limit(1)
      .maybeSingle();

    const userId = (profile as { id?: string } | null)?.id;
    if (!userId || !uuidPattern.test(userId)) {
      throw new Error(`No Supabase profile found for ${name}`);
    }

    const { error } = await supabase.from('project_members').upsert(
      {
        project_id: getDbSiteId(projectId),
        user_id: userId,
        project_role: role,
        is_active: true,
        created_by: profileId,
        updated_by: profileId,
      },
      { onConflict: 'project_id,user_id' }
    );

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function recordNormalizedMaterialTransaction(input: {
  projectId: string;
  materialId: string;
  type: 'INWARD' | 'OUTWARD';
  quantity: number;
  cost: number;
  referenceNo: string;
}): Promise<MutationResult> {
  if (!isLiveSupabase()) return { data: null, error: null };

  try {
    const { data: material } = await supabase
      .from('materials')
      .select('project_id, site_id, location_id, item_master_id')
      .eq('id', input.materialId)
      .maybeSingle();

    const row = material as TableRow | null;
    if (!row?.item_master_id) return { data: null, error: null };

    const profileId = await currentProfileId();
    const rate = input.quantity > 0 ? input.cost / input.quantity : 0;
    const transactionType = input.type === 'INWARD' ? 'receipt' : 'issue';

    const { error } = await supabase.from('stock_ledger').insert({
      project_id: row.project_id ?? getDbSiteId(input.projectId),
      site_id: row.site_id ?? null,
      location_id: row.location_id ?? null,
      item_id: row.item_master_id,
      transaction_type: transactionType,
      quantity: input.quantity,
      rate,
      amount: input.cost,
      source_table: 'material_transactions',
      reference_no: input.referenceNo,
      transaction_date: today(),
      created_by: profileId,
    });

    if (error) throw new Error(error.message);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}
