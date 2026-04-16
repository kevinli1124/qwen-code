/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// OpenTelemetry SDK has been removed.
// These are no-op stubs to maintain API compatibility.

export function isTelemetrySdkInitialized(): boolean {
  return false;
}

 
export function initializeTelemetry(_config: unknown): void {}

export async function shutdownTelemetry(): Promise<void> {}
