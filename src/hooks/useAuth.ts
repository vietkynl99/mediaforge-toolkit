import { useState, useEffect, useCallback } from 'react';
import { AuthUser } from '../types/auth';
import { authService } from '../services/auth';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const userData = await authService.checkStatus();
      setUser(userData);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const login = async (username: string, password: string) => {
    setError(null);
    try {
      const userData = await authService.login(username, password);
      setUser(userData);
      return userData;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const register = async (username: string, password: string) => {
    setError(null);
    try {
      await authService.register(username, password);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return {
    user,
    loading,
    error,
    login,
    register,
    logout,
    setError
  };
}
