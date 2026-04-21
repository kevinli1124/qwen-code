/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import { usePanelStore } from '../../stores/panelStore';
import { PanelContainer } from '../panel/PanelContainer';

export const RightPanel: FC = () => {
  const { activeTab, setActiveTab, toggleCollapsed } = usePanelStore();

  const tabs = [
    { id: 'terminal' as const, label: 'Terminal' },
    { id: 'files' as const, label: 'Files' },
    { id: 'plan' as const, label: 'Plan' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[#2e2e2e] px-2 h-9 flex-shrink-0">
        <div className="flex items-center gap-0.5 flex-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-3 py-1 text-xs rounded-sm transition-colors',
                activeTab === tab.id
                  ? 'text-[#e8e6e3] bg-[#2e2e2e]'
                  : 'text-[#8a8a8a] hover:text-[#e8e6e3] hover:bg-[#1e1e1e]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleCollapsed}
          className="w-6 h-6 rounded hover:bg-[#2e2e2e] flex items-center justify-center text-[#8a8a8a] hover:text-[#e8e6e3] transition-colors"
          title="Close panel"
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

      {/* Panel content */}
      <div className="flex-1 min-h-0">
        <PanelContainer activeTab={activeTab} />
      </div>
    </div>
  );
};
