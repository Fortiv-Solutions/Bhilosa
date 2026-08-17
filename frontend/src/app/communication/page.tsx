'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/use-app-store';
import { Building, Send, MessageSquare } from 'lucide-react';
import { supabase, getDbUserId, getSupabaseJsonHeaders } from '@/utils/supabase-client';

export default function CommunicationPage() {
  const { initSupabase, currentUser } = useAppStore();
  const [apiState, setApiState] = useState<'Live' | 'Simulation'>('Simulation');
  
  const [sources, setSources] = useState<any[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [dbMessages, setDbMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [dbMessages]);

  useEffect(() => {
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

    if (isSimulation) {
      setApiState('Simulation');
      const mockSources = [
        {
          id: '918980028485',
          isGroup: false,
          display: 'Rohan Mehta (PM)',
          lastActivity: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: '919900000003',
          isGroup: false,
          display: 'Ramesh Patel (Site Eng)',
          lastActivity: new Date(Date.now() - 7200000).toISOString()
        },
        {
          id: '120363023940239@g.us',
          isGroup: true,
          display: 'Group: Site Engineers Coordination',
          lastActivity: new Date(Date.now() - 1800000).toISOString()
        }
      ];
      setSources(mockSources);
      if (!activeSourceId) {
        setActiveSourceId(mockSources[0].id);
      }
      return;
    }

    setApiState('Live');
    initSupabase();

    const fetchSources = async () => {
      const { data } = await supabase
        .from('raw_messages')
        .select('from_number, group_jid, received_at, payload')
        .order('received_at', { ascending: false });

      if (data) {
        const uniqueSources = new Map();
        data.forEach(row => {
          const id = row.group_jid || row.from_number;
          if (!uniqueSources.has(id)) {
            let senderName = null;
            try {
              const parsedPayload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
              if (parsedPayload?.sender_name) {
                senderName = parsedPayload.sender_name;
              } else if (parsedPayload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name) {
                senderName = parsedPayload.entry[0].changes[0].value.contacts[0].profile.name;
              }
            } catch (e) {}

            const displayName = senderName ? senderName : (row.group_jid ? `Group: ${row.group_jid}` : row.from_number);

            uniqueSources.set(id, {
              id,
              isGroup: !!row.group_jid,
              display: displayName,
              lastActivity: row.received_at
            });
          }
        });
        
        const sourceList = Array.from(uniqueSources.values());
        setSources(sourceList);
        if (sourceList.length > 0 && !activeSourceId) {
          setActiveSourceId(sourceList[0].id);
        }
      }
    };
    fetchSources();

    const msgSub = supabase.channel('raw-messages-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'raw_messages' }, () => {
        fetchSources();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [initSupabase, activeSourceId]); 

  useEffect(() => {
    if (!activeSourceId) return;

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

    if (isSimulation) {
      const now = new Date();
      if (activeSourceId === '918980028485') {
        setDbMessages([
          {
            id: 'm1',
            from_number: '918980028485',
            message_type: 'text',
            payload: {
              sender_name: 'Rohan Mehta',
              text_body: "Hi, I have updated the budget estimates for Central Park."
            },
            received_at: new Date(now.getTime() - 10000000).toISOString()
          },
          {
            id: 'm2',
            from_number: '918980028485',
            message_type: 'text',
            payload: {
              sender_name: 'Rohan Mehta',
              text_body: "Please review and confirm if we can dispatch the purchase order."
            },
            received_at: new Date(now.getTime() - 5000000).toISOString()
          }
        ]);
      } else if (activeSourceId === '919900000003') {
        setDbMessages([
          {
            id: 'm3',
            from_number: '919900000003',
            message_type: 'text',
            payload: {
              sender_name: 'Ramesh Patel',
              text_body: "We received the steel rebars on site. GP-99201 gate entry is logged."
            },
            received_at: new Date(now.getTime() - 15000000).toISOString()
          }
        ]);
      } else {
        setDbMessages([
          {
            id: 'm4',
            group_jid: '120363023940239@g.us',
            from_number: '919900000003',
            message_type: 'text',
            payload: {
              sender_name: 'Ramesh Patel',
              text_body: "Team, the excavation progress is at 60% for Orbit 4. Shuttering materials are arriving tomorrow."
            },
            received_at: new Date(now.getTime() - 8000000).toISOString()
          }
        ]);
      }
      return;
    }

    const fetchMessages = async () => {
      const activeSrc = sources.find(s => s.id === activeSourceId);
      if (!activeSrc) return;

      const column = activeSrc.isGroup ? 'group_jid' : 'from_number';
      
      // Fetch inbound messages
      const { data: inboundData } = await supabase
        .from('raw_messages')
        .select(`
          *,
          clean_messages ( media_url, clean_text ),
          media_files ( storage_path, original_url ),
          transcriptions ( clean_transcript )
        `)
        .eq(column, activeSourceId);

      // Fetch outbound messages
      const { data: outboundData } = await supabase
        .from('outbound_messages')
        .select('*')
        .or(`to_phone.eq.${activeSourceId},to_phone.eq.+${activeSourceId}`);

      const merged: any[] = [];
      if (inboundData) {
        merged.push(...inboundData.map(msg => ({
          ...msg,
          isOutbound: false
        })));
      }
      if (outboundData) {
        merged.push(...outboundData.map(msg => ({
          id: msg.id,
          message_type: msg.message_type || 'text',
          from_number: 'Me',
          payload: {
            sender_name: currentUser.name,
            text_body: msg.message_text
          },
          received_at: msg.created_at,
          processing_status: msg.status === 'sent' || msg.status === 'delivered' || msg.status === 'read' ? 'completed' : 'pending',
          isOutbound: true
        })));
      }

      // Sort by received_at timestamp
      merged.sort((a, b) => new Date(a.received_at || 0).getTime() - new Date(b.received_at || 0).getTime());
      
      setDbMessages(prev => {
        // Find local optimistic messages that haven't synced to database yet
        const localOptimistic = prev.filter(msg => 
          msg.id.startsWith('m_sent_') || msg.id.startsWith('m_sim_user_')
        );
        
        // Filter out any local optimistic messages that are now saved in the database
        const unsyncedOptimistic = localOptimistic.filter(lom => 
          !merged.some(dbMsg => dbMsg.payload?.text_body === lom.payload?.text_body)
        );

        const finalMerged = [...merged, ...unsyncedOptimistic];
        finalMerged.sort((a, b) => new Date(a.received_at || 0).getTime() - new Date(b.received_at || 0).getTime());
        return finalMerged;
      });
    };
    fetchMessages();

    // Debounced fetch to avoid excessive refetches when multiple events fire rapidly
    // (e.g. n8n creates media_files + clean_messages + updates raw_messages within ms)
    const debouncedFetch = () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
      fetchDebounceRef.current = setTimeout(() => {
        fetchMessages();
      }, 500);
    };

    // Listen for inserts on raw_messages, outbound_messages, media_files, clean_messages
    // and updates on raw_messages (for when processing_status changes to 'completed')
    const threadSub = supabase.channel(`raw-messages-${activeSourceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'raw_messages' }, () => {
        fetchMessages(); // Immediate for new messages (user expects instant appearance)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'outbound_messages' }, () => {
        fetchMessages();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'media_files' }, () => {
        // Media file downloaded and stored by n8n — refetch so audio/image URLs resolve
        debouncedFetch();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clean_messages' }, () => {
        // Cleaned message created by n8n — refetch so media_url from clean_messages resolves
        debouncedFetch();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'raw_messages' }, () => {
        // processing_status changed (e.g. 'pending' → 'completed') — refetch
        debouncedFetch();
      })
      .subscribe();

    return () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
      supabase.removeChannel(threadSub);
    };
  }, [activeSourceId, sources, currentUser]);

  const activeSource = sources.find(s => s.id === activeSourceId);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeSourceId || isSending) return;

    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');

    if (isSimulation) {
      const now = new Date();
      const newMockMsg = {
        id: `m_sim_user_${Date.now()}`,
        message_type: 'text',
        payload: {
          sender_name: currentUser.name,
          text_body: messageInput.trim()
        },
        received_at: now.toISOString()
      };
      
      if (activeSource?.isGroup) {
        (newMockMsg as any).group_jid = activeSourceId;
        (newMockMsg as any).from_number = '919900000002'; // mock sender
      } else {
        (newMockMsg as any).from_number = activeSourceId;
      }

      setDbMessages(prev => [...prev, newMockMsg]);
      setMessageInput('');

      // Send to webhook silently via proxy if configured
      const hasWebhook = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_WF5_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL);
      if (hasWebhook) {
        try {
          const sentBy = getDbUserId(currentUser.id);
          const formattedTo = activeSourceId?.startsWith('+') ? activeSourceId.substring(1) : activeSourceId;
          
          await fetch('/api/send-message', {
            method: 'POST',
            headers: await getSupabaseJsonHeaders(),
            body: JSON.stringify({
              to: formattedTo,
              text: messageInput.trim(),
              status: 'queued',
              source: 'dashboard',
              timestamp: now.toISOString(),
              sent_by: sentBy,
              site_id: 'a1b2c3d4-0000-0000-0000-000000000001',
              thread_id: 'b2c3d4e5-0000-0000-0000-000000000009',
              to_user_id: 'b2c3d4e5-0000-0000-0000-000000000008'
            }),
          });
        } catch (webhookErr) {
          console.warn("Could not reach simulation webhook proxy:", webhookErr);
        }
      }
      return;
    }

    const hasWebhook = typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_WF5_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL);
    if (!hasWebhook) {
      alert("Webhook URL is not configured in .env.");
      return;
    }

    setIsSending(true);
    try {
      let threadId = null;
      let siteId = null;
      let toUserId = null;
      const sentBy = currentUser ? getDbUserId(currentUser.id) : 'b2c3d4e5-0000-0000-0000-000000000002'; // default to PM

      try {
        let threadQuery = supabase
          .from('message_threads')
          .select('id, site_id, user_id');
        
        if (activeSource?.isGroup) {
          threadQuery = threadQuery.eq('group_jid', activeSourceId);
        } else {
          threadQuery = threadQuery.eq('phone_number', activeSourceId);
        }

        const { data: threadData } = await threadQuery.limit(1);

        if (threadData && threadData.length > 0) {
          threadId = threadData[0].id;
          siteId = threadData[0].site_id;
          toUserId = threadData[0].user_id;
        }

        if (!toUserId && !activeSource?.isGroup) {
          const { data: phoneData } = await supabase
            .from('whatsapp_numbers')
            .select('user_id')
            .eq('phone_number', activeSourceId)
            .limit(1);
          
          if (phoneData && phoneData.length > 0) {
            toUserId = phoneData[0].user_id;
          }
        }
      } catch (err) {
        console.error("Failed to query thread/user from Supabase:", err);
      }

      const formattedTo = activeSourceId?.startsWith('+') ? activeSourceId.substring(1) : activeSourceId;

      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: await getSupabaseJsonHeaders(),
        body: JSON.stringify({
          to: formattedTo,
          text: messageInput.trim(),
          status: 'queued',
          source: 'dashboard',
          timestamp: new Date().toISOString(),
          sent_by: sentBy,
          site_id: siteId,
          thread_id: threadId,
          to_user_id: toUserId
        }),
      });

      if (response.ok) {
        // Construct the sent message object locally so it shows up in UI immediately
        const sentMsg = {
          id: `m_sent_${Date.now()}`,
          message_type: 'text',
          from_number: 'Me',
          payload: {
            sender_name: currentUser.name,
            text_body: messageInput.trim()
          },
          received_at: new Date().toISOString(),
          processing_status: 'completed',
          isOutbound: true
        };
        setDbMessages(prev => [...prev, sentMsg]);
        setMessageInput('');
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to send message: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("An error occurred while sending the message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] w-full overflow-hidden bg-white dark:bg-gray-950 rounded-[32px] shadow-sm border border-gray-100 dark:border-gray-900/40 flex flex-col">
      <div className="flex h-full overflow-hidden">
        {/* Left sidebar (1/3) */}
        <div className="w-[300px] md:w-[350px] flex-shrink-0 border-r border-gray-100 dark:border-gray-900/40 flex flex-col bg-gray-50/50 dark:bg-gray-950/50 backdrop-blur-xl z-20">
          {/* Chats Header */}
          <div className="h-20 px-6 border-b border-gray-100 dark:border-gray-900/40 flex items-center justify-between bg-white dark:bg-gray-950 z-10 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
            <h2 className="font-heading font-bold text-[18px] tracking-tight text-gray-900 dark:text-gray-100">Messages</h2>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e83e8c] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#e83e8c]"></span>
              </span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 py-3 scrollbar-none">
            {sources.map((src, idx) => {
              const isActive = src.id === activeSourceId;
              const initials = src.display.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
              
              const previewText = src.isGroup ? "Tap to view group messages" : "Tap to view messages";
              const timeDisplay = src.lastActivity ? src.lastActivity.substring(11, 16) : '';
              
              return (
                <button
                  key={src.id}
                  onClick={() => setActiveSourceId(src.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 mb-1 text-left transition-all relative overflow-hidden group
                    ${isActive 
                      ? 'bg-white dark:bg-gray-900 shadow-[0_2px_10px_-4px_rgba(182,141,64,0.3)] border border-gray-100 dark:border-gray-800 rounded-2xl scale-[1.02]' 
                      : 'hover:bg-white/60 dark:hover:bg-gray-900/50 rounded-2xl border border-transparent hover:border-gray-100 dark:hover:border-gray-800'}`}
                >
                  {/* Gold left bar for active state */}
                  {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 h-10 w-1 bg-gradient-to-b from-[#f2679f] to-[#e83e8c] rounded-r-md"></div>}
                  
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-[14px] flex-shrink-0 shadow-sm border
                    ${isActive 
                      ? 'bg-gradient-to-br from-[#fdeef4] to-[#fbe6ee] dark:from-[#3a0f28] dark:to-[#2a0a1c] text-[#e83e8c] border-[#e83e8c]/20' 
                      : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-800 group-hover:text-[#e83e8c]'}`}>
                    {initials}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`text-[15px] truncate font-semibold ${isActive ? 'text-[#e83e8c]' : 'text-gray-700 dark:text-gray-300'}`}>{src.display}</p>
                      <span className={`text-[11px] font-medium flex-shrink-0 ${isActive ? 'text-[#e83e8c]/80' : 'text-gray-400'}`}>{timeDisplay}</span>
                    </div>
                    <p className={`text-[13px] truncate ${isActive ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500 dark:text-gray-500'}`}>
                      {previewText}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right chat stream (2/3) */}
        <div className="flex-1 flex flex-col bg-[#fdeef4] dark:bg-[#0c0a09] relative">
          {/* Premium pattern overlay */}
          <div className="absolute inset-0 z-0 opacity-[0.04] dark:opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#e83e8c 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

          {/* Active Header */}
          <div className="h-20 border-b border-gray-100 dark:border-gray-900/40 px-6 flex items-center justify-between bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-10 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#f2679f] to-[#a3105c] flex items-center justify-center text-white font-bold text-[14px] shadow-[0_2px_10px_-2px_rgba(182,141,64,0.4)] border border-[#e83e8c]/20">
                {activeSource?.display ? activeSource.display.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'WA'}
              </div>
              <div className="flex flex-col">
                <p className="text-[16px] font-bold text-gray-900 dark:text-gray-100 tracking-tight">{activeSource?.display || 'Loading...'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_4px_0_rgba(16,185,129,0.5)]" />
                  <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">Online</p>
                </div>
              </div>
            </div>
            <span className={`text-[10px] px-3 py-1.5 rounded-full font-bold uppercase tracking-wider border shadow-sm ${
              apiState === 'Live' ? 'bg-[#e83e8c]/10 text-[#e83e8c] border-[#e83e8c]/20' : 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/20'
            }`}>
              {apiState === 'Live' ? 'LIVE SYNC' : 'SIMULATION'}
            </span>
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 z-10 scroll-smooth">
            {dbMessages.map((msg) => {
              let textContent = '';
              let senderName = msg.from_number;
              const timestamp = msg.received_at ? msg.received_at.substring(11, 16) : '';

              let mediaContent = null;
              try {
                const parsedPayload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload;
                
                if (parsedPayload?.sender_name) {
                  senderName = parsedPayload.sender_name;
                } else if (parsedPayload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name) {
                  senderName = parsedPayload.entry[0].changes[0].value.contacts[0].profile.name;
                }

                // Resolve media URL
                let resolvedMediaUrl = null;
                
                if (msg.media_files && msg.media_files.length > 0) {
                  const mf = msg.media_files[0];
                  if (mf.storage_path) {
                    const cleanPath = mf.storage_path.replace(/^pms-media\//, '');
                    resolvedMediaUrl = supabase.storage.from('pms-media').getPublicUrl(cleanPath).data.publicUrl;
                  } else if (mf.original_url) {
                    resolvedMediaUrl = mf.original_url;
                  }
                }
                
                if (!resolvedMediaUrl && msg.clean_messages && msg.clean_messages.length > 0 && msg.clean_messages[0].media_url) {
                  resolvedMediaUrl = msg.clean_messages[0].media_url;
                }
                
                if (!resolvedMediaUrl) {
                  resolvedMediaUrl = parsedPayload?.image_url || parsedPayload?.audio_url || parsedPayload?.video_url || parsedPayload?.document_url || msg.media_url;
                }
                
                if (msg.message_type === 'text') {
                  textContent = parsedPayload?.text_body || parsedPayload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || JSON.stringify(parsedPayload, null, 2);
                } else if (msg.message_type === 'image') {
                  textContent = parsedPayload?.image_caption || '';
                  mediaContent = resolvedMediaUrl ? (
                    <div className="mb-2 rounded-xl overflow-hidden border border-black/5 dark:border-white/5">
                      <img src={resolvedMediaUrl} alt="Image" className="max-w-full h-auto max-h-[300px] object-cover" />
                    </div>
                  ) : (
                    <span className="italic text-gray-500">📷 Image loading or unavailable...</span>
                  );
                } else if (msg.message_type === 'audio') {
                  const transcript = msg.transcriptions?.[0]?.clean_transcript || msg.clean_messages?.[0]?.clean_text;
                  mediaContent = resolvedMediaUrl ? (
                    <div className="mb-2 flex flex-col gap-2">
                      <audio controls className="w-full min-w-[220px] max-w-[260px] h-[40px] rounded-full shadow-xs">
                        <source src={resolvedMediaUrl} />
                        Your browser does not support the audio element.
                      </audio>
                      {transcript && (
                        <div className="bg-white/60 dark:bg-black/20 p-2.5 rounded-xl text-[13px] text-gray-700 dark:text-gray-300 border border-black/5 dark:border-white/5 italic max-w-full">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="w-1 h-3 bg-[#e83e8c] rounded-full"></span>
                            <span className="font-semibold text-[#e83e8c] not-italic text-[10px] uppercase tracking-wider">Transcript</span>
                          </div>
                          "{transcript}"
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="italic text-gray-500">🎵 Audio loading or unavailable...</span>
                  );
                } else {
                  textContent = JSON.stringify(parsedPayload, null, 2);
                }
              } catch (e) {
                textContent = 'Unparseable payload';
              }

              const isMe = msg.isOutbound || senderName === currentUser.name || senderName === 'Me';
              const displaySender = senderName === 'Ramesh Patel' ? 'Priya Nair (SITE_ENGINEER)' : 
                                    senderName === 'Rohan Mehta' ? 'Rohan Mehta (PROJECT_MANAGER)' : 
                                    senderName;

              return (
                <div key={msg.id} className={`flex flex-col w-full ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name */}
                  {!isMe && senderName !== activeSource?.display && (
                    <div className="text-[11px] text-[#e83e8c] font-bold mb-1 tracking-wider uppercase ml-1">
                      {displaySender}
                    </div>
                  )}
                  <div className={`max-w-[85%] lg:max-w-[70%] px-4 py-3 relative shadow-sm border ${
                    isMe 
                      ? 'bg-gradient-to-br from-[#e83e8c] to-[#c3006a] rounded-2xl rounded-tr-sm text-white border-[#a3105c]/30 shadow-[0_2px_8px_-2px_rgba(182,141,64,0.3)]' 
                      : 'bg-white dark:bg-gray-900 rounded-2xl rounded-tl-sm text-gray-800 dark:text-gray-200 border-gray-100 dark:border-gray-800 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)]'
                  }`}>
                    {/* Message Content */}
                    <div className="flex flex-col">
                      {mediaContent}
                      <div className="flex items-end gap-4 flex-wrap">
                        {textContent && (
                          <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words ${isMe ? 'font-medium' : 'font-normal'}`}>
                            {textContent}
                          </p>
                        )}
                        
                        {/* Meta Info: Time and Processing Status */}
                        <div className={`flex items-center gap-1.5 text-[10px] font-semibold ml-auto self-end mt-1 shrink-0 ${isMe ? 'text-white/80' : 'text-gray-400'}`}>
                          <span className="translate-y-px tracking-wide">{timestamp}</span>
                          {isMe && (
                            <svg viewBox="0 0 16 11" width="14" height="10" className={msg.processing_status === 'completed' ? 'text-white' : 'text-white/50'}>
                              <path fill="currentColor" d="M11.804 3.006l-4.221 4.222-2.184-2.185-1.061 1.06 3.245 3.245 5.282-5.281-1.061-1.061z"></path>
                              <path fill="currentColor" d="M15.111 3.006l-4.222 4.222-1.06-1.06 4.221-4.222 1.061 1.061z"></path>
                              <path fill="currentColor" d="M5.4 7.228l-1.061 1.06-3.244-3.245 1.06-1.061 3.245 3.246z"></path>
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {dbMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 bg-white dark:bg-gray-900 rounded-full flex items-center justify-center shadow-lg mb-6 border border-gray-100 dark:border-gray-800">
                  <MessageSquare className="w-8 h-8 text-[#e83e8c]" />
                </div>
                <h3 className="font-heading text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">No messages yet</h3>
                <p className="text-sm font-medium text-gray-500">Send a message to start the conversation.</p>
              </div>
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
          
          {/* Floating Input Area */}
          <div className="p-4 bg-gradient-to-t from-[#fdeef4] via-[#fdeef4]/80 to-transparent dark:from-[#0c0a09] dark:via-[#0c0a09]/80 z-10 shrink-0">
            <div className="max-w-4xl mx-auto flex items-center gap-3 bg-white dark:bg-gray-900 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-gray-200/50 dark:border-gray-800/80 p-2 pl-4 transition-all focus-within:shadow-[0_8px_30px_rgba(182,141,64,0.15)] focus-within:border-[#e83e8c]/30">
              <button className="text-gray-400 hover:text-[#e83e8c] transition-colors shrink-0 p-2 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800">
                <svg viewBox="0 0 24 24" width="22" height="22" className="fill-current"><path d="M1.816 15.556v.002c0 1.502.584 2.912 1.646 3.972s2.472 1.647 3.974 1.647a5.58 5.58 0 0 0 3.972-1.645l9.547-9.548c.769-.768 1.147-1.767 1.058-2.817-.079-.968-.548-1.927-1.319-2.698-1.594-1.592-4.068-1.711-5.517-.262l-7.916 7.915c-.881.881-.792 2.25.214 3.261.959.958 2.423 1.053 3.263.215l5.511-5.512c.28-.28.267-.722.053-.936l-.244-.244c-.191-.191-.567-.349-.957.04l-5.506 5.506c-.18.18-.635.127-.976-.214-.098-.097-.576-.613-.213-.973l7.915-7.917c.818-.817 2.267-.699 3.23.262.5.501.802 1.1.849 1.685.051.573-.156 1.111-.589 1.543l-9.547 9.549a3.97 3.97 0 0 1-2.829 1.171 3.975 3.975 0 0 1-2.83-1.173 3.973 3.973 0 0 1-1.172-2.828c0-1.071.415-2.076 1.172-2.83l7.209-7.211c.157-.157.264-.579.028-.814L11.5 4.36a.57.57 0 0 0-.834.018l-7.205 7.207a5.577 5.577 0 0 0-1.645 3.971z"></path></svg>
              </button>
              <form onSubmit={handleSendMessage} className="flex-1 flex items-center gap-2">
                <input 
                  type="text" 
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type your message..." 
                  disabled={isSending}
                  className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 px-2 py-2 text-[15px] focus:outline-none placeholder-gray-400 font-medium"
                />
                <button 
                  type="submit" 
                  disabled={!messageInput.trim() || isSending}
                  className="w-11 h-11 rounded-full bg-gradient-to-br from-[#f2679f] to-[#e83e8c] hover:from-[#f68bc2] hover:to-[#ec6aa8] flex items-center justify-center text-white transition-all shadow-md disabled:opacity-50 disabled:grayscale shrink-0"
                >
                  {isSending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send className="w-5 h-5 ml-0.5" />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

