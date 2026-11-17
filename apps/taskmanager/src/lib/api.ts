import type { StatusFilter, Task, TaskCounts, TaskStatus, User } from '../types.ts';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };

  if (!response.ok) {
    throw new ApiError(payload.error || 'Request failed.', response.status);
  }

  return payload as T;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const data = await requestJson<{ user: User }>('/api/auth/me');
    return data.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return null;
    }
    throw err;
  }
}

export async function signup(email: string, password: string): Promise<User> {
  const data = await requestJson<{ user: User }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function login(email: string, password: string): Promise<User> {
  const data = await requestJson<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export async function fetchTasks(
  status: StatusFilter,
): Promise<{ tasks: Task[]; counts: TaskCounts }> {
  const query = status === 'all' ? '' : `?status=${encodeURIComponent(status)}`;
  return requestJson<{ tasks: Task[]; counts: TaskCounts }>(`/api/tasks${query}`);
}

export async function createTask(input: {
  title: string;
  description: string;
  status: TaskStatus;
}): Promise<Task> {
  const data = await requestJson<{ task: Task }>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function updateTask(
  taskId: string,
  updates: { title?: string; description?: string; status?: TaskStatus },
): Promise<Task> {
  const data = await requestJson<{ task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return data.task;
}

export async function deleteTask(taskId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  });
}
