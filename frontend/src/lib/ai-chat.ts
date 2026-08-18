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
  try {
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
      console.warn('[ai-chat] createChatSession notice:', error.message);
      return {
        id: `session-local-${Date.now()}`,
        user_id: userId,
        title: title || 'Local Session',
        project_id: projectId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_archived: false,
      };
    }
    return data;
  } catch (err) {
    console.warn('[ai-chat] Offline mode for createChatSession');
    return {
      id: `session-local-${Date.now()}`,
      user_id: userId,
      title: title || 'Local Session',
      project_id: projectId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_archived: false,
    };
  }
}

/** Load all sessions for a user (most recent first) */
export async function loadChatSessions(userId: string): Promise<ChatSession[]> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });

    if (error) {
      console.warn('[ai-chat] loadChatSessions notice:', error.message);
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/** Update session title (auto-generated from first user message) */
export async function updateSessionTitle(
  sessionId: string,
  title: string
): Promise<void> {
  try {
    await supabase
      .from('ai_chat_sessions')
      .update({ title })
      .eq('id', sessionId);
  } catch {
    // Offline mode
  }
}

/** Archive (soft-delete) a session */
export async function archiveChatSession(sessionId: string): Promise<void> {
  try {
    await supabase
      .from('ai_chat_sessions')
      .update({ is_archived: true })
      .eq('id', sessionId);
  } catch {
    // Offline mode
  }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

/** Save a single message to the database */
export async function saveChatMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  tokensUsed?: number
): Promise<ChatMessage | null> {
  try {
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
      console.warn('[ai-chat] saveChatMessage notice:', error.message);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Load all messages for a session (oldest first) */
export async function loadChatMessages(sessionId: string): Promise<ChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from('ai_chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[ai-chat] loadChatMessages notice:', error.message);
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

/** Delete all messages in a session (used by clear chat) */
export async function clearChatMessages(sessionId: string): Promise<void> {
  try {
    await supabase
      .from('ai_chat_messages')
      .delete()
      .eq('session_id', sessionId);
  } catch {
    // Offline mode
  }
}
