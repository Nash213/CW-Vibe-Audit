import { useCallback, useEffect, useState } from 'react';
import { ApiError, getCurrentUser } from './api';
import { AuthPage } from './components/AuthPage';
import { TaskWorkspace } from './components/TaskWorkspace';
import type { User } from './types';

type RoutePath = '/' | '/login' | '/signup';

function normalizeRoute(pathname: string): RoutePath {
  if (pathname === '/signup') {
    return '/signup';
  }
  if (pathname === '/login') {
    return '/login';
  }
  return '/';
}

export default function App() {
  const [route, setRoute] = useState<RoutePath>(() => normalizeRoute(window.location.pathname));
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const navigate = useCallback((nextPath: string) => {
    const normalized = normalizeRoute(nextPath);
    if (window.location.pathname !== normalized) {
      window.history.pushState({}, '', normalized);
    }
    setRoute(normalized);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(({ user: currentUser }) => {
        if (!active) {
          return;
        }
        setUser(currentUser);
        if (currentUser && (route === '/login' || route === '/signup')) {
          navigate('/');
        } else if (!currentUser && route === '/') {
          navigate('/login');
        }
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          if (route === '/') {
            navigate('/login');
          }
          return;
        }
        setUser(null);
        if (route === '/') {
          navigate('/login');
        }
      })
      .finally(() => {
        if (active) {
          setCheckingAuth(false);
        }
      });

    return () => {
      active = false;
    };
  }, [navigate, route]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="text-sm font-medium text-slate-500">Loading workspace...</div>
      </div>
    );
  }

  if (!user) {
    const authMode = route === '/signup' ? 'signup' : 'login';
    return (
      <AuthPage
        mode={authMode}
        onNavigate={navigate}
        onAuthSuccess={(authenticatedUser) => {
          setUser(authenticatedUser);
          navigate('/');
        }}
      />
    );
  }

  return (
    <TaskWorkspace
      user={user}
      onLoggedOut={() => {
        setUser(null);
        navigate('/login');
      }}
    />
  );
}
