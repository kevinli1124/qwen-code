/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { SessionList } from '../session/SessionList';

interface SidebarProps {
  onNewSession: () => void;
}

export const Sidebar: FC<SidebarProps> = ({ onNewSession }) => {
  const currentModel = useSettingsStore((s) => s.currentModel);
  const setShowSettingsModal = useSettingsStore((s) => s.setShowSettingsModal);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Logo + new session */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-[#2e2e2e]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">Q</span>
          </div>
          <span className="text-sm font-semibold text-[#e8e6e3]">
            Qwen Code
          </span>
          <span className="text-xs text-[#888] select-none tabular-nums">
            v{__APP_VERSION__}
          </span>
        </div>
        <button
          onClick={onNewSession}
          className="w-6 h-6 rounded hover:bg-[#2e2e2e] flex items-center justify-center transition-colors"
          title="New Session"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        <SessionList />
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#2e2e2e] flex items-center justify-between">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[#8a8a8a] min-w-0">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="flex-shrink-0"
          >
            <circle
              cx="6"
              cy="6"
              r="5"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M6 4v3M6 8.5v.5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          <span className="truncate">{currentModel}</span>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="w-6 h-6 flex items-center justify-center rounded text-[#8a8a8a] hover:text-[#e8e6e3] hover:bg-[#2e2e2e] transition-colors flex-shrink-0"
          title="Settings"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle
              cx="6.5"
              cy="6.5"
              r="2"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.6 2.6l1.06 1.06M9.34 9.34l1.06 1.06M2.6 10.4l1.06-1.06M9.34 3.66l1.06-1.06"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
