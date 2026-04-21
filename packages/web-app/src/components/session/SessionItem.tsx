/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { sessionsApi } from '../../api/sessions';
import type { SessionSummary, SessionStatus } from '../../types/session';

interface SessionItemProps {
  session: SessionSummary;
  isActive: boolean;
}

function StatusDot({ status }: { status: SessionStatus }) {
  const colors: Record<SessionStatus, string> = {
    idle: 'bg-[#8a8a8a]',
    running: 'bg-yellow-400 animate-pulse',
    completed: 'bg-green-500',
    error: 'bg-red-500',
  };
  return (
    <span
      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors[status]}`}
    />
  );
}

function getRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export const SessionItem: FC<SessionItemProps> = ({ session, isActive }) => {
  const { setActiveSessionId, removeSession } = useSessionStore();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await sessionsApi.delete(session.id);
    } catch {
      // Ignore server errors — remove from UI regardless
    }
    removeSession(session.id);
  };

  return (
    <div
      className={[
        'group relative flex items-start gap-2 px-2 py-2 rounded cursor-pointer transition-colors',
        isActive
          ? 'bg-[#2e2e2e] text-[#e8e6e3]'
          : 'text-[#8a8a8a] hover:bg-[#1e1e1e] hover:text-[#e8e6e3]',
      ].join(' ')}
      onClick={() => setActiveSessionId(session.id)}
    >
      <StatusDot status={session.status} />
      <div className="flex-1 min-w-0 pr-5">
        <div className="text-xs font-medium truncate leading-tight">
          {session.title}
        </div>
        <div className="text-[10px] text-[#8a8a8a] mt-0.5">
          {getRelativeTime(session.updatedAt)}
        </div>
      </div>
      {/* Delete button — visible on hover */}
      <button
        onClick={handleDelete}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[#8a8a8a] hover:text-red-400 hover:bg-[#3a1a1a]"
        title="Delete session"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1 1l8 8M9 1L1 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};
