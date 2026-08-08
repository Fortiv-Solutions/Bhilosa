'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu,
  Moon,
  Sun,
  X,
  LayoutGrid,
  Building2,
  ShoppingCart,
  ClipboardCheck,
  CircleDollarSign,
  FileText,
  Settings2,
  ChevronRight,
  LogOut,
  Bell,
  UserCog,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/rbac';
import { useAppStore } from '@/store/use-app-store';

export default function MobileNavbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { activeRole, currentUser, theme, toggleTheme, projects, logout } = useAppStore();

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Grouped Navigation Structure matching Desktop Sidebar & SubNavBar
  const mobileGroups = [
    {
      title: 'Home',
      icon: LayoutGrid,
      items: [
        { label: 'Overview', path: '/dashboard' },
        { label: 'Inbox', path: '/inbox' },
      ],
    },
    {
      title: 'Projects',
      icon: Building2,
      items: [
        { label: 'Projects', path: '/projects' },
        { label: 'Execution', path: '/activities' },
        { label: 'Safety & QC', path: '/safety-qc' },
      ],
    },
    {
      title: 'Supply Chain',
      icon: ShoppingCart,
      items: [
        { label: 'Procurement', path: '/procurement' },
        { label: 'Item Master', path: '/item-master' },
        { label: 'Vendors', path: '/vendors' },
        { label: 'Inventory', path: '/inventory' },
      ],
    },
    {
      title: 'Work Orders',
      icon: ClipboardCheck,
      items: [
        { label: 'Work Orders', path: '/work-orders' },
        { label: 'Service Bills', path: '/service-bills' },
      ],
    },
    {
      title: 'Financials',
      icon: CircleDollarSign,
      items: [
        { label: 'Budget Control', path: '/budget' },
        { label: 'Reports', path: '/reports' },
      ],
    },
    {
      title: 'Documents',
      icon: FileText,
      items: [{ label: 'Documents', path: '/documents' }],
    },
    {
      title: 'Settings',
      icon: Settings2,
      items: [{ label: 'Settings', path: '/settings' }],
    },
  ];

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ED';

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 shadow-xs backdrop-blur-md">
        <Link href="/dashboard" className="flex items-center gap-2">
          <svg className="h-7 w-7 text-primary" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path className="fill-primary" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z" />
          </svg>
          <span className="font-heading text-base font-extrabold text-primary">PRAGATI</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-border bg-muted/60 text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/30 text-xs font-bold font-heading"
          >
            {initials}
          </button>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-xl border border-border bg-muted p-2 text-muted-foreground hover:text-primary transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* User Profile Dropdown */}
      <AnimatePresence>
        {profileOpen && (
          <div className="fixed right-4 top-16 z-50 w-64 rounded-2xl border border-border bg-popover p-4 shadow-premium backdrop-blur-md">
            <div className="flex items-center gap-3 border-b border-border/60 pb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/30 font-bold text-xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">{currentUser.name}</p>
                <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary">{ROLE_LABELS[activeRole]}</p>
              </div>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              className="fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] flex-col bg-card border-r border-border shadow-2xl lg:hidden"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <svg className="h-7 w-7 text-primary" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path className="fill-primary" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z" />
                  </svg>
                  <span className="font-heading text-base font-extrabold text-primary">PRAGATI</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-border bg-muted p-2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Grouped Navigation List matching Desktop ERP */}
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 scrollbar-none">
                {mobileGroups.map((group) => {
                  const GroupIcon = group.icon;
                  const hasActiveChild = group.items.some(
                    (it) => pathname === it.path || pathname.startsWith(`${it.path}/`)
                  );

                  return (
                    <div key={group.title} className="space-y-1">
                      <div className="flex items-center gap-2 px-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground/80">
                        <GroupIcon className="h-3.5 w-3.5 text-primary/70" />
                        <span>{group.title}</span>
                      </div>

                      <div className="space-y-0.5 pl-2">
                        {group.items.map((subItem) => {
                          const isActive =
                            pathname === subItem.path || pathname.startsWith(`${subItem.path}/`);

                          return (
                            <Link
                              key={subItem.path}
                              href={subItem.path}
                              onClick={() => setIsOpen(false)}
                              className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                                isActive
                                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-xs'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              <span>{subItem.label}</span>
                              {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Drawer Footer */}
              <div className="border-t border-border p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/30 text-xs font-bold font-heading">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-foreground">{currentUser.name}</p>
                      <p className="text-[9px] font-extrabold uppercase text-primary tracking-wide">{ROLE_LABELS[activeRole]}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      logout();
                    }}
                    className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

