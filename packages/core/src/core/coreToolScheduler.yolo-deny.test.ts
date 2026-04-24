/**
 * @license
 * Copyright 2026 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isYoloDenied } from './coreToolScheduler.js';

describe('isYoloDenied — shell commands', () => {
  const yolo = (cmd: string) =>
    isYoloDenied('run_shell_command', { command: cmd });

  it('blocks rm -rf in the canonical forms', () => {
    expect(yolo('rm -rf /tmp/x')).toBe(true);
    expect(yolo('rm -fr /')).toBe(true);
    expect(yolo('rm --recursive --force /var')).toBe(true);
    expect(yolo('sudo rm -rf /')).toBe(true);
  });

  it('blocks dd of= disk writes', () => {
    expect(yolo('dd if=/dev/zero of=/dev/sda bs=1M')).toBe(true);
  });

  it('blocks chown / chmod -R on unexpected trees', () => {
    expect(yolo('chmod -R 777 /')).toBe(true);
    expect(yolo('chown -R root /etc')).toBe(true);
  });

  it('blocks git push --force and git reset --hard', () => {
    expect(yolo('git push origin main --force')).toBe(true);
    expect(yolo('git reset --hard HEAD~10')).toBe(true);
  });

  it('blocks privilege escalation & account mutation', () => {
    expect(yolo('sudo whoami')).toBe(true);
    expect(yolo('doas apt install x')).toBe(true);
    expect(yolo('useradd mallory')).toBe(true);
    expect(yolo('passwd alice')).toBe(true);
  });

  it('blocks Windows destructive commands', () => {
    expect(yolo('Remove-Item -Recurse -Force C:\\Users\\me\\docs')).toBe(true);
    expect(yolo('format C:')).toBe(true);
    expect(yolo('shutdown /r /t 0')).toBe(true);
  });

  it('allows benign commands under YOLO', () => {
    expect(yolo('ls -la')).toBe(false);
    expect(yolo('git status')).toBe(false);
    expect(yolo('npm run build')).toBe(false);
    expect(yolo('echo hello')).toBe(false);
    // NB: `grep 'rm -rf' file` WILL match the deny pattern (substring
    // match is substring match). That's an accepted false-positive — the
    // LLM gets prompted for confirmation instead of silent auto-approve
    // under YOLO, which is the safe failure mode.
  });
});

describe('isYoloDenied — sensitive paths for write tools', () => {
  const writeDenied = (p: string, tool = 'write_file') =>
    isYoloDenied(tool, { file_path: p });

  it('blocks writes to .env family', () => {
    expect(writeDenied('/home/me/app/.env')).toBe(true);
    expect(writeDenied('/home/me/app/.env.production')).toBe(true);
    expect(writeDenied('C:\\proj\\.env.local')).toBe(true);
  });

  it('blocks writes to .ssh and credential stores', () => {
    expect(writeDenied('/home/me/.ssh/id_rsa')).toBe(true);
    expect(writeDenied('/home/me/.ssh/authorized_keys')).toBe(true);
    expect(writeDenied('/home/me/.aws/credentials')).toBe(true);
    expect(writeDenied('/home/me/.config/gh/hosts.yml')).toBe(true);
    expect(writeDenied('/home/me/.gnupg/pubring.kbx')).toBe(true);
  });

  it('blocks writes to shell rc files (persistence vector)', () => {
    expect(writeDenied('/home/me/.bashrc')).toBe(true);
    expect(writeDenied('/home/me/.zshrc')).toBe(true);
    expect(writeDenied('/home/me/.profile')).toBe(true);
    expect(writeDenied('/home/me/.bash_profile')).toBe(true);
  });

  it('blocks writes to .git/config', () => {
    expect(writeDenied('/repo/.git/config')).toBe(true);
    expect(writeDenied('/repo/.gitmodules')).toBe(true);
    expect(writeDenied('/repo/.npmrc')).toBe(true);
    expect(writeDenied('/home/me/.netrc')).toBe(true);
  });

  it('blocks writes to system directories (Unix)', () => {
    expect(writeDenied('/etc/passwd')).toBe(true);
    expect(writeDenied('/etc/hosts')).toBe(true);
    expect(writeDenied('/usr/local/bin/x')).toBe(true);
    expect(writeDenied('/boot/grub/grub.cfg')).toBe(true);
  });

  it('blocks writes to system directories (Windows)', () => {
    expect(writeDenied('C:\\Windows\\System32\\drivers\\etc\\hosts')).toBe(
      true,
    );
    expect(writeDenied('C:\\Program Files\\App\\config.xml')).toBe(true);
    expect(writeDenied('D:\\ProgramData\\something\\config.json')).toBe(true);
  });

  it('blocks writes to third-party-managed trees', () => {
    expect(writeDenied('/proj/node_modules/some-pkg/index.js')).toBe(true);
    expect(writeDenied('/proj/vendor/lib/thing.go')).toBe(true);
    expect(writeDenied('/proj/.venv/lib/site-packages/pkg/mod.py')).toBe(true);
  });

  it('allows writes to ordinary source paths', () => {
    expect(writeDenied('/proj/src/foo.ts')).toBe(false);
    expect(writeDenied('/proj/README.md')).toBe(false);
    expect(writeDenied('C:\\Users\\me\\proj\\src\\app.tsx')).toBe(false);
  });

  it('matches edit / replace / multi_edit, not just write_file', () => {
    expect(writeDenied('/home/me/.ssh/id_rsa', 'edit')).toBe(true);
    expect(writeDenied('/home/me/.ssh/id_rsa', 'replace')).toBe(true);
    expect(writeDenied('/home/me/.ssh/id_rsa', 'multi_edit')).toBe(true);
    // Unknown tool: no interference with YOLO auto-approve.
    expect(writeDenied('/home/me/.ssh/id_rsa', 'unknown_tool')).toBe(false);
  });

  it('accepts path under alternate arg names', () => {
    expect(isYoloDenied('edit', { path: '/home/me/.env' })).toBe(true);
    expect(isYoloDenied('edit', { filePath: '/home/me/.env' })).toBe(true);
  });
});
