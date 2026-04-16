#!/usr/bin/env node
/**
 * End-to-end smoke test for the custom subagent lineup.
 *
 * Drives the built Qwen Code CLI in non-interactive mode, spawning each
 * agent with a small fixed prompt and scoring its output against the
 * agent's declared output contract.
 *
 * Requires:
 *   - the CLI has been built (npm run build)
 *   - a working auth (OPENAI_API_KEY / DASHSCOPE_API_KEY / etc)
 *
 * Usage:
 *   node scripts/test-agents.mjs            # runs all agents
 *   node scripts/test-agents.mjs implementer # runs one agent
 *
 * Exit code 0 on success, 1 if any test fails the shape check. LLM output
 * is non-deterministic, so shape checks only verify headers/format —
 * semantic quality must be eyeballed by the user.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'packages', 'cli', 'dist', 'index.js');
const CWD = path.resolve(__dirname, '..');

const TESTS = [
  {
    agent: 'code-reviewer',
    description: 'Review a small file for potential issues (read-only).',
    prompt: `Spawn the code-reviewer agent to review the file at ${path.resolve(CWD, 'packages/core/src/utils/paths.ts')}. It only needs to check the isSubpathSafe function (around line 270). After the review returns, relay its full output verbatim.`,
    expectHeaders: ['## Review Summary', '## Confidence'],
    forbiddenMarkers: ['## Changes', 'Edit tool'],
  },
  {
    agent: 'debugger',
    description: 'Diagnose a fake bug symptom, read-only access.',
    prompt: `Spawn the debugger agent to analyze this symptom: "isSubpathSafe returns true even when the resolved child path is outside the resolved parent, when realpathSync throws partway through". Point it at ${path.resolve(CWD, 'packages/core/src/utils/paths.ts')}. The function lives around line 270-290. Explain in the expected Root Cause / Evidence / Confidence format. After it returns, relay its output verbatim.`,
    expectHeaders: ['## Root Cause'],
    forbiddenMarkers: ['## Changes', 'edit applied', 'Applying fix'],
  },
  {
    agent: 'implementer',
    description: 'A trivial bounded change on an existing file.',
    prompt: `Spawn the implementer agent with this task: "Add exactly one short JSDoc comment line ('/** Clears the realpath cache; exposed for tests. */') immediately above the 'export function clearRealpathCache' function in ${path.resolve(CWD, 'packages/core/src/utils/paths.ts')}. Do not change anything else." After it returns, relay its Result / Changes / Verification output verbatim.`,
    expectHeaders: ['## Result', '## Changes'],
    forbiddenMarkers: [],
    cleanup: async () => {
      // Revert whatever the implementer did.
      await run('git', ['checkout', '--', 'packages/core/src/utils/paths.ts']);
    },
  },
  {
    agent: 'refactorer',
    description: 'Ask for a rename that would change behavior, expect refusal.',
    prompt: `Spawn the refactorer agent with this task: "Rename the isSubpathSafe function in ${path.resolve(CWD, 'packages/core/src/utils/paths.ts')} to isPathSafe, AND also change its behavior to return false when parentPath equals childPath." Relay its output verbatim. The refactorer should refuse the behavior change and stop.`,
    expectHeaders: ['## Refactor'],
    expectOneOf: ['Not performed', 'Behavior preserved'],
    forbiddenMarkers: [],
  },
  {
    agent: 'test-runner',
    description: 'Run an existing green test and report PASS with evidence.',
    prompt: `Spawn the test-runner agent with this task: "Run exactly this command from the repository root: 'npx vitest run packages/core/src/utils/paths.test.ts'. Working directory: ${CWD}". Relay its full output (Verdict / Command / Summary / Evidence) verbatim.`,
    expectHeaders: ['## Verdict', '## Summary'],
    expectOneOf: ['PASS'],
    forbiddenMarkers: [],
  },
];

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: CWD, shell: false, ...opts });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function runTest(test) {
  console.log(`\n========================================`);
  console.log(`Agent: ${test.agent}`);
  console.log(`Desc : ${test.description}`);
  console.log(`----------------------------------------`);

  const startMs = Date.now();
  const { code, stdout, stderr } = await run(
    'node',
    [CLI, '-p', test.prompt, '--yolo'],
    { timeout: 240000 },
  );
  const elapsed = Math.round((Date.now() - startMs) / 1000);

  console.log(`CLI exit code: ${code}`);
  console.log(`Elapsed      : ${elapsed}s`);
  console.log(`\n--- OUTPUT ---\n${stdout}\n--- END OUTPUT ---`);
  if (stderr.trim()) {
    console.log(`\n--- STDERR ---\n${stderr}\n--- END STDERR ---`);
  }

  // Shape validation — accept either "## Header" or "Header:" prose form
  const problems = [];
  for (const h of test.expectHeaders ?? []) {
    const headerText = h.replace(/^#+\s*/, '');
    const mdForm = new RegExp(`^##\\s*${headerText}\\b`, 'm');
    const proseForm = new RegExp(`^${headerText}:\\s`, 'm');
    if (!mdForm.test(stdout) && !proseForm.test(stdout)) {
      problems.push(`missing expected header "${h}" (neither "## ${headerText}" nor "${headerText}:" form found)`);
    }
  }
  if (test.expectOneOf && !test.expectOneOf.some((m) => stdout.includes(m))) {
    problems.push(`none of expected markers found: ${test.expectOneOf.join(' | ')}`);
  }
  for (const m of test.forbiddenMarkers ?? []) {
    if (stdout.includes(m)) problems.push(`forbidden marker appeared: "${m}"`);
  }

  if (test.cleanup) {
    console.log('Running cleanup...');
    await test.cleanup();
  }

  if (problems.length > 0) {
    console.log(`\nSHAPE CHECK: FAIL`);
    for (const p of problems) console.log(`  - ${p}`);
    return false;
  }
  console.log(`\nSHAPE CHECK: OK`);
  return true;
}

const target = process.argv[2];
const toRun = target ? TESTS.filter((t) => t.agent === target) : TESTS;
if (toRun.length === 0) {
  console.log(`Unknown agent: ${target}`);
  console.log(`Available: ${TESTS.map((t) => t.agent).join(', ')}`);
  process.exit(1);
}

let fails = 0;
for (const t of toRun) {
  const ok = await runTest(t);
  if (!ok) fails++;
}

console.log(`\n========================================`);
console.log(`Ran ${toRun.length} test(s), ${fails} shape failure(s).`);
console.log(`Note: shape check only validates output format; semantic`);
console.log(`quality (did the agent ACTUALLY find the right issue?) must`);
console.log(`be judged by reading the OUTPUT sections above.`);
process.exit(fails > 0 ? 1 : 0);
