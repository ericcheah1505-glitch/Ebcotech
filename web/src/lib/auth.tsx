'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, loadStoredToken, setToken, setUnauthorizedHandler } from './api';
import type { AppSettings, User } from './types';

const DEFAULT_SETTINGS: AppSettings = { salesman_installed_report: 'off', session_idle_minutes: '30' };
// While the page is on screen it checks in this often, so people filling in a report are not logged out.
const KEEP_ALIVE_MS = 4 * 60 * 1000;

type AuthState = {
  user: User | null;
  ready: boolean;
  settings: AppSettings;
  refreshSettings: () => Promise<void>;
  notice: string | null; // why the user was logged out (shown on the login page)
  passwordChanged: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await api<AppSettings>('/settings'));
    } catch {
      // keep the last known settings
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      setToken(null);
      setUser(null);
      setNotice(message);
    });
    (async () => {
      if (loadStoredToken()) {
        try {
          setUser(await api<User>('/me', { timeoutMs: 8000 }));
          await refreshSettings();
        } catch {
          // offline or expired: log in again
        }
      }
      setReady(true);
    })();
  }, [refreshSettings]);

  // Keep the login alive while the page is visible; check at once when the person comes back to it.
  useEffect(() => {
    if (!user) return;
    const ping = () => api('/me').catch(() => {});
    const timer = setInterval(() => document.visibilityState === 'visible' && ping(), KEEP_ALIVE_MS);
    const onVisible = () => document.visibilityState === 'visible' && ping();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api<{ token: string; user: User }>('/login', { body: { username, password } });
      setToken(res.token);
      await refreshSettings();
      setNotice(null);
      setUser(res.user);
    },
    [refreshSettings]
  );

  const passwordChanged = useCallback(() => setUser((u) => (u ? { ...u, must_change_password: 0 } : u)), []);

  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, settings, refreshSettings, notice, passwordChanged, login, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
