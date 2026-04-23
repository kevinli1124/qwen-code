/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ChatMessageData } from '@qwen-code/webui';
import type { CommandMetadata, SkillMetadata } from '../api/commands';

export interface LocalCommandDeps {
  sessionId: string;
  sessionTitle?: string;
  sessionCwd?: string;
  commands: CommandMetadata[];
  skills: SkillMetadata[];
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
  sessionTokens: { inputTokens: number; outputTokens: number; turns: number };
  /** Replace the visible messages with just what the user keeps. */
  clearSession: (sessionId: string) => void;
  /** Append an assistant-style message to the conversation. */
  appendMessage: (sessionId: string, msg: ChatMessageData) => void;
}

export interface LocalCommandResult {
  /** true if we handled it locally — caller should NOT forward to CLI. */
  handled: boolean;
}

function makeAssistantMessage(content: string): ChatMessageData {
  return {
    uuid: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'assistant',
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content },
  };
}

function groupByCategory(
  items: Array<{ name: string; description: string; category?: string }>,
): Record<string, typeof items> {
  const out: Record<string, typeof items> = {};
  for (const c of items) {
    const cat = c.category ?? 'misc';
    (out[cat] ??= []).push(c);
  }
  return out;
}

/**
 * Handle a text message locally if it matches a web-UI-local slash
 * command. Returns { handled: true } so the caller skips sending it to
 * the child CLI (which would reject it as "not supported in
 * non-interactive mode").
 *
 * Commands handled locally: /help, /clear, /status, /stats, /skills,
 * /tools, /about.
 */
export function handleLocalCommand(
  text: string,
  deps: LocalCommandDeps,
): LocalCommandResult {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return { handled: false };

  // Take the first whitespace-separated token as the command name.
  const firstSpace = trimmed.search(/\s/);
  const cmdName = (firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace))
    .slice(1)
    .toLowerCase();

  switch (cmdName) {
    case 'clear': {
      deps.clearSession(deps.sessionId);
      deps.appendMessage(
        deps.sessionId,
        makeAssistantMessage(
          '✓ Conversation cleared (local view only — the CLI session still keeps its context).',
        ),
      );
      return { handled: true };
    }

    case 'help': {
      const byCat = groupByCategory(deps.commands);
      const lines: string[] = ['**Available slash commands:**', ''];
      const order = [
        'info',
        'session',
        'config',
        'agents',
        'skill',
        'ext',
        'setup',
        'misc',
      ];
      for (const cat of order) {
        const items = byCat[cat];
        if (!items || items.length === 0) continue;
        lines.push(`**${cat}**`);
        for (const c of items) {
          lines.push(`- \`/${c.name}\` — ${c.description}`);
        }
        lines.push('');
      }
      lines.push(
        '_Type `/` to open the autocomplete menu; use ↑ / ↓ / Tab to navigate._',
      );
      deps.appendMessage(
        deps.sessionId,
        makeAssistantMessage(lines.join('\n')),
      );
      return { handled: true };
    }

    case 'skills': {
      if (deps.skills.length === 0) {
        deps.appendMessage(
          deps.sessionId,
          makeAssistantMessage(
            'No skills found under `~/.qwen/skills/`, `<project>/.qwen/skills/`, or bundled dir.',
          ),
        );
      } else {
        const byScope = new Map<string, SkillMetadata[]>();
        for (const s of deps.skills) {
          const arr = byScope.get(s.scope) ?? [];
          arr.push(s);
          byScope.set(s.scope, arr);
        }
        const lines: string[] = ['**Installed skills:**', ''];
        for (const scope of ['bundled', 'user', 'project'] as const) {
          const items = byScope.get(scope);
          if (!items || items.length === 0) continue;
          lines.push(`**${scope}**`);
          for (const s of items) {
            lines.push(
              `- \`/${s.name}\`${s.description ? ` — ${s.description}` : ''}`,
            );
          }
          lines.push('');
        }
        deps.appendMessage(
          deps.sessionId,
          makeAssistantMessage(lines.join('\n')),
        );
      }
      return { handled: true };
    }

    case 'status': {
      const lines = [
        `**Session:** ${deps.sessionTitle ?? deps.sessionId}`,
        `**Working dir:** \`${deps.sessionCwd ?? '?'}\``,
        `**Session ID:** \`${deps.sessionId}\``,
        `**Turns this session:** ${deps.sessionTokens.turns}`,
      ];
      deps.appendMessage(
        deps.sessionId,
        makeAssistantMessage(lines.join('\n')),
      );
      return { handled: true };
    }

    case 'stats': {
      const last = deps.tokenUsage;
      const lines = [
        '**Token usage:**',
        `- Session total: ↑ ${deps.sessionTokens.inputTokens} / ↓ ${deps.sessionTokens.outputTokens} across ${deps.sessionTokens.turns} turn(s)`,
      ];
      if (last) {
        lines.push(
          `- Last turn: ↑ ${last.inputTokens ?? 0} / ↓ ${last.outputTokens ?? 0}`,
        );
      }
      deps.appendMessage(
        deps.sessionId,
        makeAssistantMessage(lines.join('\n')),
      );
      return { handled: true };
    }

    case 'tools': {
      // Show the tools advertised at session init — read from sessionStore
      // isn't available here; fall back to a static-ish hint.
      deps.appendMessage(
        deps.sessionId,
        makeAssistantMessage(
          'Tools available depend on the model and enabled extensions. In a typical run you will see:\n' +
            '- File: `read_file`, `write_file`, `edit`, `list_directory`, `glob`\n' +
            '- Search: `grep_search`, `web_fetch`\n' +
            '- Run: `run_shell_command`\n' +
            '- Agents / skills: `agent`, `skill`, `todo_write`\n' +
            '- Memory: `save_memory`, `memory_write`, `memory_remove`\n\n' +
            'Check the sidebar system-init event for the exact list from this session.',
        ),
      );
      return { handled: true };
    }

    case 'about': {
      deps.appendMessage(
        deps.sessionId,
        makeAssistantMessage(
          'Qwen Code (web UI) — type `/help` for commands, `@<path>` to reference a file.',
        ),
      );
      return { handled: true };
    }

    default:
      return { handled: false };
  }
}
