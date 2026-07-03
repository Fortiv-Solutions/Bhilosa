'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import {
  erpUtilityNavigationItems,
  getNavigationItemsForRole,
  isNavigationItemActive,
} from '@/config/erp-navigation';
import { ROLE_LABELS } from '@/lib/rbac';
import { useAppStore } from '@/store/use-app-store';

export default function UtilityNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { activeRole, currentUser, theme, toggleTheme, logout } = useAppStore();
  const initials = currentUser.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SU';
  const utilityItems = getNavigationItemsForRole(erpUtilityNavigationItems, activeRole);

  return (
    <nav
      aria-label="Utility navigation"
      className="hidden w-fit self-end rounded-xl border border-border bg-card/90 p-1.5 shadow-sm backdrop-blur-xl lg:flex"
    >
      <div className="flex items-center gap-0.5">
        {utilityItems.map((item) => {
          const isActive = isNavigationItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex h-9 items-center gap-2 rounded-[10px] px-3 text-[12px] font-semibold transition-colors duration-200 ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <div className="mx-1.5 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={toggleTheme}
          className="grid h-9 w-9 place-items-center rounded-[10px] text-muted-foreground transition-colors duration-200 hover:bg-muted/80 hover:text-foreground"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="h-4 w-4" strokeWidth={1.8} /> : <Sun className="h-4 w-4" strokeWidth={1.8} />}
        </button>
        <div className="mx-1.5 h-5 w-px bg-border" />

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen((isOpen) => !isOpen)}
            className="flex h-9 items-center gap-2 rounded-[10px] px-1.5 pr-2 text-left transition-colors duration-200 hover:bg-muted/80"
            aria-label="Open profile menu"
            aria-expanded={isProfileOpen}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-extrabold font-heading select-none">
              {initials}
            </div>
            <span className="max-w-28 truncate text-[12px] font-semibold text-foreground">{currentUser.name}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border bg-popover p-2 shadow-premium">
              <div className="border-b border-border px-2.5 pb-2 pt-1">
                <p className="truncate text-sm font-semibold text-foreground">{currentUser.name}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{ROLE_LABELS[activeRole]}</p>
              </div>
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                Access is assigned by upper management and enforced by database policies.
              </div>
              <div className="mt-1.5 border-t border-border pt-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                    router.push('/login');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                    <LogOut className="h-3.5 w-3.5" />
                  </span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
