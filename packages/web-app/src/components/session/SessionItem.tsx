/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
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
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);

  return (
    <button
      onClick={() => setActiveSessionId(session.id)}
      className={[
        'w-full flex items-start gap-2 px-2 py-2 rounded text-left transition-colors group',
        isActive
          ? 'bg-[#2e2e2e] text-[#e8e6e3]'
          : 'text-[#8a8a8a] hover:bg-[#1e1e1e] hover:text-[#e8e6e3]',
      ].join(' ')}
    >
      <StatusDot status={session.status} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate leading-tight">
          {session.title}
        </div>
        <div className="text-[10px] text-[#8a8a8a] mt-0.5">
          {getRelativeTime(session.updatedAt)}
        </div>
      </div>
    </button>
  );
};
