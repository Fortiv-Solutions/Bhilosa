import { supabase } from '@/utils/supabase-client';
import { isLiveSupabase } from '@/lib/erp/supabase-modules';

export type SupportTicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type SupportTicketCategory = 
  | 'Technical Bug' 
  | 'Work Order & Billing' 
  | 'Site Mobile App Sync' 
  | 'Account Access & Roles' 
  | 'Feature Request'
  | 'General Inquiry';

export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';

export interface SupportTicketRow {
  id: string;
  user_id?: string;
  user_name: string;
  user_role: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  assigned_engineer_name?: string | null;
  resolution_notes?: string | null;
  created_at: string;
  updated_at?: string;
  attachments?: string[];
}

export interface SupportFaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  sequence_order: number;
  is_published: boolean;
}

/**
 * Fetch all support tickets from Supabase with fallback
 */
export async function fetchSupportTickets(): Promise<{ data: SupportTicketRow[]; error: Error | null }> {
  if (!isLiveSupabase()) {
    return { data: [], error: null };
  }

  try {
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (ticketsError) throw new Error(ticketsError.message);

    // Fetch attachments for these tickets
    const { data: attachmentsData } = await supabase
      .from('support_ticket_attachments')
      .select('*');

    const mappedTickets: SupportTicketRow[] = (ticketsData ?? []).map((t: any) => {
      const ticketAtts = (attachmentsData ?? [])
        .filter((a: any) => a.ticket_id === t.id)
        .map((a: any) => a.file_url);

      return {
        ...t,
        attachments: ticketAtts
      };
    });

    return { data: mappedTickets, error: null };
  } catch (err: any) {
    console.error('Failed to fetch support tickets from Supabase:', err);
    return { data: [], error: err as Error };
  }
}

/**
 * Create a new support ticket in Supabase along with attachments
 */
export async function createSupportTicket(ticket: {
  userId?: string;
  userName: string;
  userRole: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  subject: string;
  description: string;
  projectId?: string;
  attachments?: string[];
}): Promise<{ data: SupportTicketRow | null; error: Error | null }> {
  if (!isLiveSupabase()) {
    const fallbackId = `SUP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const mockRow: SupportTicketRow = {
      id: fallbackId,
      user_name: ticket.userName,
      user_role: ticket.userRole,
      category: ticket.category,
      priority: ticket.priority,
      status: 'OPEN',
      subject: ticket.subject,
      description: ticket.description,
      assigned_engineer_name: 'Pramukh Support Desk',
      created_at: new Date().toISOString(),
      attachments: ticket.attachments || []
    };
    return { data: mockRow, error: null };
  }

  try {
    const payload: any = {
      user_name: ticket.userName,
      user_role: ticket.userRole,
      category: ticket.category,
      priority: ticket.priority,
      subject: ticket.subject,
      description: ticket.description,
      status: 'OPEN',
      assigned_engineer_name: 'Pramukh Support Desk'
    };

    if (ticket.userId) payload.user_id = ticket.userId;
    if (ticket.projectId) payload.project_id = ticket.projectId;

    const { data, error } = await supabase
      .from('support_tickets')
      .insert([payload])
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Save attached images if any
    if (ticket.attachments && ticket.attachments.length > 0 && data?.id) {
      const attRows = ticket.attachments.map((imgUrl, idx) => ({
        ticket_id: data.id,
        file_name: `Screenshot_${idx + 1}.png`,
        file_url: imgUrl,
        file_type: 'image/png'
      }));

      await supabase.from('support_ticket_attachments').insert(attRows);
    }

    return {
      data: {
        ...(data as SupportTicketRow),
        attachments: ticket.attachments || []
      },
      error: null
    };
  } catch (err: any) {
    console.error('Failed to create support ticket in Supabase:', err);
    return { data: null, error: err as Error };
  }
}

/**
 * Fetch FAQs from Supabase with fallback
 */
export async function fetchSupportFaqs(): Promise<{ data: SupportFaqRow[]; error: Error | null }> {
  if (!isLiveSupabase()) {
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from('support_faqs')
      .select('*')
      .eq('is_published', true)
      .order('sequence_order', { ascending: true });

    if (error) throw new Error(error.message);
    return { data: (data ?? []) as SupportFaqRow[], error: null };
  } catch (err: any) {
    console.error('Failed to fetch support FAQs from Supabase:', err);
    return { data: [], error: err as Error };
  }
}

/**
 * Update ticket status in Supabase
 */
export async function updateSupportTicketStatus(
  ticketId: string, 
  status: SupportTicketStatus, 
  resolutionNotes?: string
): Promise<{ success: boolean; error: Error | null }> {
  if (!isLiveSupabase()) {
    return { success: true, error: null };
  }

  try {
    const payload: any = { status };
    if (resolutionNotes) {
      payload.resolution_notes = resolutionNotes;
      if (status === 'RESOLVED' || status === 'CLOSED') {
        payload.resolved_at = new Date().toISOString();
      }
    }

    const { error } = await supabase
      .from('support_tickets')
      .update(payload)
      .eq('id', ticketId);

    if (error) throw new Error(error.message);
    return { success: true, error: null };
  } catch (err: any) {
    console.error('Failed to update ticket status in Supabase:', err);
    return { success: false, error: err as Error };
  }
}
