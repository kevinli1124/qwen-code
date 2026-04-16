/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenTelemetry metrics have been removed. This file verifies that the
 * no-op stubs and enum definitions compile and export correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  FileOperation,
  PerformanceMetricType,
  MemoryMetricType,
  ToolExecutionPhase,
  ApiRequestPhase,
  isPerformanceMonitoringActive,
} from './metrics.js';

describe('metrics stubs', () => {
  it('FileOperation enum has expected values', () => {
    expect(FileOperation.CREATE).toBe('create');
    expect(FileOperation.READ).toBe('read');
    expect(FileOperation.UPDATE).toBe('update');
  });

  it('PerformanceMetricType enum has expected values', () => {
    expect(PerformanceMetricType.STARTUP).toBe('startup');
    expect(PerformanceMetricType.MEMORY).toBe('memory');
    expect(PerformanceMetricType.CPU).toBe('cpu');
  });

  it('MemoryMetricType enum has expected values', () => {
    expect(MemoryMetricType.HEAP_USED).toBe('heap_used');
    expect(MemoryMetricType.HEAP_TOTAL).toBe('heap_total');
  });

  it('ToolExecutionPhase enum has expected values', () => {
    expect(ToolExecutionPhase.VALIDATION).toBe('validation');
    expect(ToolExecutionPhase.EXECUTION).toBe('execution');
  });

  it('ApiRequestPhase enum has expected values', () => {
    expect(ApiRequestPhase.NETWORK_LATENCY).toBe('network_latency');
    expect(ApiRequestPhase.RESPONSE_PROCESSING).toBe('response_processing');
  });

  it('isPerformanceMonitoringActive returns false (no-op)', () => {
    expect(isPerformanceMonitoringActive()).toBe(false);
  });
});
