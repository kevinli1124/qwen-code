# Auto-Memory System

A 4-layer memory architecture that lets the agent accumulate knowledge
across sessions, promote recurring patterns into reusable skills, and
carry provenance when knowledge travels between agents or users.

## Why this exists

The pre-existing `memory_write` tool was architecturally proactive but
practically passive: the LLM rarely reached the threshold where it would
proactively save something, so the user ran with an empty memory
indefinitely. This system adds deterministic triggers, similarity
safeguards, and a portable export format so knowledge actually
accumulates and can be inspected.

## Layers

```
┌────────────────────────────────────────────────────┐
│  Layer 0: Working memory (in-context)              │
├────────────────────────────────────────────────────┤
│  Layer 1: Episodic memory                          │
│    ~/.qwen/episodes/YYYY-MM-DD-HHMM-<slug>.md      │
│    Auto-captured on long-running turns.            │
├────────────────────────────────────────────────────┤
│  Layer 2: Semantic memory                          │
│    ~/.qwen/memory/<name>.md                        │
│    (or <project>/.qwen/memory/<name>.md)           │
│    Distilled from episodes; always loaded as hook. │
├────────────────────────────────────────────────────┤
│  Layer 3: Procedural memory (skills)               │
│    ~/.qwen/skills/<name>/SKILL.md                  │
│    Promoted from high-score recurring episodes.    │
└────────────────────────────────────────────────────┘
```

## Auto-triggers

| When                                                                  | What fires                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| Fresh workspace, no `user_profile` memory                             | Onboarding hint prepended to memory index             |
| Turn ≥ 15 tool calls OR ≥ 20 min runtime                              | `SessionReviewer.maybeCapture` writes episode         |
| ≥ 5 episodes on file after a write                                    | `distillSuggestion` on CaptureAction                  |
| Single episode scores ≥ 9/12                                          | `skillProposal.trigger = high_score`                  |
| ≥ 2 episodes share ≥ 2 tags                                           | `skillProposal.trigger = recurring_pattern`           |
| `memory_write` with `overwrite: false` + near-duplicate in same scope | `similar_found` notice returned                       |
| `skill_write` without `force` + near-duplicate                        | `[merge] / [new] / [cancel]` three-option suggestion  |
| Startup                                                               | `archiveExpired()` moves aged episodes to `archived/` |

## Tool inventory

### Writing / authoring

| Tool             | Purpose                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `memory_write`   | Create/update a structured memory; similarity gate when `overwrite: false` |
| `memory_remove`  | Delete a memory file                                                       |
| `memory_distill` | Surface N recent episodes as a drafting prompt for memory promotion        |
| `memory_export`  | Pack filtered memories into a portable SKILL.md with `provenance`          |
| `skill_write`    | Create/update a skill; similarity gate + `mergeInto` / `force`             |
| `skill_propose`  | Surface high-scoring episodes as a SKILL.md drafting prompt                |
| `skill_install`  | Install a SKILL.md bundle; cross-user gate + optional memory unpack        |

### Reading / listing

| Tool           | Purpose                                                     |
| -------------- | ----------------------------------------------------------- |
| `episode_list` | Filterable listing of episodes (tag, score, outcome, since) |
| `skill_list`   | Skills grouped by level; provenance visible at a glance     |

## Settings (`.qwen/settings.json` → `general.*`)

```json
{
  "general": {
    "onboarding": {
      "enabled": true,
      "minQuestions": 1,
      "askOnGap": true
    },
    "episodes": {
      "autoCapture": "ask",
      "toolCallThreshold": 15,
      "durationMsThreshold": 1200000,
      "retentionDays": 90
    }
  }
}
```

`autoCapture` supports `off` / `ask` / `auto`. `retentionDays: 0`
disables archival.

## Directory layout

```
~/.qwen/
├── memory/                <- Layer 2 (semantic)
│   ├── MEMORY.md          <- always-loaded index
│   ├── user_profile.md
│   ├── eslint_monorepo.md
│   └── imported-alice-typescript_strict.md   (from skill_install)
├── episodes/              <- Layer 1 (episodic)
│   ├── 2026-04-22-0900-eslint-fix.md
│   ├── 2026-04-22-1015-refactor.md
│   └── archived/          <- auto-moved by retention cleanup
│       └── 2020-01-01-old.md
└── skills/                <- Layer 3 (procedural)
    ├── eslint-monorepo-fix/SKILL.md
    └── sky-wisdom/SKILL.md   (with provenance frontmatter)
```

## End-to-end flow

```
1. First session
   ── onboarding hint in system prompt
   ── user answers → memory_write(user_profile)
2. Normal work
   ── 15+ tool calls trigger episode write
   ── after 5 episodes: distillSuggestion on turn end
3. Recurring pattern
   ── skillProposal on turn end
   ── user runs skill_propose → model drafts → skill_write
   ── similarity gate offers [merge] / [new] / [cancel]
4. Knowledge handoff
   ── memory_export → bundle with provenance
   ── recipient runs skill_install → cross-user gate
   ── unpackMemories=true → local imported-*/-*.md entries
5. Housekeeping
   ── startup archiveExpired moves old episodes to archived/
   ── episode_list / skill_list for introspection
```

## Key files

| Path                                                              | Role                                           |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| `packages/core/src/episodes/episode-store.ts`                     | CRUD + retention                               |
| `packages/core/src/episodes/session-reviewer.ts`                  | Turn-end capture + suggestion triggers         |
| `packages/core/src/memory/memory-store.ts`                        | Layer 2 store + index                          |
| `packages/core/src/skills/skill-manager.ts`                       | Layer 3 store + read/write                     |
| `packages/core/src/skills/types.ts` (`SkillProvenance`)           | Provenance schema                              |
| `packages/core/src/onboarding/onboarding-manager.ts`              | First-run profile manager                      |
| `packages/core/src/utils/similarity.ts`                           | fast-levenshtein + Jaccard + token overlap     |
| `packages/core/src/tools/memory-{write,remove,distill,export}.ts` | Memory-side tools                              |
| `packages/core/src/tools/skill-{write,propose,install,list}.ts`   | Skill-side tools                               |
| `packages/core/src/tools/episode-list.ts`                         | Episode listing                                |
| `packages/core/src/config/config.ts`                              | Wiring + `refreshHierarchicalMemory` injection |

## Verification

```bash
npm run test:memory-phases   # end-to-end smoke (≥57 checks across 7 phases)
npm run test --workspace=packages/core   # unit + integration tests
```
