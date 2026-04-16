/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenTelemetry SDK has been removed. This file verifies the stub behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  isTelemetrySdkInitialized,
  initializeTelemetry,
  shutdownTelemetry,
} from './sdk.js';

describe('sdk stubs', () => {
  it('isTelemetrySdkInitialized always returns false', () => {
    expect(isTelemetrySdkInitialized()).toBe(false);
  });

  it('initializeTelemetry is a no-op', () => {
    expect(() => initializeTelemetry(null)).not.toThrow();
    expect(isTelemetrySdkInitialized()).toBe(false);
  });

  it('shutdownTelemetry resolves without error', async () => {
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });
});
