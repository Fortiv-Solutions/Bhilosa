'use client';

import React, { useState } from 'react';
import { Settings, Shield, Bell, Calendar, Lock, CheckCircle2 } from 'lucide-react';
import type { BudgetConfig } from '@/lib/budget';

interface BudgetSettingsTabProps {
  config?: BudgetConfig;
  onSaveConfig?: (config: BudgetConfig) => void;
  canManage?: boolean;
}

export default function BudgetSettingsTab({
  config: initialConfig = {
    caution_threshold_percent: 50,
    warning_threshold_percent: 75,
    critical_threshold_percent: 90,
    hard_limit_percent: 100,
    hard_limit_enforcement: 'block',
    require_justification_over_budget: true,
    current_fy: '2025-26',
    budget_lock_enabled: false,
  },
  onSaveConfig,
  canManage = true,
}: BudgetSettingsTabProps) {
  const [config, setConfig] = useState<BudgetConfig>(initialConfig);
  const [savedMessage, setSavedMessage] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (onSaveConfig) onSaveConfig(config);
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  }

  return (
    <form onSubmit={handleSave} className="max-w-4xl space-y-6">
      {savedMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Budget module configuration saved successfully!
        </div>
      )}

      {/* Threshold Alert Configuration */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">4-Tier Threshold Alert Settings</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
            <span>🟡 Caution Threshold (%)</span>
            <input
              type="number"
              value={config.caution_threshold_percent}
              onChange={(e) => setConfig({ ...config, caution_threshold_percent: Number(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
              disabled={!canManage}
            />
          </label>

          <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
            <span>🟠 Warning Threshold (%)</span>
            <input
              type="number"
              value={config.warning_threshold_percent}
              onChange={(e) => setConfig({ ...config, warning_threshold_percent: Number(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
              disabled={!canManage}
            />
          </label>

          <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
            <span>🔴 Critical Threshold (%)</span>
            <input
              type="number"
              value={config.critical_threshold_percent}
              onChange={(e) => setConfig({ ...config, critical_threshold_percent: Number(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
              disabled={!canManage}
            />
          </label>

          <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
            <span>🚨 Hard Overrun Limit (%)</span>
            <input
              type="number"
              value={config.hard_limit_percent}
              onChange={(e) => setConfig({ ...config, hard_limit_percent: Number(e.target.value) })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
              disabled={!canManage}
            />
          </label>
        </div>
      </div>

      {/* Enforcement & Over-Budget Control */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Over-Budget Enforcement Mode</h2>
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="enforcement"
              checked={config.hard_limit_enforcement === 'block'}
              onChange={() => setConfig({ ...config, hard_limit_enforcement: 'block' })}
              className="accent-primary"
              disabled={!canManage}
            />
            <div>
              <p className="text-xs font-bold text-foreground">Hard Block (Strict Control)</p>
              <p className="text-[11px] text-muted-foreground">Completely prevent PO/WO creation when budget ceiling is reached until Management overrides.</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="enforcement"
              checked={config.hard_limit_enforcement === 'warn_only'}
              onChange={() => setConfig({ ...config, hard_limit_enforcement: 'warn_only' })}
              className="accent-primary"
              disabled={!canManage}
            />
            <div>
              <p className="text-xs font-bold text-foreground">Soft Block with Justification</p>
              <p className="text-[11px] text-muted-foreground">Show prominent warning and mandate justification text, but allow PO creation.</p>
            </div>
          </label>
        </div>
      </div>

      {/* Financial Year & Lock Settings */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-base font-semibold">Financial Year & Budget Locks</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1 text-xs font-bold uppercase text-muted-foreground">
            <span>Active Financial Year</span>
            <select
              value={config.current_fy}
              onChange={(e) => setConfig({ ...config, current_fy: e.target.value })}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold outline-none"
              disabled={!canManage}
            >
              <option value="2025-26">2025-26 (Apr 2025 - Mar 2026)</option>
              <option value="2026-27">2026-27 (Apr 2026 - Mar 2027)</option>
            </select>
          </label>

          <label className="flex items-center gap-3 pt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.budget_lock_enabled}
              onChange={(e) => setConfig({ ...config, budget_lock_enabled: e.target.checked })}
              className="accent-primary h-4 w-4"
              disabled={!canManage}
            />
            <div>
              <p className="text-xs font-bold text-foreground">Lock Prior FY Allocations</p>
              <p className="text-[11px] text-muted-foreground">Prevent modifications to closed financial years.</p>
            </div>
          </label>
        </div>
      </div>

      {canManage && (
        <button
          type="submit"
          className="h-10 rounded-lg bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Save Configuration
        </button>
      )}
    </form>
  );
}
