/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the AGENT_SPAWN event type and AgentEventEmitter behaviour.
 */

import { describe, it, expect, vi } from 'vitest';
import { AgentEventEmitter, AgentEventType } from './agent-events.js';
import type { AgentSpawnEvent } from './agent-events.js';

describe('AgentEventType.AGENT_SPAWN', () => {
  it('is defined in the enum', () => {
    expect(AgentEventType.AGENT_SPAWN).toBe('agent_spawn');
  });

  it('AgentEventEmitter emits and receives AGENT_SPAWN with correct payload', () => {
    const emitter = new AgentEventEmitter();
    const listener = vi.fn();

    emitter.on(AgentEventType.AGENT_SPAWN, listener);

    const payload: AgentSpawnEvent = {
      subagentId: 'sub-abc123',
      parentAgentId: 'parent-xyz456',
      parentToolCallId: 'call-789',
      subagentType: 'general-purpose',
      timestamp: 1_000_000,
    };

    emitter.emit(AgentEventType.AGENT_SPAWN, payload);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('off() removes the listener', () => {
    const emitter = new AgentEventEmitter();
    const listener = vi.fn();

    emitter.on(AgentEventType.AGENT_SPAWN, listener);
    emitter.off(AgentEventType.AGENT_SPAWN, listener);
    emitter.emit(AgentEventType.AGENT_SPAWN, {
      subagentId: 'a',
      parentAgentId: 'b',
      parentToolCallId: 'c',
      subagentType: 'fork',
      timestamp: 0,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it('payload fields are all present and correctly typed', () => {
    const emitter = new AgentEventEmitter();
    let received: AgentSpawnEvent | undefined;

    emitter.on(AgentEventType.AGENT_SPAWN, (e) => {
      received = e;
    });

    emitter.emit(AgentEventType.AGENT_SPAWN, {
      subagentId: 'sub-1',
      parentAgentId: 'parent-1',
      parentToolCallId: 'tcall-1',
      subagentType: 'implementer',
      timestamp: Date.now(),
    });

    expect(received).toBeDefined();
    expect(typeof received!.subagentId).toBe('string');
    expect(typeof received!.parentAgentId).toBe('string');
    expect(typeof received!.parentToolCallId).toBe('string');
    expect(typeof received!.subagentType).toBe('string');
    expect(typeof received!.timestamp).toBe('number');
  });
});
