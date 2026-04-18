/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration test: subagent fork must receive agent-scoped memories (full body)
 * and the general memory index (hooks only) appended to its system prompt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Mock os first so MemoryStore and SubagentManager see the fake home.
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => actual.homedir()),
  };
});

// Fully replace the AgentHeadless module — only AgentHeadless.create is
// exercised via SubagentManager.createAgentHeadless, so a minimal mock is
// sufficient and avoids any real model/tooling dependencies.
const mockAgentHeadlessCreate = vi.hoisted(() => vi.fn());
vi.mock('../agents/runtime/agent-headless.js', () => ({
  AgentHeadless: { create: mockAgentHeadlessCreate },
  ContextState: class {
    private state: Record<string, unknown> = {};
    get(k: string): unknown {
      return this.state[k];
    }
    set(k: string, v: unknown): void {
      this.state[k] = v;
    }
    get_keys(): string[] {
      return Object.keys(this.state);
    }
  },
  templateString: (s: string) => s,
}));

import { makeFakeConfig } from '../test-utils/config.js';
import { SubagentManager } from '../subagents/subagent-manager.js';
import type { SubagentConfig } from '../subagents/types.js';

let tmpRoot: string;
let fakeHome: string;
let projectRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-mem-sa-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  projectRoot = path.join(tmpRoot, 'project');
  await fs.mkdir(fakeHome, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  vi.mocked(os.homedir).mockReturnValue(fakeHome);
  mockAgentHeadlessCreate.mockReset();
  mockAgentHeadlessCreate.mockResolvedValue({
    /* AgentHeadless stub — tests only assert on create() args */
  });
});

afterEach(async () => {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function makeSubagentConfig(name: string): SubagentConfig {
  return {
    name,
    description: `${name} test agent`,
    systemPrompt: `You are ${name}.`,
    level: 'project',
    filePath: path.join(projectRoot, '.qwen', 'agents', `${name}.md`),
  } as SubagentConfig;
}

function getCapturedPromptConfig() {
  expect(mockAgentHeadlessCreate).toHaveBeenCalledTimes(1);
  return mockAgentHeadlessCreate.mock.calls[0][2] as {
    systemPrompt?: string;
  };
}

describe('Subagent memory injection', () => {
  it('appends agent-scoped memories in full to the forked agent system prompt', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    const store = config.getMemoryStore();
    await store.writeMemory({
      name: 'reviewer_patterns',
      description: 'common bugs to watch for',
      type: 'reference',
      scope: 'user',
      content:
        'Pattern 1: off-by-one in pagination. Pattern 2: stale cache invalidation.',
      agent: 'code-reviewer',
    });

    const subagentManager = new SubagentManager(config);
    await subagentManager.createAgentHeadless(
      makeSubagentConfig('code-reviewer'),
      config,
    );

    const promptConfig = getCapturedPromptConfig();
    const sys = promptConfig.systemPrompt ?? '';
    expect(sys).toContain('You are code-reviewer.'); // original preserved
    expect(sys).toContain('Agent memories: code-reviewer (loaded in full)');
    // Full body is inlined — that's the whole point of agent-scoped memory.
    expect(sys).toContain('Pattern 1: off-by-one in pagination');
    expect(sys).toContain('Pattern 2: stale cache invalidation');
  });

  it('also appends the general memory index as hooks only', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    const store = config.getMemoryStore();
    // General (non-agent) memory — body must NOT be inlined, only hook should appear.
    await store.writeMemory({
      name: 'user_role',
      description: 'zh-TW, full-stack, Vue+.NET',
      type: 'user',
      scope: 'user',
      content: 'BODY_SHOULD_NOT_APPEAR_IN_SUBAGENT_PROMPT',
    });

    const subagentManager = new SubagentManager(config);
    await subagentManager.createAgentHeadless(
      makeSubagentConfig('code-reviewer'),
      config,
    );

    const sys = getCapturedPromptConfig().systemPrompt ?? '';
    expect(sys).toContain('[User Role](./user_role.md)');
    expect(sys).toContain('zh-TW, full-stack, Vue+.NET');
    expect(sys).not.toContain('BODY_SHOULD_NOT_APPEAR_IN_SUBAGENT_PROMPT');
  });

  it('matches agent name case-insensitively', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    await config.getMemoryStore().writeMemory({
      name: 'mixed_case_mem',
      description: 'for Code-Reviewer',
      type: 'reference',
      scope: 'user',
      content: 'UNIQUE_CASE_BODY',
      agent: 'Code-Reviewer', // same slug, different casing
    });

    const subagentManager = new SubagentManager(config);
    await subagentManager.createAgentHeadless(
      makeSubagentConfig('code-reviewer'),
      config,
    );

    const sys = getCapturedPromptConfig().systemPrompt ?? '';
    expect(sys).toContain('UNIQUE_CASE_BODY');
  });

  it('injects discipline but no index block when no memories exist', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    const subagentManager = new SubagentManager(config);
    await subagentManager.createAgentHeadless(
      makeSubagentConfig('solo-agent'),
      config,
    );

    const sys = getCapturedPromptConfig().systemPrompt ?? '';
    expect(sys).toContain('You are solo-agent.');
    // Discipline is always on so the first memory gets written correctly.
    expect(sys).toContain('Memory discipline');
    // But no scope index block, since there are no memories yet.
    expect(sys).not.toContain('Memory index (');
    // And no per-agent block either.
    expect(sys).not.toContain('Agent memories:');
  });

  it('does not inject memories tagged for other agents', async () => {
    const config = makeFakeConfig({
      cwd: projectRoot,
      targetDir: projectRoot,
    });
    await config.getMemoryStore().writeMemory({
      name: 'for_reviewer_only',
      description: 'reviewer-specific',
      type: 'reference',
      scope: 'user',
      content: 'REVIEWER_ONLY_CONTENT',
      agent: 'code-reviewer',
    });

    const subagentManager = new SubagentManager(config);
    await subagentManager.createAgentHeadless(
      makeSubagentConfig('deploy-auditor'),
      config,
    );

    const sys = getCapturedPromptConfig().systemPrompt ?? '';
    // The tagged body must not leak into a different agent's prompt.
    expect(sys).not.toContain('REVIEWER_ONLY_CONTENT');
    expect(sys).not.toContain('Agent memories: deploy-auditor');
    // But the hook should still appear in the general index, tagged.
    expect(sys).toContain('[agent:code-reviewer]');
  });
});
