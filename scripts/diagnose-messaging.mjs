#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Standalone diagnostic for the messaging / subagent-fork 500 bug.
 *
 * Bypasses the Ink TUI and Telegram. Reads the user's ~/.qwen/settings.json
 * to get model + API key, then hits the Gemini REST API directly with four
 * progressively-richer payloads. Prints which variant returns 500 so we can
 * localize the culprit:
 *
 *   1. baseline          — one user turn, no tools, no system instruction
 *   2. + systemInstruction — adds the default-assistant system prompt
 *   3. + trivial tool    — adds a single tool declaration
 *   4. full fork shape   — system + tools + `contents` role pattern that
 *                          `AgentHeadless.execute({ extraHistory })` sends
 *
 * Run with: `node scripts/diagnose-messaging.mjs`
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const settingsPath = path.join(os.homedir(), '.qwen', 'settings.json');
const raw = fs.readFileSync(settingsPath, 'utf8');
const settings = JSON.parse(raw);

const apiKey =
  settings?.env?.GEMINI_API_KEY ||
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY;
const model = settings?.model?.name;

if (!apiKey) {
  console.error('No GEMINI_API_KEY found in settings.env or environment.');
  process.exit(1);
}
if (!model) {
  console.error('No model configured in settings.model.name.');
  process.exit(1);
}

console.log(`Model: ${model}`);
console.log(`API key: ${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`);
console.log('');

const endpoint = (suffix) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}${suffix}?key=${apiKey}`;

async function call(label, body) {
  process.stdout.write(`▶ ${label}\n`);
  const start = Date.now();
  let res;
  try {
    res = await fetch(endpoint(':generateContent'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.log(`  network error: ${err.message}`);
    return;
  }
  const dt = Date.now() - start;
  const text = await res.text();
  if (!res.ok) {
    console.log(`  ✗ HTTP ${res.status} in ${dt}ms`);
    // Trim the response so the summary stays readable.
    console.log(`  body: ${text.slice(0, 500).replace(/\s+/g, ' ')}`);
  } else {
    const json = JSON.parse(text);
    const out = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(empty)';
    console.log(`  ✓ HTTP 200 in ${dt}ms — reply: ${out.slice(0, 80)}`);
  }
  console.log('');
}

const TEST_TEXT = 'hi';

// 1. Baseline
await call('1. baseline (no tools, no system)', {
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
});

// 2. With system instruction (like default assistant)
await call('2. + systemInstruction', {
  systemInstruction: {
    role: 'system',
    parts: [
      {
        text: "You are the user's personal assistant, reached through a messaging channel. Reply concisely.",
      },
    ],
  },
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
});

// 3. With a single trivial tool
await call('3. + tools (one trivial function declaration)', {
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
  tools: [
    {
      functionDeclarations: [
        {
          name: 'echo',
          description: 'Echoes the input back.',
          parameters: {
            type: 'OBJECT',
            properties: {
              text: { type: 'STRING', description: 'text to echo' },
            },
            required: ['text'],
          },
        },
      ],
    },
  ],
});

// 4. Full subagent-like shape
await call('4. full subagent shape (system + tools + extraHistory pattern)', {
  systemInstruction: {
    role: 'system',
    parts: [
      {
        text: "You are the user's personal assistant, reached through a messaging channel. Reply concisely.",
      },
    ],
  },
  contents: [
    // Simulated extraHistory = empty on first call, so just the new user turn:
    { role: 'user', parts: [{ text: TEST_TEXT }] },
  ],
  tools: [
    {
      functionDeclarations: [
        {
          name: 'read_file',
          description: 'Read a file from the project.',
          parameters: {
            type: 'OBJECT',
            properties: {
              path: { type: 'STRING', description: 'absolute path' },
            },
            required: ['path'],
          },
        },
        {
          name: 'run_shell',
          description: 'Execute a shell command.',
          parameters: {
            type: 'OBJECT',
            properties: {
              command: { type: 'STRING', description: 'shell command' },
            },
            required: ['command'],
          },
        },
      ],
    },
  ],
});

// 5. Stream endpoint — AgentHeadless uses generateContentStream, not the
//    non-stream endpoint. Some models reject the stream path more aggressively.
async function callStream(label, body) {
  process.stdout.write(`▶ ${label}\n`);
  const start = Date.now();
  let res;
  try {
    res = await fetch(endpoint(':streamGenerateContent'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.log(`  network error: ${err.message}`);
    return;
  }
  const dt = Date.now() - start;
  const text = await res.text();
  if (!res.ok) {
    console.log(`  ✗ HTTP ${res.status} in ${dt}ms`);
    console.log(`  body: ${text.slice(0, 500).replace(/\s+/g, ' ')}`);
  } else {
    console.log(
      `  ✓ HTTP 200 in ${dt}ms — first 120 chars of stream: ${text.slice(0, 120).replace(/\s+/g, ' ')}`,
    );
  }
  console.log('');
}

await callStream('5. stream endpoint, baseline', {
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
});

// 6. Full-fat registry — simulate what AgentCore.prepareTools() sends.
//    AgentHeadless inherits the FULL tool set unless the subagent config
//    overrides `tools`. That's ~20 tools, each with many fields.
const manyTools = [
  'read_file',
  'write_file',
  'edit_file',
  'list_directory',
  'glob',
  'grep',
  'run_shell',
  'todo_write',
  'task_create',
  'task_update',
  'memory_write',
  'memory_remove',
  'web_fetch',
  'web_search',
  'trigger_create',
  'trigger_list',
  'trigger_delete',
  'trigger_toggle',
  'cron_create',
  'cron_list',
].map((name) => ({
  name,
  description: `${name} — simulated tool for diagnostic.`,
  parameters: {
    type: 'OBJECT',
    properties: {
      arg: { type: 'STRING', description: 'dummy arg' },
    },
  },
}));

await callStream('6. stream + full-fat tool registry (~20 tools)', {
  systemInstruction: {
    role: 'system',
    parts: [
      {
        text: "You are the user's personal assistant, reached through a messaging channel. Reply concisely.",
      },
    ],
  },
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
  tools: [{ functionDeclarations: manyTools }],
});

// 7. Stream + huge system prompt — env bootstrap usually injects thousands
//    of lines (QWEN.md, soul, tool catalogue). Simulate a large system.
const hugeSystem =
  "You are the user's personal assistant.\n\n" +
  'Some project context: ' +
  'x'.repeat(20000);
await callStream('7. stream + large system prompt (~20k chars)', {
  systemInstruction: {
    role: 'system',
    parts: [{ text: hugeSystem }],
  },
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
});

// 8. Stream + tools + huge system — worst case
await callStream('8. stream + many tools + large system (worst case)', {
  systemInstruction: {
    role: 'system',
    parts: [{ text: hugeSystem }],
  },
  contents: [{ role: 'user', parts: [{ text: TEST_TEXT }] }],
  tools: [{ functionDeclarations: manyTools }],
});

console.log('— done —');
