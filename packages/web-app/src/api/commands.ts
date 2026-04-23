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
}

export const commandsApi = {
  list: () => apiFetch<CommandMetadata[]>('/api/commands'),
};
