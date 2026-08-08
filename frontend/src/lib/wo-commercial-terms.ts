// ============================================================================
// PRAMUKH GROUP ERP V2 — WORK ORDER COMMERCIAL TERMS & PAYMENT STAGES
// File: frontend/src/lib/wo-commercial-terms.ts
//
// The contract layer. Every clause here changes MONEY, and the Service Bill
// INHERITS them rather than asking the biller to re-type them.
//
// Grounded in the 13 Work Orders and 29 Payment Certificates:
//   * Retention is printed on all 149 certificate sheets and valued on 7 — it
//     is a contract decision, not a per-bill entry.
//   * TDS is nil on all 101 sheets that mention it ("deducted at your end").
//   * GST is three-state; a boolean could not express "Tax as applicable".
//   * The Louvers Work Order permits 5% measurement variation; most permit 0.
//
// Obligations that do not change money (BOCW, PF, labour insurance,
// scaffolding, PIS, guarantee certificates) stay in the terms text and on the
// printed document — modelling all 26 clauses as fields would be noise.
// ============================================================================

import { supabase, getDbSiteId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

type MutationResult<T = unknown> = { data: T | null; error: Error | null };

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function asDbError(error: { message?: string; code?: string; hint?: string | null } | null): Error {
  if (!error) return new Error('Unknown database error.');
  const message = error.message || 'The database rejected this change.';
  if (error.hint && (error.code === '22023' || error.code === '23514' || error.code === '42501')) {
    return new Error(`${message} ${error.hint}`);
  }
  return new Error(message);
}

export type GstTreatment = 'inclusive' | 'exclusive' | 'not_applicable';
export type PaymentTermsType =
  | 'on_completion'
  | 'days_after_bill'
  | 'monthly_ra'
  | 'advance_and_completion';
export type ContractType =
  | 'labour_only'
  | 'labour_with_material'
  | 'supply_only'
  | 'supply_and_install';

export type WoCommercialTerms = {
  work_order_id: string;
  project_id: string;
  gst_treatment: GstTreatment;
  gst_rate: number;
  retention_percent: number;
  retention_release_months: number | null;
  advance_percent: number;
  advance_recovery_percent: number;
  tds_percent: number;
  payment_terms_type: PaymentTermsType;
  payment_days: number | null;
  billing_window_days: number[];
  delay_debit_per_day: number;
  safety_warning_limit: number;
  safety_debit_per_instance: number;
  variation_tolerance_percent: number;
  joint_measurement_required: boolean;
  ra_requires_full_activity: boolean;
  contract_type: ContractType | null;
  wastage_included: boolean;
  notes: string | null;
};

/** Wording taken from the source documents, so the form reads like the contract. */
export const GST_TREATMENT_LABELS: Record<GstTreatment, string> = {
  inclusive: 'GST included in the rates',
  exclusive: 'GST extra as applicable',
  not_applicable: 'No GST / not applicable',
};

export const PAYMENT_TERMS_LABELS: Record<PaymentTermsType, string> = {
  on_completion: '100% after work completion',
  days_after_bill: 'N days after bill / RA receipt',
  monthly_ra: 'Monthly, on RA bill submission',
  advance_and_completion: 'Advance + balance on completion',
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  labour_only: 'Labour only',
  labour_with_material: 'Labour with material',
  supply_only: 'Supply only',
  supply_and_install: 'Supply and install',
};

const TERMS_SELECT = '*';

/**
 * Terms for a Work Order. Falls back to fn_wo_terms' conservative defaults when
 * no row exists, so callers never branch on null.
 */
export async function getWorkOrderTerms(workOrderId: string): Promise<WoCommercialTerms | null> {
  if (!isLiveSupabase() || !workOrderId) return null;

  const { data, error } = await supabase
    .from('wo_commercial_terms')
    .select(TERMS_SELECT)
    .eq('work_order_id', workOrderId)
    .maybeSingle();

  if (error) throw asDbError(error);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    work_order_id: row.work_order_id as string,
    project_id: row.project_id as string,
    gst_treatment: (row.gst_treatment as GstTreatment) ?? 'exclusive',
    gst_rate: Number(row.gst_rate ?? 18),
    retention_percent: Number(row.retention_percent ?? 0),
    retention_release_months:
      row.retention_release_months == null ? null : Number(row.retention_release_months),
    advance_percent: Number(row.advance_percent ?? 0),
    advance_recovery_percent: Number(row.advance_recovery_percent ?? 0),
    tds_percent: Number(row.tds_percent ?? 0),
    payment_terms_type: (row.payment_terms_type as PaymentTermsType) ?? 'on_completion',
    payment_days: row.payment_days == null ? null : Number(row.payment_days),
    billing_window_days: (row.billing_window_days as number[]) ?? [],
    delay_debit_per_day: Number(row.delay_debit_per_day ?? 0),
    safety_warning_limit: Number(row.safety_warning_limit ?? 0),
    safety_debit_per_instance: Number(row.safety_debit_per_instance ?? 0),
    variation_tolerance_percent: Number(row.variation_tolerance_percent ?? 0),
    joint_measurement_required: Boolean(row.joint_measurement_required),
    ra_requires_full_activity: Boolean(row.ra_requires_full_activity),
    contract_type: (row.contract_type as ContractType) ?? null,
    wastage_included: Boolean(row.wastage_included),
    notes: (row.notes as string) ?? null,
  };
}

