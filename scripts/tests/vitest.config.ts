/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/tests/**/*.test.js'],
    // web-server.test.js runs under vitest.web.config.ts because it needs
    // real node:fs — the appendFileSync mock in test-setup.ts breaks it.
    exclude: ['scripts/tests/web-server.test.js'],
    setupFiles: ['scripts/tests/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    poolOptions: {
      threads: {
        minThreads: 8,
        maxThreads: 16,
      },
    },
  },
});
