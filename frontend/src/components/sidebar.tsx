'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingCart,
  ClipboardList,
  Boxes,
  Handshake,
  ClipboardCheck,
  Wrench,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';

export default function Sidebar() {
  const pathname = usePathname();
  const { activeRole } = useAppStore();

  // Each module is its own direct sidebar entry — no umbrella groups, no
  // secondary tab strip. See config/erp-navigation.ts for the full rationale
  // behind this being the full module list.
  const slimNavItems = [
    {
      label: 'Procurement',
      path: '/procurement',
      icon: ShoppingCart,
      groupPaths: ['/procurement']
    },
    {
      label: 'MRP',
      path: '/mrp',
      icon: ClipboardList,
      groupPaths: ['/mrp']
    },
    {
      label: 'Inventory',
      path: '/inventory',
      icon: Boxes,
      groupPaths: ['/inventory']
    },
    {
      label: 'Vendors',
      path: '/vendors',
      icon: Handshake,
      groupPaths: ['/vendors']
    },
    {
      label: 'Work Orders',
      path: '/work-orders',
      icon: ClipboardCheck,
      groupPaths: ['/work-orders']
    },
    {
      label: 'Service Bills',
      path: '/service-bills',
      icon: Wrench,
      groupPaths: ['/service-bills']
    },
  ];

  // Helper to determine if an item group is active
  const isItemActive = (groupPaths: string[]) => {
    return groupPaths.some(p => pathname === p || pathname.startsWith(`${p}/`));
  };

  return (
    <aside className="hidden lg:flex flex-col bg-card border-r border-border w-20 shrink-0 h-full select-none overflow-hidden">
      {/* Navigation menu items stacked vertically (Zoho format) */}
      <nav className="flex flex-col flex-1 pt-0 pb-4 gap-1.5">
        {slimNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.groupPaths);

          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center gap-1.5 w-full py-3.5 transition-all duration-150 border-l-[3px] ${
                isActive
                  ? 'bg-primary/10 text-primary border-primary'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white border-transparent'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="text-[9px] font-extrabold tracking-tight text-center leading-none uppercase truncate max-w-full px-1">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
