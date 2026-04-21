#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end smoke test for the auto-memory system (Phases 1 & 2).
 *
 * Runs without mocks — actually writes files to a temporary $HOME-like
 * directory, exercises the real EpisodeStore / SessionReviewer /
 * MemoryStore / similarity modules, and verifies observable behaviour.
 *
 * Usage:
 *     conda activate qwen-code
 *     npx tsx scripts/test-memory-phases.mjs
 *
 * Exits 0 on full pass, 1 on any failure.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// ─── Test harness ──────────────────────────────────────────────
const results = [];
let failed = 0;

function log(color, label, msg) {
  const codes = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
  };
  process.stdout.write(`${codes[color]}${label}${codes.reset} ${msg}\n`);
}

function check(name, predicate, detail) {
  if (predicate) {
    log('green', '  ✓', name);
    results.push({ name, pass: true });
  } else {
    log('red', '  ✗', `${name}${detail ? ` — ${detail}` : ''}`);
    results.push({ name, pass: false, detail });
    failed++;
  }
}

async function section(title, fn) {
  log('cyan', '\n●', title);
  await fn();
}

// ─── Set up isolated $HOME BEFORE loading modules ─────────────

const tempHome = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), 'qwen-e2e-')),
);
const tempProject = path.join(tempHome, 'fake-project');
await fs.mkdir(tempProject, { recursive: true });

// os.homedir() reads these env vars each call, so overriding BEFORE the
// first dynamic import redirects ~/.qwen/... to our sandbox.
process.env['HOME'] = tempHome;
process.env['USERPROFILE'] = tempHome;
const root = path.parse(tempHome).root;
process.env['HOMEDRIVE'] = root.replace(/\\+$/, '');
process.env['HOMEPATH'] = tempHome.substring(root.length);

log('dim', 'tmp home:', tempHome);
log('dim', 'tmp project:', tempProject);

// ─── Import core modules via tsx (from TS source) ──────────────

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(scriptDir, '..', 'packages', 'core', 'src');

function srcUrl(...segments) {
  return pathToFileURL(path.join(srcRoot, ...segments)).href;
}

const { EpisodeStore } = await import(
  srcUrl('episodes', 'episode-store.ts')
);
const { SessionReviewer } = await import(
  srcUrl('episodes', 'session-reviewer.ts')
);
const { MemoryStore } = await import(srcUrl('memory', 'memory-store.ts'));
const { findSimilarMemories, findSimilarSkills } = await import(
  srcUrl('utils', 'similarity.ts')
);
const { buildDistillPrompt } = await import(
  srcUrl('tools', 'memory-distill.ts')
);
const { buildSkillProposalPrompt } = await import(
  srcUrl('tools', 'skill-propose.ts')
);
const { SkillManager } = await import(srcUrl('skills', 'skill-manager.ts'));
const { Config } = await import(srcUrl('config', 'config.ts'));
const { MemoryExportTool } = await import(
  srcUrl('tools', 'memory-export.ts')
);
const { SkillInstallTool } = await import(
  srcUrl('tools', 'skill-install.ts')
);

// Quick sanity: confirm os.homedir now points where we expect.
if (os.homedir() !== tempHome) {
  log('red', 'FATAL', `os.homedir()=${os.homedir()} ≠ ${tempHome}`);
  process.exit(1);
}

// ─── Phase 1 tests ────────────────────────────────────────────

