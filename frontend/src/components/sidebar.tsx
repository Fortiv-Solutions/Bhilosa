'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  MessageSquare,
  Building2,
  ShoppingCart,
  ClipboardCheck,
  CircleDollarSign,
  FileText,
  Settings2,
  HelpCircle,
} from 'lucide-react';
import { useAppStore } from '@/store/use-app-store';

export default function Sidebar() {
  const pathname = usePathname();
  const { activeRole } = useAppStore();

  const slimNavItems = [
    { 
      label: 'Home', 
      path: '/dashboard', 
      icon: LayoutGrid,
      groupPaths: ['/dashboard', '/inbox'] 
    },
    { 
      label: 'Projects', 
      path: '/projects', 
      icon: Building2,
      groupPaths: ['/projects', '/activities', '/safety-qc']
    },
    { 
      label: 'Supply Chain', 
      path: '/procurement', 
      icon: ShoppingCart,
      groupPaths: ['/procurement', '/item-master', '/vendors', '/inventory']
    },
    {
      label: 'Work Orders',
      path: '/work-orders',
      icon: ClipboardCheck,
      groupPaths: ['/work-orders']
    },
    { 
      label: 'Financials', 
      path: '/budget', 
      icon: CircleDollarSign,
      groupPaths: ['/budget', '/reports']
    },
    { 
      label: 'Documents', 
      path: '/documents', 
      icon: FileText,
      groupPaths: ['/documents']
    },
    { 
      label: 'Settings', 
      path: '/settings', 
      icon: Settings2,
      groupPaths: ['/settings']
    },
    { 
      label: 'Support', 
      path: '/support', 
      icon: HelpCircle,
      groupPaths: ['/support']
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
                  ? 'bg-[#b68d40]/10 text-[#b68d40] border-[#b68d40]'
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
