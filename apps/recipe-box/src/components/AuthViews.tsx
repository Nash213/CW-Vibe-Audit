import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client.ts';
import type { User } from '../types.ts';

export type AuthMode = 'login' | 'signup' | 'setup-admin';

interface AuthViewsProps {
  mode: AuthMode;
  hasAdmin: boolean;
  onSwitchMode: (mode: AuthMode) => void;
  onAuthenticated: (token: string, user: User) => void;
}

export function AuthViews({
  mode,
  hasAdmin,
  onSwitchMode,
  onAuthenticated,
}: AuthViewsProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveMode: AuthMode = mode === 'setup-admin' && hasAdmin ? 'login' : mode;

  const switchMode = (nextMode: AuthMode) => {
    setError(null);
    setPassword('');
    setConfirmPassword('');
    onSwitchMode(nextMode);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (effectiveMode !== 'login' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response =
        effectiveMode === 'login'
          ? await api.login(email, password)
          : effectiveMode === 'signup'
            ? await api.signup(email, password)
            : await api.setupAdmin(email, password);

      onAuthenticated(response.token, response.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const heading =
    effectiveMode === 'login'
      ? 'Log in to your recipe box'
      : effectiveMode === 'signup'
        ? 'Create your account'
        : 'Create the first admin account';

  const subtitle =
    effectiveMode === 'login'
      ? 'Access your personal recipes sorted newest first.'
      : effectiveMode === 'signup'
        ? 'Save breakfast, main, and dessert recipes in one private space.'
        : 'Set up the initial administrator account to manage users and keep your own recipes.';

  const submitLabel =
    effectiveMode === 'login'
      ? submitting
        ? 'Logging in...'
        : 'Log in'
      : effectiveMode === 'signup'
        ? submitting
          ? 'Creating account...'
          : 'Sign up'
        : submitting
          ? 'Creating admin...'
          : 'Create admin account';

  return (
    <div className="mx-auto w-full max-w-md py-10 px-4">
      {!hasAdmin && effectiveMode !== 'setup-admin' && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-zinc-800">
          <p className="font-medium text-emerald-900">No admin account configured yet</p>
          <p className="mt-1 text-zinc-600">
            Initialize the first administrator account before regular sign-ups begin.
          </p>
          <button
            type="button"
            onClick={() => switchMode('setup-admin')}
            className="mt-3 inline-flex items-center text-sm font-medium text-emerald-800 underline underline-offset-4 hover:text-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            Create first admin account
          </button>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 sm:p-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 [text-wrap:balance]">
          {heading}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-600">{subtitle}</p>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-zinc-800">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="cook@example.com"
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-zinc-800">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={effectiveMode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={effectiveMode === 'login' ? 'Enter your password' : 'At least 8 characters'}
              className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
          </div>

          {effectiveMode !== 'login' && (
            <div>
              <label htmlFor="auth-confirm" className="block text-sm font-medium text-zinc-800">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                className="mt-1.5 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>

        <div className="mt-6 border-t border-zinc-100 pt-5 text-sm text-zinc-600">
          {effectiveMode === 'login' ? (
            <p>
              New here?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-medium text-emerald-800 underline underline-offset-4 hover:text-emerald-950"
              >
                Create an account
              </button>
            </p>
          ) : effectiveMode === 'signup' ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-medium text-emerald-800 underline underline-offset-4 hover:text-emerald-950"
              >
                Log in
              </button>
            </p>
          ) : (
            <p>
              Want a regular account instead?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-medium text-emerald-800 underline underline-offset-4 hover:text-emerald-950"
              >
                Back to log in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
