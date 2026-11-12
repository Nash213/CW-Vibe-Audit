export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatar_url?: string | null;
  bio?: string | null;
  created_at: string;
  updated_at: string;
  note_count?: number;
}

export interface Note {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_pinned: boolean;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface AdminStats {
  totalUsers: number;
  totalNotes: number;
  totalAdmins: number;
  recentUsers: number;
}

export type NoteColor = 'default' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'purple';

export type AppView = 'notes' | 'profile' | 'admin';
