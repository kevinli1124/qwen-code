/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';
import type { AppSettings } from '../api/settings';

interface SettingsStore {
  sidebarCollapsed: boolean;
  currentModel: string;
  showSettingsModal: boolean;
  serverSettings: AppSettings | null;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setModel: (model: string) => void;
  setShowSettingsModal: (v: boolean) => void;
  setServerSettings: (s: AppSettings) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  sidebarCollapsed: false,
  currentModel: 'qwen3.5-plus',
  showSettingsModal: false,
  serverSettings: null,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setModel: (model) => set({ currentModel: model }),
  setShowSettingsModal: (v) => set({ showSettingsModal: v }),
  setServerSettings: (s) =>
    set({ serverSettings: s, currentModel: s.model.name || 'qwen3.5-plus' }),
}));
