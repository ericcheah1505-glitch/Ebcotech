import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, loadStoredSession, setServerUrl, setToken, setUnauthorizedHandler } from './api';
import type { AppSettings, User } from './types';

const DEFAULT_SETTINGS: AppSettings = { salesman_installed_report: 'off', session_idle_minutes: '30' };
// While the app is on screen it checks in this often, so people filling in a report are not logged out.
const KEEP_ALIVE_MS = 4 * 60 * 1000;
const STARTUP_TIMEOUT_MS = 8000;

type AuthState = {
  user: User | null;
  ready: boolean;
  settings: AppSettings; // company-wide settings the admin controls (More > Settings)
  refreshSettings: () => Promise<void>;
  notice: string | null; // why the user was logged out (shown on the login screen)
  passwordChanged: () => void;
  login: (server: string, username: string, password: string) => Promise<void>;
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
      const { serverUrl, token } = await loadStoredSession();
      if (serverUrl && token) {
        try {
          // Short limit so a stale server address (laptop on a new Wi-Fi) falls back to the login screen quickly.
          setUser(await api<User>('/me', { timeoutMs: STARTUP_TIMEOUT_MS }));
          await refreshSettings();
        } catch {
          // offline or expired: user logs in again
        }
      }
      setReady(true);
    })();
  }, [refreshSettings]);

  // Keep the login alive while the app is open on screen; when the app comes back from the
  // background, check straight away so an expired login goes to the login screen at once.
  useEffect(() => {
    if (!user) return;
    const ping = () => api('/me').catch(() => {});
    let timer = AppState.currentState === 'active' ? setInterval(ping, KEEP_ALIVE_MS) : null;
    const sub = AppState.addEventListener('change', (state) => {
      if (timer) clearInterval(timer);
      timer = null;
      if (state === 'active') {
        ping();
        timer = setInterval(ping, KEEP_ALIVE_MS);
      }
    });
    return () => {
      sub.remove();
      if (timer) clearInterval(timer);
    };
  }, [user]);

  const login = useCallback(
    async (server: string, username: string, password: string) => {
      await setServerUrl(server);
      const res = await api<{ token: string; user: User }>('/login', { body: { username, password } });
      await setToken(res.token);
      await refreshSettings();
      setNotice(null);
      setUser(res.user);
    },
    [refreshSettings]
  );

  const passwordChanged = useCallback(() => setUser((u) => (u ? { ...u, must_change_password: 0 } : u)), []);

  const logout = useCallback(async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    await setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, settings, refreshSettings, notice, passwordChanged, login, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
