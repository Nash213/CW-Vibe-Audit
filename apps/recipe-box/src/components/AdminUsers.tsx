import type { AdminUser } from '../types.ts';

interface AdminUsersProps {
  users: AdminUser[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function AdminUsers({ users, loading, error, onRetry }: AdminUsersProps) {
  const totalAdmins = users.filter((u) => u.role === 'admin').length;
  const totalRecipes = users.reduce((sum, u) => sum + u.recipeCount, 0);

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Users
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Registered accounts and recipe activity across the application.
        </p>
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-3 divide-x divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
          <div className="px-5 py-4">
            <p className="text-xs font-medium text-zinc-500">Total Users</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900 tabular-nums">
              {users.length}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-medium text-zinc-500">Admins</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900 tabular-nums">
              {totalAdmins}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs font-medium text-zinc-500">Total Recipes</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900 tabular-nums">
              {totalRecipes}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-4 hover:text-red-950"
          >
            Try again
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="divide-y divide-zinc-100" aria-busy="true" aria-label="Loading users">
            {[1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between px-5 py-3.5 animate-pulse">
                <div className="h-4 w-48 rounded bg-zinc-200" />
                <div className="h-4 w-24 rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-600">
            No users have registered yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/70 text-xs font-medium text-zinc-500">
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3 text-right">Recipes</th>
                  <th className="px-5 py-3 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-zinc-50/70">
                    <td className="px-5 py-3 font-medium text-zinc-900">{entry.email}</td>
                    <td className="px-5 py-3 text-zinc-700">
                      {entry.role === 'admin' ? 'Admin' : 'User'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-zinc-700 tabular-nums">
                      {entry.recipeCount}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-zinc-500 tabular-nums">
                      {formatDate(entry.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