await section('Phase 1 — Episodic capture (SessionReviewer)', async () => {
  const reviewer = new SessionReviewer(new EpisodeStore(), {
    autoCapture: 'auto',
    toolCallThreshold: 15,
    durationMsThreshold: 20 * 60 * 1000,
    retentionDays: 90,
  });

  // Build a realistic long-task turn: 18 tool calls across read_file + edit,
  // touching multiple files, ending with an assistant text summary.
  const turnStartedAt = Date.now() - 25 * 60 * 1000; // 25 min ago
  const turnEndedAt = Date.now();

  const parts = [];
  for (let i = 0; i < 10; i++) {
    parts.push({
      functionCall: {
        name: 'read_file',
        args: { file_path: `/tmp/eslint-${i}.ts` },
      },
    });
  }
  for (let i = 0; i < 8; i++) {
    parts.push({
      functionCall: {
        name: 'edit',
        args: { file_path: `/tmp/config-${i}.mjs` },
      },
    });
  }
  parts.push({
    text: 'Fixed ESLint monorepo glob patterns across all scripts/*.mjs files. Verified with npm run lint.',
  });

  const summary = {
    history: [
      { role: 'user', parts: [{ text: 'fix all eslint errors in scripts/' }] },
      { role: 'model', parts },
    ],
    turnStartIndex: 0,
    turnStartedAt,
    turnEndedAt,
    completedNormally: true,
  };

  const result = await reviewer.maybeCapture(summary);

  check(
    'maybeCapture returns kind=written',
    result.kind === 'written',
    `got kind=${result.kind}${result.kind === 'skipped' ? `, reason=${result.reason}` : ''}`,
  );

  if (result.kind !== 'written') return;
  const episode = result.episode;

  check(
    'episode id has timestamp+slug format',
    /^\d{4}-\d{2}-\d{2}-\d{4}-/.test(episode.id),
    `id=${episode.id}`,
  );
  check(
    'toolCalls counted correctly',
    episode.toolCalls === 18,
    `got ${episode.toolCalls}`,
  );
  check(
    'duration ~25 min',
    Math.abs(episode.durationMins - 25) <= 1,
    `got ${episode.durationMins}`,
  );
  check(
    'outcome=success',
    episode.outcome === 'success',
    `got ${episode.outcome}`,
  );
  check(
    'has eslint/monorepo tags',
    episode.tags.includes('eslint') && episode.tags.includes('monorepo'),
    `tags=${JSON.stringify(episode.tags)}`,
  );
  check(
    'scores total >= 9/12',
    episode.scores.novelty +
      episode.scores.reusability +
      episode.scores.complexity +
      episode.scores.outcome >=
      9,
    `scores=${JSON.stringify(episode.scores)}`,
  );

  // Verify the file actually landed on disk.
  const expectedPath = path.join(
    tempHome,
    '.qwen',
    'episodes',
    `${episode.id}.md`,
  );
  const onDisk = await fs
    .readFile(expectedPath, 'utf8')
    .catch(() => null);

  check(
    'episode file exists on disk',
    onDisk !== null,
    `expected at ${expectedPath}`,
  );
  if (onDisk) {
    check(
      'file starts with YAML frontmatter',
      /^---\n/.test(onDisk),
      'missing leading ---',
    );
    check(
      'file contains Stats section',
      onDisk.includes('## Stats'),
      'missing Stats header',
    );
    check(
      'file contains the assistant text tail',
      onDisk.includes('ESLint monorepo'),
      'assistant summary not preserved',
    );
  }
});

await section('Phase 1 — threshold gating', async () => {
  const reviewer = new SessionReviewer(new EpisodeStore(), {
    autoCapture: 'auto',
    toolCallThreshold: 15,
    durationMsThreshold: 20 * 60 * 1000,
    retentionDays: 90,
  });

  const shortSummary = {
    history: [
      { role: 'user', parts: [{ text: 'quick fix' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'read_file', args: {} } }],
      },
    ],
    turnStartIndex: 0,
    turnStartedAt: Date.now() - 1000,
    turnEndedAt: Date.now(),
    completedNormally: true,
  };

  const result = await reviewer.maybeCapture(shortSummary);
  check(
    'short task is skipped (1 tool call, <20min)',
    result.kind === 'skipped',
    `got kind=${result.kind}`,
  );
});

