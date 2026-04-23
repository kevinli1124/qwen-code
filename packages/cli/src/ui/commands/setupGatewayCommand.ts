/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * /setup-gateway — interactive wizard for messaging gateways.
 *
 * No args opens a dialog with a channel picker; channel names skip the
 * picker; `verify` runs live sanity checks; `list` reprints the text
 * provider directory.
 *
 * Each provider module under `./gateway-setup/` owns its own scaffold +
 * verify implementation, so adding Discord / Slack later requires no
 * changes here.
 */

import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { findProvider, gatewaySetupProviders } from './gateway-setup/index.js';
import { formatSetupResult } from './gateway-setup/types.js';
import { getErrorMessage } from '@qwen-code/qwen-code-core';
import { t } from '../../i18n/index.js';

function emit(ctx: CommandContext, type: MessageType, text: string): void {
  ctx.ui.addItem({ type, text }, Date.now());
}

function listProviders(): string {
  const lines: string[] = [t('Messaging gateway providers:'), ''];
  for (const p of gatewaySetupProviders) {
    const tag = p.available ? t('[OK]  ') : t('[TODO]');
    // p.summary is looked up as a translation key by the provider, so it
    // has already been localized by the time we get here.
    lines.push(`${tag} ${p.channel.padEnd(10)} — ${p.summary}`);
  }
  lines.push('');
  lines.push(t('Usage:'));
  lines.push(
    `  /setup-gateway                       ${t('open the interactive picker')}`,
  );
  lines.push(
    `  /setup-gateway <channel>             ${t('jump to a channel (e.g. telegram)')}`,
  );
  lines.push(
    `  /setup-gateway <channel> --scaffold-only   ${t('write a trigger YAML template instead of opening the dialog')}`,
  );
  lines.push(
    `  /setup-gateway verify [channel]      ${t('sanity-check the setup')}`,
  );
  lines.push(
    `  /setup-gateway list                  ${t('reprint this list')}`,
  );
  return lines.join('\n');
}

function parseArgs(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0);
}

async function runScaffold(
  ctx: CommandContext,
  channel: string,
  overwrite: boolean,
): Promise<void> {
  const provider = findProvider(channel);
  if (!provider) {
    emit(
      ctx,
      MessageType.ERROR,
      t('Unknown channel "{{channel}}". Known: {{list}}.', {
        channel,
        list: gatewaySetupProviders.map((p) => p.channel).join(', '),
      }),
    );
    return;
  }
  if (!provider.available) {
    emit(
      ctx,
      MessageType.INFO,
      t(
        '{{label}} gateway is on the roadmap but not yet implemented — no scaffold will be written.',
        { label: provider.label },
      ),
    );
    return;
  }
  try {
    const result = await provider.scaffold(ctx, { overwrite });
    emit(
      ctx,
      result.failed ? MessageType.ERROR : MessageType.INFO,
      formatSetupResult(result),
    );
  } catch (err) {
    emit(
      ctx,
      MessageType.ERROR,
      t('{{label}} scaffold failed: {{error}}', {
        label: provider.label,
        error: getErrorMessage(err),
      }),
    );
  }
}

async function runVerify(
  ctx: CommandContext,
  onlyChannel?: string,
): Promise<void> {
  const providers = onlyChannel
    ? [findProvider(onlyChannel)].filter(
        (p): p is NonNullable<typeof p> => p !== undefined,
      )
    : gatewaySetupProviders.filter((p) => p.available);

  if (onlyChannel && providers.length === 0) {
    emit(
      ctx,
      MessageType.ERROR,
      t('Unknown channel "{{channel}}".', { channel: onlyChannel }),
    );
    return;
  }

  if (providers.length === 0) {
    emit(
      ctx,
      MessageType.INFO,
      t('No gateway providers are available to verify.'),
    );
    return;
  }

  for (const provider of providers) {
    if (!provider.available) {
      emit(
        ctx,
        MessageType.INFO,
        t('{{label}} is not yet implemented — skipping verify.', {
          label: provider.label,
        }),
      );
      continue;
    }
    try {
      const result = await provider.verify(ctx);
      emit(
        ctx,
        result.failed ? MessageType.ERROR : MessageType.INFO,
        formatSetupResult(result),
      );
    } catch (err) {
      emit(
        ctx,
        MessageType.ERROR,
        t('{{label}} verify crashed: {{error}}', {
          label: provider.label,
          error: getErrorMessage(err),
        }),
      );
    }
  }
}

export const setupGatewayCommand: SlashCommand = {
  name: 'setup-gateway',
  // Getter so the description is resolved when the user opens /help or tab
  // completion, not at module load time — otherwise it caches the English
  // fallback before the i18n runtime finishes loading.
  get description() {
    return t(
      'Scaffold a messaging gateway (Telegram today; Discord/Slack soon) and verify the setup.',
    );
  },
  kind: CommandKind.BUILT_IN,
  action: async (ctx, rawArgs): Promise<SlashCommandActionReturn | void> => {
    const args = parseArgs(rawArgs);

    // No args → open the unified interactive dialog with a channel picker.
    if (args.length === 0) {
      return { type: 'dialog', dialog: 'setup_gateway' };
    }

    const head = args[0].toLowerCase();
    if (head === 'verify') {
      const target = args[1]?.toLowerCase();
      await runVerify(ctx, target);
      return;
    }
    if (
      head === 'list' ||
      head === 'help' ||
      head === '--help' ||
      head === '-h'
    ) {
      emit(ctx, MessageType.INFO, listProviders());
      return;
    }

    const wantScaffoldFile = args.slice(1).some((a) => a === '--scaffold-only');
    const overwrite = args.slice(1).some((a) => a === '--overwrite');

    // Channel name given → open the same dialog, skipping the picker step.
    // `--scaffold-only` falls back to the file-template behavior for scripted
    // setups (no dialog, just write `.qwen/triggers/<channel>.md`).
    if (!wantScaffoldFile) {
      // [DISABLED 2026-04-23 — Telegram integration disabled; see commit msg for how to re-enable]
      // if (head === 'telegram') {
      //   return { type: 'dialog', dialog: 'setup_gateway_telegram' };
      // }
      const known = findProvider(head);
      if (known && !known.available) {
        emit(
          ctx,
          MessageType.INFO,
          t(
            '{{label}} is on the roadmap but not yet implemented. Run /setup-gateway to see the picker.',
            { label: known.label },
          ),
        );
        return;
      }
    }

    await runScaffold(ctx, head, overwrite);
  },
};
