import type { User, Note, AdminStats } from './types.ts';

const TOKEN_KEY = 'notex_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Do not set Content-Type if body is FormData
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}`);
  }

  return data;
}

export const api = {
  // Auth
  async register(data: { name: string; email: string; password: string }): Promise<{ user: User; token: string }> {
    const res = await fetchWithAuth('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setStoredToken(res.token);
    return res;
  },

  async login(data: { email: string; password: string }): Promise<{ user: User; token: string }> {
    const res = await fetchWithAuth('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setStoredToken(res.token);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await fetchWithAuth('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  async getMe(): Promise<{ user: User }> {
    return fetchWithAuth('/api/auth/me');
  },

  // Profile
  async updateProfile(data: { name?: string; bio?: string; avatar_url?: string }): Promise<{ user: User }> {
    return fetchWithAuth('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async uploadAvatar(fileOrDataUrl: File | string): Promise<{ user: User; avatarUrl: string }> {
    if (typeof fileOrDataUrl === 'string') {
      return fetchWithAuth('/api/profile/avatar', {
        method: 'POST',
        body: JSON.stringify({ dataUrl: fileOrDataUrl }),
      });
    } else {
      const formData = new FormData();
      formData.append('avatar', fileOrDataUrl);
      return fetchWithAuth('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });
    }
  },

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ success: boolean }> {
    return fetchWithAuth('/api/profile/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Notes
  async getNotes(params?: { search?: string; category?: string; pinned?: boolean }): Promise<{ notes: Note[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category && params.category !== 'All') query.set('category', params.category);
    if (params?.pinned !== undefined) query.set('pinned', String(params.pinned));

    const queryString = query.toString();
    const url = `/api/notes${queryString ? `?${queryString}` : ''}`;
    return fetchWithAuth(url);
  },

  async createNote(data: {
    title: string;
    content: string;
    category?: string;
    tags?: string[];
    is_pinned?: boolean;
    color?: string;
  }): Promise<{ note: Note }> {
    return fetchWithAuth('/api/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateNote(
    id: number,
    data: {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      is_pinned?: boolean;
      color?: string;
    }
  ): Promise<{ note: Note }> {
    return fetchWithAuth(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteNote(id: number): Promise<{ success: boolean }> {
    return fetchWithAuth(`/api/notes/${id}`, {
      method: 'DELETE',
    });
  },

  async togglePin(id: number): Promise<{ note: Note }> {
    return fetchWithAuth(`/api/notes/${id}/pin`, {
      method: 'PATCH',
    });
  },

  // Admin
  async getAdminUsers(): Promise<{ users: User[] }> {
    return fetchWithAuth('/api/admin/users');
  },

  async getAdminStats(): Promise<{ stats: AdminStats }> {
    return fetchWithAuth('/api/admin/stats');
  },

  async updateUserRole(id: number, role: 'admin' | 'user'): Promise<{ user: User }> {
    return fetchWithAuth(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async deleteAdminUser(id: number): Promise<{ success: boolean; message: string }> {
    return fetchWithAuth(`/api/admin/users/${id}`, {
      method: 'DELETE',
    });
  },
};
