'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Moon, Sun, X } from 'lucide-react';
import {
  erpNavigationItems,
  erpUtilityNavigationItems,
  getNavigationItemsForRole,
  isNavigationItemActive,
} from '@/config/erp-navigation';
import { ROLE_LABELS } from '@/lib/rbac';
import { useAppStore } from '@/store/use-app-store';

export default function MobileNavbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { activeRole, currentUser, theme, toggleTheme, projects } = useAppStore();
  const navigationItems = getNavigationItemsForRole(erpNavigationItems, activeRole);
  const utilityItems = getNavigationItemsForRole(erpUtilityNavigationItems, activeRole);
  const canSeeProjects = activeRole === 'UPPER_MANAGEMENT';

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <>
      <header className="lg:hidden sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border bg-card/95 px-4 shadow-xs backdrop-blur-md">
        <Link href="/dashboard" className="flex items-center gap-2">
          <svg className="h-8 w-8 text-primary" viewBox="30 1 36 29" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path className="fill-primary" d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z" />
          </svg>
          <span className="font-heading text-base font-bold text-primary">PRAGATI</span>
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-xl border border-border bg-muted p-2 text-muted-foreground hover:text-primary"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <nav
        aria-label="Utility navigation"
        className="fixed left-2 right-2 top-[4.5rem] z-30 grid grid-cols-[repeat(auto-fit,minmax(2.5rem,1fr))] gap-1 rounded-xl border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur-xl lg:hidden"
      >
        {utilityItems.map((item) => {
          const Icon = item.icon;
          const isActive = isNavigationItemActive(pathname, item);
          return (
            <Link
              key={item.path}
              href={item.path}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex h-10 items-center justify-center rounded-xl transition-colors ${
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          className="flex h-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {theme === 'light' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            aria-label="Open profile menu"
            aria-expanded={profileOpen}
            className={`flex h-10 w-full items-center justify-center rounded-xl transition-colors ${profileOpen ? 'bg-primary/10' : 'hover:bg-muted'}`}
          >
            {(() => {
              const initials = currentUser.name
                ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : 'SU';
              return (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 text-[9px] font-extrabold font-heading select-none">
                  {initials}
                </div>
              );
            })()}
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-border bg-popover p-3 shadow-premium">
              <p className="truncate text-sm font-semibold text-foreground">{currentUser.name}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-primary">{ROLE_LABELS[activeRole]}</p>
              <p className="mt-3 text-xs text-muted-foreground">Access is assigned by upper management.</p>
            </div>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-black backdrop-blur-xs lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card shadow-2xl lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <span className="font-heading text-sm font-bold text-primary">PRAGATI</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-border bg-muted p-2 text-muted-foreground hover:text-foreground"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = isNavigationItemActive(pathname, item);
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                        isActive
                          ? 'border-l-4 border-primary bg-gradient-to-r from-primary/10 to-transparent pl-3 text-primary'
                          : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                {canSeeProjects && (
                  <div className="ml-5 space-y-0.5 border-l border-border pl-3">
                    {projects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/projects/${project.id}`}
                        onClick={() => setIsOpen(false)}
                        className={`block rounded-lg px-3 py-2 text-xs font-semibold ${
                          pathname === `/projects/${project.id}`
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {project.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