await section('Phase 1 — off mode short-circuits', async () => {
  const reviewer = new SessionReviewer(new EpisodeStore(), {
    autoCapture: 'off',
    toolCallThreshold: 15,
    durationMsThreshold: 20 * 60 * 1000,
    retentionDays: 90,
  });

  // Even a long turn should be skipped.
  const summary = {
    history: [
      {
        role: 'model',
        parts: Array.from({ length: 20 }, () => ({
          functionCall: { name: 'read_file', args: {} },
        })),
      },
    ],
    turnStartIndex: 0,
    turnStartedAt: Date.now() - 30 * 60 * 1000,
    turnEndedAt: Date.now(),
    completedNormally: true,
  };

  const result = await reviewer.maybeCapture(summary);
  check(
    'autoCapture=off skips regardless of size',
    result.kind === 'skipped' && result.reason === 'autoCapture=off',
    `got ${JSON.stringify(result)}`,
  );
});

// ─── Phase 2 tests ────────────────────────────────────────────

await section('Phase 2 — similarity detection (pure function)', async () => {
  const existingMemories = [
    {
      name: 'eslint_monorepo_globs',
      description:
        'ESLint flat config glob patterns do not inherit across blocks',
      type: 'decision',
      scope: 'project',
      content: 'body',
    },
  ];

  // Case A: different name, overlapping description → should match.
  const matchA = findSimilarMemories(
    {
      name: 'eslint_glob_rules',
      description: 'ESLint glob patterns inherit flat config blocks',
      type: 'decision',
    },
    existingMemories,
  );
  check(
    'near-duplicate description is flagged',
    matchA.length === 1 &&
      matchA[0].item.name === 'eslint_monorepo_globs' &&
      matchA[0].reason === 'desc_overlap',
    `got ${JSON.stringify(matchA)}`,
  );

  // Case B: unrelated topic → no match.
  const matchB = findSimilarMemories(
    {
      name: 'coffee_preference',
      description: 'Likes espresso in the morning',
      type: 'user',
    },
    existingMemories,
  );
  check(
    'unrelated entry is not flagged',
    matchB.length === 0,
    `got ${JSON.stringify(matchB)}`,
  );

  // Case C: fuzzy name.
  const matchC = findSimilarMemories(
    {
      name: 'eslint_monorepo_glob', // one char short
      description: '',
      type: 'decision',
    },
    existingMemories,
  );
  check(
    'near-duplicate name is flagged (Levenshtein)',
    matchC.length === 1 && matchC[0].reason === 'name_fuzzy',
    `got ${JSON.stringify(matchC)}`,
  );

  // Case D: skill similarity — same description hits via desc_overlap.
  const existingSkills = [
    {
      name: 'eslint-monorepo-fix',
      description: 'Diagnose and fix ESLint glob patterns in monorepos',
      level: 'user',
      filePath: '/fake/SKILL.md',
      body: '',
    },
  ];
  const matchD = findSimilarSkills(
    {
      name: 'lint-config-doctor',
      description: 'Diagnose ESLint glob patterns monorepos fix',
    },
    existingSkills,
  );
  check(
    'findSimilarSkills detects overlap via description',
    matchD.length === 1 && matchD[0].reason === 'desc_overlap',
    `got ${JSON.stringify(matchD)}`,
  );
});

