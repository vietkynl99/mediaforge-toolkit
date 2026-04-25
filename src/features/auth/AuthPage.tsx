import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';

export const AuthPage: React.FC = () => {
  const { login, register, error, setError } = useAuth();
  const [view, setView] = useState<'login' | 'register'>(() => {
    if (typeof window === 'undefined') return 'login';
    return window.location.pathname === '/register' ? 'register' : 'login';
  });

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/auth/config');
        const data = await response.json();
        setRegisterEnabled(Boolean(data?.registerEnabled));
      } catch {
        setRegisterEnabled(false);
      }
    };
    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    if (view === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (view === 'login') {
        await login(username, password);
        window.history.pushState({}, '', '/dashboard');
      } else {
        await register(username, password);
        setView('login');
        window.history.pushState({}, '', '/login');
      }
    } catch (err) {
      // Error is handled by useAuth
    } finally {
      setSubmitting(false);
    }
  };

  const toggleView = () => {
    const nextView = view === 'login' ? 'register' : 'login';
    setView(nextView);
    window.history.pushState({}, '', nextView === 'register' ? '/register' : '/login');
    setError(null);
    setConfirmPassword('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-lime-500 rounded-xl flex items-center justify-center text-zinc-950 font-black italic">MF</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-lime-300/70">MediaForge Toolkit</p>
              <h1 className="text-2xl font-semibold text-zinc-100">
                {view === 'login' ? 'Sign in' : 'Create account'}
              </h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            {view === 'login' ? 'Sign in to access MediaForge' : 'Create a new account'}
          </p>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Enter password"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
              />
            </div>
            {view === 'register' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Confirm password</label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  placeholder="Re-enter password"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
                />
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-lime-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? view === 'login' ? 'Signing in...' : 'Creating account...'
                : view === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
            {view !== 'login' || registerEnabled !== false ? (
              <span>{view === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
            ) : <span />}
            {view !== 'login' || registerEnabled !== false ? (
              <button
                type="button"
                onClick={toggleView}
                className="text-lime-300 hover:text-lime-200 font-semibold"
              >
                {view === 'login' ? 'Create account' : 'Sign in'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
