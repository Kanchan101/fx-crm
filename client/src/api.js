// ═══════════════════════════════════════════════════════
// FX CRM — API Client
// Import this in your React components to call the backend
// ═══════════════════════════════════════════════════════

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

// Store token in memory
let authToken = localStorage.getItem('fx_token') || null;

export const setToken = (token) => {
  authToken = token;
  if (token) localStorage.setItem('fx_token', token);
  else localStorage.removeItem('fx_token');
};

export const getToken = () => authToken;

// Base fetch with auth
const apiFetch = async (endpoint, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return res.json();
};

// ── Auth ───────────────────────────────────────────────
export const login = async (email, password) => {
  const data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
};

export const getMe = () => apiFetch('/api/auth/me');
export const logout = () => setToken(null);

// ── Dashboard ─────────────────────────────────────────
export const getDashboardStats = () => apiFetch('/api/dashboard/stats');

// ── Clients ───────────────────────────────────────────
export const getClients = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/api/clients${query ? '?' + query : ''}`);
};
export const getClient = (id) => apiFetch(`/api/clients/${id}`);
export const createClient = (data) => apiFetch('/api/clients', { method: 'POST', body: JSON.stringify(data) });
export const updateClient = (id, data) => apiFetch(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// ── Candidates ────────────────────────────────────────
export const getCandidates = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/api/candidates${query ? '?' + query : ''}`);
};
export const getCandidate = (id) => apiFetch(`/api/candidates/${id}`);
export const createCandidate = (data) => apiFetch('/api/candidates', { method: 'POST', body: JSON.stringify(data) });
export const updateCandidate = (id, data) => apiFetch(`/api/candidates/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// ── Jobs ──────────────────────────────────────────────
export const getJobs = (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return apiFetch(`/api/jobs${query ? '?' + query : ''}`);
};
export const createJob = (data) => apiFetch('/api/jobs', { method: 'POST', body: JSON.stringify(data) });

// ── Pipeline ──────────────────────────────────────────
export const getPipeline = () => apiFetch('/api/pipeline');
export const addToPipeline = (data) => apiFetch('/api/pipeline', { method: 'POST', body: JSON.stringify(data) });
export const moveStage = (id, stage, notes) => apiFetch(`/api/pipeline/${id}/stage`, { method: 'PUT', body: JSON.stringify({ stage, notes }) });

// ── Interviews ────────────────────────────────────────
export const getInterviews = () => apiFetch('/api/interviews');
export const createInterview = (data) => apiFetch('/api/interviews', { method: 'POST', body: JSON.stringify(data) });
export const updateInterview = (id, data) => apiFetch(`/api/interviews/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// ── WhatsApp ──────────────────────────────────────────
export const getWhatsAppThreads = () => apiFetch('/api/whatsapp/threads');
export const getMessages = (candidateId) => apiFetch(`/api/whatsapp/messages/${candidateId}`);
export const sendWhatsApp = (data) => apiFetch('/api/whatsapp/send', { method: 'POST', body: JSON.stringify(data) });

// ── CV Processing ─────────────────────────────────────
export const getCVStats = () => apiFetch('/api/cv/stats');
export const uploadCVs = async (files, source = 'upload') => {
  const formData = new FormData();
  files.forEach(f => formData.append('cvs', f));
  formData.append('source', source);
  
  const res = await fetch(`${API_URL}/api/cv/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: formData,
  });
  return res.json();
};

// ── Team ──────────────────────────────────────────────
export const getTeam = () => apiFetch('/api/team');

// ── Reports ───────────────────────────────────────────
export const getRevenueReport = () => apiFetch('/api/reports/revenue');
export const getSourcingReport = () => apiFetch('/api/reports/sourcing');

// ── Health ────────────────────────────────────────────
export const checkHealth = () => apiFetch('/api/health');
