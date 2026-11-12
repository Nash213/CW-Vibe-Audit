import React, { useState } from 'react';
import { X, Lock, Mail, User, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'register';
  onClose: () => void;
  onOpenFirstAdmin: () => void;
  hasAdmin: boolean;
}

export function AuthModal({
  isOpen,
  initialMode,
  onClose,
  onOpenFirstAdmin,
  hasAdmin,
}: AuthModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync mode when initialMode prop changes
  React.useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      setIsLoading(true);
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoCustomer = () => {
    setMode('login');
    setEmail('customer@example.com');
    setPassword('customer123');
    setError(null);
  };

  const fillDemoAdmin = () => {
    setMode('login');
    setEmail('admin@novastore.com');
    setPassword('admin123');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-100 mb-6 pb-2">
          <button
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`pb-2 text-sm font-bold transition-all border-b-2 -mb-2.5 mr-6 cursor-pointer ${
              mode === 'login'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`pb-2 text-sm font-bold transition-all border-b-2 -mb-2.5 cursor-pointer ${
              mode === 'register'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-100 transition-all cursor-pointer hover:-translate-y-0.5 disabled:opacity-50 mt-2"
          >
            {isLoading ? (
              <span>Authenticating...</span>
            ) : mode === 'login' ? (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Create Customer Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Login Helpers */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center mb-2.5">
            Quick Demo Auto-Fill
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={fillDemoCustomer}
              className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors text-center cursor-pointer"
            >
              Customer Demo
            </button>
            <button
              type="button"
              onClick={fillDemoAdmin}
              className="py-2 px-3 text-xs font-semibold rounded-xl border border-indigo-200 hover:border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 transition-colors text-center cursor-pointer flex items-center justify-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              Admin Demo
            </button>
          </div>
        </div>

        {/* First admin creation shortcut if none exists */}
        {!hasAdmin && (
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 text-center">
            <span>No administrator account exists yet. </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFirstAdmin();
              }}
              className="font-bold underline cursor-pointer hover:text-amber-900"
            >
              Create Initial Admin
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
