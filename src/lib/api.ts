import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'fx_token';
const USER_KEY = 'fx_user';

export const getToken = (): string | undefined => Cookies.get(TOKEN_KEY);
export const setToken = (token: string) => Cookies.set(TOKEN_KEY, token, { expires: 1, sameSite: 'lax' });
export const removeToken = () => {
  Cookies.remove(TOKEN_KEY);
  if (typeof window !== 'undefined') localStorage.removeItem(USER_KEY);
};
export const getStoredUser = () => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};
export const setStoredUser = (user: any) => {
  if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(user));
};

async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    removeToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }),
    me: () => apiFetch<{ user: any }>('/api/auth/me'),
    logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  },
  clients: {
    list: (params?: string) => apiFetch(`/api/clients${params ? `?${params}` : ''}`),
    get: (id: string) => apiFetch(`/api/clients/${id}`),
    create: (data: any) => apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  requirements: {
    list: (params?: string) => apiFetch(`/api/requirements${params ? `?${params}` : ''}`),
    get: (id: string) => apiFetch(`/api/requirements/${id}`),
    create: (data: any) => apiFetch('/api/requirements', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/requirements/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  candidates: {
    list: (params?: string) => apiFetch(`/api/candidates${params ? `?${params}` : ''}`),
    get: (id: string) => apiFetch(`/api/candidates/${id}`),
    create: (data: any) => apiFetch('/api/candidates', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/api/candidates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    parseCV: (formData: FormData) =>
      fetch(`${API_URL}/api/candidates/parse-cv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      }).then((r) => r.json()),
  },
  pipeline: {
    list: (params?: string) => apiFetch(`/api/pipeline${params ? `?${params}` : ''}`),
    updateStatus: (id: string, status: string, reject_reason?: string, drop_reason?: string) =>
      apiFetch(`/api/pipeline/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reject_reason, drop_reason }) }),
  },
  interviews: {
    list: (params?: string) => apiFetch(`/api/interviews${params ? `?${params}` : ''}`),
    create: (data: any) => apiFetch('/api/interviews', { method: 'POST', body: JSON.stringify(data) }),
  },
  reports: {
    dailySourcing: (params?: string) => apiFetch(`/api/reports/daily-sourcing${params ? `?${params}` : ''}`),
    dailyInterviews: (params?: string) => apiFetch(`/api/reports/daily-interviews${params ? `?${params}` : ''}`),
  },
  team: {
    list: () => apiFetch('/api/team'),
    get: (id: string) => apiFetch(`/api/team/${id}`),
  },
};
