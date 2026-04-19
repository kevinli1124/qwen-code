/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { CommandContext } from '../types.js';
import { t } from '../../../i18n/index.js';
import {
  errorResult,
  type GatewaySetupProvider,
  type SetupResult,
  type SetupStep,
} from './types.js';

const TRIGGER_ID = 'telegram';
const TRIGGER_FILENAME = `${TRIGGER_ID}.md`;

const TEMPLATE = `---
id: ${TRIGGER_ID}
name: Telegram personal assistant
kind: message
enabled: true
spec:
  channel: telegram
  # Leave historyWindow at defaults (20 messages / 8000 chars) unless you
  # specifically want to inject more or less prior conversation per turn.
  # historyWindow:
  #   maxMessages: 20
  #   maxChars: 8000
  # promptPrefix: '[Telegram]'   # optional: prepended to each user turn
---
`;

const GETME_TIMEOUT_MS = 8000;

/** Picks a plausible per-shell syntax for exporting env vars on the current OS. */
function envHint(varName: string, placeholder: string): string {
  if (process.platform === 'win32') {
    return [
      `PowerShell:  $env:${varName} = '${placeholder}'`,
      `cmd.exe:     set ${varName}=${placeholder}`,
    ].join('\n');
  }
  return `bash/zsh:    export ${varName}='${placeholder}'`;
}

/** Telegram bot token looks like `<digits>:<35 alphanum-ish chars>`. */
function looksLikeToken(s: string): boolean {
  return /^\d+:[A-Za-z0-9_-]{10,}$/.test(s);
}

