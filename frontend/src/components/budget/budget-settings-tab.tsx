'use client';

// ============================================================================
// PRAMUKH GROUP ERP V2 — BUDGET CONFIGURATION
// File: frontend/src/components/budget/budget-settings-tab.tsx
//
// What was wrong before:
//   * The entire config was a component default object. `onSaveConfig` was never
//     passed by the page, so "Save Configuration" showed
//     "configuration saved successfully!" and wrote nothing anywhere.
//   * There was no budget_config table to save into. One now exists, one row per
//     project, and these thresholds actually drive fn_check_budget_overrun_alert.
//   * The financial-year list was hardcoded to two options.
//   * `canManage` defaulted to true, so every role could edit thresholds.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Bell, Calendar, CheckCircle2, Loader2, LockKeyhole, Percent, Save, Shield } from 'lucide-react';
import type { BudgetConfig } from '@/lib/budget';
import { BudgetDataError, saveBudgetConfig } from '@/lib/supabase-budget';
import type { BudgetPermissions } from '@/lib/budget-permissions';
import { useBudgetData } from './budget-data-context';
import { BudgetAuthRequired, BudgetError, BudgetLoading } from './budget-states';

/** Financial years around the current one, so the list never goes stale. */
function financialYearOptions(): string[] {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [-1, 0, 1].map((offset) => {
    const from = startYear + offset;
    return `${from}-${String((from + 1) % 100).padStart(2, '0')}`;
  });
}

export default function BudgetSettingsTab({
  permissions,
  isPortfolio,
}: {
  permissions: BudgetPermissions;
  isPortfolio: boolean;
}) {
  const { projectId, projectName, config, loading, needsAuth, error, refresh } = useBudgetData();

  if (needsAuth) return <BudgetAuthRequired />;
  if (loading) return <BudgetLoading label="Loading budget configuration…" />;
  if (error) return <BudgetError message={error} onRetry={() => void refresh()} />;

  // Keyed on the project so switching projects remounts the form with that
  // project's persisted values as the initial state. Avoids mirroring props into
  // state with a synchronising effect.
  return (
    <ConfigForm
      key={projectId}
      projectId={projectId}
      projectName={projectName}
      persisted={config}
      permissions={permissions}
      isPortfolio={isPortfolio}
      onSaved={refresh}
    />
  );
}

