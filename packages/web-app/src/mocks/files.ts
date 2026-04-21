import type { FileOperationEntry } from '../types/message';

const now = Date.now();
const t = (offsetMs: number) => new Date(now - offsetMs).toISOString();

export const MOCK_FILE_OPS: FileOperationEntry[] = [
  {
    callId: 'call-001',
    type: 'read',
    path: 'packages/cli/src/gemini.tsx',
    content: `/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { loadCliConfig } from './config';
import { initializeApp } from './init';
// ... (284 lines)`,
    timestamp: t(4 * 60 * 1000 + 30 * 1000),
  },
  {
    callId: 'call-003',
    type: 'write',
    path: 'packages/cli/src/web/WebServer.ts',
    content: `/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import * as http from 'http';
export function startWebServer(opts: { port: number }) {
  const server = http.createServer(handleRequest);
  server.listen(opts.port);
}`,
    timestamp: t(3 * 60 * 1000 + 30 * 1000),
  },
];
