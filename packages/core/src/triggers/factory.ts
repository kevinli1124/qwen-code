/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseTrigger, TriggerDeps } from './base-trigger.js';
import { CronTrigger } from './cron-trigger.js';
import { FileTrigger } from './file-trigger.js';
import { WebhookTrigger } from './webhook-trigger.js';
import { ChatTrigger } from './chat-trigger.js';
import { SystemTrigger } from './system-trigger.js';
import { TriggerError, TriggerErrorCode, type TriggerConfig } from './types.js';

/**
 * Constructs a trigger instance for the given config. Callers must invoke
 * `trigger.validate()` before `trigger.start()`.
 * Supported kinds: cron, file, webhook, chat, system.
 */
export function createTrigger(
  cfg: TriggerConfig,
  deps: TriggerDeps,
): BaseTrigger {
  switch (cfg.kind) {
    case 'cron':
      return new CronTrigger(cfg, deps);
    case 'file':
      return new FileTrigger(cfg, deps);
    case 'webhook':
      return new WebhookTrigger(cfg, deps);
    case 'chat':
      return new ChatTrigger(cfg, deps);
    case 'system':
      return new SystemTrigger(cfg, deps);
    default:
      throw new TriggerError(
        `Unknown trigger kind: ${String(cfg.kind)}`,
        TriggerErrorCode.UNSUPPORTED_KIND,
        cfg.id,
      );
  }
}
