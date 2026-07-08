'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  erpNavigationItems,
  getNavigationItemsForRole,
  isNavigationItemActive,
} from '@/config/erp-navigation';
import { useAppStore } from '@/store/use-app-store';

export default function Sidebar() {
  const pathname = usePathname();
  const { 
    activeRole,
    sidebarOpen,
    setSidebarOpen,
  } = useAppStore();

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

    </aside>
  );
}
