import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import type { AppView, Note } from '../types.ts';
import {
  FileText,
  Pin,
  Folder,
  Tag,
  Shield,
  User as UserIcon,
  Plus,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  selectedCategory: string;
  setSelectedCategory: (category: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  onlyPinned: boolean;
  setOnlyPinned: (pinned: boolean) => void;
  notes: Note[];
  onNewNote: () => void;
}

const CATEGORIES = ['All', 'General', 'Work', 'Personal', 'Ideas', 'Tasks', 'Archive'];

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  selectedCategory,
  setSelectedCategory,
  selectedTag,
  setSelectedTag,
  onlyPinned,
  setOnlyPinned,
  notes,
  onNewNote,
}) => {
  const { user, logout } = useAuth();

  // Extract unique tags and calculate counts
  const allTags = React.useMemo(() => {
    const tagCount: Record<string, number> = {};
    notes.forEach((n) => {
      n.tags.forEach((t) => {
        tagCount[t] = (tagCount[t] || 0) + 1;
      });
    });
    return Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const pinnedCount = notes.filter((n) => n.is_pinned).length;

  return (
    <aside className="w-64 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/50 flex flex-col justify-between h-[calc(100vh-4rem)] sticky top-16 shrink-0 select-none hidden md:flex">
      <div className="p-4 space-y-6 overflow-y-auto">
        {/* Quick New Note Button */}
        <button
          onClick={() => {
            setCurrentView('notes');
            onNewNote();
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Compose Note</span>
        </button>

        {/* Primary Views */}
        <div className="space-y-1">
          <div className="px-2 text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            Workspace
          </div>

          <button
            onClick={() => {
              setCurrentView('notes');
              setSelectedCategory('All');
              setSelectedTag(null);
              setOnlyPinned(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
              currentView === 'notes' && selectedCategory === 'All' && !onlyPinned && !selectedTag
                ? 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4" />
              <span>All Notes</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-neutral-400 dark:text-neutral-500">
              {notes.length}
            </span>
          </button>

          <button
            onClick={() => {
              setCurrentView('notes');
              setOnlyPinned(true);
              setSelectedTag(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
              currentView === 'notes' && onlyPinned
                ? 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Pin className="w-4 h-4" />
              <span>Pinned Notes</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-neutral-400 dark:text-neutral-500">
              {pinnedCount}
            </span>
          </button>
        </div>

        {/* Categories */}
        <div className="space-y-1">
          <div className="px-2 text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            Categories
          </div>
          {CATEGORIES.filter((c) => c !== 'All').map((cat) => {
            const count = notes.filter((n) => n.category === cat).length;
            const isSelected = currentView === 'notes' && selectedCategory === cat && !onlyPinned;

            return (
              <button
                key={cat}
                onClick={() => {
                  setCurrentView('notes');
                  setSelectedCategory(cat);
                  setOnlyPinned(false);
                  setSelectedTag(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  isSelected
                    ? 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Folder className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{cat}</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-neutral-400 dark:text-neutral-500">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div className="space-y-2">
            <div className="px-2 text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider flex items-center justify-between">
              <span>Tags</span>
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="text-[11px] text-neutral-400 hover:text-neutral-900 dark:hover:text-white underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 px-1">
              {allTags.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => {
                    setCurrentView('notes');
                    setSelectedTag(selectedTag === tag ? null : tag);
                  }}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    selectedTag === tag
                      ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                  }`}
                >
                  #{tag} <span className="opacity-70 tabular-nums">({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Administration Section if role is admin */}
        {user?.role === 'admin' && (
          <div className="space-y-1">
            <div className="px-2 text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              Management
            </div>
            <button
              onClick={() => setCurrentView('admin')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-sm transition-colors ${
                currentView === 'admin'
                  ? 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium'
                  : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Admin Console</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* User Footer Profile & Sign out */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-100/40 dark:bg-neutral-900/40 flex items-center justify-between gap-2">
        <button
          onClick={() => setCurrentView('profile')}
          className="flex items-center gap-3 min-w-0 text-left hover:opacity-80 transition-opacity p-1 rounded-md"
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-neutral-200 dark:border-neutral-700 shrink-0"
              onError={(e) => {
                // styled CSS fallback
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center font-semibold text-neutral-700 dark:text-neutral-200 text-xs shrink-0">
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
              {user?.name}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {user?.email}
            </div>
          </div>
        </button>

        <button
          onClick={logout}
          className="p-1.5 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
