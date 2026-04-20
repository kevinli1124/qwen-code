/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the onToolStart / onToolComplete callbacks added to CoreToolScheduler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ApprovalMode,
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from '../index.js';
import type { Config, ToolResult, ToolRegistry } from '../index.js';
import { CoreToolScheduler } from './coreToolScheduler.js';
import type { AnyToolInvocation } from '../index.js';
import { IdeClient } from '../ide/ide-client.js';
import type { PermissionDecision } from '../permissions/types.js';

vi.mock('../ide/ide-client.js', () => ({
  IdeClient: { getInstance: vi.fn() },
}));

// ─── Minimal mock tool that succeeds ────────────────────────

class SuccessInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  getDescription() {
    return 'success tool';
  }
  async execute(): Promise<ToolResult> {
    return { llmContent: 'ok' };
  }
  async getDefaultPermission(): Promise<PermissionDecision> {
    return 'allow';
  }
}

class FailInvocation extends BaseToolInvocation<
  Record<string, unknown>,
  ToolResult
> {
  getDescription() {
    return 'fail tool';
  }
  async execute(): Promise<ToolResult> {
    return { llmContent: '', error: { message: 'boom', type: undefined } };
  }
  async getDefaultPermission(): Promise<PermissionDecision> {
    return 'allow';
  }
}

class SuccessTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor() {
    super('success_tool', 'Success Tool', 'does nothing', Kind.ReadOnly, {
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  }
  protected createInvocation(
    _params: Record<string, unknown>,
  ): SuccessInvocation {
    return new SuccessInvocation({});
  }
}

class FailTool extends BaseDeclarativeTool<
  Record<string, unknown>,
  ToolResult
> {
  constructor() {
    super('fail_tool', 'Fail Tool', 'always fails', Kind.ReadOnly, {
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  }
  protected createInvocation(_params: Record<string, unknown>): FailInvocation {
    return new FailInvocation({});
  }
}

// ─── Minimal mock config ─────────────────────────────────────

function makeConfig(
  tools: Array<BaseDeclarativeTool<Record<string, unknown>, ToolResult>>,
): Config {
  const registry = {
    getTool: (name: string) => tools.find((t) => t.name === name) ?? null,
    getAllTools: () => tools,
    getDeclarativeTools: () => tools,
  } as unknown as ToolRegistry;

  return {
    getToolRegistry: () => registry,
    getApprovalMode: () => ApprovalMode.YOLO,
    getMessageBus: () => undefined,
    getDisableAllHooks: () => true,
    getShellExecutionConfig: () => undefined,
    getChatRecordingService: () => undefined,
    getDisableFileTruncation: () => false,
  } as unknown as Config;
}

function makeScheduler(
  tools: Array<BaseDeclarativeTool<Record<string, unknown>, ToolResult>>,
  onToolStart?: (
    callId: string,
    name: string,
    args: Record<string, unknown>,
    invocation: AnyToolInvocation,
  ) => void,
  onToolComplete?: (
    callId: string,
    name: string,
    success: boolean,
    durationMs: number,
  ) => void,
) {
  return new CoreToolScheduler({
    config: makeConfig(tools),
    getPreferredEditor: () => undefined,
    onEditorClose: () => {},
    onToolStart,
    onToolComplete,
  });
}

// ─── Tests ───────────────────────────────────────────────────

describe('CoreToolScheduler onToolStart / onToolComplete callbacks', () => {
  beforeEach(() => {
    vi.mocked(IdeClient.getInstance).mockReturnValue(
      null as unknown as ReturnType<typeof IdeClient.getInstance>,
    );
  });

  it('onToolStart fires before execute with correct callId, name, args, and invocation', async () => {
    const startSpy = vi.fn();
    const scheduler = makeScheduler([new SuccessTool()], startSpy);
    const signal = new AbortController().signal;

    await scheduler.schedule(
      { callId: 'c1', name: 'success_tool', args: {}, isClientInitiated: true },
      signal,
    );

    expect(startSpy).toHaveBeenCalledOnce();
    const [callId, name, args, invocation] = startSpy.mock.calls[0];
    expect(callId).toBe('c1');
    expect(name).toBe('success_tool');
    expect(args).toEqual({});
    expect(invocation).toBeInstanceOf(SuccessInvocation);
  });

  it('onToolComplete fires after a successful execute with success=true and durationMs>=0', async () => {
    const completeSpy = vi.fn();
    const scheduler = makeScheduler(
      [new SuccessTool()],
      undefined,
      completeSpy,
    );
    const signal = new AbortController().signal;

    await scheduler.schedule(
      { callId: 'c2', name: 'success_tool', args: {}, isClientInitiated: true },
      signal,
    );

    expect(completeSpy).toHaveBeenCalledOnce();
    const [callId, name, success, durationMs] = completeSpy.mock.calls[0];
    expect(callId).toBe('c2');
    expect(name).toBe('success_tool');
    expect(success).toBe(true);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it('onToolComplete fires with success=false when tool returns an error', async () => {
    const completeSpy = vi.fn();
    const scheduler = makeScheduler([new FailTool()], undefined, completeSpy);
    const signal = new AbortController().signal;

    await scheduler.schedule(
      { callId: 'c3', name: 'fail_tool', args: {}, isClientInitiated: true },
      signal,
    );

    expect(completeSpy).toHaveBeenCalledOnce();
    const [, , success] = completeSpy.mock.calls[0];
    expect(success).toBe(false);
  });

  it('onToolStart fires before onToolComplete', async () => {
    const order: string[] = [];
    const scheduler = makeScheduler(
      [new SuccessTool()],
      () => order.push('start'),
      () => order.push('complete'),
    );
    const signal = new AbortController().signal;

    await scheduler.schedule(
      { callId: 'c4', name: 'success_tool', args: {}, isClientInitiated: true },
      signal,
    );

    expect(order).toEqual(['start', 'complete']);
  });

  it('callbacks are optional — scheduler works without them', async () => {
    const scheduler = makeScheduler([new SuccessTool()]);
    const signal = new AbortController().signal;

    // Should not throw
    await expect(
      scheduler.schedule(
        {
          callId: 'c5',
          name: 'success_tool',
          args: {},
          isClientInitiated: true,
        },
        signal,
      ),
    ).resolves.not.toThrow();
  });
});
