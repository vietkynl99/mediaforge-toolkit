import React from 'react';

interface AuthScreenProps {
  authView: 'login' | 'register';
  authUsername: string;
  setAuthUsername: (value: string) => void;
  authPassword: string;
  setAuthPassword: (value: string) => void;
  authConfirmPassword: string;
  setAuthConfirmPassword: (value: string) => void;
  authError: string | null;
  authSubmitting: boolean;
  registerEnabled: boolean | null;
  onLoginSubmit: (event?: React.FormEvent) => void;
  onRegisterSubmit: (event?: React.FormEvent) => void;
  onToggleView: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  authView,
  authUsername,
  setAuthUsername,
  authPassword,
  setAuthPassword,
  authConfirmPassword,
  setAuthConfirmPassword,
  authError,
  authSubmitting,
  registerEnabled,
  onLoginSubmit,
  onRegisterSubmit,
  onToggleView
}) => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(700px_circle_at_15%_20%,rgba(132,204,22,0.12),transparent_60%),radial-gradient(600px_circle_at_85%_0%,rgba(16,185,129,0.16),transparent_55%)]" />
      <div className="relative min-h-screen flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-950/80 backdrop-blur p-8 shadow-[0_0_60px_rgba(16,185,129,0.12)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-lime-500 rounded-xl flex items-center justify-center text-zinc-950 font-black italic">MF</div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-lime-300/70">MediaForge Toolkit</p>
              <h1 className="text-2xl font-semibold text-zinc-100">
                {authView === 'login' ? 'Sign in' : 'Create account'}
              </h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            {authView === 'login'
              ? 'Sign in to access MediaForge'
              : 'Create a new account'}
          </p>
          <form className="space-y-4" onSubmit={authView === 'login' ? onLoginSubmit : onRegisterSubmit}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Username</label>
              <input
                value={authUsername}
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder="Enter username"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Password</label>
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                type="password"
                placeholder="Enter password"
                className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
              />
            </div>
            {authView === 'register' && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Confirm password</label>
                <input
                  value={authConfirmPassword}
                  onChange={(event) => setAuthConfirmPassword(event.target.value)}
                  type="password"
                  placeholder="Re-enter password"
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-lime-400/60"
                />
              </div>
            )}
            {authError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {authError}
              </div>
            )}
            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full rounded-xl bg-lime-500 px-4 py-3 text-sm font-semibold text-zinc-900 transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authSubmitting
                ? authView === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : authView === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
          <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
            {authView !== 'login' || registerEnabled !== false ? (
              <span>
                {authView === 'login' ? "Don't have an account?" : 'Already have an account?'}
              </span>
            ) : (
              <span />
            )}
            {authView !== 'login' || registerEnabled !== false ? (
              <button
                type="button"
                onClick={onToggleView}
                className="text-lime-300 hover:text-lime-200 font-semibold"
              >
                {authView === 'login' ? 'Create account' : 'Sign in'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
