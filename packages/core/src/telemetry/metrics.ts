/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// OpenTelemetry metrics have been removed.
// This file provides no-op stubs and enum definitions for API compatibility.

import type { Config } from '../config/config.js';
import type { ModelSlashCommandEvent } from './types.js';

export const SUBAGENT_EXECUTION_COUNT = 'qwen-code.subagent.execution.count';

export type MetricDefinitions = Record<
  string,
  { attributes: Record<string, unknown> }
>;

export enum FileOperation {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
}

export enum PerformanceMetricType {
  STARTUP = 'startup',
  MEMORY = 'memory',
  CPU = 'cpu',
  TOOL_EXECUTION = 'tool_execution',
  API_REQUEST = 'api_request',
  TOKEN_EFFICIENCY = 'token_efficiency',
}

export enum MemoryMetricType {
  HEAP_USED = 'heap_used',
  HEAP_TOTAL = 'heap_total',
  EXTERNAL = 'external',
  RSS = 'rss',
}

export enum ToolExecutionPhase {
  VALIDATION = 'validation',
  PREPARATION = 'preparation',
  EXECUTION = 'execution',
  RESULT_PROCESSING = 'result_processing',
}

export enum ApiRequestPhase {
  REQUEST_PREPARATION = 'request_preparation',
  NETWORK_LATENCY = 'network_latency',
  RESPONSE_PROCESSING = 'response_processing',
  TOKEN_PROCESSING = 'token_processing',
}

 
export function getMeter(): undefined {
  return undefined;
}

 
export function initializeMetrics(_config: Config): void {}

export function recordChatCompressionMetrics(
   
  _config: Config,
   
  _attributes: Record<string, unknown>,
): void {}

export function recordToolCallMetrics(
   
  _config: Config,
   
  _durationMs: number,
   
  _attributes: Record<string, unknown>,
): void {}

export function recordTokenUsageMetrics(
   
  _config: Config,
   
  _tokenCount: number,
   
  _attributes: Record<string, unknown>,
): void {}

export function recordApiResponseMetrics(
   
  _config: Config,
   
  _durationMs: number,
   
  _attributes: Record<string, unknown>,
): void {}

export function recordApiErrorMetrics(
   
  _config: Config,
   
  _durationMs: number,
   
  _attributes: Record<string, unknown>,
): void {}

export function recordFileOperationMetric(
   
  _config: Config,
   
  _attributes: Record<string, unknown>,
): void {}

 
export function recordInvalidChunk(_config: Config): void {}

 
export function recordContentRetry(_config: Config): void {}

 
export function recordContentRetryFailure(_config: Config): void {}

export function recordModelSlashCommand(
   
  _config: Config,
   
  _event: ModelSlashCommandEvent,
): void {}

export function recordSubagentExecutionMetrics(
   
  _config: Config,
   
  _subagentName: string,
   
  _status: string,
   
  _terminateReason?: string,
): void {}

 
export function initializePerformanceMonitoring(_config: Config): void {}

export function recordStartupPerformance(
   
  _config: Config,
   
  _durationMs: number,
   
  _phase?: string,
): void {}

export function recordMemoryUsage(
   
  _config: Config,
   
  _usageBytes: number,
   
  _metricType?: MemoryMetricType,
): void {}

export function recordCpuUsage(
   
  _config: Config,
   
  _usagePercent: number,
   
  _component?: string,
): void {}

export function recordToolQueueDepth(
   
  _config: Config,
   
  _queueDepth: number,
): void {}

export function recordToolExecutionBreakdown(
   
  _config: Config,
   
  _functionName: string,
   
  _phase: ToolExecutionPhase,
   
  _durationMs: number,
): void {}

export function recordTokenEfficiency(
   
  _config: Config,
   
  _model: string,
   
  _metric: string,
   
  _value: number,
   
  _context?: string,
): void {}

export function recordApiRequestBreakdown(
   
  _config: Config,
   
  _model: string,
   
  _phase: ApiRequestPhase,
   
  _durationMs: number,
): void {}

export function recordPerformanceScore(
   
  _config: Config,
   
  _score: number,
   
  _metricType?: PerformanceMetricType,
): void {}

export function recordPerformanceRegression(
   
  _config: Config,
   
  _metric: string,
   
  _currentValue: number,
   
  _baselineValue: number,
   
  _severity?: 'low' | 'medium' | 'high',
): void {}

export function recordBaselineComparison(
   
  _config: Config,
   
  _metric: string,
   
  _currentValue: number,
   
  _baselineValue: number,
): void {}

export function isPerformanceMonitoringActive(): boolean {
  return false;
}

 
export function recordArenaSessionStartedMetrics(_config: Config): void {}

export function recordArenaAgentCompletedMetrics(
   
  _config: Config,
   
  _agentModelId: string,
   
  _status: string,
   
  _durationMs: number,
   
  _inputTokens: number,
   
  _outputTokens: number,
): void {}

export function recordArenaSessionEndedMetrics(
   
  _config: Config,
   
  _status: string,
   
  _displayBackend?: string,
   
  _durationMs?: number,
   
  _winnerModelId?: string,
): void {}
