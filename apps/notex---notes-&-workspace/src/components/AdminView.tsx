import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import type { User, AdminStats } from '../types.ts';
import { api } from '../api.ts';
import {
  Users,
  FileText,
  Shield,
  Clock,
  Search,
  Trash2,
  RefreshCw,
  AlertCircle,
  Check,
  UserCheck,
} from 'lucide-react';

export const AdminView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [usersRes, statsRes] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminStats(),
      ]);
      setUsers(usersRes.users);
      setStats(statsRes.stats);
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleRole = async (targetUser: User) => {
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    const confirmMsg =
      newRole === 'admin'
        ? `Grant Administrator privileges to ${targetUser.name}?`
        : `Demote ${targetUser.name} to Standard Member?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setActionInProgress(targetUser.id);
      setError(null);
      await api.updateUserRole(targetUser.id, newRole);
      setSuccess(`Role updated for ${targetUser.name}.`);
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update user role.');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    if (targetUser.id === currentUser?.id) {
      setError('You cannot delete your own account while logged in.');
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to permanently delete user "${targetUser.name}" (${targetUser.email}) and all their notes? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setActionInProgress(targetUser.id);
      setError(null);
      const res = await api.deleteAdminUser(targetUser.id);
      setSuccess(res.message);
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white flex items-center gap-2.5">
            <Shield className="w-6 h-6 text-amber-500" />
            <span>Administrator Console</span>
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            System overview, user directories, permissions, and workspace metrics.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-700 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {success && (
        <div className="mb-6 p-3 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-medium">Total Registered Users</span>
            <Users className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white">
            {stats?.totalUsers ?? '-'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-medium">Total Notes Saved</span>
            <FileText className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white">
            {stats?.totalNotes ?? '-'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-medium">Admin Accounts</span>
            <Shield className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white">
            {stats?.totalAdmins ?? '-'}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 mb-2">
            <span className="text-xs font-medium">New (Last 7 Days)</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-white">
            {stats?.recentUsers ?? '-'}
          </div>
        </div>
      </div>

      {/* Users Data Grid Section */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              All Users Directory
            </h2>
            <span className="text-xs font-mono tabular-nums text-neutral-400">
              ({filteredUsers.length} total)
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search user name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">Notes</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                    No users matching criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  const isWorking = actionInProgress === u.id;
                  const joinDate = u.created_at
                    ? new Date(u.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '-';

                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      {/* Name & Avatar */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shrink-0 flex items-center justify-center font-semibold text-neutral-700 dark:text-neutral-200">
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              u.name[0]?.toUpperCase() || 'U'
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 font-mono">
                                  You
                                </span>
                              )}
                            </div>
                            {u.bio && (
                              <div className="text-[11px] text-neutral-400 truncate max-w-xs">
                                {u.bio}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono text-neutral-600 dark:text-neutral-300">
                        {u.email}
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            u.role === 'admin'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-neutral-600 dark:text-neutral-400'
                          }`}
                        >
                          {u.role === 'admin' && <Shield className="w-3 h-3 fill-amber-500/20" />}
                          <span className="capitalize">{u.role}</span>
                        </span>
                      </td>

                      {/* Notes count */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right font-mono tabular-nums text-neutral-700 dark:text-neutral-300">
                        {u.note_count ?? 0}
                      </td>

                      {/* Joined Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                        {joinDate}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Role Toggle button */}
                          <button
                            type="button"
                            onClick={() => handleToggleRole(u)}
                            disabled={isWorking}
                            className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                              u.role === 'admin'
                                ? 'border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                : 'border-amber-300 dark:border-amber-700/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                            }`}
                            title={u.role === 'admin' ? 'Demote to member' : 'Promote to admin'}
                          >
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3 h-3" />
                              <span>{u.role === 'admin' ? 'Make Member' : 'Make Admin'}</span>
                            </span>
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            disabled={isCurrent || isWorking}
                            className={`p-1.5 rounded transition-colors ${
                              isCurrent
                                ? 'opacity-30 cursor-not-allowed text-neutral-400'
                                : 'text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            }`}
                            title={isCurrent ? 'Cannot delete yourself' : `Delete ${u.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
