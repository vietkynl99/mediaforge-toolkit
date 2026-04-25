import { AuthUser } from '../types/auth';

export const authService = {
  async login(username: string, password: string): Promise<AuthUser> {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok || !data?.user) {
      throw new Error(data?.error || 'Login failed.');
    }
    return data.user as AuthUser;
  },

  async register(username: string, password: string): Promise<void> {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || 'Register failed.');
    }
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
  },

  async checkStatus(): Promise<AuthUser | null> {
    const response = await fetch('/api/auth/status');
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data?.user || null;
  }
};
