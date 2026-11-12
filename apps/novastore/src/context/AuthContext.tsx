import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types.js';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  hasAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  createFirstAdmin: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  seedDemoData: () => Promise<void>;
  refreshAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(true);

  const getHeaders = () => {
    const token = localStorage.getItem('novastore_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const checkCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to fetch user:', err);
      setUser(null);
    }
  };

  const refreshAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        setHasAdmin(data.hasAdmin);
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([checkCurrentUser(), refreshAuthStatus()]);
      setIsLoading(false);
    };
    init();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    if (data.token) {
      localStorage.setItem('novastore_token', data.token);
    }
    setUser(data.user);
    await refreshAuthStatus();
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    if (data.token) {
      localStorage.setItem('novastore_token', data.token);
    }
    setUser(data.user);
    await refreshAuthStatus();
  };

  const createFirstAdmin = async (name: string, email: string, password: string) => {
    const res = await fetch('/api/auth/create-first-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to create first admin account');
    }

    if (data.token) {
      localStorage.setItem('novastore_token', data.token);
    }
    setUser(data.user);
    setHasAdmin(true);
    await refreshAuthStatus();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    localStorage.removeItem('novastore_token');
    setUser(null);
  };

  const seedDemoData = async () => {
    const res = await fetch('/api/auth/seed', {
      method: 'POST',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to seed demo data');
    }
    await refreshAuthStatus();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        hasAdmin,
        login,
        register,
        createFirstAdmin,
        logout,
        seedDemoData,
        refreshAuthStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
