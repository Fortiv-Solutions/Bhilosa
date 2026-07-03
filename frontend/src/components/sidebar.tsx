'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Moon, Sun, Phone } from 'lucide-react';
import {
  erpNavigationItems,
  erpUtilityNavigationItems,
  getNavigationItemsForRole,
  isNavigationItemActive,
} from '@/config/erp-navigation';
import { useAppStore } from '@/store/use-app-store';
import { ROLE_LABELS } from '@/lib/rbac';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { 
    activeRole,
    currentUser,
    theme,
    toggleTheme,
    logout,
    sidebarOpen,
    setSidebarOpen,
  } = useAppStore();

  const initials = currentUser.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SU';

  // Sidebar now remains visible globally to fix jarring layout shifts

  return (
    <aside className={`relative hidden lg:flex flex-col bg-card py-5 justify-between rounded-3xl shadow-sm border border-border flex-shrink-0 h-[calc(100vh-32px)] sticky top-4 transition-all duration-300 ${sidebarOpen ? 'w-64 px-0' : 'w-20 px-0 items-center'}`}>
      
      {/* Sidebar Expand/Collapse Toggle Button */}
      <button 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute -right-3 top-8 w-6 h-6 rounded-full bg-card border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground z-50 cursor-pointer hover:scale-110 transition-all"
        title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {/* Top Section */}
      <div className={`flex min-h-0 w-full flex-1 flex-col gap-4 ${sidebarOpen ? 'items-stretch' : 'items-center'}`}>
        {/* Pragati Brand Logo Section */}
        <div className={`flex items-center w-full transition-all duration-300 ${sidebarOpen ? 'gap-3 px-6' : 'justify-center px-0'}`}>
          <div
            className={`flex items-center justify-center flex-shrink-0 transition-all duration-300 cursor-pointer hover:scale-110 ${sidebarOpen ? 'w-9 h-9' : 'w-11 h-11'}`}
            title="PRAGATI"
            onClick={() => !sidebarOpen && setSidebarOpen(true)}
          >
            <svg className="w-7 h-7 text-primary drop-shadow-[0_2px_8px_rgba(182,141,64,0.15)] filter" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path className="fill-primary" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"/>
            </svg>
          </div>
          
          <div className={`flex flex-col select-none transition-all duration-300 ${sidebarOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0 pointer-events-none'}`}>
            <span className="text-xl font-heading font-black tracking-wider text-primary leading-none">
              PRAGATI
            </span>
          </div>
        </div>

        {/* Central Nav Stack */}
        <nav className={`flex min-h-0 w-full flex-1 flex-col gap-0.5 overflow-y-auto py-0.5 scrollbar-none ${sidebarOpen ? 'px-0 pr-0' : 'pr-1 items-center'}`}>
          {getNavigationItemsForRole(erpNavigationItems, activeRole).map((item) => {
            const isActive = isNavigationItemActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`group relative flex items-center transition-all
                  ${sidebarOpen
                    ? `w-full gap-3 border-l-4 py-2.5 pr-4 pl-6 text-xs font-semibold
                       ${isActive
                         ? 'bg-primary/10 text-primary border-primary font-bold'
                         : 'border-transparent text-muted-foreground hover:text-primary hover:bg-primary/5'
                       }`
                    : `justify-center w-12 h-12 flex-none rounded-lg
                       ${isActive
                         ? 'bg-primary/10 text-primary font-bold shadow-sm scale-105'
                         : 'text-muted-foreground hover:text-primary hover:bg-primary/5'
                       }`
                  }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0 transition-transform duration-200 group-hover:scale-105" />
                <span className={`transition-all duration-300 truncate text-xs font-semibold ${sidebarOpen ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0 pointer-events-none'}`}>
                  {item.label}
                </span>
                {!sidebarOpen && (
                  <span className="absolute left-16 z-50 whitespace-nowrap rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 pointer-events-none">
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={`mt-3 w-full border-t border-border pt-3 ${sidebarOpen ? 'px-4' : 'flex flex-col items-center'}`}>

        <div className="relative mt-1 w-full">
          <button
            type="button"
            onClick={() => setIsProfileOpen((isOpen) => !isOpen)}
            className={`group relative flex items-center rounded-xl text-left transition-colors hover:bg-muted/80 ${
              sidebarOpen ? 'w-full gap-3 px-2.5 py-1.5' : 'h-12 w-12 justify-center'
            }`}
            aria-label="Open profile and role menu"
            aria-expanded={isProfileOpen}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-extrabold font-heading select-none">
              {initials}
            </div>
            <span className={`min-w-0 flex-1 transition-all duration-300 ${sidebarOpen ? 'max-w-full opacity-100' : 'max-w-0 opacity-0 pointer-events-none'}`}>
              <span className="block truncate text-xs font-bold text-foreground">
                {currentUser.name}
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-bold uppercase tracking-wide text-primary">
                {ROLE_LABELS[activeRole]}
              </span>
            </span>
            {sidebarOpen && (
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  isProfileOpen ? 'rotate-180' : ''
                }`}
              />
            )}
            {!sidebarOpen && (
              <span className="absolute left-16 z-50 whitespace-nowrap rounded-lg border border-border bg-secondary px-2.5 py-1.5 text-xs font-semibold text-secondary-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 pointer-events-none">
                {currentUser.name}
              </span>
            )}
          </button>

          {isProfileOpen && (
            <div className={`absolute bottom-14 z-50 w-56 rounded-xl border border-border bg-popover p-2 shadow-premium ${sidebarOpen ? 'left-0' : 'left-16'}`}>
              <div className="border-b border-border px-2.5 pb-2 pt-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {currentUser.name}
                </p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                  {ROLE_LABELS[activeRole]}
                </p>
              </div>
              <div className="px-2.5 py-2 text-xs text-muted-foreground">
                Access is assigned by upper management and enforced by database policies.
              </div>

              <div className="mt-1.5 border-t border-border pt-1.5 flex flex-col gap-0.5">
                <a
                  href="tel:+919876543210"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] text-muted-foreground leading-none">Support Hotline</span>
                    <span className="text-[11px] font-bold text-foreground mt-0.5 leading-none">+91 98765 43210</span>
                  </div>
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                    router.push('/login');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 cursor-pointer"
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

    </aside>
  );
}
