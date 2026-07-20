'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon, Loader2, MessageSquare, Mic, Pause, Play, Plus, Send,
  Square, Users, Volume2, VolumeX, Search, Phone, Hash, MoreVertical, Bot,
  ShieldCheck, AlertCircle, ArrowLeft
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAppStore } from '@/store/use-app-store';
import { normalizeDatabaseRole, roleToDatabaseRole } from '@/lib/rbac';
import type { ProjectSite } from '@/utils/mock-data';
import { supabase, getDbSiteId } from '@/utils/supabase-client';
import {
  attachmentUrl, createDirectConversation, ensureProject, getSessionProfile,
  listConversations, listMessages, listProjectMembers, markRead, sendMessage,
  createGroupChannel,
  type Conversation, type InboxMessage, type Profile,
} from '@/lib/inbox';

type MemberRow = { user_id:string; project_role:string; profiles:{id:string;name:string;email:string;role:string}|null };

function formatAudioTime(seconds:number) {
  if(!Number.isFinite(seconds))return '0:00';
  const wholeSeconds=Math.max(0,Math.floor(seconds));
  return `${Math.floor(wholeSeconds/60)}:${String(wholeSeconds%60).padStart(2,'0')}`;
}

function VoicePlayer({url,mine}:{url:string;mine:boolean}) {
  const audio=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [currentTime,setCurrentTime]=useState(0);
  const [duration,setDuration]=useState(0);
  const [muted,setMuted]=useState(false);

  const togglePlayback=async()=>{
    const element=audio.current;
    if(!element)return;
    if(element.paused)await element.play();
    else element.pause();
  };

  const seek=(value:number)=>{
    const element=audio.current;
    if(!element)return;
    element.currentTime=value;
    setCurrentTime(value);
  };

  const toggleMuted=()=>{
    const element=audio.current;
    if(!element)return;
    element.muted=!element.muted;
    setMuted(element.muted);
  };

  const progress=duration?Math.min(100,(currentTime/duration)*100):0;
  const railClass=mine?'bg-white/25':'bg-gray-300 dark:bg-gray-600';
  const fillClass=mine?'bg-white':'bg-[#b68d40]';

  return <div className={`mt-2 flex w-fit min-w-[260px] max-w-[340px] items-center gap-3 rounded-xl px-3 py-2.5 ${
    mine?'bg-[#b68d40] text-white shadow-sm':'bg-gray-100 dark:bg-gray-800 shadow-sm ring-1 ring-inset ring-black/[0.04] dark:ring-white/5'
  }`}>
    <audio
      ref={audio}
      src={url}
      preload="metadata"
      onLoadedMetadata={event=>setDuration(event.currentTarget.duration)}
      onDurationChange={event=>setDuration(event.currentTarget.duration)}
      onTimeUpdate={event=>setCurrentTime(event.currentTarget.currentTime)}
      onPlay={()=>setPlaying(true)}
      onPause={()=>setPlaying(false)}
      onEnded={()=>setPlaying(false)}
    />
    <button
      type="button"
      onClick={togglePlayback}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95 ${
        mine?'bg-white text-[#9a742f]':'bg-[#b68d40] text-white'
      }`}
      aria-label={playing?'Pause voice message':'Play voice message'}
    >
      {playing?<Pause className="h-4 w-4 fill-current"/>:<Play className="ml-0.5 h-4 w-4 fill-current"/>}
    </button>
    <div className="min-w-0 flex-1">
      <div className="relative h-4">
        <div className={`absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full ${railClass}`}>
          <div className={`h-full rounded-full ${fillClass}`} style={{width:`${progress}%`}}/>
        </div>
        <input
          type="range"
          min="0"
          max={duration||0}
          step="0.01"
          value={Math.min(currentTime,duration||0)}
          onChange={event=>seek(Number(event.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Seek voice message"
        />
      </div>
      <div className={`mt-0.5 flex items-center justify-between text-[10px] font-medium ${
        mine?'text-white/75':'text-gray-500 dark:text-gray-400'
      }`}>
        <span>{formatAudioTime(currentTime)}</span>
        <span>{formatAudioTime(duration)}</span>
      </div>
    </div>
    <button
      type="button"
      onClick={toggleMuted}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
        mine?'text-white/80 hover:bg-white/10 hover:text-white':'text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-white'
      }`}
      aria-label={muted?'Unmute voice message':'Mute voice message'}
    >
      {muted?<VolumeX className="h-4 w-4"/>:<Volume2 className="h-4 w-4"/>}
    </button>
  </div>;
}

