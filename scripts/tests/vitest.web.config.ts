/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/tests/web-server.test.js'],
    // No setupFiles — avoids the fs mock from test-setup.ts which conflicts
    // with node:fs used by WebServer.ts
    testTimeout: 15_000,
  },
});
