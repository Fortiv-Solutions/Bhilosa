// Centralizes approval, material, delay, budget, and procurement workflow notifications.
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, RefreshCcw, Trash2 } from 'lucide-react';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';
import { useAppStore } from '@/store/use-app-store';
import { supabase } from '@/utils/supabase-client';

type DbNotification = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  priority: string;
  status: string;
  created_at: string;
  read_at: string | null;
};

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default function NotificationsPage() {
  const { notifications, markNotificationRead, clearNotifications } = useAppStore();
  const [dbNotifications, setDbNotifications] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveMode = isLiveSupabase();

  const refresh = useCallback(async () => {
    if (!liveMode) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: loadError } = await supabase
        .from('notifications')
        .select('id,title,message,notification_type,priority,status,created_at,read_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (loadError) throw new Error(loadError.message);
      setDbNotifications((data ?? []) as DbNotification[]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [liveMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function markDbNotificationRead(id: string) {
    const { error: updateError } = await supabase
      .from('notifications')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refresh();
  }

  const visibleNotifications = liveMode ? dbNotifications : notifications;
  const unreadCount = liveMode
    ? dbNotifications.filter((notification) => notification.status !== 'read' && !notification.read_at).length
    : notifications.filter((notification) => !notification.read).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">Company Alert Center</span>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{unreadCount} unread alerts across approvals, materials, delays, budgets, and procurement.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} disabled={!liveMode || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          {!liveMode && (
            <button type="button" onClick={clearNotifications} disabled={notifications.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
              <Trash2 className="h-3.5 w-3.5" /> Clear all
            </button>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <section className="space-y-2">
        {liveMode
          ? dbNotifications.map((notification) => {
              const read = notification.status === 'read' || Boolean(notification.read_at);
              return (
                <article key={notification.id} className={`flex gap-3 rounded-2xl border p-4 ${read ? 'border-gray-100 bg-white dark:border-gray-850 dark:bg-gray-900' : 'border-orange-100 bg-orange-50/60 dark:border-orange-900/30 dark:bg-orange-950/10'}`}>
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm dark:bg-gray-900"><Bell className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-heading text-sm font-bold">{notification.title}</h2>
                      <span className="text-[10px] text-gray-400">{relativeTime(notification.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{notification.message}</p>
                    {!read && (
                      <button type="button" onClick={() => void markDbNotificationRead(notification.id)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                        <CheckCheck className="h-3.5 w-3.5" /> Mark as read
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          : notifications.map((notification) => (
              <article key={notification.id} className={`flex gap-3 rounded-2xl border p-4 ${notification.read ? 'border-gray-100 bg-white dark:border-gray-850 dark:bg-gray-900' : 'border-orange-100 bg-orange-50/60 dark:border-orange-900/30 dark:bg-orange-950/10'}`}>
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-white text-primary shadow-sm dark:bg-gray-900"><Bell className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-heading text-sm font-bold">{notification.title}</h2>
                    <span className="text-[10px] text-gray-400">{notification.time}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{notification.message}</p>
                  {!notification.read && (
                    <button type="button" onClick={() => markNotificationRead(notification.id)} className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                      <CheckCheck className="h-3.5 w-3.5" /> Mark as read
                    </button>
                  )}
                </div>
              </article>
            ))}
        {visibleNotifications.length === 0 && (
          <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-16 text-center dark:border-gray-800 dark:bg-gray-900">
            <Bell className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-semibold text-gray-500">No active notifications.</p>
          </div>
        )}
      </section>
    </div>
  );
}
