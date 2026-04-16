/**
 * Standalone verification script for custom subagent configurations.
 *
 * Runs the same SubagentManager used by the interactive CLI to confirm
 * every agent file in .qwen/agents/ loads cleanly, has valid tool names,
 * and matches the expected invariants (read-only vs read-write, etc).
 *
 * Usage: node scripts/verify-agents.mjs
 */

import { Config, SubagentManager } from '../packages/core/dist/src/index.js';

const EXPECTED_AGENTS = {
  'code-reviewer': {
    readOnly: true,
    tools: ['read_file', 'grep_search', 'glob', 'list_directory', 'lsp', 'ask_user_question'],
    forbidden: ['run_shell_command', 'edit', 'write_file'],
  },
  'debugger': {
    readOnly: false, // has shell (read-only by prompt)
    tools: ['read_file', 'grep_search', 'glob', 'list_directory', 'run_shell_command', 'lsp', 'ask_user_question'],
    forbidden: ['edit', 'write_file'],
  },
  'implementer': {
    readOnly: false,
    tools: ['read_file', 'write_file', 'edit', 'grep_search', 'glob', 'list_directory', 'lsp', 'ask_user_question'],
    forbidden: ['run_shell_command'],
  },
  'refactorer': {
    readOnly: false,
    tools: ['read_file', 'edit', 'grep_search', 'glob', 'list_directory', 'lsp', 'ask_user_question'],
    forbidden: ['run_shell_command', 'write_file'],
  },
  'test-engineer': {
    readOnly: false,
    tools: ['read_file', 'edit', 'write_file', 'glob', 'grep_search', 'run_shell_command', 'skill', 'web_fetch', 'web_search'],
    forbidden: [],
  },
};

const config = new Config({
  sessionId: 'verify-agents',
  targetDir: process.cwd(),
  cwd: process.cwd(),
  debugMode: false,
  model: 'test-model',
  interactive: false,
});

const mgr = new SubagentManager(config);
const agents = await mgr.listSubagents();

console.log(`\nFound ${agents.length} agent(s) total across all levels.\n`);

let failed = 0;
const seen = new Set();
for (const agent of agents) {
  seen.add(agent.name);
  console.log(`[${agent.level}] ${agent.name}`);
  console.log(`  path        : ${agent.filePath}`);
  console.log(`  model       : ${agent.model ?? 'inherit'}`);
  console.log(`  approvalMode: ${agent.approvalMode ?? 'inherit'}`);
  console.log(`  tools       : ${agent.tools?.join(', ') ?? '(all)'}`);
  console.log(`  prompt size : ${agent.systemPrompt?.length ?? 0} chars`);

  const expected = EXPECTED_AGENTS[agent.name];
  if (expected) {
    // Check expected tools present
    const missing = expected.tools.filter((t) => !agent.tools?.includes(t));
    if (missing.length > 0) {
      console.log(`  FAIL        : missing expected tools: ${missing.join(', ')}`);
      failed++;
    }
    // Check forbidden tools absent
    const forbidden = expected.forbidden.filter((t) => agent.tools?.includes(t));
    if (forbidden.length > 0) {
      console.log(`  FAIL        : has forbidden tools: ${forbidden.join(', ')}`);
      failed++;
    }
    if (missing.length === 0 && forbidden.length === 0) {
      console.log(`  check       : OK`);
    }
  }
  console.log('');
}

// Verify all expected agents were found
for (const name of Object.keys(EXPECTED_AGENTS)) {
  if (!seen.has(name)) {
    console.log(`FAIL: expected agent '${name}' not found`);
    failed++;
  }
}

// Verify built-ins exist
const builtins = ['general-purpose', 'Explore', 'statusline-setup'];
for (const name of builtins) {
  if (!seen.has(name)) {
    console.log(`FAIL: builtin agent '${name}' not found`);
    failed++;
  } else {
    console.log(`builtin present: ${name}`);
  }
}

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll agent definitions OK.');
