/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, type FC } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { SessionItem } from './SessionItem';

export const SessionList: FC = () => {
  const { sessions, activeSessionId } = useSessionStore();
  const [search, setSearch] = useState('');

  const filtered = sessions.filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 py-2">
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2 py-1.5 text-xs bg-[#1e1e1e] border border-[#2e2e2e] rounded text-[#e8e6e3] placeholder:text-[#8a8a8a] focus:outline-none focus:border-accent"
        />
      </div>

      {/* Session items */}
      <div className="flex-1 overflow-y-auto px-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[#8a8a8a] text-center">
            No sessions found
          </div>
        ) : (
          filtered.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
            />
          ))
        )}
      </div>
    </div>
  );
};
