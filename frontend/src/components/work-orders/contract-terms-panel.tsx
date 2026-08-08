'use client';

// ============================================================================
// CONTRACT TERMS + PAYMENT STAGES
//
// The commercial clauses that decide money, entered once on the Work Order and
// inherited by every bill raised against it.
//
// Why this exists: across the 29 source Payment Certificates, retention is
// printed on all 149 sheets and valued on 7, TDS is nil on all 101 that mention
// it, and three different flat rates were billed against one contracted scope.
// Every one of those is a contract decision that was being re-typed — or not —
// on each bill.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, AlertTriangle, Plus, Trash2, Wand2 } from 'lucide-react';
import {
  CONTRACT_TYPE_LABELS,
  GST_TREATMENT_LABELS,
  PAYMENT_TERMS_LABELS,
  PLUMBING_STAGE_PRESET,
  generateStageLines,
  getWorkOrderTerms,
  listPaymentStages,
  savePaymentStages,
  saveWorkOrderTerms,
  type ContractType,
  type GstTreatment,
  type PaymentTermsType,
  type WoCommercialTerms,
} from '@/lib/wo-commercial-terms';
import type { WorkOrderPermissions } from '@/lib/work-order-permissions';
import { formatIndianCurrency } from '@/utils/format-currency';

type StageDraft = { key: string; stage_name: string; stage_percent: number };

const DEFAULTS = {
  gst_treatment: 'exclusive' as GstTreatment,
  gst_rate: 18,
  retention_percent: 0,
  retention_release_months: null as number | null,
  advance_percent: 0,
  advance_recovery_percent: 0,
  tds_percent: 0,
  payment_terms_type: 'on_completion' as PaymentTermsType,
  payment_days: null as number | null,
  delay_debit_per_day: 0,
  safety_warning_limit: 0,
  safety_debit_per_instance: 0,
  variation_tolerance_percent: 0,
  joint_measurement_required: false,
  contract_type: null as ContractType | null,
  wastage_included: true,
};

