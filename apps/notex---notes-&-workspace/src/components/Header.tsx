import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import type { AppView } from '../types.ts';
import { Plus, Sun, Moon, LogOut, Shield, FileText, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  onNewNote: () => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  onNewNote,
  theme,
  setTheme,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between gap-8">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setCurrentView('notes')}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-bold text-base shadow-sm">
            N
          </div>
          <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white whitespace-nowrap">
            Notex
          </span>
        </button>
      </div>

      {/* Zone 2: Concise single-line navigation links */}
      <nav className="flex items-center gap-1 sm:gap-4 text-sm font-medium">
        <button
          onClick={() => setCurrentView('notes')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'notes'
              ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Notes</span>
        </button>

        <button
          onClick={() => setCurrentView('profile')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
            currentView === 'profile'
              ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800'
              : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>Profile</span>
        </button>

        {user?.role === 'admin' && (
          <button
            onClick={() => setCurrentView('admin')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              currentView === 'admin'
                ? 'text-neutral-900 dark:text-white font-semibold bg-neutral-100 dark:bg-neutral-800'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-500" />
            <span>Admin Console</span>
          </button>
        )}
      </nav>

      {/* Zone 3: 1 primary action + theme toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle color theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {currentView === 'notes' && (
          <button
            onClick={onNewNote}
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white bg-neutral-900 dark:bg-white dark:text-neutral-900 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>New Note</span>
          </button>
        )}

        <button
          onClick={logout}
          className="p-2 text-neutral-500 hover:text-rose-600 dark:text-neutral-400 dark:hover:text-rose-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
