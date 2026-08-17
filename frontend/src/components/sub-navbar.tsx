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

  // Every module is now a direct sidebar entry (see sidebar.tsx) rather than a
  // grouped umbrella, so each "group" here is just its own module — which
  // means allowedTabs.length below is always <= 1 and this bar never renders.
  // Kept as single-item groups (not deleted) so the role-filtering logic below
  // stays correct if a module ever needs a real sub-tab again.
  const groups = [
    { name: 'Procurement', paths: ['/procurement'], tabs: [{ label: 'Procurement', path: '/procurement' }] },
    { name: 'MRP', paths: ['/mrp'], tabs: [{ label: 'MRP', path: '/mrp' }] },
    { name: 'Inventory', paths: ['/inventory'], tabs: [{ label: 'Inventory', path: '/inventory' }] },
    { name: 'Vendors', paths: ['/vendors'], tabs: [{ label: 'Vendors', path: '/vendors' }] },
    { name: 'Work Orders', paths: ['/work-orders'], tabs: [{ label: 'Work Orders', path: '/work-orders' }] },
    { name: 'Service Bills', paths: ['/service-bills'], tabs: [{ label: 'Service Bills', path: '/service-bills' }] },
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
    <div className="h-11 bg-card border-b border-border flex items-center px-6 gap-6 select-none flex-shrink-0 overflow-x-auto scrollbar-none whitespace-nowrap">
      {allowedTabs.map(tab => {
        const isActive = pathname === tab.path || pathname.startsWith(`${tab.path}/`);
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={`h-full flex items-center text-xs font-semibold px-1 border-b-2 transition-all duration-150 ${
              isActive
                ? 'border-[#e83e8c] text-[#e83e8c]'
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
