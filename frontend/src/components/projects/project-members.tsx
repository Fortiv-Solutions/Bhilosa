'use client';
import { useCallback,useEffect,useState } from 'react';
import { assignMember,ensureProject,listProjectMembers } from '@/lib/inbox';
import type { ProjectSite } from '@/utils/mock-data';

export function ProjectMembers({project}:{project:ProjectSite}){
 type Member={user_id:string;project_role:string;profiles:{name:string;email:string}|null};
 const [members,setMembers]=useState<Member[]>([]);const [email,setEmail]=useState('');const [role,setRole]=useState('member');const [projectId,setProjectId]=useState('');const [error,setError]=useState('');
 const load=useCallback(async()=>{const db=await ensureProject(project.id,project.name);setProjectId(db.id);setMembers(await listProjectMembers(db.id) as unknown as Member[]);},[project.id,project.name]);
 useEffect(()=>{const timer=setTimeout(()=>void load().catch(e=>setError(e instanceof Error?e.message:'Could not load members.')),0);return()=>clearTimeout(timer);},[load]);
 const add=async(e:React.FormEvent)=>{e.preventDefault();try{await assignMember(projectId,email,role);setEmail('');await load();setError('');}catch(err){setError(err instanceof Error?err.message:'Could not assign user.');}};
 return <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border space-y-4">
  <h3 className="font-semibold text-sm">Supabase Project Members</h3>
  <form onSubmit={add} className="flex gap-2 flex-wrap">
   <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Existing user email" className="flex-1 min-w-52 text-xs p-2.5 rounded-lg border bg-transparent" required/>
   <select value={role} onChange={e=>setRole(e.target.value)} className="text-xs p-2.5 rounded-lg border bg-transparent"><option value="member">Member</option><option value="manager">Manager</option></select>
   <button className="text-xs font-bold bg-primary text-white px-4 rounded-lg">Assign</button>
  </form>
  {error&&<p className="text-xs text-red-600">{error}</p>}
  <div className="space-y-2">{members.map(m=><div key={m.user_id} className="p-3 border rounded-lg flex justify-between"><span className="text-xs font-medium">{m.profiles?.name} <span className="text-gray-400">({m.profiles?.email})</span></span><span className="text-[10px] font-bold bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{m.project_role}</span></div>)}</div>
 </div>;
}
