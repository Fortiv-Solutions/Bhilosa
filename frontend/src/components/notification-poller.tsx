'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { getDbUserId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { listUnreadNotifications } from '@/lib/notifications';
import { CENTRAL_PARK_SCHEDULE_ACTIVITIES } from '@/lib/schedule-data';

const LIVE_POLL_INTERVAL_MS = 25_000;
const MOCK_SCAN_INTERVAL_MS = 60_000;

/** Polls the DB `notifications` table for the signed-in user and surfaces new rows into the bell/toast.
 *  In mock/demo mode (no live Supabase), it derives smart contextual notifications from app state:
 *  - Overdue schedule activities
 *  - Pending DPR approvals
 *  - Logged delay events
 */
export default function NotificationPoller() {
  const currentUser = useAppStore((state) => state.currentUser);
  const addNotification = useAppStore((state) => state.addNotification);
  const projects = useAppStore((state) => state.projects);
  const seenIds = useRef<Set<string>>(new Set());

  // ── LIVE SUPABASE MODE ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLiveSupabase() || !currentUser?.id) return;

    let cancelled = false;
    const recipientId = getDbUserId(currentUser.id);

    async function poll() {
      try {
        const rows = await listUnreadNotifications(recipientId);
        if (cancelled) return;
        for (const row of rows) {
          addNotification({
            type: row.notification_type,
            title: row.title,
            message: row.message,
            dbId: row.id,
            actionUrl: row.action_url || undefined,
          });
        }
      } catch {
        // Notifications are best-effort — a failed poll should never disrupt the app.
      }
    }

    void poll();
    const interval = window.setInterval(poll, LIVE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUser?.id, addNotification]);

  // ── MOCK / DEMO MODE ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLiveSupabase()) return;

    function scanAndNotify() {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Overdue schedule activities — top 3 most critical
      const overdueActivities = CENTRAL_PARK_SCHEDULE_ACTIVITIES
        .filter((a) => {
          const end = (a as any).planned_end_date || (a as any).plannedEndDate;
          const actual = (a as any).actual_end_date || (a as any).actualEndDate;
          return !actual && !!end && end < todayStr;
        })
        .slice(0, 3);

      for (const act of overdueActivities) {
        const actId = (act as any).id || (act as any).title;
        const notifId = `overdue_${actId}`;
        if (seenIds.current.has(notifId)) continue;
        seenIds.current.add(notifId);

        const endDate = (act as any).planned_end_date || (act as any).plannedEndDate;
        const daysOverdue = Math.floor(
          (new Date(todayStr).getTime() - new Date(endDate).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const cleanTitle = ((act as any).title as string).replace(/\s*\([^)]+\)/g, '').trim();

        addNotification({
          id: notifId,
          type: 'schedule_delay',
          title: `⚠️ Activity Overdue: ${cleanTitle}`,
          message: `Planned end was ${endDate} — ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue. Please update progress or log a delay reason.`,
          actionUrl: '/projects/central-park',
        });
      }

      // 2. Pending DPR approvals across all projects
      for (const project of projects) {
        const pendingDPRs = (project.dailyActivities || []).filter(
          (d) => d.status === 'Submitted' || d.status === 'Under Review'
        );

        if (pendingDPRs.length > 0) {
          const notifId = `dpr_pending_${project.id}_${pendingDPRs.length}`;
          if (!seenIds.current.has(notifId)) {
            seenIds.current.add(notifId);
            addNotification({
              id: notifId,
              type: 'dpr_approval',
              title: `📋 ${pendingDPRs.length} DPR${pendingDPRs.length > 1 ? 's' : ''} Awaiting Approval`,
              message: `${project.name}: ${pendingDPRs.length} Daily Progress Report${pendingDPRs.length > 1 ? 's' : ''} submitted and waiting for review.`,
              actionUrl: `/projects/${project.id}`,
            });
          }
        }

        // 3. Unresolved delay events
        const delays = (project.delays || []).filter(
          (d) => d.status !== 'Resolved' && d.status !== 'Closed'
        );
        if (delays.length > 0) {
          const notifId = `delays_${project.id}_${delays.length}`;
          if (!seenIds.current.has(notifId)) {
            seenIds.current.add(notifId);
            addNotification({
              id: notifId,
              type: 'delay_flag',
              title: `🚨 ${delays.length} Delay${delays.length > 1 ? 's' : ''} Flagged — ${project.name}`,
              message: `${delays.length} active delay event${delays.length > 1 ? 's' : ''} logged on site. Review and assign corrective action.`,
              actionUrl: `/projects/${project.id}`,
            });
          }
        }
      }
    }

    // Run immediately on mount, then every MOCK_SCAN_INTERVAL_MS
    scanAndNotify();
    const interval = window.setInterval(scanAndNotify, MOCK_SCAN_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [addNotification, projects]);

  return null;
}
