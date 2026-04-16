/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenTelemetry SDK has been removed. Telemetry is now fully disabled by default.
 * This file verifies that telemetry-related exports compile correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  TelemetryTarget,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  isTelemetrySdkInitialized,
} from './index.js';

describe('telemetry', () => {
  it('TelemetryTarget enum has expected values', () => {
    expect(TelemetryTarget.LOCAL).toBe('local');
    expect(TelemetryTarget.GCP).toBe('gcp');
    expect(TelemetryTarget.QWEN).toBe('qwen');
  });

  it('DEFAULT_TELEMETRY_TARGET is LOCAL', () => {
    expect(DEFAULT_TELEMETRY_TARGET).toBe(TelemetryTarget.LOCAL);
  });

  it('DEFAULT_OTLP_ENDPOINT is localhost', () => {
    expect(DEFAULT_OTLP_ENDPOINT).toBe('http://localhost:4317');
  });

  it('SDK is never initialized (no-op stubs)', () => {
    expect(isTelemetrySdkInitialized()).toBe(false);
  });
});