export type SaveTermsInput = Partial<Omit<WoCommercialTerms, 'work_order_id' | 'project_id'>> & {
  workOrderId: string;
  projectId: string;
};

/**
 * Insert or update the terms. A trigger keeps work_orders.tax_inclusive in step
 * with gst_treatment, because the Phase 2 drawdown arithmetic reads the boolean
 * directly and the two must never disagree.
 */
export async function saveWorkOrderTerms(input: SaveTermsInput): Promise<MutationResult> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');
    if (!input.workOrderId) throw new Error('No Work Order selected.');

    const payload: Record<string, unknown> = {
      work_order_id: input.workOrderId,
      project_id: getDbSiteId(input.projectId),
    };
    const map: Record<string, string> = {
      gst_treatment: 'gst_treatment',
      gst_rate: 'gst_rate',
      retention_percent: 'retention_percent',
      retention_release_months: 'retention_release_months',
      advance_percent: 'advance_percent',
      advance_recovery_percent: 'advance_recovery_percent',
      tds_percent: 'tds_percent',
      payment_terms_type: 'payment_terms_type',
      payment_days: 'payment_days',
      billing_window_days: 'billing_window_days',
      delay_debit_per_day: 'delay_debit_per_day',
      safety_warning_limit: 'safety_warning_limit',
      safety_debit_per_instance: 'safety_debit_per_instance',
      variation_tolerance_percent: 'variation_tolerance_percent',
      joint_measurement_required: 'joint_measurement_required',
      ra_requires_full_activity: 'ra_requires_full_activity',
      contract_type: 'contract_type',
      wastage_included: 'wastage_included',
      notes: 'notes',
    };
    for (const [key, column] of Object.entries(map)) {
      const value = (input as Record<string, unknown>)[key];
      if (value !== undefined) payload[column] = value;
    }

    const { error } = await supabase
      .from('wo_commercial_terms')
      .upsert(payload, { onConflict: 'work_order_id' });

    if (error) throw asDbError(error);
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Payment stages
// ---------------------------------------------------------------------------

export type PaymentStageRow = {
  id: string;
  work_order_id: string;
  sequence_no: number;
  stage_name: string;
  stage_percent: number;
};

/**
 * The plumbing Work Orders' seven stages. Real on 2 of the 13 source documents;
 * the other five "Payment Stages" headings are boilerplate with no percentages,
 * which is why decomposition is opt-in.
 */
export const PLUMBING_STAGE_PRESET: { stage_name: string; stage_percent: number }[] = [
  { stage_name: 'Inlet Fitting Work', stage_percent: 20 },
  { stage_name: 'Internal Drainage Line Work', stage_percent: 10 },
  { stage_name: 'Water Proofing Work', stage_percent: 25 },
  { stage_name: 'External Vertical Line Work', stage_percent: 20 },
  { stage_name: 'Terrace Looping Work', stage_percent: 10 },
  { stage_name: 'CP Fitting Work', stage_percent: 7.5 },
  { stage_name: 'Sanitary Fitting Work', stage_percent: 7.5 },
];

export async function listPaymentStages(workOrderId: string): Promise<PaymentStageRow[]> {
  if (!isLiveSupabase() || !workOrderId) return [];

  const { data, error } = await supabase
    .from('wo_payment_stages')
    .select('id, work_order_id, sequence_no, stage_name, stage_percent')
    .eq('work_order_id', workOrderId)
    .order('sequence_no', { ascending: true });

  if (error) throw asDbError(error);
  return (data ?? []) as unknown as PaymentStageRow[];
}

/**
 * Replace the stage set in one transaction-like sequence. The database asserts
 * the percentages sum to 100 at statement end (a deferred constraint trigger),
 * so an intermediate state during the rewrite is fine.
 */
