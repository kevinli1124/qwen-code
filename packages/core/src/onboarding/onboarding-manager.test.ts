/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MemoryStore } from '../memory/memory-store.js';
import { OnboardingManager } from './onboarding-manager.js';
import { DEFAULT_ONBOARDING_SETTINGS } from './types.js';

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: vi.fn(() => actual.homedir()),
  };
});

let tmpRoot: string;
let fakeHome: string;
let projectRoot: string;

beforeEach(async () => {
  tmpRoot = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-onboard-')),
  );
  fakeHome = path.join(tmpRoot, 'home');
  projectRoot = path.join(tmpRoot, 'project');
  await fs.mkdir(fakeHome, { recursive: true });
  await fs.mkdir(projectRoot, { recursive: true });
  vi.mocked(os.homedir).mockReturnValue(fakeHome);
});

afterEach(async () => {
  try {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('OnboardingManager.shouldPromptOnboarding', () => {
  it('returns true when user_profile is missing and onboarding is enabled', async () => {
    const mgr = new OnboardingManager(new MemoryStore(projectRoot));
    expect(await mgr.shouldPromptOnboarding()).toBe(true);
  });

  it('returns false when onboarding.enabled is false', async () => {
    const mgr = new OnboardingManager(new MemoryStore(projectRoot), {
      ...DEFAULT_ONBOARDING_SETTINGS,
      enabled: false,
    });
    expect(await mgr.shouldPromptOnboarding()).toBe(false);
  });

  it('returns false once user_profile is saved', async () => {
    const store = new MemoryStore(projectRoot);
    await store.writeMemory({
      name: 'user_profile',
      type: 'user',
      scope: 'user',
      description: 'Sky',
      content: '- name: Sky',
    });
    const mgr = new OnboardingManager(store);
    expect(await mgr.shouldPromptOnboarding()).toBe(false);
  });
});

describe('OnboardingManager.buildOnboardingHint', () => {
  it('includes the required question and the save-memory instruction', () => {
    const mgr = new OnboardingManager(new MemoryStore(projectRoot));
    const hint = mgr.buildOnboardingHint();
    expect(hint).toMatch(/First-run onboarding/);
    expect(hint).toMatch(/What should I call you\?/);
    expect(hint).toMatch(/memory_write/);
    expect(hint).toMatch(/user_profile/);
  });

  it('separates required and optional question sections', () => {
    const mgr = new OnboardingManager(new MemoryStore(projectRoot));
    const hint = mgr.buildOnboardingHint();
    expect(hint).toMatch(/### Required/);
    expect(hint).toMatch(/### Optional/);
  });
});

describe('OnboardingManager.recordProfile', () => {
  it('writes a user_profile memory with the required fields', async () => {
    const store = new MemoryStore(projectRoot);
    const mgr = new OnboardingManager(store);

    await mgr.recordProfile({
      name: 'Sky',
      role: 'solo developer',
      reply_style: 'concise',
      language: 'zh-TW',
    });

    const cfg = await store.loadMemory('user_profile');
    expect(cfg).not.toBeNull();
    expect(cfg?.type).toBe('user');
    expect(cfg?.scope).toBe('user');
    expect(cfg?.content).toContain('- name: Sky');
    expect(cfg?.content).toContain('- role: solo developer');
    expect(cfg?.content).toContain('- reply_style: concise');
    expect(cfg?.content).toContain('- language: zh-TW');
  });

  it('rejects empty name', async () => {
    const mgr = new OnboardingManager(new MemoryStore(projectRoot));
    await expect(mgr.recordProfile({ name: '   ' })).rejects.toThrow(
      /non-empty/,
    );
  });

  it('idempotent: re-recording overwrites the existing profile', async () => {
    const store = new MemoryStore(projectRoot);
    const mgr = new OnboardingManager(store);

    await mgr.recordProfile({ name: 'Sky' });
    await mgr.recordProfile({ name: 'Sky', role: 'developer' });

    const cfg = await store.loadMemory('user_profile');
    expect(cfg?.content).toContain('- role: developer');
  });
});

describe('OnboardingManager.detectGaps', () => {
  it('returns all canonical keys when no profile exists', async () => {
    const mgr = new OnboardingManager(new MemoryStore(projectRoot));
    const gaps = await mgr.detectGaps();
    expect(gaps).toEqual(['name', 'role', 'reply_style', 'language']);
  });

  it('returns only missing keys once profile exists', async () => {
    const store = new MemoryStore(projectRoot);
    const mgr = new OnboardingManager(store);
    await mgr.recordProfile({ name: 'Sky', reply_style: 'concise' });
    const gaps = await mgr.detectGaps();
    expect(gaps).toEqual(['role', 'language']);
  });

  it('honors expectedKeys argument', async () => {
    const store = new MemoryStore(projectRoot);
    const mgr = new OnboardingManager(store);
    await mgr.recordProfile({ name: 'Sky' });
    const gaps = await mgr.detectGaps(['shell']);
    expect(gaps).toContain('shell');
  });
});
