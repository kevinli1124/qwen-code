/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { apiFetch } from './client';

export interface CommandMetadata {
  name: string;
  description: string;
  category?: string;
  runner?: 'local' | 'cli';
}

export interface SkillMetadata {
  name: string;
  description: string;
  category: string;
  scope: 'user' | 'project' | 'bundled';
}

export const commandsApi = {
  list: (lang?: string) => {
    const q = lang ? `?lang=${encodeURIComponent(lang)}` : '';
    return apiFetch<CommandMetadata[]>(`/api/commands${q}`);
  },
  listSkills: () => apiFetch<SkillMetadata[]>('/api/skills'),
};