export async function savePaymentStages(
  workOrderId: string,
  projectId: string,
  stages: { stage_name: string; stage_percent: number }[],
): Promise<MutationResult> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');

    const clean = stages
      .map((stage) => ({
        stage_name: stage.stage_name.trim(),
        stage_percent: Number(stage.stage_percent) || 0,
      }))
      .filter((stage) => stage.stage_name && stage.stage_percent > 0);

    if (clean.length > 0) {
      const total = clean.reduce((sum, stage) => sum + stage.stage_percent, 0);
      if (Math.abs(total - 100) > 0.1) {
        throw new Error(
          `Payment stages sum to ${total.toFixed(2)}%, not 100%. They must reconcile to the contract value.`,
        );
      }
    }

    const { error: delError } = await supabase
      .from('wo_payment_stages')
      .delete()
      .eq('work_order_id', workOrderId);
    if (delError) throw asDbError(delError);

    if (clean.length === 0) return { data: null, error: null };

    const { error } = await supabase.from('wo_payment_stages').insert(
      clean.map((stage, index) => ({
        work_order_id: workOrderId,
        project_id: getDbSiteId(projectId),
        sequence_no: index + 1,
        stage_name: stage.stage_name,
        stage_percent: stage.stage_percent,
      })),
    );
    if (error) throw asDbError(error);

    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

/**
 * Decompose each base scope line into one line per stage, with the stage rate
 * COMPUTED (Rs 33,500 x 20% = Rs 6,700) rather than typed. Draft only — a live
 * contract changes through a variation.
 */
export async function generateStageLines(
  workOrderId: string,
): Promise<MutationResult<{ linesCreated: number; contractValue: number }>> {
  try {
    if (!isLiveSupabase()) throw new Error('Supabase is not configured.');

    const { data, error } = await supabase.rpc('rpc_generate_wo_stage_lines', {
      p_work_order_id: workOrderId,
    });
    if (error) throw asDbError(error);

    const row = (data ?? {}) as Record<string, unknown>;
    return {
      data: {
        linesCreated: Number(row.lines_created || 0),
        contractValue: Number(row.contract_value || 0),
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error: asError(error) };
  }
}

// ---------------------------------------------------------------------------
// Bill defaults
// ---------------------------------------------------------------------------

export type ServiceBillDefaults = {
  retentionPercent: number;
  retentionReleaseMonths: number | null;
  tdsPercent: number;
  gstTreatment: GstTreatment;
  gstRate: number;
  taxInclusive: boolean;
  advanceRecoveryPercent: number;
  delayDebitPerDay: number;
  safetyDebitPerInstance: number;
  variationTolerancePercent: number;
  jointMeasurementRequired: boolean;
  paymentTermsType: PaymentTermsType;
  paymentDays: number | null;
  billingWindowDays: number[];
  contractType: ContractType | null;
  hasStages: boolean;
};

/**
 * What a new bill inherits from its Work Order. Replaces asking the biller for
 * retention, TDS and GST — the certificates show those are contract decisions.
 */
export async function getServiceBillDefaults(
  workOrderId: string,
): Promise<ServiceBillDefaults | null> {
  if (!isLiveSupabase() || !workOrderId) return null;

  const { data, error } = await supabase.rpc('rpc_service_bill_defaults', {
    p_work_order_id: workOrderId,
  });
  if (error) throw asDbError(error);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    retentionPercent: Number(row.retention_percent || 0),
    retentionReleaseMonths:
      row.retention_release_months == null ? null : Number(row.retention_release_months),
    tdsPercent: Number(row.tds_percent || 0),
    gstTreatment: (row.gst_treatment as GstTreatment) ?? 'exclusive',
    gstRate: Number(row.gst_rate || 0),
    taxInclusive: Boolean(row.tax_inclusive),
    advanceRecoveryPercent: Number(row.advance_recovery_percent || 0),
    delayDebitPerDay: Number(row.delay_debit_per_day || 0),
    safetyDebitPerInstance: Number(row.safety_debit_per_instance || 0),
    variationTolerancePercent: Number(row.variation_tolerance_percent || 0),
    jointMeasurementRequired: Boolean(row.joint_measurement_required),
    paymentTermsType: (row.payment_terms_type as PaymentTermsType) ?? 'on_completion',
    paymentDays: row.payment_days == null ? null : Number(row.payment_days),
    billingWindowDays: (row.billing_window_days as number[]) ?? [],
    contractType: (row.contract_type as ContractType) ?? null,
    hasStages: Boolean(row.has_stages),
  };
}