export function ContractTermsPanel({
  workOrderId,
  projectId,
  permissions,
  isDraft,
  onChanged,
}: {
  workOrderId: string;
  projectId: string;
  permissions: WorkOrderPermissions;
  /** Scope generation is a drafting act; a live contract changes by variation. */
  isDraft: boolean;
  onChanged: () => void;
}) {
  const [terms, setTerms] = useState(DEFAULTS);
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const canEdit = permissions.canCreateWorkOrder;

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        getWorkOrderTerms(workOrderId),
        listPaymentStages(workOrderId),
      ]);
      if (t) {
        setTerms({
          gst_treatment: t.gst_treatment,
          gst_rate: t.gst_rate,
          retention_percent: t.retention_percent,
          retention_release_months: t.retention_release_months,
          advance_percent: t.advance_percent,
          advance_recovery_percent: t.advance_recovery_percent,
          tds_percent: t.tds_percent,
          payment_terms_type: t.payment_terms_type,
          payment_days: t.payment_days,
          delay_debit_per_day: t.delay_debit_per_day,
          safety_warning_limit: t.safety_warning_limit,
          safety_debit_per_instance: t.safety_debit_per_instance,
          variation_tolerance_percent: t.variation_tolerance_percent,
          joint_measurement_required: t.joint_measurement_required,
          contract_type: t.contract_type,
          wastage_included: t.wastage_included,
        });
      }
      setStages(
        s.map((stage) => ({
          key: stage.id,
          stage_name: stage.stage_name,
          stage_percent: Number(stage.stage_percent),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load contract terms.');
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stageTotal = stages.reduce((sum, stage) => sum + (stage.stage_percent || 0), 0);
  const stagesValid = stages.length === 0 || Math.abs(stageTotal - 100) <= 0.1;

  function set<K extends keyof typeof DEFAULTS>(key: K, value: (typeof DEFAULTS)[K]) {
    setTerms((prev) => ({ ...prev, [key]: value }));
  }

  async function saveAll() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const t = await saveWorkOrderTerms({ workOrderId, projectId, ...terms });
    if (t.error) {
      setBusy(false);
      setError(t.error.message);
      return;
    }

    const s = await savePaymentStages(
      workOrderId,
      projectId,
      stages.map(({ stage_name, stage_percent }) => ({ stage_name, stage_percent })),
    );
    setBusy(false);
    if (s.error) setError(s.error.message);
    else {
      setNotice('Contract terms saved. New bills will inherit them.');
      void load();
      onChanged();
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await generateStageLines(workOrderId);
    setBusy(false);
    if (result.error) setError(result.error.message);
    else {
      setNotice(
        `${result.data!.linesCreated} stage lines generated. Contract value ${formatIndianCurrency(result.data!.contractValue)}.`,
      );
      onChanged();
    }
  }

  const field =
    'h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-primary';
  const num = `${field} text-right font-mono`;

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading flex items-center gap-2 text-base font-semibold">
          <FileText className="h-4 w-4 text-primary" /> Contract Terms
        </h2>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold hover:bg-muted"
        >
          {expanded ? 'Hide' : 'Show / Edit'}
        </button>
      </div>

      {/* Always-visible summary: the figures every bill will inherit. */}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Retention <strong className="text-foreground">{terms.retention_percent}%</strong>
          {terms.retention_release_months
            ? ` · released after ${terms.retention_release_months} months`
            : ''}
        </span>
        <span>
          GST <strong className="text-foreground">{GST_TREATMENT_LABELS[terms.gst_treatment]}</strong>
        </span>
        <span>
          TDS <strong className="text-foreground">{terms.tds_percent}%</strong>
        </span>
        <span>
          Measurement tolerance{' '}
          <strong className="text-foreground">{terms.variation_tolerance_percent}%</strong>
        </span>
        {stages.length > 0 && (
          <span>
            <strong className="text-foreground">{stages.length}</strong> payment stages
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          {notice}
        </div>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          <Group title="Tax">
            <Field label="GST treatment">
              <select
                disabled={!canEdit}
                value={terms.gst_treatment}
                onChange={(e) => set('gst_treatment', e.target.value as GstTreatment)}
                className={field}
              >
                {Object.entries(GST_TREATMENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="GST rate %">
              <input
                type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                value={terms.gst_rate}
                onChange={(e) => set('gst_rate', Number(e.target.value))}
                className={num}
              />
            </Field>
            <Field label="Contract type">
              <select
                disabled={!canEdit}
                value={terms.contract_type ?? ''}
                onChange={(e) => set('contract_type', (e.target.value || null) as ContractType | null)}
                className={field}
              >
                <option value="">—</option>
                {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </Group>

          <Group title="Retention & advance">
            <Field label="Retention %">
              <input
                type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                value={terms.retention_percent}
                onChange={(e) => set('retention_percent', Number(e.target.value))}
                className={num}
              />
            </Field>
            <Field label="Released after (months)" hint="Blank = released on close">
              <input
                type="number" min={0} disabled={!canEdit}
                value={terms.retention_release_months ?? ''}
                onChange={(e) =>
                  set('retention_release_months', e.target.value === '' ? null : Number(e.target.value))
                }
                className={num}
              />
            </Field>
            <Field label="Advance %">
              <input
                type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                value={terms.advance_percent}
                onChange={(e) => set('advance_percent', Number(e.target.value))}
                className={num}
              />
            </Field>
            <Field label="Advance recovery % per bill">
              <input
                type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                value={terms.advance_recovery_percent}
                onChange={(e) => set('advance_recovery_percent', Number(e.target.value))}
                className={num}
              />
            </Field>
            {/* Nil on all 101 certificate sheets that mention it. */}
            <Field label="TDS %" hint="Usually 0 — deducted at the vendor's end">
              <input
                type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                value={terms.tds_percent}
                onChange={(e) => set('tds_percent', Number(e.target.value))}
                className={num}
              />
            </Field>
          </Group>

          <Group title="Payment timing">
            <Field label="Payment terms">
              <select
                disabled={!canEdit}
                value={terms.payment_terms_type}
                onChange={(e) => set('payment_terms_type', e.target.value as PaymentTermsType)}
                className={field}
              >
                {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment days">
              <input
                type="number" min={0} disabled={!canEdit}
                value={terms.payment_days ?? ''}
                onChange={(e) =>
                  set('payment_days', e.target.value === '' ? null : Number(e.target.value))
                }
                className={num}
              />
            </Field>
          </Group>

          <Group title="Penalties & measurement">
            <Field label="Delay debit / day">
              <input
                type="number" min={0} step="0.01" disabled={!canEdit}
                value={terms.delay_debit_per_day}
                onChange={(e) => set('delay_debit_per_day', Number(e.target.value))}
                className={num}
              />
            </Field>
            <Field label="Safety warnings before debit">
              <input
                type="number" min={0} disabled={!canEdit}
                value={terms.safety_warning_limit}
                onChange={(e) => set('safety_warning_limit', Number(e.target.value))}
                className={num}
              />
            </Field>
            <Field label="Safety debit / instance">
              <input
                type="number" min={0} step="0.01" disabled={!canEdit}
                value={terms.safety_debit_per_instance}
                onChange={(e) => set('safety_debit_per_instance', Number(e.target.value))}
                className={num}
              />
            </Field>
            {/* The Louvers WO states "variation above 5% is not considered". */}
            <Field label="Measurement tolerance %" hint="Allowed before over-measurement is refused">
              <input
                type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                value={terms.variation_tolerance_percent}
                onChange={(e) => set('variation_tolerance_percent', Number(e.target.value))}
                className={num}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold text-muted-foreground">
              <input
                type="checkbox" disabled={!canEdit}
                checked={terms.joint_measurement_required}
                onChange={(e) => set('joint_measurement_required', e.target.checked)}
              />
              Joint measurement at final bill
            </label>
          </Group>

          {/* --- Payment stages ------------------------------------------- */}
          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold">Payment Stages (optional)</h3>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setStages(
                        PLUMBING_STAGE_PRESET.map((stage, i) => ({
                          key: `p${i}`,
                          ...stage,
                        })),
                      )
                    }
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
                  >
                    Plumbing preset
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setStages((prev) => [
                        ...prev,
                        { key: Math.random().toString(36).slice(2), stage_name: '', stage_percent: 0 },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> Add stage
                  </button>
                </div>
              )}
            </div>

            <p className="mt-1 text-[11px] text-muted-foreground">
              Only for contracts whose value is earned in stages — e.g. plumbing: Inlet 20%,
              Drainage 10%, Waterproofing 25%, External Vertical 20%, Terrace 10%, CP 7.5%,
              Sanitary 7.5%. Must total 100%.
            </p>

            {stages.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {stages.map((stage, index) => (
                  <div key={stage.key} className="flex items-center gap-2">
                    <span className="w-5 text-[11px] text-muted-foreground">{index + 1}</span>
                    <input
                      disabled={!canEdit}
                      value={stage.stage_name}
                      onChange={(e) =>
                        setStages((prev) =>
                          prev.map((s) => (s.key === stage.key ? { ...s, stage_name: e.target.value } : s)),
                        )
                      }
                      placeholder="Stage name"
                      className={`${field} flex-1`}
                    />
                    <input
                      type="number" min={0} max={100} step="0.01" disabled={!canEdit}
                      value={stage.stage_percent}
                      onChange={(e) =>
                        setStages((prev) =>
                          prev.map((s) =>
                            s.key === stage.key ? { ...s, stage_percent: Number(e.target.value) } : s,
                          ),
                        )
                      }
                      className={`${num} w-24`}
                    />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setStages((prev) => prev.filter((s) => s.key !== stage.key))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className={stagesValid ? 'text-muted-foreground' : 'font-bold text-red-600'}>
                    Total {stageTotal.toFixed(2)}% {stagesValid ? '' : '— must be 100%'}
                  </span>
                  {canEdit && isDraft && stages.length > 0 && stagesValid && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={generate}
                      title="Replaces each scope line with one line per stage, rate computed from the percentage"
                      className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      <Wand2 className="h-3 w-3" /> Generate stage lines
                    </button>
                  )}
                </div>

                {!isDraft && stages.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Line generation is a drafting action. A live contract&apos;s scope changes
                    through a variation.
                  </p>
                )}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy || !stagesValid}
                onClick={saveAll}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Contract Terms
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
