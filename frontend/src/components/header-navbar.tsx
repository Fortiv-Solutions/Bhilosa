'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Moon, Sun, Search, Bell, UserCog, Phone, Download } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/rbac';
import { useAppStore } from '@/store/use-app-store';
import { downloadWholeReport } from '@/utils/report-generator';

export default function HeaderNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const { 
    activeRole, 
    currentUser, 
    theme, 
    toggleTheme, 
    logout,
    notifications,
    markNotificationRead,
    clearNotifications,
    projects
  } = useAppStore();

  const unreadNotifications = notifications.filter(n => !n.read);

  const initials = currentUser.name
    ? currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'SU';

  // Get current page name from pathname
  const getPageTitle = (path: string) => {
    if (path.startsWith('/projects/')) {
      const projId = path.split('/')[2];
      const match = projects.find((p) => p.id === projId || path.includes(p.id));
      if (match) return match.name;
      if (path.includes('central-park')) return 'Central Park';
      return 'Projects';
    }
    if (path === '/projects') return 'Projects';
    if (path === '/activities') return 'Execution';
    if (path === '/procurement') return 'Procurement';
    if (path === '/vendors') return 'Vendors';
    if (path === '/inventory') return 'Inventory';
    if (path === '/labour') return 'Labour';
    if (path === '/equipment') return 'Equipment';
    if (path === '/safety-qc') return 'Safety & QC';
    if (path === '/finance') return 'Finance';
    if (path === '/budget') return 'Budget';
    if (path === '/documents') return 'Documents';
    if (path === '/reports') return 'Reports';
    if (path === '/settings') return 'Admin Settings';
    if (path === '/notifications') return 'Notifications';
    if (path === '/inbox') return 'Inbox';
    
    // Fallback: capitalize the first segment
    const segment = path.split('/')[1];
    if (!segment) return 'Overview';
    return segment.charAt(0).toUpperCase() + segment.slice(1);
  };

  const title = getPageTitle(pathname);

  return (
    <header className="hidden lg:flex items-center justify-between h-14 bg-card border-b border-border transition-all duration-300 w-full flex-shrink-0">
      {/* Left side: Logo, Title & Search */}
      <div className="flex items-center h-full gap-5">
        {/* Logo Icon Container (Matches sidebar width: 80px) */}
        <Link href="/dashboard" className="w-20 h-full flex items-center justify-center border-r border-border hover:bg-muted/30 transition-colors flex-shrink-0">
          <svg
            className="w-6.5 h-6.5 text-[#b68d40] drop-shadow-md flex-shrink-0"
            viewBox="30 1 36 29"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="fill-[#b68d40]"
              d="M52.13,17.62v2.6s7.81,1.18,9,9.31h4.34a4.39,4.39,0,0,1-1.9-2.21C63,25.74,60.25,18.65,52.13,17.62ZM34.47,3.9H44.72V14.23C37.23,14.15,34.62,13.2,34.47,3.9ZM30,1.38A5.14,5.14,0,0,1,32,5.24v.63c.71,9.31,4.65,10.57,12.7,10.65V27.16h-.08s-.4,2.21-1.58,2.37h4.18V1.38H30ZM43.53,17.62v2.6s-7.8,1.18-8.91,9.31H30.29a4.07,4.07,0,0,0,1.81-2.21C32.65,25.74,35.49,18.65,43.53,17.62ZM51,14.23V3.9H61.28C61,13.2,58.44,14.15,51,14.23ZM63.8,1.38H48.5V29.53h4.1C51.5,29.37,51,27.16,51,27.16h0V16.52c8-.08,12-1.34,12.61-10.65a1.71,1.71,0,0,0,.08-.63,4.93,4.93,0,0,1,2-3.86Z"
            />
          </svg>
        </Link>

        {/* Brand Text and Page Title */}
        <div className="flex items-center gap-2 select-none">
          <span className="text-[14px] font-heading font-black tracking-wider text-[#b68d40] leading-none uppercase">
            PRAGATI
          </span>
          <span className="text-muted-foreground/30 text-xs">/</span>
          <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-widest leading-none">
            {title}
          </span>
        </div>

        {/* Separator line */}
        <div className="h-5 w-[1px] bg-border/80" />

        {/* Global Search bar */}
        <div className="relative max-w-xs w-64 hidden xl:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects, materials, bills..."
            className="w-full pl-9 pr-4 py-1.5 text-[11px] font-semibold rounded-md border border-border bg-muted/20 focus:bg-background focus:border-primary/50 outline-none transition-all placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      {/* Right side: Actions & Profile */}
      <div className="flex items-center gap-4 pr-5">
        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon className="h-4.5 w-4.5" strokeWidth={1.8} /> : <Sun className="h-4.5 w-4.5" strokeWidth={1.8} />}
        </button>

        {/* Notifications Button & Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer relative"
            title="Notifications"
          >
            <Bell className="h-4.5 w-4.5" strokeWidth={1.8} />
            {unreadNotifications.length > 0 && (
              <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-primary ring-2 ring-card" />
            )}
          </button>

          {isNotificationsOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-30" onClick={() => setIsNotificationsOpen(false)} />
              <div className="absolute right-0 top-12 z-50 w-80 rounded-md border border-border bg-popover p-2 shadow-premium animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center justify-between border-b border-border px-2.5 pb-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground">Notifications</span>
                    {unreadNotifications.length > 0 && (
                      <span className="bg-primary/10 text-primary text-[9px] font-extrabold px-1.5 py-0.5 rounded-full">
                        {unreadNotifications.length} New
                      </span>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearNotifications}
                      className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto py-1 scrollbar-none">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground font-semibold">
                      No active notifications.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          markNotificationRead(n.id);
                          if (n.actionUrl) {
                            setIsNotificationsOpen(false);
                            router.push(n.actionUrl);
                          }
                        }}
                        className={`flex flex-col gap-0.5 p-2.5 rounded-lg transition-colors cursor-pointer text-left mt-0.5 ${
                          !n.read 
                            ? 'bg-primary/5 hover:bg-primary/10 border-l-2 border-primary pl-2' 
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-bold text-foreground line-clamp-1 leading-none">{n.title}</span>
                          <span className="text-[9px] font-semibold text-muted-foreground whitespace-nowrap leading-none">{n.time}</span>
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground line-clamp-2 mt-0.5 leading-tight">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-1 border-t border-border pt-1">
                  <Link
                    href="/notifications"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="block text-center text-[10px] font-bold text-primary hover:underline py-1.5 cursor-pointer"
                  >
                    View All Notifications
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Users & Roles Button */}
        {activeRole === 'UPPER_MANAGEMENT' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => downloadWholeReport(projects)}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer relative"
              title="Download Whole Executive Report"
            >
              <Download className="h-4.5 w-4.5" strokeWidth={1.8} />
            </button>
            <Link
              href="/users"
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer relative"
              title="Users & Roles"
            >
              <UserCog className="h-4.5 w-4.5" strokeWidth={1.8} />
            </Link>
          </div>
        )}

        <div className="h-5 w-px bg-border" />

        {/* User Profile Selector Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsProfileOpen((isOpen) => !isOpen)}
            className="flex h-10 items-center gap-2 rounded-md px-2 hover:bg-muted/50 transition-colors cursor-pointer text-left"
            aria-label="Open profile menu"
            aria-expanded={isProfileOpen}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 text-[10px] font-extrabold font-heading select-none">
              {initials}
            </div>
            <div className="hidden sm:block">
              <span className="block truncate text-xs font-bold text-foreground leading-none">{currentUser.name}</span>
              <span className="mt-0.5 block truncate text-[9px] font-bold uppercase tracking-wider text-primary leading-none">
                {ROLE_LABELS[activeRole]}
              </span>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-30" onClick={() => setIsProfileOpen(false)} />
              <div className="absolute right-0 top-12 z-50 w-56 rounded-md border border-border bg-popover p-2 shadow-premium animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="border-b border-border px-2.5 pb-2 pt-1">
                  <p className="truncate text-sm font-semibold text-foreground">{currentUser.name}</p>
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
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
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
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-red-500 transition-colors hover:bg-red-500/10 cursor-pointer"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
                      <LogOut className="h-3.5 w-3.5" />
                    </span>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
