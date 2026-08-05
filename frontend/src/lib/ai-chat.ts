import { supabase } from '@/utils/supabase-client';

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** Create a new chat session for the current user */
export async function createChatSession(
  userId: string,
  title?: string,
  projectId?: string | null
): Promise<ChatSession | null> {

  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .insert({
      user_id: userId,
      title: title ?? null,
      project_id: projectId ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[ai-chat] createChatSession error:', error.message);
    return null;
  }
  return data;
}

/** Load all sessions for a user (most recent first) */
export async function loadChatSessions(userId: string): Promise<ChatSession[]> {

  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[ai-chat] loadChatSessions error:', error.message);
    return [];
  }
  return data ?? [];
}

/** Update session title (auto-generated from first user message) */
export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {

  await supabase
    .from('ai_chat_sessions')
    .update({ title })
    .eq('id', sessionId);
}

/** Archive (soft-delete) a session */
export async function archiveChatSession(sessionId: string): Promise<void> {

  await supabase
    .from('ai_chat_sessions')
    .update({ is_archived: true })
    .eq('id', sessionId);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Save a single message to the database */
export async function saveChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  tokensUsed?: number
): Promise<ChatMessage | null> {

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      tokens_used: tokensUsed ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[ai-chat] saveChatMessage error:', error.message);
    return null;
  }
  return data;
}

/** Load all messages for a session (oldest first) */
export async function loadChatMessages(sessionId: string): Promise<ChatMessage[]> {

  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ai-chat] loadChatMessages error:', error.message);
    return [];
  }
  return data ?? [];
}

/** Delete all messages in a session (used by clear chat) */
export async function clearChatMessages(sessionId: string): Promise<void> {

  await supabase
    .from('ai_chat_messages')
    .delete()
    .eq('session_id', sessionId);
}
