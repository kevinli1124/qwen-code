/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ChatTrigger } from './chat-trigger.js';
import type { TriggerConfig } from './types.js';
import { TriggerError } from './types.js';

function makeConfig(overrides: Partial<TriggerConfig> = {}): TriggerConfig {
  return {
    id: 'watchword',
    name: 'Watch Word',
    kind: 'chat',
    enabled: true,
    agentRef: 'researcher',
    spec: { patterns: ['deploy'] },
    ...overrides,
  };
}

const fakeDeps = { cronScheduler: {} as never };

describe('ChatTrigger validate', () => {
  it('rejects empty patterns', () => {
    const t = new ChatTrigger(makeConfig({ spec: { patterns: [] } }), fakeDeps);
    expect(() => t.validate()).toThrow(TriggerError);
  });

  it('rejects more than 10 patterns', () => {
    const patterns = Array.from({ length: 11 }, (_, i) => `p${i}`);
    const t = new ChatTrigger(makeConfig({ spec: { patterns } }), fakeDeps);
    expect(() => t.validate()).toThrow(/max 10/);
  });

  it('rejects non-string patterns', () => {
    const t = new ChatTrigger(
      makeConfig({ spec: { patterns: ['ok', 1 as unknown as string] } }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(TriggerError);
  });

  it('rejects invalid matchMode', () => {
    const t = new ChatTrigger(
      makeConfig({
        spec: { patterns: ['x'], matchMode: 'fuzzy' as unknown as 'substring' },
      }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(/invalid matchMode/);
  });

  it('rejects invalid regex pattern in regex mode', () => {
    const t = new ChatTrigger(
      makeConfig({ spec: { patterns: ['(unclosed'], matchMode: 'regex' } }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(/invalid regex/);
  });

  it('rejects negative cooldownMs', () => {
    const t = new ChatTrigger(
      makeConfig({ spec: { patterns: ['x'], cooldownMs: -1 } }),
      fakeDeps,
    );
    expect(() => t.validate()).toThrow(/cooldownMs/);
  });
});

describe('ChatTrigger evaluate', () => {
  it('substring match is case-insensitive', () => {
    const t = new ChatTrigger(makeConfig(), fakeDeps);
    t.validate();
    t.start(() => {});
    expect(t.evaluate('please DEPLOY now')?.matchedPattern).toBe('deploy');
  });

  it('substring returns null when no pattern matches', () => {
    const t = new ChatTrigger(makeConfig(), fakeDeps);
    t.start(() => {});
    expect(t.evaluate('hello world')).toBeNull();
  });

  it('regex match returns the matched substring', () => {
    const t = new ChatTrigger(
      makeConfig({
        spec: { patterns: ['ship-\\d+'], matchMode: 'regex', cooldownMs: 0 },
      }),
      fakeDeps,
    );
    t.validate();
    t.start(() => {});
    const r = t.evaluate('rolling out ship-42 tonight');
    expect(r?.matchedPattern).toBe('ship-\\d+');
    expect(r?.matchedText).toBe('ship-42');
  });

  it('mention mode requires leading @', () => {
    const t = new ChatTrigger(
      makeConfig({
        spec: {
          patterns: ['oncall'],
          matchMode: 'mention',
          cooldownMs: 0,
        },
      }),
      fakeDeps,
    );
    t.start(() => {});
    expect(t.evaluate('oncall please look')).toBeNull();
    expect(t.evaluate('@oncall please look')?.matchedText).toBe('@oncall');
  });

  it('cooldown suppresses re-fires within the window', () => {
    const t = new ChatTrigger(
      makeConfig({ spec: { patterns: ['ping'], cooldownMs: 5000 } }),
      fakeDeps,
    );
    t.start(() => {});
    expect(t.evaluate('ping', 1_000)).not.toBeNull();
    expect(t.evaluate('ping', 2_000)).toBeNull();
    expect(t.evaluate('ping', 6_001)).not.toBeNull();
  });

  it('returns null when the trigger has not been started', () => {
    const t = new ChatTrigger(makeConfig(), fakeDeps);
    expect(t.evaluate('deploy')).toBeNull();
  });

  it('fireManually dispatches the match payload', async () => {
    const t = new ChatTrigger(makeConfig(), fakeDeps);
    const onFire = vi.fn();
    t.start(onFire);
    const match = t.evaluate('ok deploy')!;
    await t.fireManually({ ...match });
    expect(onFire).toHaveBeenCalledTimes(1);
    expect(onFire.mock.calls[0][0].payload).toEqual(match);
  });

  it('stop clears the onFire callback', () => {
    const t = new ChatTrigger(makeConfig(), fakeDeps);
    t.start(() => {});
    t.stop();
    expect(t.evaluate('deploy')).toBeNull();
  });
});
