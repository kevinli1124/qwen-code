import { create } from 'zustand';

interface SettingsStore {
  sidebarCollapsed: boolean;
  currentModel: string;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setModel: (model: string) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  sidebarCollapsed: false,
  currentModel: 'qwen3.5-plus',
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setModel: (model) => set({ currentModel: model }),
}));
