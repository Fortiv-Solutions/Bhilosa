'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Menu,
  Moon,
  Sun,
  X,
  ShoppingCart,
  ClipboardList,
  Boxes,
  Handshake,
  ClipboardCheck,
  Wrench,
  ChevronRight,
  LogOut,
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

  // Each module is its own flat entry — no group headers, no nesting. See
  // sidebar.tsx (desktop) for the matching list.
  const mobileNavItems = [
    { label: 'Procurement', path: '/procurement', icon: ShoppingCart },
    { label: 'MRP', path: '/mrp', icon: ClipboardList },
    { label: 'Inventory', path: '/inventory', icon: Boxes },
    { label: 'Vendors', path: '/vendors', icon: Handshake },
    { label: 'Work Orders', path: '/work-orders', icon: ClipboardCheck },
    { label: 'Service Bills', path: '/service-bills', icon: Wrench },
  ];

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'ED';

  return (
    <>
      {/* Top Mobile Header */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-card/95 px-4 shadow-xs backdrop-blur-md">
        <Link href="/procurement" className="flex items-center gap-2">
          <Image src="/jyoti-logo.png" alt="Jyoti" width={72} height={34} className="w-12 h-auto" priority />
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
                  <Image src="/jyoti-logo.png" alt="Jyoti" width={72} height={34} className="w-12 h-auto" />
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

              {/* Flat Navigation List — every module is a direct entry, no group nesting */}
              <div className="flex-1 space-y-0.5 overflow-y-auto px-4 py-4 scrollbar-none">
                {mobileNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);

                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/20 shadow-xs'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/70'}`} />
                      <span className="flex-1">{item.label}</span>
                      {isActive && <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                    </Link>
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

