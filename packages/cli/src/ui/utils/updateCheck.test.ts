/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkForUpdates } from './updateCheck.js';

describe('checkForUpdates', () => {
  it('should always return null (update check disabled)', async () => {
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });
});