function Media({ message,mine }:{message:InboxMessage;mine:boolean}) {
  const [url,setUrl]=useState('');
  const attachment=message.message_attachments?.[0];
  useEffect(()=>{if(attachment)attachmentUrl(attachment.storage_path).then(setUrl).catch(()=>setUrl(''));},[attachment]);
  if(!attachment)return null;
  if(!url)return <div className="mt-2 h-20 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"/>;
  return message.type==='image'
    ? <img src={url} alt="Message attachment" className="mt-2 max-h-72 rounded-xl object-cover"/>
    : <VoicePlayer key={url} url={url} mine={mine}/>;
}

export function InboxModule({project}:{project:ProjectSite}) {
  const [profile,setProfile]=useState<Profile|null>(null);
  const [dbProjectId,setDbProjectId]=useState('');
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [members,setMembers]=useState<MemberRow[]>([]);
  const [active,setActive]=useState<Conversation|null>(null);
  const [messages,setMessages]=useState<InboxMessage[]>([]);
  const [text,setText]=useState('');
  const [loading,setLoading]=useState(true);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [recording,setRecording]=useState(false);
  const [isMockInbox, setIsMockInbox] = useState(false);
  const recorder=useRef<MediaRecorder|null>(null);
  const chunks=useRef<Blob[]>([]);
  const recordingStarted=useRef(0);
  const fileInput=useRef<HTMLInputElement>(null);
  const bottom=useRef<HTMLDivElement>(null);

  const handleConvertMessage = async (message: InboxMessage, type: 'qc' | 'rework') => {
    if (!message.body) return;
    const isSimulation = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project');
    const dbSiteId = getDbSiteId(project.id);
    
    try {
      if (type === 'qc') {
        if (!isSimulation) {
          const { error: qcError } = await supabase
            .from('qc_inspections')
            .insert({
              id: `QCR-${Date.now().toString().slice(-4)}`,
              project_id: dbSiteId,
              status: 'Submitted',
              remarks: JSON.stringify({
                location: 'Tower A / Site',
                remarksText: message.body,
                contractorName: 'Pragati Builders',
                priority: 'MEDIUM',
                assignedEngineer: '-- Unassigned --'
              })
            });

          if (qcError) throw qcError;
          alert('Message successfully converted & logged as a QC Observation request!');
        } else {
          alert('[Simulation] Message successfully converted & logged as a QC Observation request!');
        }
      } else if (type === 'rework') {
        if (!isSimulation) {
          const { error: taskError } = await supabase
            .from('tasks')
            .insert({
              project_id: dbSiteId,
              title: `[REWORK] ${message.body.slice(0, 30)}...`,
              description: JSON.stringify({
                issueDescription: message.body,
                location: 'Tower A / Site',
                responsiblePerson: 'Pragati Builders',
                targetDate: new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0],
                status: 'Assigned',
                remarks: 'Raised from inbox chat message'
              }),
              priority: 'MEDIUM',
              status: 'TODO'
            });

          if (taskError) throw taskError;
          alert('Message successfully converted & raised as a Rework corrective action task!');
        } else {
          alert('[Simulation] Message successfully converted & raised as a Rework corrective action task!');
        }
      }
    } catch (err: any) {
      console.error('Failed to convert message:', err);
      alert(`Error converting message: ${err.message || err}`);
    }
  };

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [creatingChannel, setCreatingChannel] = useState(false);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim() || creatingChannel) return;
    setCreatingChannel(true);
    setError('');
    try {
      if (isMockInbox) {
        const newConv: Conversation = {
          id: 'mock-channel-' + Math.random().toString(),
          project_id: project.id,
          type: 'channel',
          title: newChannelName,
          updated_at: new Date().toISOString(),
          latest_message: 'Channel created.',
          unread_count: 0,
        };
        setConversations(prev => [newConv, ...prev]);
        setActive(newConv);
        setShowCreateModal(false);
        setNewChannelName('');
        setSelectedMembers([]);
        setCreatingChannel(false);
        return;
      }
      const id = await createGroupChannel(dbProjectId, newChannelName, selectedMembers);
      await refreshConversations(dbProjectId);
      const rows = await listConversations(dbProjectId);
      setActive(rows.find(row => row.id === id) ?? null);
      setShowCreateModal(false);
      setNewChannelName('');
      setSelectedMembers([]);
    } catch (e: any) {
      console.error('Error creating channel:', e);
      setError(e?.message || JSON.stringify(e) || 'Failed to create channel.');
    } finally {
      setCreatingChannel(false);
    }
  };

  const refreshConversations=useCallback(async(projectId:string)=>{
    const rows=await listConversations(projectId);
    setConversations(rows);
    setActive(current=>current ? rows.find(row=>row.id===current.id)??rows[0]??null : rows[0]??null);
  },[]);

  useEffect(()=>{
    let live=true;
    (async()=>{
      try {
        const me=await getSessionProfile();
        if(!me) {
          const currentUser = useAppStore.getState().currentUser;
          if (currentUser) {
            setIsMockInbox(true);
            setProfile({
              id: currentUser.id || 'mock-user-id',
              name: currentUser.name || 'Demo User',
              email: currentUser.email || 'demo@pramukh.com',
              role: roleToDatabaseRole(normalizeDatabaseRole(currentUser.role)),
            });
            setDbProjectId(project.id);
            const mockMembers: MemberRow[] = [
              {
                user_id: currentUser.id || 'mock-user-id',
                project_role: 'manager',
                profiles: {
                  id: currentUser.id || 'mock-user-id',
                  name: currentUser.name || 'Demo User',
                  email: currentUser.email || 'demo@pramukh.com',
                  role: currentUser.role,
                }
              },
              {
                user_id: 'mock-member-1',
                project_role: 'member',
                profiles: {
                  id: 'mock-member-1',
                  name: 'Priya Nair',
                  email: 'priya@pramukh.com',
                  role: 'SITE_ENGINEER',
                }
              },
              {
                user_id: 'mock-member-2',
                project_role: 'member',
                profiles: {
                  id: 'mock-member-2',
                  name: 'Dhruv Shah',
                  email: 'dhruv@pramukh.com',
                  role: 'QA_QC_ENGINEER',
                }
              }
            ];
            setMembers(mockMembers);
            const mockConversations: Conversation[] = [
              {
                id: 'mock-group-channel',
                project_id: project.id,
                type: 'project_group',
                title: 'Project Group Feed',
                updated_at: new Date().toISOString(),
                latest_message: 'Welcome to the project inbox feed.',
                unread_count: 0,
              }
            ];
            setConversations(mockConversations);
            setActive(mockConversations[0]);
            if(live) setLoading(false);
            return;
          } else {
            throw new Error('Sign in with Supabase to use the inbox.');
          }
        }
        const dbProject=await ensureProject(project.id,project.name);
        const [memberRows]=await Promise.all([listProjectMembers(dbProject.id),refreshConversations(dbProject.id)]);
        if(!live)return;
        setProfile(me);setDbProjectId(dbProject.id);setMembers(memberRows as unknown as MemberRow[]);
      } catch(e){setError(e instanceof Error?e.message:'Inbox could not be loaded.');}
      finally{if(live)setLoading(false);}
    })();
    return()=>{live=false;};
  },[project.id,project.name,refreshConversations]);

  const loadMessages=useCallback(async(conversation:Conversation)=>{
    if (isMockInbox) {
      const mockMsgs: InboxMessage[] = (project.chats || []).map(c => ({
        id: c.id,
        conversation_id: conversation.id,
        project_id: project.id,
        sender_id: c.senderName === 'Priya Nair' ? 'mock-member-1' : c.senderName === 'Dhruv Shah' ? 'mock-member-2' : 'mock-user-id',
        body: c.message,
        type: 'text',
        created_at: c.timestamp,
        profiles: {
          name: c.senderName,
        },
        message_attachments: []
      }));
      setMessages(prev => {
        const localOnly = prev.filter(m => m.id.startsWith('local-mock-'));
        const filteredLocal = localOnly.filter(l => !mockMsgs.some(m => m.id === l.id));
        return [...mockMsgs, ...filteredLocal].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
      return;
    }
    try {setMessages(await listMessages(conversation.id));await markRead(conversation.id);}
    catch(e){setError(e instanceof Error?e.message:'Messages could not be loaded.');}
  },[isMockInbox, project.id, project.chats]);

  useEffect(()=>{
    if(!active)return;
    const initialLoad=setTimeout(()=>void loadMessages(active),0);
    if (isMockInbox) {
      return () => clearTimeout(initialLoad);
    }
    const channel=supabase.channel(`conversation:${active.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`conversation_id=eq.${active.id}`},
        ()=>loadMessages(active)).subscribe();
    return()=>{clearTimeout(initialLoad);void supabase.removeChannel(channel);};
  },[active,loadMessages,isMockInbox]);

  useEffect(()=>bottom.current?.scrollIntoView({behavior:'smooth'}),[messages]);

  useEffect(() => {
    if (!profile || !dbProjectId || isMockInbox) return;
    const channel = supabase.channel(`invites:${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${profile.id}` }, () => {
        void refreshConversations(dbProjectId);
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, dbProjectId, refreshConversations, isMockInbox]);

  const submit=async(file?:File,duration?:number)=>{
    if(!active||(!text.trim()&&!file))return;
    setSending(true);setError('');
    
    if (isMockInbox) {
      const newMsgId = 'local-mock-' + Math.random().toString();
      const userMsg: InboxMessage = {
        id: newMsgId,
        conversation_id: active.id,
        project_id: project.id,
        sender_id: profile?.id || 'mock-user-id',
        body: text,
        type: 'text',
        created_at: new Date().toISOString(),
        profiles: {
          name: profile?.name || 'Demo User',
        },
        message_attachments: []
      };
      setMessages(prev => [...prev, userMsg]);
      setText('');
      setSending(false);
      
      setTimeout(() => {
        const replies = [
          "Got it! I will check the reinforcement drawings and get back to you shortly.",
          "Received. Let's make sure the site supervisor signs off on this before we pour.",
          "Noted. I will schedule a QA check for tomorrow morning.",
          "Thanks for the update. Let's keep a close eye on the curing temperature."
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        const replyMsg: InboxMessage = {
          id: 'local-mock-' + Math.random().toString(),
          conversation_id: active.id,
          project_id: project.id,
          sender_id: 'mock-member-1',
          body: randomReply,
          type: 'text',
          created_at: new Date().toISOString(),
          profiles: {
            name: 'Priya Nair',
          },
          message_attachments: []
        };
        setMessages(prev => [...prev, replyMsg]);
      }, 1500);
      
      return;
    }
    
    try {await sendMessage(active,text,file,duration);setText('');await loadMessages(active);await refreshConversations(dbProjectId);}
    catch(e){setError(e instanceof Error?e.message:'Message failed to send.');}
    finally{setSending(false);}
  };

  const startVoice=async()=>{
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const next=new MediaRecorder(stream);chunks.current=[];recordingStarted.current=Date.now();
      next.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      next.onstop=()=>{stream.getTracks().forEach(track=>track.stop());const blob=new Blob(chunks.current,{type:next.mimeType||'audio/webm'});const file=new File([blob],`voice-${Date.now()}.webm`,{type:blob.type});void submit(file,Math.max(1,Math.round((Date.now()-recordingStarted.current)/1000)));setRecording(false);};
      recorder.current=next;next.start();setRecording(true);
    } catch {setError('Microphone permission is required to send a voice note.');}
  };

  const openDirect=async(userId:string)=>{
    try {
      if (isMockInbox) {
        const otherMember = members.find(m => m.user_id === userId);
        const newConv: Conversation = {
          id: 'mock-direct-' + userId,
          project_id: project.id,
          type: 'direct',
          title: otherMember?.profiles?.name || 'Direct Chat',
          updated_at: new Date().toISOString(),
          latest_message: 'Direct conversation started.',
          unread_count: 0,
        };
        setConversations(prev => {
          const exists = prev.find(p => p.id === newConv.id);
          if (exists) return prev;
          return [newConv, ...prev];
        });
        setActive(newConv);
        return;
      }
      const id=await createDirectConversation(dbProjectId,userId);
      await refreshConversations(dbProjectId);
      const rows=await listConversations(dbProjectId);
      setActive(rows.find(row=>row.id===id)??null);
    } catch(e){setError(e instanceof Error?e.message:'Direct conversation could not be opened.');}
  };

  if(loading)return <div className="h-[calc(100vh-140px)] grid place-items-center"><Loader2 className="animate-spin text-[#b68d40]"/></div>;

  const getInitials = (name?: string | null) => (name || '?').substring(0, 2).toUpperCase();

  const renderAvatar = (name?: string | null, email?: string | null) => (
    <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 flex items-center justify-center text-[11px] font-bold shadow-sm ring-1 ring-black/5 dark:ring-white/10 uppercase">
      {getInitials(name || email)}
    </div>
  );

  return <div className="h-[calc(100vh-140px)] flex overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111] shadow-md dark:shadow-none">
    <aside className={`w-full md:w-72 shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-gray-50/50 dark:bg-[#161616] ${active ? 'hidden md:flex' : 'flex'}`}>
      <div className="h-16 px-5 flex flex-col justify-center border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-transparent">
        <h2 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100 flex items-center justify-between">
          <span>Project Inbox</span>
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><MoreVertical className="w-4 h-4"/></button>
        </h2>
        <p className="text-[11px] font-medium text-gray-500 mt-0.5">{project.name}</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <div>
          <h3 className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center justify-between">
            Channels
            <button onClick={() => setShowCreateModal(true)} className="p-0.5 rounded-sm hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><Plus className="w-3.5 h-3.5"/></button>
          </h3>
          <div className="space-y-0.5">
            {conversations.filter(c=>c.type==='project_group' || c.type==='channel').map(c=><button key={c.id} onClick={()=>setActive(c)} className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors ${active?.id===c.id?'bg-[#b68d40]/10 text-[#9a742f] dark:bg-[#b68d40]/20 dark:text-[#d4b068] font-medium':'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'}`}>
              <Hash className="w-4 h-4 opacity-70"/><span className="text-[13px] truncate flex-1">{c.title||'General'}</span>{Boolean(c.unread_count)&&<span className="rounded-full bg-[#b68d40] text-white text-[9px] px-1.5 py-0.5 leading-none">{c.unread_count}</span>}
            </button>)}
          </div>
        </div>
        <div>
          <h3 className="px-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center justify-between">
            Direct Messages
          </h3>
          <div className="space-y-0.5">
            {conversations.filter(c=>c.type!=='project_group').map(c=><button key={c.id} onClick={()=>setActive(c)} className={`w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors ${active?.id===c.id?'bg-[#b68d40]/10 text-[#9a742f] dark:bg-[#b68d40]/20 dark:text-[#d4b068] font-medium':'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50'}`}>
              <div className="w-4 h-4 rounded-[4px] bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 text-[8px] flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 uppercase shrink-0">{getInitials(c.title)}</div>
              <span className="text-[13px] truncate flex-1">{c.title||'Direct message'}</span>{Boolean(c.unread_count)&&<span className="rounded-full bg-[#b68d40] text-white text-[9px] px-1.5 py-0.5 leading-none">{c.unread_count}</span>}
            </button>)}
            {members.filter(m=>m.user_id!==profile?.id && !conversations.some(c=>c.type!=='project_group' && c.title===(m.profiles?.name||m.profiles?.email))).map(m=><button key={m.user_id} onClick={()=>openDirect(m.user_id)} className="w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 transition-colors text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800/50 group">
              <div className="w-4 h-4 rounded-[4px] border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0"><Plus className="w-3 h-3"/></div>
              <span className="text-[13px] truncate flex-1">{m.profiles?.name||m.profiles?.email}</span>
            </button>)}
          </div>
        </div>
      </div>
    </aside>
    <section className={`flex-1 min-w-0 flex flex-col bg-white dark:bg-[#111] ${active ? 'flex' : 'hidden md:flex'}`}>
      <header className="h-16 px-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white/50 dark:bg-[#111]/50 backdrop-blur-md z-10 sticky top-0">
        <div className="flex items-center gap-3">
          {active && (
            <button 
              type="button"
              onClick={() => setActive(null)}
              className="md:hidden p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Back to conversations list"
            >
              <ArrowLeft className="w-4.5 h-4.5" />
            </button>
          )}
          {active?.type === 'project_group' ? <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500"><Hash className="w-4 h-4"/></div> : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 text-[10px] flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 uppercase shrink-0">{getInitials(active?.title)}</div>}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[15px] leading-tight">{active?.title||'Direct message'}</h3>
            <p className="text-[11px] text-gray-500">{active?.type === 'project_group' ? 'Project team channel' : 'Direct message'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="w-8 h-8 grid place-items-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Search"><Search className="w-4 h-4"/></button>
          <button className="w-8 h-8 grid place-items-center rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Call"><Phone className="w-4 h-4"/></button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {!active&&<div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3"><MessageSquare className="w-10 h-10 opacity-20"/><p className="text-sm font-medium">Select a conversation to start messaging</p></div>}
        {messages.map((message, i)=>{
          const mine=message.sender_id===profile?.id;
          const isAI = message.body?.startsWith('🤖');
          const showHeader = i === 0 || messages[i-1].sender_id !== message.sender_id || (new Date(message.created_at).getTime() - new Date(messages[i-1].created_at).getTime() > 1000 * 60 * 5);
          
          return <div key={message.id} className={`flex gap-3 group`}>
            {showHeader ? (
              isAI ? (
                <div className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-800 dark:to-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                  <Bot className="w-5 h-5" />
                </div>
              ) : renderAvatar(mine ? (profile?.name || 'You') : message.profiles?.name)
            ) : <div className="w-9 shrink-0"/>}
            <div className="flex-1 min-w-0">
              {showHeader && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="font-semibold text-[13px] text-gray-900 dark:text-gray-100">{isAI ? 'Site Inspector AI' : (mine ? 'You' : (message.profiles?.name || 'Project member'))}</span>
                  <span className="text-[10px] text-gray-400">{new Date(message.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              )}
              {message.body && (
                isAI ? (
                  <div className="text-[13.5px] text-gray-800 dark:text-gray-300 leading-relaxed break-words">
                    <ReactMarkdown
                      components={{
                        h3: ({node, ...props}) => <h3 className="text-[14px] font-bold mt-4 mb-2 text-gray-900 dark:text-gray-100" {...props} />,
                        strong: ({node, ...props}) => <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1.5 my-2" {...props} />,
                        ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1.5 my-2" {...props} />,
                        li: ({node, ...props}) => <li className="pl-1" {...props} />,
                        p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />
                      }}
                    >
                      {message.body.replace(/^🤖\s*/, '')}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-[13.5px] text-gray-800 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
                )
              )}
              <Media message={message} mine={mine}/>
            </div>
            
            {/* Convert action menu on hover */}
            {message.body && !isAI && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1.5 ml-2 self-center bg-gray-50 dark:bg-[#202020] border border-gray-200 dark:border-gray-800 rounded-lg p-1 shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => handleConvertMessage(message, 'qc')}
                  title="Convert message text to a new QC Observation"
                  className="p-1 text-gray-500 hover:text-[#b68d40] hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors flex items-center gap-0.5 text-[10px] font-extrabold uppercase"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">QC</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConvertMessage(message, 'rework')}
                  title="Convert message text to a new Rework Task"
                  className="p-1 text-gray-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors flex items-center gap-0.5 text-[10px] font-extrabold uppercase"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Rework</span>
                </button>
              </div>
            )}
          </div>
        })}
        <div ref={bottom}/>
      </div>
      {error&&<div className="mx-6 mb-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 px-3 py-2 text-xs">{error}</div>}
      <div className="px-6 pb-6 pt-2">
        <div className="flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161616] focus-within:ring-1 focus-within:ring-[#b68d40]/50 focus-within:border-[#b68d40] transition-all shadow-sm overflow-hidden">
          <textarea 
            value={text} 
            onChange={e=>setText(e.target.value)} 
            onKeyDown={e=>{if(e.key==='Enter' && !e.shiftKey){e.preventDefault();void submit();}}} 
            disabled={!active||sending} 
            placeholder={active ? `Message ${active.title || 'project'}...` : 'Select a conversation...'} 
            className="w-full bg-transparent px-4 py-3 text-[13.5px] outline-none resize-none min-h-[48px] max-h-32 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
            rows={1}
          />
          <div className="flex items-center justify-between px-2 py-2 bg-gray-50/50 dark:bg-[#161616] border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-1">
              <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)void submit(file);e.target.value='';}}/>
              <button onClick={()=>fileInput.current?.click()} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label="Send image"><ImageIcon className="w-4.5 h-4.5"/></button>
              <button onClick={()=>recording?recorder.current?.stop():startVoice()} className={`relative p-1.5 rounded-md transition-colors ${recording?'text-red-500 bg-red-50 dark:bg-red-500/10':'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`} aria-label={recording?'Stop recording':'Record voice'}>
                {recording?<Square className="w-4.5 h-4.5 fill-current"/>:<Mic className="w-4.5 h-4.5"/>}
                {recording && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"/>}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400 hidden sm:inline-block font-medium"><strong>Return</strong> to send</span>
              <button onClick={()=>submit()} disabled={!active||sending||(!text.trim()&&!recording)} className="px-3 py-1.5 rounded-md bg-[#b68d40] text-white text-[13px] font-medium hover:bg-[#9a742f] disabled:opacity-40 transition-colors flex items-center gap-1.5 shadow-sm">
                {sending?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<>Send <Send className="w-3.5 h-3.5"/></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
      {/* Create Channel Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Create Channel</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Plus className="w-5 h-5 rotate-45"/>
              </button>
            </div>
            <form onSubmit={handleCreateChannel} className="flex-1 overflow-y-auto p-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Channel Name</label>
                <input
                  type="text"
                  required
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  placeholder="e.g. Site Safety"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-[#b68d40] focus:ring-1 focus:ring-[#b68d40] outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Add Members</label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                  {members.filter(m => m.user_id !== profile?.id).map(m => (
                    <label key={m.user_id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(m.user_id)}
                        onChange={e => {
                          if (e.target.checked) setSelectedMembers([...selectedMembers, m.user_id]);
                          else setSelectedMembers(selectedMembers.filter(id => id !== m.user_id));
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-[#b68d40] focus:ring-[#b68d40]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.profiles?.name || m.profiles?.email}</p>
                        {m.profiles?.name && <p className="text-xs text-gray-500 truncate">{m.profiles.email}</p>}
                      </div>
                    </label>
                  ))}
                  {members.filter(m => m.user_id !== profile?.id).length === 0 && (
                    <p className="text-sm text-gray-500 italic">No other members in this project.</p>
                  )}
                </div>
              </div>
            </form>
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleCreateChannel} disabled={creatingChannel || !newChannelName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-[#b68d40] hover:bg-[#9a742f] rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2">
                {creatingChannel ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                Create
              </button>
            </div>
          </div>
        </div>
      )}
  </div>;
}
