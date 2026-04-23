import { create } from 'zustand';
import type { PanelTab } from '../types/panel';

interface PanelStore {
  activeTab: PanelTab;
  width: number;
  collapsed: boolean;
  setActiveTab: (tab: PanelTab) => void;
  setWidth: (w: number) => void;
  toggleCollapsed: () => void;
}

export const usePanelStore = create<PanelStore>((set) => ({
  activeTab: 'terminal',
  width: 520,
  // Start collapsed on every refresh — the panel is secondary context.
  // Header toggle reopens it when the user wants Terminal/Files/Plan.
  collapsed: true,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setWidth: (w) => set({ width: Math.max(300, Math.min(900, w)) }),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
}));
