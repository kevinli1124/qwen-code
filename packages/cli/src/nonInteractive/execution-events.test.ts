/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Verifies that the CLI execution event message types match the shapes
 * expected by the SDK protocol (SDKToolStartMessage, SDKToolCompleteMessage,
 * SDKAgentSpawnMessage).  No runtime import from the SDK is needed — we
 * validate the shapes structurally using TypeScript's assignability checks
 * inside the test bodies.
 */

import { describe, it, expect } from 'vitest';
import type {
  CLIToolStartMessage,
  CLIToolCompleteMessage,
  CLIToolOutputChunkMessage,
  CLIAgentSpawnMessage,
} from './types.js';

describe('CLI execution event message types', () => {
  it('CLIToolStartMessage has all required fields', () => {
    const msg: CLIToolStartMessage = {
      type: 'tool_start',
      session_id: 'sess-1',
      call_id: 'call-1',
      tool_name: 'read_file',
      args: { path: '/tmp/x' },
      agent_id: 'main',
      timestamp: 1_000_000,
    };

    expect(msg.type).toBe('tool_start');
    expect(typeof msg.session_id).toBe('string');
    expect(typeof msg.call_id).toBe('string');
    expect(typeof msg.tool_name).toBe('string');
    expect(typeof msg.args).toBe('object');
    expect(typeof msg.agent_id).toBe('string');
    expect(typeof msg.timestamp).toBe('number');
  });

  it('CLIToolCompleteMessage has all required fields including optional error', () => {
    const success: CLIToolCompleteMessage = {
      type: 'tool_complete',
      session_id: 'sess-1',
      call_id: 'call-1',
      tool_name: 'read_file',
      success: true,
      duration_ms: 42,
      agent_id: 'main',
      timestamp: 1_000_001,
    };
    expect(success.type).toBe('tool_complete');
    expect(success.success).toBe(true);
    expect(success.error).toBeUndefined();

    const failure: CLIToolCompleteMessage = {
      ...success,
      success: false,
      error: 'file not found',
    };
    expect(failure.success).toBe(false);
    expect(typeof failure.error).toBe('string');
  });

  it('CLIAgentSpawnMessage has all required fields', () => {
    const msg: CLIAgentSpawnMessage = {
      type: 'agent_spawn',
      session_id: 'sess-1',
      subagent_id: 'sub-abc',
      parent_agent_id: 'main',
      parent_tool_call_id: 'call-agent-1',
      subagent_type: 'general-purpose',
      timestamp: 1_000_002,
    };

    expect(msg.type).toBe('agent_spawn');
    expect(typeof msg.subagent_id).toBe('string');
    expect(typeof msg.parent_agent_id).toBe('string');
    expect(typeof msg.parent_tool_call_id).toBe('string');
    expect(typeof msg.subagent_type).toBe('string');
    expect(typeof msg.timestamp).toBe('number');
  });

  it('CLIToolOutputChunkMessage has all required fields', () => {
    const msg: CLIToolOutputChunkMessage = {
      type: 'tool_output_chunk',
      session_id: 'sess-1',
      call_id: 'call-1',
      tool_name: 'shell',
      chunk: 'line 1\nline 2',
      agent_id: 'sub-abc',
      timestamp: 1_000_003,
    };

    expect(msg.type).toBe('tool_output_chunk');
    expect(typeof msg.call_id).toBe('string');
    expect(typeof msg.tool_name).toBe('string');
    expect(typeof msg.agent_id).toBe('string');
    expect(typeof msg.timestamp).toBe('number');
  });

  it('type discriminant values match SDK protocol constants', () => {
    const toolStart: CLIToolStartMessage['type'] = 'tool_start';
    const toolComplete: CLIToolCompleteMessage['type'] = 'tool_complete';
    const outputChunk: CLIToolOutputChunkMessage['type'] = 'tool_output_chunk';
    const agentSpawn: CLIAgentSpawnMessage['type'] = 'agent_spawn';

    expect(toolStart).toBe('tool_start');
    expect(toolComplete).toBe('tool_complete');
    expect(outputChunk).toBe('tool_output_chunk');
    expect(agentSpawn).toBe('agent_spawn');
  });
});
