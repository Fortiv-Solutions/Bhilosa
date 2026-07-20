// Defines the company-level ERP navigation shared by desktop and mobile shells.
import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Handshake,
  LayoutDashboard,
  PackageOpen,
  Settings2,
  ShoppingCart,
  Users,
  Wrench,
  UserCheck,
  ShieldCheck,
  LayoutGrid,
  MessageSquare,
  Boxes,
  Truck,
  IndianRupee,
  UserCog,
  Construction,
} from 'lucide-react';
import type { Role } from '@/lib/roles';
import { canAccessPath } from '@/lib/rbac';

export interface ErpNavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
  allowedRoles?: Role[];
  group?: string; // Section header label
}

export const erpNavigationItems: ErpNavigationItem[] = [
  { label: 'Overview',     path: '/dashboard',   icon: LayoutGrid,        exact: true },
  { label: 'Inbox',        path: '/inbox',        icon: MessageSquare },
  { label: 'Projects',     path: '/projects',     icon: Building2,         group: 'Projects & Execution', allowedRoles: ['UPPER_MANAGEMENT', 'PROJECT_MANAGER'] },
  { label: 'Execution',    path: '/activities',   icon: Construction,      allowedRoles: ['UPPER_MANAGEMENT', 'PROJECT_MANAGER'] },
  { label: 'Procurement',  path: '/procurement',  icon: ShoppingCart,      group: 'Supply Chain' },
  { label: 'Vendors',      path: '/vendors',      icon: Handshake,         allowedRoles: ['UPPER_MANAGEMENT', 'PR_TEAM'] },
  { label: 'Inventory',    path: '/inventory',    icon: Boxes },
  { label: 'Labour',       path: '/labour',       icon: Users,             group: 'Workforce' },
  { label: 'Equipment',    path: '/equipment',    icon: Truck },
  { label: 'Safety & QC',  path: '/safety-qc',    icon: ShieldCheck,       allowedRoles: ['UPPER_MANAGEMENT', 'PROJECT_MANAGER'] },
  { label: 'Finance',      path: '/finance',      icon: IndianRupee,       group: 'Financials', allowedRoles: ['UPPER_MANAGEMENT'] },
  { label: 'Budget',       path: '/budget',       icon: CircleDollarSign,  allowedRoles: ['UPPER_MANAGEMENT'] },
  { label: 'Documents',    path: '/documents',    icon: FileText,          group: 'Documents' },
  { label: 'Reports',      path: '/reports',      icon: BarChart3 },
  { label: 'Admin',        path: '/settings',     icon: Settings2,         group: 'Settings', allowedRoles: ['UPPER_MANAGEMENT'] },
];

export const erpUtilityNavigationItems: ErpNavigationItem[] = [
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Users & Roles', path: '/users', icon: UserCog, allowedRoles: ['UPPER_MANAGEMENT'] },
];

export function getNavigationItemsForRole(items: ErpNavigationItem[], role: Role): ErpNavigationItem[] {
  return items.filter((item) => {
    if (item.allowedRoles) return item.allowedRoles.includes(role);
    return canAccessPath(role, item.path);
  });
}

export function isNavigationItemActive(
  pathname: string,
  item: ErpNavigationItem,
): boolean {
  return item.exact ? pathname === item.path : pathname.startsWith(item.path);
}