await section(
  'Phase 2 — MemoryStore + similarity integration on real filesystem',
  async () => {
    const store = new MemoryStore(tempProject);

    // Seed one memory to the project scope.
    await store.writeMemory({
      name: 'eslint_monorepo_globs',
      type: 'decision',
      scope: 'project',
      description:
        'ESLint flat config glob patterns do not inherit across blocks',
      content:
        'The rule in one sentence.\n\n**Why:** prior debugging incident.\n**How to apply:** check glob coverage on lint failures.',
    });

    const listed = await store.listMemories({ scope: 'project', force: true });
    check(
      'seeded memory is visible via listMemories',
      listed.length === 1 && listed[0].name === 'eslint_monorepo_globs',
      `got ${JSON.stringify(listed.map((m) => m.name))}`,
    );

    // Simulate the gate that memory-write.ts runs with overwrite=false.
    const hits = findSimilarMemories(
      {
        name: 'eslint_glob_inheritance',
        description: 'ESLint glob patterns inherit blocks across flat config',
        type: 'decision',
      },
      listed.filter((m) => m.name !== 'eslint_glob_inheritance'),
    );

    check(
      'gate flags the near-duplicate before writing',
      hits.length === 1 && hits[0].item.name === 'eslint_monorepo_globs',
      `got ${JSON.stringify(hits)}`,
    );

    // Verify the second memory would NOT land if the gate were honored.
    const parallelPath = path.join(
      tempProject,
      '.qwen',
      'memory',
      'eslint_glob_inheritance.md',
    );
    const exists = await fs
      .access(parallelPath)
      .then(() => true)
      .catch(() => false);
    check(
      'near-duplicate file was not created (gate not bypassed)',
      !exists,
      `unexpected file at ${parallelPath}`,
    );

    // Inspect the auto-rebuilt MEMORY.md index.
    const indexPath = path.join(
      tempProject,
      '.qwen',
      'memory',
      'MEMORY.md',
    );
    const indexContent = await fs.readFile(indexPath, 'utf8');
    check(
      'MEMORY.md index lists the seeded entry',
      indexContent.includes('eslint_monorepo_globs'),
      'missing in index',
    );
  },
);

// ─── Phase 3 tests ────────────────────────────────────────────

await section(
  'Phase 3 — Memory distillation (prompt builder + auto-suggest)',
  async () => {
    // Seed three episodes via the real store.
    const store = new EpisodeStore();
    for (let i = 0; i < 3; i++) {
      await store.writeEpisode({
        id: `2026-04-22-09${String(i).padStart(2, '0')}-sample-${i}`,
        title: `Investigation ${i}`,
        timestamp: new Date(
          Date.parse('2026-04-22T09:00:00Z') + i * 60_000,
        ).toISOString(),
        durationMins: 30,
        toolCalls: 20,
        outcome: 'success',
        tags: ['eslint', 'monorepo'],
        scores: { novelty: 2, reusability: 2, complexity: 3, outcome: 3 },
        content: `Body text for investigation ${i}`,
      });
    }

    const all = await store.listEpisodes({ force: true });
    const seeded = all.filter((e) => e.id.includes('sample-'));
    check(
      '3 seeded episodes are all visible',
      seeded.length === 3,
      `got ${seeded.length}`,
    );

    // Build the distill prompt directly (exercises the same code path the
    // tool uses to format output).
    const prompt = buildDistillPrompt(seeded, '# Memory Index\n\n- foo — hook');

    check(
      'prompt references all 3 episode titles',
      prompt.includes('Investigation 0') &&
        prompt.includes('Investigation 1') &&
        prompt.includes('Investigation 2'),
      'at least one title missing',
    );
    check(
      'prompt embeds the memory index',
      prompt.includes('# Memory Index') && prompt.includes('- foo — hook'),
      'memory index not embedded',
    );
    check(
      'prompt includes the final anti-fabrication reminder',
      /do not fabricate memories/i.test(prompt),
      'reminder missing',
    );
    check(
      'prompt advises memory_write with overwrite:false',
      prompt.includes('overwrite: false'),
      'missing overwrite guidance',
    );

    // Now verify SessionReviewer surfaces a distillSuggestion when the
    // episode pile crosses the threshold (5 by default).
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      autoCapture: 'auto',
      toolCallThreshold: 15,
      durationMsThreshold: 20 * 60 * 1000,
      retentionDays: 90,
    });

    let lastResult;
    for (let i = 0; i < 3; i++) {
      const startedAt = Date.parse('2026-04-22T10:00:00Z') + i * 60_000;
      lastResult = await reviewer.maybeCapture({
        history: [
          { role: 'user', parts: [{ text: `task ${i}` }] },
          {
            role: 'model',
            parts: [
              ...Array.from({ length: 20 }, () => ({
                functionCall: {
                  name: 'read_file',
                  args: { file_path: `/tmp/${i}.ts` },
                },
              })),
              { text: `Done ${i}` },
            ],
          },
        ],
        turnStartIndex: 0,
        turnStartedAt: startedAt,
        turnEndedAt: startedAt + 21 * 60 * 1000,
        completedNormally: true,
      });
    }

    check(
      'last write succeeded (6 total episodes now)',
      lastResult && lastResult.kind === 'written',
      `got kind=${lastResult?.kind}`,
    );
    check(
      'distillSuggestion fires once episodes >= 5',
      lastResult &&
        lastResult.kind === 'written' &&
        !!lastResult.distillSuggestion &&
        lastResult.distillSuggestion.episodeCount >= 5,
      `suggestion=${JSON.stringify(lastResult?.distillSuggestion)}`,
    );
  },
);

