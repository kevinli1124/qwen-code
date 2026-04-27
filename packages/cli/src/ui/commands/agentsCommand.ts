/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import {
  CommandKind,
  type SlashCommand,
  type CommandContext,
  type OpenDialogActionReturn,
  type MessageActionReturn,
} from './types.js';
import { t } from '../../i18n/index.js';
import { SubagentManager } from '@qwen-code/qwen-code-core';

function formatAgentList(
  agents: Array<{
    name: string;
    level: string;
    tools?: string[];
    model?: string;
    description: string;
  }>,
): string {
  if (agents.length === 0) {
    return 'No subagents registered.';
  }

  // Group by level for readable output
  const byLevel: Record<string, typeof agents> = {};
  for (const a of agents) {
    (byLevel[a.level] ??= []).push(a);
  }

  const levelOrder = ['session', 'project', 'user', 'extension', 'builtin'];
  const lines: string[] = [
    `Registered subagents (${agents.length} total):`,
    '',
  ];

  for (const level of levelOrder) {
    const group = byLevel[level];
    if (!group || group.length === 0) continue;
    lines.push(`[${level}] — ${group.length}`);
    for (const a of group) {
      const toolSummary = a.tools ? `${a.tools.length} tools` : 'all tools';
      const modelTag = a.model && a.model !== 'inherit' ? ` · ${a.model}` : '';
      lines.push(`  ${a.name.padEnd(20)} ${toolSummary.padEnd(10)}${modelTag}`);
      // First sentence of description, max 80 chars
      const firstSentence = a.description.split(/[.。\n]/)[0].trim();
      const desc =
        firstSentence.length > 80
          ? firstSentence.slice(0, 77) + '...'
          : firstSentence;
      if (desc) lines.push(`    ${desc}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// Agent scaffold templates
const AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;

const VALID_TEMPLATES = ['basic', 'executor', 'reviewer', 'analyzer'] as const;
type TemplateName = (typeof VALID_TEMPLATES)[number];

interface AgentTemplate {
  description: (name: string) => string;
  tools: string[];
  systemPrompt: (name: string) => string;
}

const TEMPLATES: Record<TemplateName, AgentTemplate> = {
  basic: {
    description: (name) =>
      `${name} — custom agent. Describe when to spawn this agent and what it does.`,
    tools: [],
    systemPrompt: (name) => `# ${name}

You are ${name}. Describe your role and responsibilities here.

## Scope

What tasks are you authorized to perform? What is explicitly out of scope?

## Output format

Describe the expected output format so callers know what to expect.
`,
  },

  executor: {
    description: (name) =>
      `${name} — focused implementer for concrete, bounded code changes. Caller must supply target file(s) and exact change. Returns a diff summary.`,
    tools: [
      'read_file',
      'write_file',
      'edit',
      'grep_search',
      'glob',
      'list_directory',
    ],
    systemPrompt: (name) => `# ${name} — Focused Implementer

You receive a concrete change request and execute it. You do not plan, explore broadly, or propose alternatives. The caller has already decided what to do; your job is to write the code correctly and stop.

## Scope contract

Your task is BOUNDED by what the caller gave you. Do NOT:
- Refactor code outside the specified scope
- Add tests unless explicitly asked
- Change interfaces or APIs beyond what the task requires

## Output format

After completing the task, respond with:

## Result
[One sentence: done / blocked / clarification needed]

## Changes
[Bullet list of files changed and what changed]

## Verification
[How you confirmed the change is correct]
`,
  },

  reviewer: {
    description: (name) =>
      `${name} — read-only code reviewer. Analyzes code for bugs, security issues, and quality. Never edits files.`,
    tools: ['read_file', 'grep_search', 'glob', 'list_directory'],
    systemPrompt: (name) => `# ${name} — Code Reviewer

You review code. You do NOT edit files. Your job is analysis and reporting only.

## What to check

- Correctness: logic errors, edge cases, off-by-one errors
- Security: injection risks, path traversal, unsafe operations
- Quality: naming, duplication, missing error handling

## Output format

## Review Summary
[2-3 sentence overview]

## Findings
[Bulleted list. Each item: severity (critical/high/medium/low), location (file:line), description]

## Confidence
[high / medium / low — how confident you are in the findings]
`,
  },

  analyzer: {
    description: (name) =>
      `${name} — research and diagnosis agent. Investigates symptoms, traces root causes, and produces structured reports. Never edits files.`,
    tools: ['read_file', 'grep_search', 'glob', 'list_directory', 'web_search'],
    systemPrompt: (name) => `# ${name} — Analyzer

You investigate problems. You read code, search for patterns, and produce structured diagnostic reports. You do NOT edit files.

## Process

1. Restate the symptom in your own words to confirm understanding
2. Identify the most likely root cause candidates
3. Gather evidence from the codebase (read files, grep, glob)
4. Rule out candidates until one remains
5. Summarize findings

## Output format

## Root Cause
[One paragraph: the actual cause]

## Evidence
[Bulleted list of file:line references that support the diagnosis]

## Confidence
[high / medium / low] — [reason for uncertainty if not high]
`,
  },
};

export const agentsCommand: SlashCommand = {
  name: 'agents',
  get description() {
    return t('Manage subagents for specialized task delegation.');
  },
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'list',
      get description() {
        return t('List all registered subagents inline (no dialog).');
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext): Promise<MessageActionReturn> => {
        const config = context.services.config;
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config not available.',
          };
        }
        try {
          const mgr = new SubagentManager(config);
          const agents = await mgr.listSubagents();
          return {
            type: 'message',
            messageType: 'info',
            content: formatAgentList(agents),
          };
        } catch (err) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to list subagents: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    },
    {
      name: 'manage',
      get description() {
        return t('Manage existing subagents (view, edit, delete).');
      },
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'subagent_list',
      }),
    },
    {
      name: 'create',
      get description() {
        return t('Create a new subagent with guided setup.');
      },
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'subagent_create',
      }),
    },
    {
      name: 'new',
      get description() {
        return t(
          'Scaffold a new agent from a template: /agents new <name> [basic|executor|reviewer|analyzer]',
        );
      },
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext): Promise<MessageActionReturn> => {
        const rawArgs = (context.invocation?.args ?? '').trim();
        const parts = rawArgs.split(/\s+/).filter(Boolean);
        const name = parts[0];
        const templateKey = (parts[1] ?? 'basic') as TemplateName;

        if (!name) {
          return {
            type: 'message',
            messageType: 'error',
            content: [
              'Usage: /agents new <name> [template]',
              `Templates: ${VALID_TEMPLATES.join(', ')}`,
              '',
              'Examples:',
              '  /agents new my-linter',
              '  /agents new security-reviewer reviewer',
              '  /agents new data-extractor analyzer',
            ].join('\n'),
          };
        }

        if (!AGENT_NAME_RE.test(name)) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Agent name must be lowercase alphanumeric with hyphens (e.g. "my-reviewer"). Got: "${name}"`,
          };
        }

        if (!VALID_TEMPLATES.includes(templateKey)) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Unknown template "${templateKey}". Available: ${VALID_TEMPLATES.join(', ')}`,
          };
        }

        const config = context.services.config;
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Config not available.',
          };
        }

        const template = TEMPLATES[templateKey];

        try {
          const mgr = new SubagentManager(config);
          await mgr.createSubagent(
            {
              name,
              description: template.description(name),
              tools: template.tools.length > 0 ? template.tools : undefined,
              systemPrompt: template.systemPrompt(name),
              level: 'project',
            },
            { level: 'project' },
          );

          const filePath = path.join(
            config.getProjectRoot(),
            '.qwen',
            'agents',
            `${name}.md`,
          );

          return {
            type: 'message',
            messageType: 'info',
            content: [
              `Agent "${name}" created from "${templateKey}" template.`,
              `File: ${filePath}`,
              '',
              'Edit the file to customize the system prompt and tool list.',
              'Use /agents list to verify it was registered.',
            ].join('\n'),
          };
        } catch (err) {
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to create agent: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    },
  ],
};
