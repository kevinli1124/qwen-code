/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { create } from 'zustand';

interface PersistedShape {
  userAllows: string[];
  projectAllows: Record<string, string[]>;
}

interface PermissionRulesState extends PersistedShape {
  /** Has the user previously said always-allow for this tool? */
  isAllowed: (toolName: string, projectCwd: string | undefined) => boolean;
  allowForUser: (toolName: string) => void;
  allowForProject: (toolName: string, projectCwd: string) => void;
  revokeAll: () => void;
  revokeTool: (toolName: string, projectCwd?: string) => void;
}

const STORAGE_KEY = 'qwen-web-allow-rules';

function loadInitial(): PersistedShape {
  if (typeof window === 'undefined') {
    return { userAllows: [], projectAllows: {} };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { userAllows: [], projectAllows: {} };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    return {
      userAllows: Array.isArray(parsed.userAllows) ? parsed.userAllows : [],
      projectAllows:
        parsed.projectAllows && typeof parsed.projectAllows === 'object'
          ? (parsed.projectAllows as Record<string, string[]>)
          : {},
    };
  } catch {
    return { userAllows: [], projectAllows: {} };
  }
}

function save(shape: PersistedShape): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
  } catch {
    // quota / disabled — ignore; rules stay in memory for this session
  }
}

/**
 * Local persistence (localStorage) for "always allow" rules. These live
 * entirely in the browser and auto-approve matching permission_request
 * events on arrival — the user has already made the decision once.
 * Keyed by project cwd for project-scope rules and unscoped for user.
 */
export const usePermissionRulesStore = create<PermissionRulesState>(
  (set, get) => {
    const initial = loadInitial();
    return {
      ...initial,

      isAllowed: (toolName, projectCwd) => {
        const state = get();
        if (state.userAllows.includes(toolName)) return true;
        if (!projectCwd) return false;
        return !!state.projectAllows[projectCwd]?.includes(toolName);
      },

      allowForUser: (toolName) =>
        set((s) => {
          if (s.userAllows.includes(toolName)) return s;
          const next = { ...s, userAllows: [...s.userAllows, toolName] };
          save({ userAllows: next.userAllows, projectAllows: s.projectAllows });
          return next;
        }),

      allowForProject: (toolName, projectCwd) =>
        set((s) => {
          const current = s.projectAllows[projectCwd] ?? [];
          if (current.includes(toolName)) return s;
          const projectAllows = {
            ...s.projectAllows,
            [projectCwd]: [...current, toolName],
          };
          save({ userAllows: s.userAllows, projectAllows });
          return { ...s, projectAllows };
        }),

      revokeAll: () => {
        save({ userAllows: [], projectAllows: {} });
        set({ userAllows: [], projectAllows: {} });
      },

      revokeTool: (toolName, projectCwd) =>
        set((s) => {
          const userAllows = s.userAllows.filter((t) => t !== toolName);
          const projectAllows: Record<string, string[]> = {
            ...s.projectAllows,
          };
          if (projectCwd && projectAllows[projectCwd]) {
            projectAllows[projectCwd] = projectAllows[projectCwd].filter(
              (t) => t !== toolName,
            );
            if (projectAllows[projectCwd].length === 0)
              delete projectAllows[projectCwd];
          } else {
            for (const key of Object.keys(projectAllows)) {
              projectAllows[key] = projectAllows[key]!.filter(
                (t) => t !== toolName,
              );
              if (projectAllows[key].length === 0) delete projectAllows[key];
            }
          }
          save({ userAllows, projectAllows });
          return { ...s, userAllows, projectAllows };
        }),
    };
  },
);