// ─── Phase 4 tests ────────────────────────────────────────────

await section(
  'Phase 4 — Skill auto-proposal (SkillManager write + prompt builder)',
  async () => {
    // Direct SkillManager roundtrip in the temp home.
    const fakeConfig = new Config({
      usageStatisticsEnabled: false,
      debugMode: false,
      model: 'test',
      cwd: tempProject,
      targetDir: tempProject,
    });
    const skillManager = new SkillManager(fakeConfig);

    const written = await skillManager.writeSkill({
      name: 'eslint-monorepo-fix',
      description: 'Diagnose and fix ESLint glob patterns in monorepos',
      body:
        '# ESLint monorepo fix\n\n' +
        '## When to use\n\n' +
        'Repeated failures on scripts/*.mjs after a lint config change.\n\n' +
        '## Steps\n\n' +
        '1. Inspect eslint.config.js\n' +
        '2. Verify glob coverage\n' +
        '3. Extend patterns and re-run `npm run lint`',
      level: 'project',
    });

    check(
      'writeSkill returns filePath under .qwen/skills/',
      typeof written.filePath === 'string' &&
        written.filePath.includes('.qwen') &&
        written.filePath.includes('skills'),
      `got ${written.filePath}`,
    );

    // Verify on-disk layout.
    const skillMdPath = path.join(
      tempProject,
      '.qwen',
      'skills',
      'eslint-monorepo-fix',
      'SKILL.md',
    );
    const onDisk = await fs.readFile(skillMdPath, 'utf8').catch(() => null);
    check(
      'SKILL.md written to expected path',
      onDisk !== null && /^---\n/.test(onDisk) && onDisk.includes('ESLint monorepo'),
      `expected at ${skillMdPath}`,
    );

    // Seed a high-score episode and build the proposal prompt.
    const epStore = new EpisodeStore();
    await epStore.writeEpisode({
      id: '2026-04-22-1200-skill-source',
      title: 'Promotable pattern',
      timestamp: '2026-04-22T12:00:00Z',
      durationMins: 40,
      toolCalls: 30,
      outcome: 'success',
      tags: ['eslint', 'monorepo'],
      scores: { novelty: 3, reusability: 3, complexity: 3, outcome: 3 },
      content:
        'This task exposed a reusable diagnostic pattern across monorepo lint setups.',
    });

    const qualifying = (
      await epStore.listEpisodes({ force: true, minScore: 9 })
    ).filter((e) => e.id === '2026-04-22-1200-skill-source');
    check(
      'seeded high-score episode is surfaced by minScore filter',
      qualifying.length === 1,
      `got ${qualifying.length}`,
    );

    const existing = await skillManager.listSkills({ force: true });
    const prompt = buildSkillProposalPrompt(qualifying, existing);

    check(
      'proposal prompt includes SKILL.md schema block',
      prompt.includes('name: <kebab-case-slug>'),
      'schema block missing',
    );
    check(
      'proposal prompt lists the existing skill to avoid duplicates',
      prompt.includes('eslint-monorepo-fix'),
      'existing skill not surfaced',
    );
    check(
      'proposal prompt offers [merge] [new] [cancel]',
      prompt.includes('[merge]') &&
        prompt.includes('[new]') &&
        prompt.includes('[cancel]'),
      'three-option suggestion missing',
    );

    // Auto-suggestion: SessionReviewer should now emit skillProposal when
    // the written episode scores 9+/12.
    const reviewer = new SessionReviewer(new EpisodeStore(), {
      autoCapture: 'auto',
      toolCallThreshold: 15,
      durationMsThreshold: 20 * 60 * 1000,
      retentionDays: 90,
    });
    const startedAt = Date.parse('2026-04-22T13:00:00Z');
    const summary = {
      history: [
        { role: 'user', parts: [{ text: 'big task' }] },
        {
          role: 'model',
          parts: [
            ...Array.from({ length: 40 }, () => ({
              functionCall: {
                name: 'read_file',
                args: { file_path: '/tmp/x.ts' },
              },
            })),
            { text: 'Fixed the eslint monorepo issue.' },
          ],
        },
      ],
      turnStartIndex: 0,
      turnStartedAt: startedAt,
      turnEndedAt: startedAt + 30 * 60 * 1000,
      completedNormally: true,
    };
    const capture = await reviewer.maybeCapture(summary);
    check(
      'SessionReviewer emits skillProposal with trigger=high_score',
      capture.kind === 'written' &&
        capture.skillProposal !== undefined &&
        capture.skillProposal.trigger === 'high_score' &&
        capture.skillProposal.episodeScore >= 9,
      `got ${JSON.stringify(capture.skillProposal)}`,
    );
  },
);

