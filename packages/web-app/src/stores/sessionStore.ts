import { create } from 'zustand';
import type { SessionSummary } from '../types/session';

interface SessionStore {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  setSessions: (sessions: SessionSummary[]) => void;
  addSession: (session: SessionSummary) => void;
  updateSession: (id: string, patch: Partial<SessionSummary>) => void;
  removeSession: (id: string) => void;
  setActiveSessionId: (id: string | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  updateSession: (id, patch) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, ...patch } : sess,
      ),
    })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeSessionId: s.activeSessionId === id ? null : s.activeSessionId,
    })),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
}));
