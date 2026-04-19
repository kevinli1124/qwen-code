/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interactive setup dialog for messaging gateways (Telegram today;
 * Discord / Slack reserved).
 *
 * Flow:
 *   1. Pick a channel (skipped if `initialChannel` is supplied).
 *   2. Collect the bot token from @BotFather (masked input).
 *   3. Collect the comma-separated Telegram user-id allowlist.
 *   4. Validate by calling `https://api.telegram.org/bot<T>/getMe`.
 *   5. On success, persist to user-scope settings
 *      (~/.qwen/settings.json) under `messaging.telegram.*`.
 *
 * Everything the user types stays in this process — no slash-command
 * argument parsing, no terminal scrollback leak (token is masked), and no
 * transmission to the LLM (the dialog bypasses the chat stream entirely).
 */

import type React from 'react';
import { useState } from 'react';
import { Box, Text } from 'ink';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { LoadedSettings } from '../../../config/settings.js';
import { SettingScope } from '../../../config/settings.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { TextInput } from '../shared/TextInput.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { theme } from '../../semantic-colors.js';
import { t } from '../../../i18n/index.js';

type Step =
  | 'channel'
  | 'unsupported'
  | 'token'
  | 'users'
  | 'validating'
  | 'done'
  | 'error';

interface Props {
  settings: LoadedSettings;
  onClose: () => void;
  /**
   * Skip the channel picker and jump straight to this channel's setup flow.
   * Undefined (the default) shows the picker first. Currently only 'telegram'
   * is supported — other values pass through to the unsupported screen.
   */
  initialChannel?: string;
  /** Injected for tests — defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

interface ChannelOption {
  value: string;
  /** Translation key — looked up at render time so the label is localized. */
  labelKey: string;
  available: boolean;
}

const CHANNEL_OPTIONS: ChannelOption[] = [
  {
    value: 'telegram',
    labelKey: 'Telegram — long-polling bot (works now)',
    available: true,
  },
  {
    value: 'discord',
    labelKey: 'Discord — not yet implemented',
    available: false,
  },
  {
    value: 'slack',
    labelKey: 'Slack — not yet implemented',
    available: false,
  },
];

const GETME_TIMEOUT_MS = 8000;

/**
 * YAML template we drop into `~/.qwen/triggers/telegram.md` when the dialog
 * finishes. Without this file, `MessageTrigger` never registers and the
 * gateway we just credential-provisioned has nothing to hand incoming
 * messages to. Kept in sync with the scaffold-only path in
 * `gateway-setup/telegram-setup.ts`.
 */
const TELEGRAM_TRIGGER_TEMPLATE = `---
id: telegram
name: Telegram personal assistant
kind: message
enabled: true
spec:
  channel: telegram
  # Defaults: last 20 messages / 8000 chars injected as conversation history.
  # Uncomment to override:
  # historyWindow:
  #   maxMessages: 20
  #   maxChars: 8000
  # promptPrefix: '[Telegram]'   # optional: prepended to each user turn
---
`;

/** Writes `~/.qwen/triggers/telegram.md` if it doesn't already exist. Returns
 *  which file was written (or was already present) so the dialog can report
 *  exactly what lives on disk. */
async function ensureTelegramTriggerFile(): Promise<{
  path: string;
  created: boolean;
}> {
  const file = path.join(os.homedir(), '.qwen', 'triggers', 'telegram.md');
  try {
    await fs.access(file);
    return { path: file, created: false };
  } catch {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, TELEGRAM_TRIGGER_TEMPLATE, 'utf8');
    return { path: file, created: true };
  }
}

/** Telegram bot token shape: `<digits>:<10+ alphanum_._dash_underscore>`. */
export function looksLikeToken(s: string): boolean {
  return /^\d+:[A-Za-z0-9_-]{10,}$/.test(s.trim());
}

