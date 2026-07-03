'use client';

import { Database, Moon, ShieldCheck, Sliders, Sun } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/rbac';
import { useAppStore } from '@/store/use-app-store';

export default function SettingsPage() {
  const { activeRole, theme, toggleTheme } = useAppStore();

  return (
    <div className="space-y-6">
      <header>
        <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-primary dark:border-orange-900/40 dark:bg-orange-950/30">
          System Configuration
        </span>
        <h1 className="font-heading mt-2 text-2xl font-bold tracking-normal text-gray-900 dark:text-white sm:text-3xl">
          Masters & Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Maintain ERP masters, system preferences, and organization-wide configuration.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900 lg:col-span-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-base font-semibold text-gray-900 dark:text-white">Access Model</h3>
          </div>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            The system now uses two production roles. Role switching is disabled in the UI; upper management assigns access from Users & Roles.
          </p>
          <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
            <div className="rounded-2xl border border-primary/20 bg-orange-50/20 p-4 dark:bg-orange-950/10">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{ROLE_LABELS.UPPER_MANAGEMENT}</p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Full system access</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">All modules, settings, users, reports, approvals, and overrides.</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-850 dark:bg-gray-950">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{ROLE_LABELS.PR_TEAM}</p>
              <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">Procurement access</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Dashboard, procurement, vendors, inventory context, documents, notifications, and reports.</p>
            </div>
          </div>
          <p className="rounded-2xl bg-muted p-3 text-xs font-semibold text-muted-foreground">
            Current session role: <span className="text-primary">{ROLE_LABELS[activeRole]}</span>
          </p>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-base font-semibold text-gray-900 dark:text-white">UI Preferences</h3>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-gray-800 dark:text-gray-200">Dark Mode Support</p>
              <p className="mt-0.5 text-xs text-gray-400">Toggle interface dark palette</p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-gray-500 transition-colors hover:text-gray-850 dark:border-gray-850 dark:bg-gray-950"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          <h3 className="font-heading text-base font-semibold text-gray-900 dark:text-white">Master Data</h3>
        </div>
        <p className="mt-1 text-xs text-gray-400">Core records shared by procurement, inventory, work orders, and finance.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {['Vendor Master', 'Material Master', 'Contractor Master', 'Agency Master', 'Region Master', 'Unit Master'].map((master) => (
            <button
              key={master}
              type="button"
              className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-4 text-left text-xs font-bold text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 dark:hover:border-orange-900/40 dark:hover:bg-orange-950/20"
            >
              {master}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
