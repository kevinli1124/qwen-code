/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { FC, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePanelStore } from '../../stores/panelStore';
import { useResizable } from '../../hooks/useResizable';

interface AppLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  rightPanel: ReactNode;
}

export const AppLayout: FC<AppLayoutProps> = ({
  sidebar,
  main,
  rightPanel,
}) => {
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const {
    width,
    collapsed: panelCollapsed,
    setWidth,
  } = usePanelStore(
    useShallow((s) => ({
      width: s.width,
      collapsed: s.collapsed,
      setWidth: s.setWidth,
    })),
  );
  const { onMouseDown } = useResizable((delta) => setWidth(width + delta));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface text-app-foreground">
      {/* Sidebar */}
      <aside
        className="flex-shrink-0 flex flex-col border-r border-[#2e2e2e] bg-sidebar transition-all duration-200 overflow-hidden"
        style={{ width: sidebarCollapsed ? 0 : 240 }}
      >
        {sidebar}
      </aside>

      {/* Main conversation */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {main}
      </main>

      {/* Resize handle */}
      {!panelCollapsed && (
        <div
          className="w-1 flex-shrink-0 cursor-col-resize bg-[#2e2e2e] hover:bg-accent transition-colors"
          onMouseDown={onMouseDown}
        />
      )}

      {/* Right panel */}
      {!panelCollapsed && (
        <aside
          className="flex-shrink-0 flex flex-col border-l border-[#2e2e2e] bg-[#161616] overflow-hidden"
          style={{ width }}
        >
          {rightPanel}
        </aside>
      )}
    </div>
  );
};