function ConfigForm({
  projectId,
  projectName,
  persisted,
  permissions,
  isPortfolio,
  onSaved,
}: {
  projectId: string;
  projectName: string;
  persisted: BudgetConfig;
  permissions: BudgetPermissions;
  isPortfolio: boolean;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<BudgetConfig>(persisted);
  const [saved, setSaved] = useState<BudgetConfig>(persisted);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const config = saved;
  const canManage = permissions.canManageConfig && !isPortfolio;
  const fyOptions = useMemo(() => {
    const options = financialYearOptions();
    return options.includes(config.current_fy) ? options : [config.current_fy, ...options];
  }, [config.current_fy]);

  const validationError = useMemo(() => {
    const { caution_threshold_percent: c, warning_threshold_percent: w } = draft;
    const { critical_threshold_percent: cr, hard_limit_percent: h } = draft;
    if ([c, w, cr, h].some((v) => !Number.isFinite(v) || v < 0)) {
      return 'Thresholds must be non-negative numbers.';
    }
    if (!(c <= w && w <= cr && cr <= h)) {
      return 'Thresholds must ascend: caution ≤ warning ≤ critical ≤ hard limit.';
    }
    if (h > 500) return 'Hard limit cannot exceed 500%.';
    if (draft.default_retention_percent < 0 || draft.default_retention_percent > 100) {
      return 'Retention must be between 0 and 100%.';
    }
    if (draft.default_gst_percent < 0 || draft.default_gst_percent > 100) {
      return 'GST must be between 0 and 100%.';
    }
    return null;
  }, [draft]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(config),
    [draft, config],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await saveBudgetConfig(projectId, draft);
      setSaved(draft);
      await onSaved();
      setSavedMessage(`Configuration saved to Supabase for ${projectName}.`);
      setTimeout(() => setSavedMessage(null), 5000);
    } catch (err) {
      setSaveError(
        err instanceof BudgetDataError || err instanceof Error
          ? err.message
          : 'Unable to save budget configuration.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
      {isPortfolio && (
        <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">
          Budget configuration is per project. Select a specific project from the header to view and
          edit its thresholds.
        </p>
      )}

      {savedMessage && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> {savedMessage}
        </div>
      )}

      {saveError && <BudgetError message={saveError} />}

      {/* THRESHOLDS */}
      <fieldset
        disabled={!canManage}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm disabled:opacity-70"
      >
        <legend className="sr-only">Threshold alert settings</legend>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-semibold">4-Tier Threshold Alert Settings</h2>
        </div>
        <p className="text-[11px] font-medium text-muted-foreground">
          These drive <code className="font-mono">fn_check_budget_overrun_alert</code> in the
          database. Utilisation is (committed + spent) ÷ allocated per budget head.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PercentField
            label="🟡 Caution threshold"
            value={draft.caution_threshold_percent}
            onChange={(v) => setDraft({ ...draft, caution_threshold_percent: v })}
          />
          <PercentField
            label="🟠 Warning threshold"
            value={draft.warning_threshold_percent}
            onChange={(v) => setDraft({ ...draft, warning_threshold_percent: v })}
          />
          <PercentField
            label="🔴 Critical threshold"
            value={draft.critical_threshold_percent}
            onChange={(v) => setDraft({ ...draft, critical_threshold_percent: v })}
          />
          <PercentField
            label="🚨 Hard overrun limit"
            value={draft.hard_limit_percent}
            onChange={(v) => setDraft({ ...draft, hard_limit_percent: v })}
            max={500}
          />
        </div>
      </fieldset>

      {/* ENFORCEMENT */}
      <fieldset
        disabled={!canManage}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm disabled:opacity-70"
      >
        <legend className="sr-only">Over-budget enforcement</legend>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-semibold">Over-Budget Enforcement Mode</h2>
        </div>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name="enforcement"
              checked={draft.hard_limit_enforcement === 'block'}
              onChange={() => setDraft({ ...draft, hard_limit_enforcement: 'block' })}
              className="accent-primary"
            />
            <div>
              <p className="text-xs font-bold text-foreground">Hard block (strict control)</p>
              <p className="text-[11px] text-muted-foreground">
                Prevent PO/WO creation once the budget ceiling is reached, until Management
                overrides.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name="enforcement"
              checked={draft.hard_limit_enforcement === 'warn_only'}
              onChange={() => setDraft({ ...draft, hard_limit_enforcement: 'warn_only' })}
              className="accent-primary"
            />
            <div>
              <p className="text-xs font-bold text-foreground">Soft block with justification</p>
              <p className="text-[11px] text-muted-foreground">
                Show a prominent warning and require justification text, but allow PO creation.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-3 border-t border-border pt-3">
            <input
              type="checkbox"
              checked={draft.require_justification_over_budget}
              onChange={(e) =>
                setDraft({ ...draft, require_justification_over_budget: e.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-xs font-bold text-foreground">
                Require justification for any over-budget document
              </p>
              <p className="text-[11px] text-muted-foreground">
                Applies to purchase requisitions and purchase orders exceeding available budget.
              </p>
            </div>
          </label>
        </div>
      </fieldset>

      {/* BILLING DEFAULTS */}
      <fieldset
        disabled={!canManage}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm disabled:opacity-70"
      >
        <legend className="sr-only">Billing defaults</legend>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Percent className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-semibold">Billing Defaults</h2>
        </div>
        <p className="text-[11px] font-medium text-muted-foreground">
          Applied to new vendor bills. The Bill-Wise Ledger uses these to compute retention and net
          payable.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PercentField
            label="Default retention (%)"
            value={draft.default_retention_percent}
            onChange={(v) => setDraft({ ...draft, default_retention_percent: v })}
          />
          <PercentField
            label="Default GST (%)"
            value={draft.default_gst_percent}
            onChange={(v) => setDraft({ ...draft, default_gst_percent: v })}
          />
        </div>
      </fieldset>

      {/* FY & LOCK */}
      <fieldset
        disabled={!canManage}
        className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm disabled:opacity-70"
      >
        <legend className="sr-only">Financial year and budget lock</legend>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-semibold">Financial Year &amp; Budget Lock</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
            <span>Active financial year</span>
            <select
              value={draft.current_fy}
              onChange={(e) => setDraft({ ...draft, current_fy: e.target.value })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
            >
              {fyOptions.map((fy) => (
                <option key={fy} value={fy}>
                  {fy} (Apr {fy.slice(0, 4)} – Mar 20{fy.slice(-2)})
                </option>
              ))}
            </select>
          </label>

          <label className="flex cursor-pointer items-start gap-3 pt-5">
            <input
              type="checkbox"
              checked={draft.budget_lock_enabled}
              onChange={(e) => setDraft({ ...draft, budget_lock_enabled: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <LockKeyhole className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                Lock this project&apos;s budget
              </p>
              <p className="text-[11px] text-muted-foreground">
                Blocks baseline change orders, Excel imports and variance edits. Enforced in the
                database by <code className="font-mono">fn_assert_budget_unlocked</code>, so the API
                rejects writes too.
              </p>
            </div>
          </label>
        </div>
      </fieldset>

      {validationError && (
        <p role="alert" className="text-xs font-bold text-red-600">
          {validationError}
        </p>
      )}

      {canManage ? (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !isDirty || Boolean(validationError)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Saving…' : 'Save configuration'}
          </button>
          {isDirty && !saving && (
            <button
              type="button"
              onClick={() => setDraft(config)}
              className="h-10 rounded-lg border border-border bg-card px-4 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Reset
            </button>
          )}
        </div>
      ) : (
        <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-semibold text-muted-foreground">
          {isPortfolio
            ? 'Select a single project to edit its configuration.'
            : 'Your role has read-only access to budget configuration.'}
        </p>
      )}
    </form>
  );
}

function PercentField({
  label,
  value,
  onChange,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
      <span>{label}</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={max}
          step="0.5"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-8 text-sm font-semibold outline-none focus:ring-1 focus:ring-primary"
        />
        <span
          className="pointer-events-none absolute right-3 top-2.5 text-sm font-semibold text-muted-foreground"
          aria-hidden="true"
        >
          %
        </span>
      </div>
    </label>
  );
}
