/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CronScheduler } from '../services/cronScheduler.js';
import { CronTrigger, extractTriggerIdFromJobPrompt } from './cron-trigger.js';
import type { TriggerConfig } from './types.js';
import { TriggerError } from './types.js';

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: 'daily-review',
    name: 'Daily Review',
    kind: 'cron',
    enabled: true,
    agentRef: 'reviewer',
    spec: { cron: '0 9 * * *' },
    ...overrides,
  };
}

describe('CronTrigger', () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    scheduler = new CronScheduler();
  });

  afterEach(() => {
    scheduler.destroy();
  });

  it('validate rejects missing cron', () => {
    const trigger = new CronTrigger(makeConfig({ spec: {} }), {
      cronScheduler: scheduler,
    });
    expect(() => trigger.validate()).toThrow(TriggerError);
  });

  it('validate rejects invalid cron expression', () => {
    const trigger = new CronTrigger(
      makeConfig({ spec: { cron: 'not-a-cron' } }),
      { cronScheduler: scheduler },
    );
    expect(() => trigger.validate()).toThrow(TriggerError);
  });

  it('start registers a job with the trigger-id sentinel prompt', () => {
    const trigger = new CronTrigger(makeConfig(), { cronScheduler: scheduler });
    trigger.validate();
    trigger.start(() => {});
    const jobs = scheduler.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].prompt).toBe('__trigger__:daily-review');
    expect(extractTriggerIdFromJobPrompt(jobs[0].prompt)).toBe('daily-review');
  });

  it('stop removes the scheduled job', () => {
    const trigger = new CronTrigger(makeConfig(), { cronScheduler: scheduler });
    trigger.start(() => {});
    expect(scheduler.size).toBe(1);
    trigger.stop();
    expect(scheduler.size).toBe(0);
    expect(trigger.getJobId()).toBeNull();
  });

  it('handleSchedulerFire invokes onFire with payload containing the cron expression', async () => {
    const trigger = new CronTrigger(makeConfig(), { cronScheduler: scheduler });
    const onFire = vi.fn();
    trigger.start(onFire);
    await trigger.handleSchedulerFire();
    expect(onFire).toHaveBeenCalledTimes(1);
    const ctx = onFire.mock.calls[0][0];
    expect(ctx.triggerId).toBe('daily-review');
    expect(ctx.kind).toBe('cron');
    expect(ctx.payload).toEqual({ cronExpr: '0 9 * * *' });
  });

  it('extractTriggerIdFromJobPrompt returns null for legacy prompts', () => {
    expect(extractTriggerIdFromJobPrompt('hello world')).toBeNull();
    expect(extractTriggerIdFromJobPrompt('__trigger__:foo')).toBe('foo');
  });
});
