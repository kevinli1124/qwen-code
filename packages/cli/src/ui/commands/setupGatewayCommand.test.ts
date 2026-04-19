/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { setupGatewayCommand } from './setupGatewayCommand.js';
import type { CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';

interface AddItemCall {
  type: MessageType;
  text: string;
}

function collectItems(ctx: CommandContext): AddItemCall[] {
  const fn = ctx.ui.addItem as unknown as {
    mock: { calls: Array<[AddItemCall, number]> };
  };
  return fn.mock.calls.map((c) => c[0]);
}

async function mkTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'qwen-setup-gw-'));
}

async function rm(p: string): Promise<void> {
  await fs.rm(p, { recursive: true, force: true });
}

function buildContext(
  projectRoot: string,
  cronEnabled: boolean,
): CommandContext {
  const config = {
    getTargetDir: () => projectRoot,
    isCronEnabled: () => cronEnabled,
  } as unknown as CommandContext['services']['config'];
  return createMockCommandContext({
    services: { config },
  });
}

describe('/setup-gateway', () => {
  const OLD_ENV = { ...process.env };
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkTmp();
    process.env = { ...OLD_ENV };
    delete process.env['TELEGRAM_BOT_TOKEN'];
    delete process.env['TELEGRAM_ALLOWED_USER_IDS'];
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    process.env = OLD_ENV;
    await rm(tmp);
  });

  describe('no args — opens the picker dialog', () => {
    it('returns the unified dialog action with no preselected channel', async () => {
      const ctx = buildContext(tmp, true);
      const result = await setupGatewayCommand.action!(ctx, '');
      expect(result).toEqual({ type: 'dialog', dialog: 'setup_gateway' });
      // No text output — the dialog is the UI.
      expect(collectItems(ctx)).toEqual([]);
    });
  });

  describe('list subcommand — prints the text provider list', () => {
    it('lists every registered provider with its availability tag', async () => {
      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'list');
      const items = collectItems(ctx);
      expect(items).toHaveLength(1);
      expect(items[0].type).toBe(MessageType.INFO);
      expect(items[0].text).toContain('telegram');
      expect(items[0].text).toContain('/setup-gateway verify');
    });
  });

  describe('unknown channel', () => {
    it('reports the valid list', async () => {
      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'nonesuch');
      const items = collectItems(ctx);
      expect(items[0].type).toBe(MessageType.ERROR);
      expect(items[0].text).toMatch(/Unknown channel/);
      expect(items[0].text).toMatch(/telegram/);
    });
  });

  describe('telegram default — opens interactive dialog', () => {
    it('returns a dialog action (no file writes)', async () => {
      const ctx = buildContext(tmp, true);
      const result = await setupGatewayCommand.action!(ctx, 'telegram');
      expect(result).toEqual({
        type: 'dialog',
        dialog: 'setup_gateway_telegram',
      });
      // Nothing was scaffolded on disk.
      const trigDir = path.join(tmp, '.qwen', 'triggers');
      await expect(fs.readdir(trigDir)).rejects.toThrow();
    });
  });

  describe('telegram scaffold (--scaffold-only)', () => {
    it('writes .qwen/triggers/telegram.md when it does not exist', async () => {
      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'telegram --scaffold-only');

      const file = path.join(tmp, '.qwen', 'triggers', 'telegram.md');
      const raw = await fs.readFile(file, 'utf8');
      expect(raw).toContain('kind: message');
      expect(raw).toContain('channel: telegram');

      const items = collectItems(ctx);
      expect(items).toHaveLength(1);
      expect(items[0].text).toContain('Wrote trigger template');
    });

    it('refuses to clobber an existing template without --overwrite', async () => {
      const file = path.join(tmp, '.qwen', 'triggers', 'telegram.md');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, 'old-content', 'utf8');

      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'telegram --scaffold-only');

      const still = await fs.readFile(file, 'utf8');
      expect(still).toBe('old-content');
      const items = collectItems(ctx);
      expect(items[0].text).toContain('already exists');
      expect(items[0].text).toContain('--overwrite');
    });

    it('replaces the template when --overwrite is passed', async () => {
      const file = path.join(tmp, '.qwen', 'triggers', 'telegram.md');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, 'old-content', 'utf8');

      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(
        ctx,
        'telegram --scaffold-only --overwrite',
      );

      const updated = await fs.readFile(file, 'utf8');
      expect(updated).toContain('kind: message');
      const items = collectItems(ctx);
      expect(items[0].text).toContain('Overwrote trigger file');
    });

    it('warns when the trigger system is disabled', async () => {
      const ctx = buildContext(tmp, false);
      await setupGatewayCommand.action!(ctx, 'telegram --scaffold-only');
      const items = collectItems(ctx);
      expect(items[0].text).toContain('trigger system is currently disabled');
      expect(items[0].text).toContain('QWEN_CODE_ENABLE_CRON');
    });
  });

  describe('telegram verify', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ ok: true, result: { username: 'my_bot' } }),
          { status: 200 },
        ),
      );
    });

    it('reports every failure when nothing is set up', async () => {
      const ctx = buildContext(tmp, false);
      await setupGatewayCommand.action!(ctx, 'verify telegram');
      const items = collectItems(ctx);
      expect(items[0].type).toBe(MessageType.ERROR);
      expect(items[0].text).toContain('Trigger file missing');
      expect(items[0].text).toContain('Trigger system is disabled');
      expect(items[0].text).toContain('TELEGRAM_BOT_TOKEN is not set');
    });

    it('calls Telegram getMe when token looks valid and reports the username', async () => {
      // Make everything else pass.
      const file = path.join(tmp, '.qwen', 'triggers', 'telegram.md');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, '---\nid: telegram\n---\n', 'utf8');
      process.env['TELEGRAM_BOT_TOKEN'] = '7890:ABCDEFGHIJKLMN_opq-rst';
      process.env['TELEGRAM_ALLOWED_USER_IDS'] = '1234';

      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'verify telegram');

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/bot7890:ABCDEFGHIJKLMN_opq-rst/getMe'),
        expect.objectContaining({ method: 'GET' }),
      );

      const items = collectItems(ctx);
      expect(items[0].type).toBe(MessageType.INFO);
      expect(items[0].text).toContain('@my_bot');
      expect(items[0].text).toContain('All checks passed');
    });

    it('flags an HTTP error from getMe as a failure', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('{}', { status: 401 }),
      );
      const file = path.join(tmp, '.qwen', 'triggers', 'telegram.md');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, '---\nid: telegram\n---\n', 'utf8');
      process.env['TELEGRAM_BOT_TOKEN'] = '7890:ABCDEFGHIJKLMN_opq-rst';

      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'verify telegram');
      const items = collectItems(ctx);
      expect(items[0].type).toBe(MessageType.ERROR);
      expect(items[0].text).toContain('HTTP 401');
    });

    it('warns but does not fail when the allowlist is empty', async () => {
      const file = path.join(tmp, '.qwen', 'triggers', 'telegram.md');
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, '---\nid: telegram\n---\n', 'utf8');
      process.env['TELEGRAM_BOT_TOKEN'] = '7890:ABCDEFGHIJKLMN_opq-rst';

      const ctx = buildContext(tmp, true);
      await setupGatewayCommand.action!(ctx, 'verify telegram');
      const items = collectItems(ctx);
      expect(items[0].type).toBe(MessageType.INFO);
      expect(items[0].text).toContain('TELEGRAM_ALLOWED_USER_IDS is empty');
      expect(items[0].text).toContain('All checks passed');
    });
  });
});
