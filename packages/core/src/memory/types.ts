/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Structured memory system — types.
 *
 * A memory is a markdown file with YAML frontmatter stored in `.qwen/memory/`
 * at user level (`~/.qwen/memory/`) or project level (`<project>/.qwen/memory/`).
 * An auto-generated `MEMORY.md` index file lists each memory with a one-line
 * hook; the index is injected into the session's system prompt while individual
 * memory bodies are only read on demand via the existing `read_file` tool.
 *
 * This complements the legacy `save_memory` / `QWEN.md` append-only mechanism:
 * that remains the place for short bullet facts, while structured memories
 * carry the Why / How-to-apply discipline and are scoped per topic.
 */

export type MemoryType =
  | 'user' // who the user is, their role, preferences
  | 'feedback' // corrections / preferences from past interactions
  | 'project' // project-specific facts
  | 'decision' // architectural / design decisions
  | 'reference'; // pointers to external resources

export type MemoryScope = 'user' | 'project';

export interface MemoryConfig {
  /** Slug (filename without .md). Letters, digits, dot, dash, underscore. */
  name: string;
  /** Human-readable title (optional, defaults to a titlecased name). */
  title?: string;
  /** One-line hook (max ~150 chars) shown in the index so agents can decide if relevant. */
  description: string;
  type: MemoryType;
  scope: MemoryScope;
  /** Optional subagent name: if set, this memory is auto-loaded when that agent is forked. */
  agent?: string;
  /** Memory body (Markdown). For feedback/decision types, should include **Why:** and **How to apply:**. */
  content: string;
  /** File metadata populated by the store; do not set manually when calling write. */
  metadata?: {
    filePath?: string;
    createdAt?: number;
    updatedAt?: number;
  };
}

export interface ListMemoryOptions {
  scope?: MemoryScope;
  type?: MemoryType;
  agent?: string;
  /** If true, bypasses the in-memory cache. */
  force?: boolean;
}

export enum MemoryErrorCode {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_CONFIG = 'INVALID_CONFIG',
  FILE_ERROR = 'FILE_ERROR',
}

export class MemoryError extends Error {
  constructor(
    message: string,
    readonly code: MemoryErrorCode,
    readonly name_: string | undefined = undefined,
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}
