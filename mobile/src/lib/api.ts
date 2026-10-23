import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Phones keep the login in secure storage; a web browser (viewing the system on the laptop) has
// no secure storage, so it uses the browser's own storage instead.
const store =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
        setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
        deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
      }
    : SecureStore;

const SERVER_KEY = 'server_url';
const TOKEN_KEY = 'auth_token';

// Live builds have the company server built in (set in eas.json); staff never type an address.
// Test copies (Expo Go on the office Wi-Fi) leave it empty and ask for the address on the login screen.
export const BUILT_IN_SERVER = (process.env.EXPO_PUBLIC_SERVER_URL ?? '').replace(/\/+$/, '');

let serverUrl = BUILT_IN_SERVER;
let token: string | null = null;
let onUnauthorized: ((message: string) => void) | null = null;

// Signatures are large uploads, so allow generous time; a wrong address still fails within this.
const REQUEST_TIMEOUT_MS = 20000;

export async function loadStoredSession() {
  serverUrl = BUILT_IN_SERVER || ((await store.getItemAsync(SERVER_KEY)) ?? '');
  token = await store.getItemAsync(TOKEN_KEY);
  return { serverUrl, token };
}

export async function setServerUrl(url: string) {
  if (BUILT_IN_SERVER) return; // fixed in live builds
  serverUrl = url.trim().replace(/\/+$/, '');
  if (serverUrl && !/^https?:\/\//.test(serverUrl)) serverUrl = `http://${serverUrl}`;
  await store.setItemAsync(SERVER_KEY, serverUrl);
}

// For loading protected files (job photos) directly into <Image>, which needs the login header.
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getServerUrl() {
  return serverUrl;
}

export async function setToken(value: string | null) {
  token = value;
  if (value) await store.setItemAsync(TOKEN_KEY, value);
  else await store.deleteItemAsync(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: (message: string) => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  if (!serverUrl) throw new Error('Server address not set');
  let res: Response;
  // Give up after a while instead of hanging when the server address is wrong or unreachable
  // (e.g. the laptop moved to another Wi-Fi and got a new address).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${serverUrl}/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new Error(`Cannot reach server at ${serverUrl}. Check Wi-Fi / server address.`);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') onUnauthorized?.(data.error || 'Please log in again');
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}
