import { apiFetch } from './client';
import type { SessionSummary, SessionDetail } from '../types/session';

export const sessionsApi = {
  list: () => apiFetch<SessionSummary[]>('/api/sessions'),
  get: (id: string) => apiFetch<SessionDetail>(`/api/sessions/${id}`),
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
};
