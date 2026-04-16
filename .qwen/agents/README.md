# Subagent Lineup — Routing Guide

This directory defines the project's custom subagents. The main agent uses
these (in combination with the built-in `Explore`, `general-purpose`, and
`statusline-setup`) to delegate specialized work.

## When to spawn which agent

### Exploration / discovery

- **built-in `Explore`** — quick file search, pattern match, reading small
  numbers of files. Returns raw findings.
- **built-in `general-purpose`** — broader research across many files when
  the structure of the answer is not known in advance.

### Implementation

- **`implementer`** — you have a concrete, bounded change. You know the
  target files and what should change. Do NOT use when the task is open-ended.
- Main agent itself — for trivial one-liners or interactive back-and-forth.

### Restructuring

- **`refactorer`** — renames, moves, extractions. Only when behavior must
  stay identical. Never for bug fixes.

### Verification

- **`code-reviewer`** — independent read-only review after implementation.
  Returns a structured issue list.
- **`test-engineer`** — reproduce bugs, verify fixes. Runs the CLI.

### Diagnosis

- **`debugger`** — root cause analysis from an error / stack trace / failing
  behavior. Does NOT fix; hand off to `implementer` or `refactorer`.

## Typical workflows

### Implement a new feature

```
1. Explore            → locate the relevant code
2. implementer        → make the change
3. test-engineer      → verify it works
4. code-reviewer      → final QA before commit
```

### Fix a reported bug

```
1. test-engineer      → reproduce the bug
2. debugger           → find root cause
3. implementer        → apply the fix (scope: single root cause)
4. test-engineer      → verify the fix
5. code-reviewer      → optional, for risky fixes
```

### Large refactor (rename / restructure)

```
1. Explore            → map the references
2. refactorer         → apply the transformation
3. test-engineer      → run full test suite
```

### Pure investigation

```
1. Explore            → fast search
2. general-purpose    → deeper synthesis if needed
```

## Parallelism

Spawn multiple agents in a SINGLE message when tasks are independent.

Example: after implementing a feature, run review and tests in parallel:

```
Agent(code-reviewer, "review src/auth/*")
Agent(test-engineer, "verify auth tests pass")
```

## Non-overlapping invariants

Each agent has been designed so its scope does NOT overlap with the others:

| Agent            | Reads | Writes | Shell     | Purpose                    |
| ---------------- | ----- | ------ | --------- | -------------------------- |
| Explore          | ✓     | ✗      | read-only | fast search                |
| general-purpose  | ✓     | ✓      | ✓         | broad fallback             |
| code-reviewer    | ✓     | ✗      | ✗         | find issues                |
| debugger         | ✓     | ✗      | read-only | find root cause            |
| implementer      | ✓     | ✓      | ✗         | execute bounded change     |
| refactorer       | ✓     | ✓      | ✗         | behavior-preserving change |
| test-engineer    | ✓     | ✓      | ✓         | reproduce / verify bugs    |
| statusline-setup | ✓     | ✓      | ✗         | status line config         |

Breaking the invariants: if code-reviewer starts fixing, or debugger starts
patching, the output contract breaks and the workflow falls apart.

## Hard rules for all custom agents

1. **Absolute paths only** — never relative.
2. **No emojis** — in code or in reports.
3. **Concise final reports** — the main agent will relay findings to the
   user, so brevity matters.
4. **Refuse out-of-scope work** — if asked to do something outside their
   role, they report and hand off.
5. **Inherit the parent model** — `model: inherit` is the default. Users
   who want to run a specific agent on a different model should override
   in their own user-level agent definitions under `~/.qwen/agents/`.
