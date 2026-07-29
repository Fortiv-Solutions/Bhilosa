'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getNavigationItemsForRole, erpNavigationItems } from '@/config/erp-navigation';
import { useAppStore } from '@/store/use-app-store';

export default function SubNavBar() {
  const pathname = usePathname();
  const { activeRole } = useAppStore();

  // If we are in project details or login, do not show subnavbar
  const isProjectDetails = pathname.startsWith('/projects/') && pathname !== '/projects';
  const isLoginPage = pathname === '/login';

  if (isProjectDetails || isLoginPage) return null;

  // Define tab groups
  const groups = [
    {
      name: 'Home',
      paths: ['/dashboard', '/inbox'],
      tabs: [
        { label: 'Overview', path: '/dashboard' },
        { label: 'Inbox', path: '/inbox' }
      ]
    },
    {
      name: 'Projects',
      paths: ['/projects', '/activities', '/safety-qc'],
      tabs: [
        { label: 'Projects', path: '/projects' },
        { label: 'Execution', path: '/activities' },
        { label: 'Safety & QC', path: '/safety-qc' }
      ]
    },
    {
      name: 'Supply Chain',
      paths: ['/procurement', '/vendors', '/inventory'],
      tabs: [
        { label: 'Procurement', path: '/procurement' },
        { label: 'Vendors', path: '/vendors' },
        { label: 'Inventory', path: '/inventory' }
      ]
    },
    {
      name: 'Workforce',
      paths: ['/labour', '/equipment'],
      tabs: [
        { label: 'Labour', path: '/labour' },
        { label: 'Equipment', path: '/equipment' }
      ]
    },
    {
      name: 'Financials',
      paths: ['/budget', '/reports'],
      tabs: [
        { label: 'Budget Control', path: '/budget' },
        { label: 'Reports', path: '/reports' }
      ]
    },
    {
      name: 'Documents',
      paths: ['/documents'],
      tabs: [
        { label: 'Documents', path: '/documents' }
      ]
    },
    {
      name: 'Settings',
      paths: ['/settings'],
      tabs: [
        { label: 'Settings', path: '/settings' }
      ]
    }
  ];

  // Find active group based on current pathname
  const activeGroup = groups.find(group => 
    group.paths.some(p => pathname === p || pathname.startsWith(`${p}/`))
  );

  if (!activeGroup) return null;

  // Filter tabs by user role permission
  const allowedTabs = activeGroup.tabs.filter(tab => {
    const navItem = erpNavigationItems.find(item => item.path === tab.path);
    if (!navItem) return true;
    if (navItem.allowedRoles) return navItem.allowedRoles.includes(activeRole);
    return true;
  });

  // If there is only 1 tab in the group, we don't need to show a tab bar
  if (allowedTabs.length <= 1) return null;

  return (
    <div className="h-11 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-6 gap-6 select-none flex-shrink-0 overflow-x-auto scrollbar-none whitespace-nowrap">
      {allowedTabs.map(tab => {
        const isActive = pathname === tab.path || pathname.startsWith(`${tab.path}/`);
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={`h-full flex items-center text-xs font-semibold px-1 border-b-2 transition-all duration-150 ${
              isActive
                ? 'border-[#b68d40] text-[#b68d40]'
                : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
