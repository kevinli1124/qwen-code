import { apiFetch } from './client';
import type { SessionSummary, SessionDetail } from '../types/session';

export const sessionsApi = {
  list: () => apiFetch<SessionSummary[]>('/api/sessions'),
  get: (id: string) => apiFetch<SessionDetail>(`/api/sessions/${id}`),
  getHistory: (id: string, limit = 50, before?: string) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set('before', before);
    return apiFetch<SessionDetail>(`/api/sessions/${id}?${q.toString()}`);
  },
  create: (cwd: string, title?: string) =>
    apiFetch<{ sessionId: string }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ cwd, title }),
    }),
  delete: (id: string) =>
    apiFetch<void>(`/api/sessions/${id}`, { method: 'DELETE' }),
  sendQuery: (id: string, message: string, fileContexts?: string[]) =>
    apiFetch<void>(`/api/sessions/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({ message, fileContexts }),
    }),
  interrupt: (id: string) =>
    apiFetch<void>(`/api/sessions/${id}/interrupt`, { method: 'POST' }),
  respondPermission: (id: string, requestId: string, allowed: boolean) =>
    apiFetch<void>(`/api/sessions/${id}/permission/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({ allowed }),
    }),
  respondQuestion: (
    id: string,
    requestId: string,
    payload: { cancelled: true } | { answers: Record<string, string> },
  ) =>
    apiFetch<void>(`/api/sessions/${id}/question/${requestId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  revertFile: (id: string, callId: string) =>
    apiFetch<{ ok: boolean; reason?: string }>(
      `/api/sessions/${id}/revert/${callId}`,
      { method: 'POST' },
    ),
};
