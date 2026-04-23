/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Curated metadata for built-in slash commands, served via GET /api/commands
 * to power the web UI's slash autocomplete. Kept manual (rather than reading
 * BuiltinCommandLoader at runtime) so the web server doesn't drag in all
 * command modules and their transitive deps.
 *
 * Descriptions are intentionally short — the frontend shows them in a
 * narrow dropdown.
 */

export interface CommandMetadata {
  name: string;
  description: string;
  category?: string;
}

export const BUILTIN_COMMAND_METADATA: CommandMetadata[] = [
  {
    name: 'about',
    description: 'Show version and build info',
    category: 'info',
  },
  { name: 'help', description: 'List available commands', category: 'info' },
  {
    name: 'status',
    description: 'Show current session status',
    category: 'info',
  },
  {
    name: 'stats',
    description: 'Show token / tool usage stats',
    category: 'info',
  },
  {
    name: 'context',
    description: 'Inspect assembled context',
    category: 'info',
  },
  { name: 'tools', description: 'List available tools', category: 'info' },
  {
    name: 'docs',
    description: 'Open Qwen Code documentation',
    category: 'info',
  },

  {
    name: 'clear',
    description: 'Clear current conversation',
    category: 'session',
  },
  {
    name: 'compress',
    description: 'Compress conversation to save tokens',
    category: 'session',
  },
  {
    name: 'summary',
    description: 'Summarize the current session',
    category: 'session',
  },
  {
    name: 'copy',
    description: 'Copy last assistant response',
    category: 'session',
  },
  {
    name: 'export',
    description: 'Export session (html/md/json/jsonl)',
    category: 'session',
  },
  {
    name: 'resume',
    description: 'Resume a previous session',
    category: 'session',
  },
  {
    name: 'restore',
    description: 'Restore from a checkpoint',
    category: 'session',
  },

  { name: 'model', description: 'Switch active model', category: 'config' },
  { name: 'auth', description: 'Configure authentication', category: 'config' },
  {
    name: 'approval-mode',
    description: 'Toggle approval mode (default/auto-edit/yolo)',
    category: 'config',
  },
  {
    name: 'permissions',
    description: 'Manage tool permissions',
    category: 'config',
  },
  { name: 'theme', description: 'Change UI theme', category: 'config' },
  {
    name: 'language',
    description: 'Change output language',
    category: 'config',
  },
  {
    name: 'editor',
    description: 'Configure default editor',
    category: 'config',
  },
  { name: 'settings', description: 'Open settings editor', category: 'config' },

  {
    name: 'agents',
    description: 'Manage / create subagents',
    category: 'agents',
  },
  { name: 'skills', description: 'List / manage skills', category: 'agents' },
  { name: 'hooks', description: 'Manage hooks', category: 'agents' },
  {
    name: 'memory',
    description: 'Manage long-term memory',
    category: 'agents',
  },
  { name: 'plan', description: 'Enter plan mode', category: 'agents' },

  { name: 'mcp', description: 'Manage MCP servers', category: 'ext' },
  {
    name: 'extensions',
    description: 'List / install extensions',
    category: 'ext',
  },

  {
    name: 'init',
    description: 'Initialize QWEN.md for this project',
    category: 'setup',
  },
  { name: 'ide', description: 'Connect to IDE companion', category: 'setup' },
  {
    name: 'setup-gateway',
    description: 'Set up messaging gateway (Telegram, etc.)',
    category: 'setup',
  },
  {
    name: 'setup-github',
    description: 'Set up GitHub integration',
    category: 'setup',
  },
  {
    name: 'directory',
    description: 'Add a directory to the include list',
    category: 'setup',
  },
  { name: 'trust', description: 'Manage folder trust', category: 'setup' },

  { name: 'bug', description: 'Report a bug', category: 'misc' },
  { name: 'btw', description: 'Quick note / side remark', category: 'misc' },
  { name: 'insight', description: 'Open insight panel', category: 'misc' },
  {
    name: 'statusline',
    description: 'Configure status line',
    category: 'misc',
  },
  { name: 'vim', description: 'Toggle vim keybindings', category: 'misc' },
  { name: 'quit', description: 'Exit Qwen Code', category: 'misc' },
  {
    name: 'reload',
    description: 'Reload extensions / config',
    category: 'misc',
  },
];
