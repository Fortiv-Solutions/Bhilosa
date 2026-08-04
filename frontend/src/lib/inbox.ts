import { supabase } from '@/utils/supabase-client';
import { normalizeDatabaseRole, roleToDatabaseRole } from '@/lib/rbac';
import type { DatabaseRole } from '@/lib/roles';

export type Profile={id:string;name:string;email:string;role:DatabaseRole;project_id?:string|null};
export type InboxProject={id:string;code:string;name:string};
export type Conversation={id:string;project_id:string;type:'project_group'|'channel'|'direct';title:string|null;updated_at:string;latest_message?:string|null;unread_count?:number};
export type Attachment={id:string;storage_path:string;mime_type:string;size_bytes:number;duration_seconds:number|null};
export type InboxMessage={id:string;conversation_id:string;project_id:string;sender_id:string;body:string|null;type:'text'|'image'|'voice';created_at:string;profiles?:{name:string}|null;message_attachments?:Attachment[]};

export async function getSessionProfile(){const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).single();if(error)throw error;return {...data,role:roleToDatabaseRole(normalizeDatabaseRole((data as {role?:string|null}).role))} as Profile;}
export async function signIn(email:string,password:string){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return getSessionProfile();}
export async function signOut(){await supabase.auth.signOut();}
export async function listProjects(){const {data,error}=await supabase.from('projects').select('id,code,name').eq('status','active').order('name');if(error)throw error;return(data??[])as InboxProject[];}
export async function ensureProject(code:string,name:string){const current=await supabase.from('projects').select('id,code,name').eq('code',code).maybeSingle();if(current.error)throw current.error;if(current.data)return current.data as InboxProject;const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in before creating a project inbox.');const {data,error}=await supabase.from('projects').insert({code,name,created_by:user.id}).select('id,code,name').single();if(error)throw error;return data as InboxProject;}
export async function bootstrapInboxData(){
 const profile=await getSessionProfile();
 if(!profile||!['super_admin','upper_management'].includes(profile.role))return;
 const existing=await listProjects();
 if(existing.length>0)return;
 const central=await ensureProject('central-park','Central Park');
 await ensureProject('orbit-4','Orbit 4');
 const profiles=await supabase.from('profiles').select('id,role').eq('is_active',true);
 if(profiles.error)throw profiles.error;
 for(const member of profiles.data??[]){
  if(normalizeDatabaseRole(member.role)==='PR_TEAM')continue;
  const assignment=await supabase.from('project_members').upsert({
   project_id:central.id,user_id:member.id,
   project_role:'manager',is_active:true,
  });
  if(assignment.error)throw assignment.error;
 }
 const conversations=await listConversations(central.id);
 const group=conversations.find(item=>item.type==='project_group');
 if(group){
  const messages=await listMessages(group.id);
  if(messages.length===0)await sendMessage(group,'Welcome to the Central Park project inbox. This room is shared only with assigned project members.');
 }
}
export async function listProjectMembers(projectId:string){const {data,error}=await supabase.from('project_members').select('user_id,project_role,profiles!project_members_user_id_fkey(id,name,email,role)').eq('project_id',projectId).eq('is_active',true);if(error)throw error;return data??[];}
export async function assignMember(projectId:string,email:string,projectRole='member'){const found=await supabase.from('profiles').select('id').ilike('email',email.trim()).single();if(found.error)throw new Error('No Supabase user exists with that email.');const {error}=await supabase.from('project_members').upsert({project_id:projectId,user_id:found.data.id,project_role:projectRole,is_active:true});if(error)throw error;}
export async function listConversations(projectId:string){
  const targetIds = Array.from(new Set([
    projectId,
    '00000000-0000-0000-0000-000000000001',
    'f6704467-df8c-4f51-a49b-ddfdc40c39af'
  ].filter(Boolean)));

  const {data,error}=await supabase.from('conversations').select('id,project_id,type,title,updated_at').in('project_id',targetIds).order('updated_at',{ascending:false});
  if(error)throw error;
  const {data:{user}}=await supabase.auth.getUser();
  return Promise.all(((data??[])as Conversation[]).map(async c=>{
    const [latest,membership]=await Promise.all([
      supabase.from('messages').select('body,type,created_at').eq('conversation_id',c.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      user?supabase.from('conversation_members').select('last_read_at').eq('conversation_id',c.id).eq('user_id',user.id).maybeSingle():Promise.resolve({data:null})
    ]);
    let unread=0;
    if(user){
      let q=supabase.from('messages').select('id',{count:'exact',head:true}).eq('conversation_id',c.id).neq('sender_id',user.id);
      if(membership.data?.last_read_at)q=q.gt('created_at',membership.data.last_read_at);
      const count=await q;
      unread=count.count??0;
    }
    return{...c,latest_message:latest.data?.body||latest.data?.type||null,unread_count:unread};
  }));
}
export async function createDirectConversation(projectId:string,userId:string){const {data,error}=await supabase.rpc('get_or_create_direct_conversation',{target_project:projectId,other_user:userId});if(error)throw error;return data as string;}
export async function listMessages(conversationId:string,before?:string){let query=supabase.from('messages').select('*,message_attachments(*)').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(50);if(before)query=query.lt('created_at',before);const {data,error}=await query;if(error)throw error;return((data??[])as InboxMessage[]).reverse();}
export async function markRead(conversationId:string){const {data:{user}}=await supabase.auth.getUser();if(user)await supabase.from('conversation_members').update({last_read_at:new Date().toISOString()}).eq('conversation_id',conversationId).eq('user_id',user.id);}
export async function sendMessage(conversation: Conversation, body: string, file?: File, durationSeconds?: number) {
  const { data: { user } } = await supabase.auth.getUser();
  const type = file ? (file.type.startsWith('image/') ? 'image' : 'voice') : 'text';
  
  let finalBody = body.trim() || null;

  if (type === 'voice' && file) {
    console.log('Transcription started for new voice message...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (res.ok) {
        const { text } = await res.json();
        console.log('Transcription received:', text);
        if (text) {
          finalBody = text;
        }
      } else {
        console.error('Transcription API failed with status', res.status, await res.text());
      }
    } catch (e) {
      console.error('Transcription fetch failed:', e);
    }
  }

  const senderEmail = user?.email || 'manager@pramukh.com';
  const senderName = user?.user_metadata?.name || 'Shreya Shinde';
  const senderRole = user?.user_metadata?.role || 'Project Manager';

  const inserted = await supabase.from('messages').insert({ 
    conversation_id: conversation.id, 
    project_id: conversation.project_id, 
    sender_email: senderEmail,
    sender_name: senderName,
    sender_role: senderRole,
    body: finalBody, 
    type 
  }).select('*').single();
  
  if (inserted.error) throw inserted.error;
  if (!file) return inserted.data;
  
  const ext = file.name.split('.').pop() || (type === 'image' ? 'jpg' : 'webm');
  const path = `${conversation.project_id}/${conversation.id}/${inserted.data.id}.${ext}`;
  const upload = await supabase.storage.from('inbox-media').upload(path, file, { contentType: file.type });
  if (upload.error) { await supabase.from('messages').delete().eq('id', inserted.data.id); throw upload.error; }
  
  const attached = await supabase.from('message_attachments').insert({ message_id: inserted.data.id, project_id: conversation.project_id, storage_path: path, mime_type: file.type, size_bytes: file.size, duration_seconds: durationSeconds ?? null });
  if (attached.error) { await supabase.storage.from('inbox-media').remove([path]); await supabase.from('messages').delete().eq('id', inserted.data.id); throw attached.error; }

  if (type === 'image' && conversation.title === 'Site-Inspection') {
    supabase.storage.from('inbox-media').createSignedUrl(path, 3600).then(({ data: signedData }) => {
      if (signedData?.signedUrl) {
        fetch('/api/site-inspection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: signedData.signedUrl })
        }).then(async res => {
          if (res.ok) {
            const { report } = await res.json();
            if (report) {
              await supabase.from('messages').insert({
                conversation_id: conversation.id,
                project_id: conversation.project_id,
                sender_email: 'ai@pramukh.com',
                sender_name: 'Site Inspector AI',
                sender_role: 'AI Assistant',
                body: `🤖 **Site Inspection Report**\n\n${report}`,
                type: 'text'
              });
            }
          }
        }).catch(console.error);
      }
    });
  }

  return inserted.data;
}
export async function attachmentUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const { data } = supabase.storage.from('inbox-media').getPublicUrl(path);
  return data.publicUrl || '';
}

export async function createGroupChannel(projectId: string, title: string, memberIds: string[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before creating a channel.');

  const membersToInsert = [...new Set([...memberIds, user.id])];

  const { data, error } = await supabase.rpc('create_custom_channel', {
    target_project: projectId,
    channel_title: title.trim(),
    member_ids: membersToInsert
  });

  if (error) throw error;
  return data as string;
}