// ─── Phase 5 tests ────────────────────────────────────────────

await section(
  'Phase 5 — Memory export → Skill install (provenance roundtrip)',
  async () => {
    // Setup: two distinct "users" sharing the same machine. We simulate
    // this by swapping HOME between operations.
    const sourceHome = path.join(tempHome, 'phase5-source');
    const targetHome = path.join(tempHome, 'phase5-target');
    const sourceProject = path.join(sourceHome, 'qwen-demo');
    const targetProject = path.join(targetHome, 'qwen-demo');
    await fs.mkdir(sourceProject, { recursive: true });
    await fs.mkdir(targetProject, { recursive: true });

    // --- Source user: seed memories and export ---
    process.env['HOME'] = sourceHome;
    process.env['USERPROFILE'] = sourceHome;
    const sourceConfig = new Config({
      usageStatisticsEnabled: false,
      debugMode: false,
      model: 'test',
      cwd: sourceProject,
      targetDir: sourceProject,
    });
    const srcMemStore = sourceConfig.getMemoryStore();
    await srcMemStore.writeMemory({
      name: 'eslint_globs_policy',
      type: 'decision',
      scope: 'user',
      description: 'ESLint flat config globs do not inherit',
      content:
        '**Rule:** flat config glob blocks are independent.\n\n**Why:** past incident.\n**How to apply:** verify coverage on lint failure.',
    });
    await srcMemStore.writeMemory({
      name: 'tsx_strict_default',
      type: 'decision',
      scope: 'user',
      description: 'strict: true in every new package',
      content: '**Why:** early type catches.\n**How to apply:** tsconfig base.',
    });

    const exportTool = new MemoryExportTool(sourceConfig);
    const exportResult = await exportTool
      .build({
        skillName: 'sky-wisdom',
        description: 'Decisions from the source user',
        types: ['decision'],
        level: 'user',
      })
      .execute(new AbortController().signal);
    check(
      'memory_export reports 2 memories packed',
      /Exported 2/.test(String(exportResult.returnDisplay)),
      String(exportResult.returnDisplay),
    );

    const bundlePath = path.join(
      sourceHome,
      '.qwen',
      'skills',
      'sky-wisdom',
      'SKILL.md',
    );
    const bundle = await fs.readFile(bundlePath, 'utf8').catch(() => '');
    check(
      'bundle frontmatter contains provenance block',
      bundle.includes('provenance:') && bundle.includes('extractedFrom:'),
      'missing provenance',
    );
    check(
      'bundle body embeds both memory sections',
      bundle.includes('### eslint_globs_policy') &&
        bundle.includes('### tsx_strict_default'),
      'memory sections missing',
    );

    // --- Target user: install the bundle cross-user ---
    process.env['HOME'] = targetHome;
    process.env['USERPROFILE'] = targetHome;
    const originalUser = process.env['USER'];
    process.env['USER'] = 'target-user';
    try {
      const targetConfig = new Config({
        usageStatisticsEnabled: false,
        debugMode: false,
        model: 'test',
        cwd: targetProject,
        targetDir: targetProject,
      });
      const installTool = new SkillInstallTool(targetConfig);

      // First attempt: WITHOUT acceptCrossUser — should be refused.
      const refusal = await installTool
        .build({ sourcePath: bundlePath, level: 'user' })
        .execute(new AbortController().signal);
      check(
        'cross-user install is refused without acceptCrossUser',
        /Cross-user/.test(String(refusal.returnDisplay)),
        String(refusal.returnDisplay),
      );

      // Second attempt: acceptCrossUser + unpackMemories.
      const installResult = await installTool
        .build({
          sourcePath: bundlePath,
          level: 'user',
          unpackMemories: true,
          acceptCrossUser: true,
        })
        .execute(new AbortController().signal);
      check(
        'install succeeds with acceptCrossUser + unpack',
        /Installed sky-wisdom/.test(String(installResult.returnDisplay)),
        String(installResult.returnDisplay),
      );

      const installedPath = path.join(
        targetHome,
        '.qwen',
        'skills',
        'sky-wisdom',
        'SKILL.md',
      );
      const installed = await fs
        .readFile(installedPath, 'utf8')
        .catch(() => '');
      check(
        'installed SKILL.md preserves provenance fields',
        installed.includes('provenance:') &&
          installed.includes('sourceUser:') &&
          installed.includes('extractedFrom:'),
        'provenance was not preserved in roundtrip',
      );

      const targetMemStore = new SkillManager(targetConfig); // only to trigger cache init
      await targetMemStore.listSkills({ force: true });

      const targetMems = await targetConfig
        .getMemoryStore()
        .listMemories({ scope: 'user', force: true });
      const importedNames = targetMems
        .map((m) => m.name)
        .filter((n) => n.startsWith('imported-'));
      check(
        'unpackMemories writes imported entries with prefix',
        importedNames.length === 2,
        `got ${JSON.stringify(importedNames)}`,
      );
    } finally {
      if (originalUser === undefined) delete process.env['USER'];
      else process.env['USER'] = originalUser;
      // Restore HOME for any later sections (cleanup block below uses it).
      process.env['HOME'] = tempHome;
      process.env['USERPROFILE'] = tempHome;
    }
  },
);

// ─── Cleanup ──────────────────────────────────────────────────

try {
  await fs.rm(tempHome, { recursive: true, force: true });
} catch {
  // best effort
}

// ─── Summary ──────────────────────────────────────────────────

const total = results.length;
const passed = total - failed;

process.stdout.write('\n');
if (failed === 0) {
  log('green', '✔', `${passed}/${total} checks passed`);
  process.exit(0);
} else {
  log('red', '✗', `${failed}/${total} checks FAILED`);
  for (const r of results) {
    if (!r.pass) {
      log('red', '   →', `${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
    }
  }
  process.exit(1);
}
