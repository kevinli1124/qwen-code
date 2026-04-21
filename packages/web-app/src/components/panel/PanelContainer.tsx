/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC } from 'react';
import type { PanelTab } from '../../types/panel';
import { TerminalPanel } from './TerminalPanel';
import { FilesPanel } from './FilesPanel';
import { PlanPanel } from './PlanPanel';
import { useSessionStore } from '../../stores/sessionStore';

interface PanelContainerProps {
  activeTab: PanelTab;
}

export const PanelContainer: FC<PanelContainerProps> = ({ activeTab }) => {
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  return (
    <div className="h-full">
      <div className={activeTab === 'terminal' ? 'h-full' : 'hidden'}>
        <TerminalPanel sessionId={activeSessionId} />
      </div>
      <div className={activeTab === 'files' ? 'h-full' : 'hidden'}>
        <FilesPanel sessionId={activeSessionId} />
      </div>
      <div className={activeTab === 'plan' ? 'h-full' : 'hidden'}>
        <PlanPanel sessionId={activeSessionId} />
      </div>
    </div>
  );
};
