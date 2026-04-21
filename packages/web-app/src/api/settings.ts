/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { apiFetch } from './client';

export interface AppSettings {
  security: {
    auth: {
      selectedType: string;
      apiKey: string;
      baseUrl: string;
    };
  };
  model: { name: string };
  general: {
    agentName: string;
    language: string;
    outputLanguage: string;
    setupCompleted: boolean;
  };
  tools: { approvalMode: string };
}

export interface TestResult {
  ok: boolean;
  error?: string;
}

export const settingsApi = {
  get: () => apiFetch<AppSettings>('/api/settings'),

  patch: (patch: Partial<AppSettings>) =>
    apiFetch<{ ok: boolean }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  test: (apiKey: string, authType: string, baseUrl: string) =>
    apiFetch<TestResult>('/api/settings/test', {
      method: 'POST',
      body: JSON.stringify({ apiKey, authType, baseUrl }),
    }),
};
