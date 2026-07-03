'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Users, Plus, Loader2, Trash2 } from 'lucide-react';
import { ROLE_LABELS, ROLE_SCOPES, normalizeDatabaseRole, type Role, updateProfileRole, updateProfileProject, isUpperManagement } from '@/lib/rbac';
import { supabase } from '@/utils/supabase-client';
import { useAppStore } from '@/store/use-app-store';

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  project_id: string | null;
};

type ProjectOption = { id: string; name: string };

export default function UsersPage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Create User State
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('PROJECT_MANAGER');
  const [newUserProjectId, setNewUserProjectId] = useState<string>('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  const { activeRole } = useAppStore();
  
  const canEdit = isUpperManagement(activeRole);

  const fetchProfiles = async () => {
    try {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, email, role, project_id')
        .order('name');
      if (profileError) {
        setError(profileError.message);
        setProfiles([]);
      } else {
        setProfiles((data ?? []) as ProfileRow[]);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .eq('status', 'active')
      .order('name');
    if (data) {
      setProjects(data as ProjectOption[]);
    }
  };

  useEffect(() => {
    void fetchProfiles();
    void fetchProjects();
  }, []);

  const handleRoleChange = async (userId: string, newRole: Role) => {
    setUpdating(userId);
    setError(null);
    try {
      await updateProfileRole(userId, newRole);
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setUpdating(null);
    }
  };

  const handleProjectChange = async (userId: string, newProjectId: string) => {
    setUpdating(userId);
    setError(null);
    try {
      const projectIdToSave = newProjectId || null;
      await updateProfileProject(userId, projectIdToSave);
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, project_id: projectIdToSave } : p));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to assign project');
    } finally {
      setUpdating(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail || !newUserPassword) return;
    
    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          projectId: newUserRole === 'PROJECT_MANAGER' ? newUserProjectId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Reset form and refresh list
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserProjectId('');
      setShowCreateForm(false);
      await fetchProfiles();
    } catch (err) {
      console.error(err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    setUpdating(userId);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }
      setProfiles(prev => prev.filter(p => p.id !== userId));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setUpdating(null);
    }
  };

  const roleCounts = profiles.reduce(
    (counts, profile) => {
      const role = normalizeDatabaseRole(profile.role);
      counts[role] = (counts[role] ?? 0) + 1;
      return counts;
    },
    {} as Partial<Record<Role, number>>,
  );

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase text-primary dark:border-orange-900/40 dark:bg-orange-950/30">
            Access Administration
          </span>
          <h1 className="font-heading mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Users & Roles</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage organization users, role assignments, and access-control scope.</p>
        </div>
        {canEdit && (
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          >
            <Plus className="h-4 w-4" />
            {showCreateForm ? 'Cancel' : 'Add User'}
          </button>
        )}
      </header>

      {showCreateForm && canEdit && (
        <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <h2 className="font-heading text-base font-semibold mb-4">Create New User</h2>
          <form onSubmit={handleCreateUser} className="space-y-4" autoComplete="off">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200" 
                  autoComplete="off"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200" 
                  autoComplete="new-password"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Temporary Password</label>
                <input 
                  type="password" 
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200" 
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Assigned Role</label>
                <select 
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as Role)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
                >
                  {Object.entries(ROLE_LABELS).map(([r, label]) => (
                    <option key={r} value={r}>{label}</option>
                  ))}
                </select>
              </div>
              {newUserRole === 'PROJECT_MANAGER' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Assigned Project</label>
                  <select 
                    value={newUserProjectId}
                    onChange={(e) => setNewUserProjectId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
                  >
                    <option value="">Select a project...</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {createError && <p className="text-xs font-semibold text-red-500">{createError}</p>}
            <div className="flex justify-end pt-2">
              <button 
                type="submit"
                disabled={isCreating}
                className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-70 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
              >
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreating ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold">User Management</h2>
          </div>
          <div className="mt-4 space-y-2">
            {loading && <p className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800">Loading live users...</p>}
            {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-600 dark:border-red-900/50 dark:bg-red-950/30">{error}</p>}
            {!loading && !error && profiles.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800">No Supabase profiles found. Users will appear here after account creation.</p>
            )}
            {profiles.map((user) => {
              const role = normalizeDatabaseRole(user.role);
              const initials = (user.name || user.email || 'U').slice(0, 2).toUpperCase();
              return (
              <div key={user.id} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 p-3 text-left dark:border-gray-800">
                <span className="grid h-9 w-9 rounded-full bg-primary/10 text-xs font-black text-primary place-items-center">{initials}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{user.name || 'Unnamed user'}</p>
                  <p className="truncate text-xs text-gray-400">{user.email || 'No email on profile'}</p>
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                      disabled={updating === user.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-700 outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 disabled:opacity-50"
                    >
                      {Object.entries(ROLE_LABELS).map(([r, label]) => (
                        <option key={r} value={r}>{label}</option>
                      ))}
                    </select>
                    {role === 'PROJECT_MANAGER' && (
                      <select
                        value={user.project_id || ''}
                        onChange={(e) => handleProjectChange(user.id, e.target.value)}
                        disabled={updating === user.id}
                        className="max-w-[150px] truncate rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-700 outline-none focus:border-primary dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300 disabled:opacity-50"
                      >
                        <option value="">No Project Assigned</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={updating === user.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50 dark:hover:bg-red-950/30"
                      title="Delete User"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {ROLE_LABELS[role]}
                    </span>
                    {role === 'PROJECT_MANAGER' && user.project_id && (
                      <span className="max-w-[120px] truncate rounded-full border border-gray-200 bg-white px-2 py-1 text-[9px] font-bold text-gray-500 dark:border-gray-700 dark:bg-gray-900">
                        {projects.find(p => p.id === user.project_id)?.name || 'Project'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )})}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-850 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-heading text-base font-semibold">Role Management</h2>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(ROLE_SCOPES).map(([role, scope]) => (
              <div key={role} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-950">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] font-bold text-gray-700 dark:text-gray-200">{ROLE_LABELS[role as Role]}</p>
                  <span className="rounded-full border border-gray-200 px-2 py-0.5 text-[9px] font-black text-gray-500 dark:border-gray-800">
                    {roleCounts[role as Role] ?? 0}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">{scope}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
