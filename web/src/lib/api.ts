// Talks to the Ebcotech server. The website is served by that same server, so requests go to the
// same address; during development (Next dev server on port 3000) they go to port 4000.

const TOKEN_KEY = 'auth_token';
const REQUEST_TIMEOUT_MS = 20000;

let token: string | null = null;
let onUnauthorized: ((message: string) => void) | null = null;

export function apiBase() {
  if (typeof window === 'undefined') return '';
  const { protocol, hostname, port } = window.location;
  return port === '3000' ? `${protocol}//${hostname}:4000` : '';
}

const storage = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v) window.localStorage.setItem(k, v);
      else window.localStorage.removeItem(k);
    } catch {
      // private mode: login lasts for this tab only
    }
  },
};

export function loadStoredToken() {
  token = storage.get(TOKEN_KEY);
  return token;
}

export function setToken(value: string | null) {
  token = value;
  storage.set(TOKEN_KEY, value);
}

export function setUnauthorizedHandler(fn: (message: string) => void) {
  onUnauthorized = fn;
}

export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 && path !== '/login') {
    const data = await res.clone().json().catch(() => ({}));
    onUnauthorized?.(data.error || 'Please log in again');
  }
  return res;
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const res = await request(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

// Files from the server (photos, PDF, Excel): returns the file's bytes.
export async function apiBlob(path: string, timeoutMs = 60000): Promise<Blob> {
  const res = await request(path, { timeoutMs });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.blob();
}

export async function apiText(path: string): Promise<string> {
  const res = await request(path, { timeoutMs: 60000 });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.text();
}

// Saves a file from the server to the computer/phone's Downloads.
export async function downloadFile(path: string, fileName: string) {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
