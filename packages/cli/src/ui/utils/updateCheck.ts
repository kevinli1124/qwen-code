/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UpdateInfo } from 'update-notifier';

export interface UpdateObject {
  message: string;
  update: UpdateInfo;
}

/**
 * Update check disabled — this project is not published to npm.
 * The function is kept for API compatibility but always returns null.
 */
export async function checkForUpdates(): Promise<UpdateObject | null> {
  return null;
}
