'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { getDbUserId } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { listUnreadNotifications } from '@/lib/notifications';

const POLL_INTERVAL_MS = 25_000;

/** Polls the DB `notifications` table for the signed-in user and surfaces new rows (e.g. service_bill_raised) into the bell/toast — accounts must see a bill "the moment it comes in", per the client's ask. */
export default function NotificationPoller() {
  const currentUser = useAppStore((state) => state.currentUser);
  const addNotification = useAppStore((state) => state.addNotification);

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
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [currentUser?.id, addNotification]);

  return null;
}
