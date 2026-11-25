import type { AdminUser, Recipe, RecipeCategory, RecipeInput, User } from '../types.ts';

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return payload as T;
}

export const api = {
  getSetupStatus(): Promise<{ hasAdmin: boolean }> {
    return request('/api/auth/setup-status');
  },

  setupAdmin(email: string, password: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  signup(email: string, password: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  login(email: string, password: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return request('/api/auth/logout', { method: 'POST' });
  },

  getMe(): Promise<{ user: User }> {
    return request('/api/auth/me');
  },

  listRecipes(category?: RecipeCategory | 'all'): Promise<{ recipes: Recipe[] }> {
    const query = category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : '';
    return request(`/api/recipes${query}`);
  },

  getRecipe(id: number): Promise<{ recipe: Recipe }> {
    return request(`/api/recipes/${id}`);
  },

  createRecipe(input: RecipeInput): Promise<{ recipe: Recipe }> {
    return request('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateRecipe(id: number, input: RecipeInput): Promise<{ recipe: Recipe }> {
    return request(`/api/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  deleteRecipe(id: number): Promise<{ ok: boolean }> {
    return request(`/api/recipes/${id}`, {
      method: 'DELETE',
    });
  },

  listAdminUsers(): Promise<{ users: AdminUser[] }> {
    return request('/api/admin/users');
  },
};
