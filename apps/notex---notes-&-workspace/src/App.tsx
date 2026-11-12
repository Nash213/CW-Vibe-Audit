/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import type { Note, AppView, NoteColor } from './types.ts';
import { api } from './api.ts';
import { Header } from './components/Header.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { NotesView } from './components/NotesView.tsx';
import { NoteEditorModal } from './components/NoteEditorModal.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { AdminView } from './components/AdminView.tsx';
import { AuthModal } from './components/AuthModal.tsx';

function MainApp() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('notes');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('notex_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [isFetchingNotes, setIsFetchingNotes] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [onlyPinned, setOnlyPinned] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editor modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // Sync theme to document element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('notex_theme', theme);
  }, [theme]);

  // Fetch notes
  const fetchNotes = useCallback(async () => {
    if (!user) return;
    try {
      setIsFetchingNotes(true);
      const res = await api.getNotes();
      setNotes(res.notes);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setIsFetchingNotes(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchNotes();
    }
  }, [user, fetchNotes]);

  // Handle Save (Create or Update)
  const handleSaveNote = async (data: {
    title: string;
    content: string;
    category: string;
    tags: string[];
    is_pinned: boolean;
    color: NoteColor;
  }) => {
    if (editingNote) {
      const res = await api.updateNote(editingNote.id, data);
      setNotes((prev) => prev.map((n) => (n.id === editingNote.id ? res.note : n)));
    } else {
      const res = await api.createNote(data);
      setNotes((prev) => [res.note, ...prev]);
    }
  };

  // Handle Delete
  const handleDeleteNote = async (id: number) => {
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Handle Pin toggle
  const handleTogglePin = async (id: number) => {
    try {
      const res = await api.togglePin(id);
      setNotes((prev) => prev.map((n) => (n.id === id ? res.note : n)));
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center font-bold text-sm animate-pulse">
            N
          </div>
          <span className="text-xs text-neutral-400 font-medium">Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal onSuccess={() => setCurrentView('notes')} />;
  }

  return (
    <div className="min-h-screen bg-neutral-100/60 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans antialiased selection:bg-neutral-900 selection:text-white dark:selection:bg-white dark:selection:text-neutral-900">
      {/* 3-Zone Top Bar */}
      <Header
        currentView={currentView}
        setCurrentView={setCurrentView}
        onNewNote={() => {
          setEditingNote(null);
          setIsEditorOpen(true);
        }}
        theme={theme}
        setTheme={setTheme}
      />

      {/* Main Body */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto min-h-[calc(100vh-4rem)]">
        {/* Workspace Sidebar (visible in notes view or everywhere on desktop) */}
        <Sidebar
          currentView={currentView}
          setCurrentView={setCurrentView}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          onlyPinned={onlyPinned}
          setOnlyPinned={setOnlyPinned}
          notes={notes}
          onNewNote={() => {
            setEditingNote(null);
            setIsEditorOpen(true);
          }}
        />

        {/* View Switcher */}
        {currentView === 'notes' && (
          <NotesView
            notes={notes}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            onlyPinned={onlyPinned}
            setOnlyPinned={setOnlyPinned}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onEditNote={(note) => {
              setEditingNote(note);
              setIsEditorOpen(true);
            }}
            onDeleteNote={handleDeleteNote}
            onTogglePin={handleTogglePin}
            onNewNote={() => {
              setEditingNote(null);
              setIsEditorOpen(true);
            }}
          />
        )}

        {currentView === 'profile' && <ProfileView />}

        {currentView === 'admin' && (
          user.role === 'admin' ? (
            <AdminView />
          ) : (
            <div className="flex-1 p-8 text-center text-neutral-500">
              Access restricted to administrators.
            </div>
          )
        )}
      </div>

      {/* Note Compose / Edit Modal */}
      <NoteEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingNote(null);
        }}
        onSave={handleSaveNote}
        initialNote={editingNote}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
