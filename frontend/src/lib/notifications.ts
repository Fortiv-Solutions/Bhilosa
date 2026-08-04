import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  action_url: string | null;
  created_at: string;
};

/** Unread notifications for a recipient (profiles.id), newest first — the source for the in-app bell/toast surfacing. */
export async function listUnreadNotifications(recipientId: string, limit = 20): Promise<NotificationRow[]> {
  if (!isLiveSupabase() || !recipientId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, notification_type, action_url, created_at')
    .eq('recipient_id', recipientId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  if (!isLiveSupabase()) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', notificationId);
}
