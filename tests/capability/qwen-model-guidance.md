# Qwen model guidance — copy into `~/.qwen/QWEN.md`

When running this fork against a Qwen-family model (e.g. `qwen3.5-*`, `qwen-max`, `qwen-plus`), append the block below to your user-level `~/.qwen/QWEN.md` file. Both sections have been validated against Qwen3.5 in the capability suite — together they move the model from 17/18 PASS · 8.89 avg to **18/18 PASS · 9.00 avg**, with the two largest improvements in `T4.6` (subagent routing) and `T5.1` (scan tool economy).

> **Why this file exists separately from `soul.md` / system prompt**: Qwen models respond strongly to `QWEN.md` content but tend to ignore softly-worded rules in system context. The directives below are deliberately written in `MUST` / `BANNED` / hard-budget form — softening to `prefer` / `consider` undoes the fix.

## One-shot copy (cmd)

```cmd
copy /y tests\capability\qwen-model-guidance.md %USERPROFILE%\.qwen\QWEN.md
```

This replaces your user-level QWEN.md with the verified template. If you already have custom content there, open `%USERPROFILE%\.qwen\QWEN.md` in a text editor and paste the two sections below instead.

---

# (Everything below this line is what gets placed into `~/.qwen/QWEN.md`)

## Subagent Delegation (MUST FOLLOW for Qwen models)

When the user's request matches any of the following, you **MUST** spawn
the matching subagent via the `agent` tool instead of doing the work
yourself. Delegation is not optional.

| User says                                            | Spawn subagent      |
| ---------------------------------------------------- | ------------------- |
| "review" / "audit" / "code review" / "檢查" / "檢視" | `code-reviewer`     |
| "debug" / "trace" / "why does this fail"             | `debugger`          |
| "write a test" / "pytest" / "補測試" / "add test"    | `test-engineer`     |
| "run the tests" / "跑測試" (not write)               | `test-runner`       |
| "refactor" / "rename" / "extract" / "重構"           | `refactorer`        |
| "implement" / "add feature" / "實作"                 | `implementer`       |
| "find where X is used" / "search for X" / "explore"  | `Explore` (builtin) |

**Why you must delegate**: subagents have narrower tool sets and cleaner
context, so they produce higher-quality focused output. Doing the work
inline pollutes the main session and tends to miss edge cases.

**Parallelism**: for independent subagent tasks, spawn them in a single
turn with multiple `agent` tool calls.

**Escape hatch**: if truly no matching subagent exists, say so explicitly
in your reply before proceeding inline.

## Tool Economy for Scan / Audit Tasks — HARD RULES

When the user asks you to scan, inventory, or audit a codebase (e.g.
"find all TODO", "list all API endpoints", "find all usages of X"):

1. **ONE grep_search call, done.** The output already contains:
   - File path
   - Line number
   - **The matched line content**
     That is sufficient for categorization and summary. Do not re-run grep
     with a refined pattern — if your first regex was wrong, pick the
     broadest one to start with.

2. **read_file is BANNED after grep_search on scan tasks.** The grep
   output IS the evidence. You do NOT need to verify matches by reading
   files. Reading 20 files to "confirm" what grep already showed is
   precisely the antipattern this rule exists to stop.

3. **Work from grep output directly.** Parse the grep matches in your
   reply text — categorize by filename/keyword, prioritize, and produce
   the requested markdown table. No further tool calls needed.

4. **Hard budget: 2 tool calls total** for any scan task. First call:
   grep. Optional second call: ONE read_file only if a single match is
   genuinely ambiguous (not every match). Exceeding 2 = you violated
   the rule.

**Exception**: code exploration / call-chain tracing / "how does X
work" / "where is X defined and called" is NOT a scan task — you may
read up to 5 files as needed to understand relationships between
functions, classes, or modules.

Applies to both main session and subagents. Violation = task failure.