function triggerFilePath(ctx: CommandContext): string | null {
  const targetDir = ctx.services.config?.getTargetDir();
  if (!targetDir) return null;
  return path.join(targetDir, '.qwen', 'triggers', TRIGGER_FILENAME);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Calls api.telegram.org/bot<token>/getMe, returns bot username on success. */
async function fetchBotIdentity(
  token: string,
): Promise<{ ok: true; username: string } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GETME_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: t('Telegram returned HTTP {{status}} — token likely invalid', {
          status: String(res.status),
        }),
      };
    }
    const json = (await res.json()) as {
      ok: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (!json.ok) {
      return {
        ok: false,
        reason: t('Telegram error: {{description}}', {
          description: json.description ?? t('unknown'),
        }),
      };
    }
    return { ok: true, username: json.result?.username ?? '<unnamed>' };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return {
        ok: false,
        reason: t('getMe timed out after {{ms}}ms', {
          ms: String(GETME_TIMEOUT_MS),
        }),
      };
    }
    return {
      ok: false,
      reason: t('Network error: {{message}}', {
        message: (err as Error).message,
      }),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const telegramSetup: GatewaySetupProvider = {
  channel: 'telegram',
  // Use getters so the label/summary are localized when read (at render
  // time), not at module load — i18n may not be initialized yet at import.
  get label() {
    return t('Telegram');
  },
  available: true,
  get summary() {
    return t(
      'Long-polling bot (via @BotFather). Good fit for personal assistant use from mobile.',
    );
  },

  async scaffold(
    ctx: CommandContext,
    options: { overwrite: boolean },
  ): Promise<SetupResult> {
    const file = triggerFilePath(ctx);
    if (!file) {
      return errorResult(
        t('Telegram setup'),
        t(
          'No project root is available — is qwen-code being run with a config?',
        ),
      );
    }

    const cronEnabled = ctx.services.config?.isCronEnabled() ?? false;
    const steps: SetupStep[] = [];
    let failed = false;

    // 1. Write (or refuse to clobber) the trigger file.
    const exists = await fileExists(file);
    if (exists && !options.overwrite) {
      steps.push({
        status: 'warn',
        label: t('Trigger file already exists: {{file}}', { file }),
        detail: t(
          'Re-run with `/setup-gateway telegram --scaffold-only --overwrite` to replace it.',
        ),
      });
    } else {
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, TEMPLATE, 'utf8');
        steps.push({
          status: 'ok',
          label: exists
            ? t('Overwrote trigger file: {{file}}', { file })
            : t('Wrote trigger template: {{file}}', { file }),
        });
      } catch (err) {
        failed = true;
        steps.push({
          status: 'error',
          label: t('Failed to write {{file}}', { file }),
          detail: (err as Error).message,
        });
      }
    }

    // 2. Gate notice — triggers won't register if cron isn't enabled.
    if (!cronEnabled) {
      steps.push({
        status: 'warn',
        label: t('The trigger system is currently disabled'),
        detail: t(
          'Triggers only run when `experimental.cron: true` is set in settings, or when the env var QWEN_CODE_ENABLE_CRON=1 is exported before launch.',
        ),
      });
    }

    // 3. Env var checklist.
    const tokenSet = Boolean(process.env['TELEGRAM_BOT_TOKEN']);
    const allowSet = Boolean(process.env['TELEGRAM_ALLOWED_USER_IDS']);
    steps.push({
      status: tokenSet ? 'ok' : 'info',
      label: tokenSet
        ? t('TELEGRAM_BOT_TOKEN is set in the current environment')
        : t('Next: set TELEGRAM_BOT_TOKEN (from @BotFather /newbot)'),
      detail: tokenSet
        ? undefined
        : envHint('TELEGRAM_BOT_TOKEN', '7890123456:AAE...'),
    });
    steps.push({
      status: allowSet ? 'ok' : 'warn',
      label: allowSet
        ? t('TELEGRAM_ALLOWED_USER_IDS is set')
        : t(
            'Next: set TELEGRAM_ALLOWED_USER_IDS (comma-separated; get yours from @userinfobot)',
          ),
      detail: allowSet
        ? undefined
        : [
            envHint('TELEGRAM_ALLOWED_USER_IDS', '123456789'),
            '',
            t(
              'Leaving this empty means ANY Telegram user who finds your bot can drive it.',
            ),
          ].join('\n'),
    });

    return {
      title: t('Telegram gateway — setup scaffold'),
      steps,
      nextHint: failed
        ? undefined
        : t(
            'Run `/setup-gateway verify telegram` once env vars are set to check the token + connectivity.',
          ),
      failed,
    };
  },

  async verify(ctx: CommandContext): Promise<SetupResult> {
    const file = triggerFilePath(ctx);
    const steps: SetupStep[] = [];
    let failed = false;

    // 1. Trigger file present?
    if (file) {
      const exists = await fileExists(file);
      steps.push({
        status: exists ? 'ok' : 'error',
        label: exists
          ? t('Trigger file exists: {{file}}', { file })
          : t('Trigger file missing: {{file}}', { file }),
        detail: exists
          ? undefined
          : t('Run `/setup-gateway telegram` to create it.'),
      });
      if (!exists) failed = true;
    }

    // 2. Cron/triggers flag?
    const cronEnabled = ctx.services.config?.isCronEnabled() ?? false;
    steps.push({
      status: cronEnabled ? 'ok' : 'error',
      label: cronEnabled
        ? t('Trigger system is enabled')
        : t('Trigger system is disabled — triggers will not register'),
      detail: cronEnabled
        ? undefined
        : t(
            'Set `experimental.cron: true` in settings.json, or export QWEN_CODE_ENABLE_CRON=1, then restart.',
          ),
    });
    if (!cronEnabled) failed = true;

    // 3. Bot token present + looks valid?
    const token = process.env['TELEGRAM_BOT_TOKEN']?.trim();
    if (!token) {
      failed = true;
      steps.push({
        status: 'error',
        label: t('TELEGRAM_BOT_TOKEN is not set in this process'),
        detail: envHint('TELEGRAM_BOT_TOKEN', '7890123456:AAE...'),
      });
    } else if (!looksLikeToken(token)) {
      steps.push({
        status: 'warn',
        label: t(
          'TELEGRAM_BOT_TOKEN is set but does not look like a valid token',
        ),
        detail: t(
          'Expected format: <digits>:<letters/digits/underscores/dashes>',
        ),
      });
    } else {
      steps.push({
        status: 'ok',
        label: t('TELEGRAM_BOT_TOKEN is set'),
      });
    }

    // 4. Live getMe (only if we have a plausible token).
    if (token && looksLikeToken(token)) {
      const id = await fetchBotIdentity(token);
      if (id.ok) {
        steps.push({
          status: 'ok',
          label: t('Connected to Telegram as @{{username}}', {
            username: id.username,
          }),
        });
      } else {
        failed = true;
        steps.push({
          status: 'error',
          label: t('Could not reach Telegram with this token'),
          detail: id.reason,
        });
      }
    }

    // 5. Allowlist — soft warning, not a failure.
    const allow = process.env['TELEGRAM_ALLOWED_USER_IDS'];
    if (!allow) {
      steps.push({
        status: 'warn',
        label: t(
          'TELEGRAM_ALLOWED_USER_IDS is empty — bot is open to any sender',
        ),
        detail: t(
          'Highly recommended for a personal assistant; find your id via @userinfobot.',
        ),
      });
    } else {
      const ids = allow
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      steps.push({
        status: 'ok',
        label: t('Allowlist has {{count}} user id(s)', {
          count: String(ids.length),
        }),
      });
    }

    return {
      title: t('Telegram gateway — verification'),
      steps,
      nextHint: failed
        ? undefined
        : t(
            'All checks passed. If triggers are already running, send a message to your bot to test end-to-end.',
          ),
      failed,
    };
  },
};