export function parseUserIds(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function callGetMe(
  token: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; username: string } | { ok: false; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GETME_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        reason: t('HTTP {{status}} — token likely invalid', {
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
        reason: json.description ?? t('Telegram rejected the token'),
      };
    }
    return { ok: true, username: json.result?.username ?? '<unnamed>' };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return {
        ok: false,
        reason: t('Request timed out ({{ms}}ms)', {
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

function initialStepFor(channel: string | undefined): Step {
  if (!channel) return 'channel';
  const opt = CHANNEL_OPTIONS.find((c) => c.value === channel);
  if (!opt) return 'channel';
  return opt.available ? 'token' : 'unsupported';
}

export const SetupGatewayDialog: React.FC<Props> = ({
  settings,
  onClose,
  initialChannel,
  fetchImpl,
}) => {
  const [step, setStep] = useState<Step>(() => initialStepFor(initialChannel));
  const [selectedChannel, setSelectedChannel] = useState<string>(
    initialChannel ?? 'telegram',
  );
  const [token, setToken] = useState('');
  const [usersRaw, setUsersRaw] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [botUsername, setBotUsername] = useState<string>('');
  const [triggerFilePath, setTriggerFilePath] = useState<string>('');
  const [triggerFileCreated, setTriggerFileCreated] = useState<boolean>(false);

  const fetchFn = fetchImpl ?? globalThis.fetch;

  // Escape cancels from any step (except while a network call is in flight).
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onClose();
      }
    },
    { isActive: step !== 'validating' },
  );

  const onPickChannel = (value: string) => {
    setSelectedChannel(value);
    const opt = CHANNEL_OPTIONS.find((c) => c.value === value);
    if (!opt?.available) {
      setStep('unsupported');
      return;
    }
    setStep('token');
  };

  const submitToken = () => {
    if (!looksLikeToken(token)) {
      setErrorMessage(
        t(
          'That does not look like a Telegram bot token. Format: <digits>:<letters/digits/underscores/dashes>.',
        ),
      );
      return;
    }
    setErrorMessage('');
    setStep('users');
  };

  const submitUsers = async () => {
    const ids = parseUserIds(usersRaw);
    setErrorMessage('');
    setStep('validating');
    const result = await callGetMe(token.trim(), fetchFn);
    if (!result.ok) {
      setErrorMessage(result.reason);
      setStep('error');
      return;
    }
    try {
      settings.setValue(
        SettingScope.User,
        'messaging.telegram.token',
        token.trim(),
      );
      settings.setValue(
        SettingScope.User,
        'messaging.telegram.allowedUserIds',
        ids,
      );
      // Critical: without ~/.qwen/triggers/telegram.md, MessageTrigger never
      // registers and no one receives Telegram updates. We create it here so
      // a first-time user ends up with a working bot after one dialog.
      const trigger = await ensureTelegramTriggerFile();
      setTriggerFilePath(trigger.path);
      setTriggerFileCreated(trigger.created);
      setBotUsername(result.username);
      setStep('done');
    } catch (err) {
      setErrorMessage(
        t('Failed to save settings: {{message}}', {
          message: (err as Error).message ?? String(err),
        }),
      );
      setStep('error');
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={theme.text.accent}>
        {t('Messaging gateway setup')}
        {step !== 'channel' && step !== 'unsupported'
          ? ` — ${selectedChannel}`
          : ''}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          {t(
            'Values you enter here stay local — saved to ~/.qwen/settings.json, never sent to the model.',
          )}
        </Text>
      </Box>

      {step === 'channel' && (
        <Box marginTop={1} flexDirection="column">
          <Text>{t('Which channel do you want to set up?')}</Text>
          <Box marginTop={1}>
            <RadioButtonSelect
              items={CHANNEL_OPTIONS.map((opt) => ({
                key: opt.value,
                label: t(opt.labelKey),
                value: opt.value,
                disabled: !opt.available,
              }))}
              initialIndex={Math.max(
                0,
                CHANNEL_OPTIONS.findIndex((c) => c.value === selectedChannel),
              )}
              onSelect={onPickChannel}
              isFocused={true}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              {t('↑/↓ to move, Enter to pick, Escape to cancel.')}
            </Text>
          </Box>
        </Box>
      )}

      {step === 'unsupported' && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.status.warning}>
            {t(
              'The {{channel}} gateway is not yet implemented. Nothing was saved.',
              { channel: selectedChannel },
            )}
          </Text>
          <Box marginTop={1}>
            <Text dimColor>
              {t(
                'Track progress in docs/users/features/messaging.md, or run /setup-gateway to pick a different channel. Press Escape to close.',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {step === 'token' && (
        <Box marginTop={1} flexDirection="column">
          <Text>{t('Step 1 / 2 — Bot token (from @BotFather /newbot):')}</Text>
          <Box marginTop={1}>
            <TextInput
              value={token}
              onChange={setToken}
              onSubmit={submitToken}
              placeholder={t('paste token, then Enter')}
              inputWidth={60}
              isActive={true}
            />
          </Box>
          <Box marginTop={1}>
            <Text color={theme.status.warning}>
              {t(
                'The token is shown in plain text so you can verify the paste succeeded. Clear your terminal scrollback after finishing.',
              )}
            </Text>
          </Box>
          {errorMessage && (
            <Box marginTop={1}>
              <Text color={theme.status.error}>{errorMessage}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text dimColor>{t('Enter to continue, Escape to cancel.')}</Text>
          </Box>
        </Box>
      )}

      {step === 'users' && (
        <Box marginTop={1} flexDirection="column">
          <Text>
            {t(
              'Step 2 / 2 — Allowed Telegram user IDs (comma-separated; get yours from @userinfobot).',
            )}
          </Text>
          <Box marginTop={1}>
            <TextInput
              value={usersRaw}
              onChange={setUsersRaw}
              onSubmit={submitUsers}
              placeholder={t('e.g. 123456789, 987654321')}
              inputWidth={50}
              isActive={true}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              {t(
                'Leave empty to accept every Telegram user (insecure for public bots). Enter to save and validate, Escape to cancel.',
              )}
            </Text>
          </Box>
        </Box>
      )}

      {step === 'validating' && (
        <Box marginTop={1}>
          <Text color={theme.status.warning}>
            {t('Contacting api.telegram.org/getMe to verify the token…')}
          </Text>
        </Box>
      )}

      {step === 'done' && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.status.success}>
            {t('Connected to Telegram as @{{username}}. Credentials saved.', {
              username: botUsername,
            })}
          </Text>
          <Box marginTop={1}>
            <Text>
              {triggerFileCreated
                ? t('Trigger file created: {{file}}', {
                    file: triggerFilePath,
                  })
                : t('Trigger file already existed, left untouched: {{file}}', {
                    file: triggerFilePath,
                  })}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              {t(
                'Restart qwen-code so the MessageTrigger picks up the new credentials. Then send a message to your bot.',
              )}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>{t('Press Escape to close.')}</Text>
          </Box>
        </Box>
      )}

      {step === 'error' && (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.status.error}>{errorMessage}</Text>
          <Box marginTop={1}>
            <Text dimColor>
              {t('Press Escape to close, then re-run /setup-gateway telegram.')}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
