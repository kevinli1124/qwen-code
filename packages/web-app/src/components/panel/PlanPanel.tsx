/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';

interface PlanPanelProps {
  sessionId: string | null;
}

function PlanItem({ item }: { item: string }) {
  const isDone = item.startsWith('✅');
  const isRunning = item.startsWith('⏳');
  const text = item.replace(/^[✅⏳⬜]\s*/, '');

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 border-b border-[#2e2e2e] last:border-b-0 ${isDone ? 'opacity-60' : ''}`}
    >
      <span className="flex-shrink-0 mt-0.5">
        {isDone ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" fill="#10b981" />
            <path
              d="M4 7l2 2 4-4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : isRunning ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="animate-spin"
          >
            <circle
              cx="7"
              cy="7"
              r="6"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="16 20"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="6" stroke="#3f3f46" strokeWidth="1.5" />
          </svg>
        )}
      </span>
      <span
        className={`text-xs leading-relaxed ${isDone ? 'line-through text-[#8a8a8a]' : 'text-[#e8e6e3]'}`}
      >
        {text}
      </span>
    </div>
  );
}

export const PlanPanel: FC<PlanPanelProps> = ({ sessionId }) => {
  const planBySession = useMessageStore((s) => s.planBySession);
  const items = sessionId ? (planBySession[sessionId] ?? []) : [];

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[#8a8a8a]">
        No active session
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-[#8a8a8a]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span className="text-xs">No plan yet</span>
      </div>
    );
  }

  const done = items.filter((i) => i.startsWith('✅')).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-[#2e2e2e]">
        <div className="text-[10px] text-[#8a8a8a] uppercase tracking-wider mb-1">
          Plan
        </div>
        <div className="w-full bg-[#2e2e2e] rounded-full h-1">
          <div
            className="bg-accent h-1 rounded-full transition-all"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-[#8a8a8a] mt-1">
          {done}/{items.length} completed
        </div>
      </div>
      {items.map((item, i) => (
        <PlanItem key={i} item={item} />
      ))}
    </div>
  );
};
