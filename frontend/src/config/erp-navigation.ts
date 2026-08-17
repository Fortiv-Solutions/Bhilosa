// Defines the company-level ERP navigation shared by desktop and mobile shells.
//
// Scoped down to Procurement (+ MRP, quote comparison, approvals, deliveries,
// vendor performance) plus Work Orders and Inventory, per product decision to
// strip the app to just these areas. Other modules' code is untouched on disk
// (Projects, Budget, Documents, Inbox, Communication, AI Assistant, Safety &
// QC, Reports, Settings, Users) — only reachability was removed, here and in
// lib/rbac.ts's ROLE_ALLOWED_PATHS.
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardCheck,
  ClipboardList,
  ShoppingCart,
  Wrench,
  Boxes,
  Handshake,
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
  { label: 'Procurement',  path: '/procurement',  icon: ShoppingCart,      group: 'Supply Chain' },
  { label: 'MRP',          path: '/mrp',          icon: ClipboardList,     group: 'Supply Chain' },
  { label: 'Inventory',    path: '/inventory',    icon: Boxes,             group: 'Supply Chain' },
  { label: 'Vendors',      path: '/vendors',      icon: Handshake,         group: 'Supply Chain' },
  { label: 'Work Orders',  path: '/work-orders',  icon: ClipboardCheck,    group: 'Work Orders' },
  { label: 'Service Bills', path: '/service-bills', icon: Wrench,          group: 'Work Orders' },
];

export const erpUtilityNavigationItems: ErpNavigationItem[] = [];

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
