import {
  type SkillConfig,
  type SkillProvenance,
  type SkillValidationResult,
  parseModelField,
} from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse as parseYaml } from '../utils/yaml-parser.js';
import { createDebugLogger } from '../utils/debugLogger.js';
import { normalizeContent } from '../utils/textUtils.js';
import { normalizeClaudeFrontmatter } from './claude-compat.js';

const debugLogger = createDebugLogger('SKILL_LOAD');

const SKILL_MANIFEST_FILE = 'SKILL.md';

export async function loadSkillsFromDir(
  baseDir: string,
): Promise<SkillConfig[]> {
  debugLogger.debug(`Loading skills from directory (skill-load): ${baseDir}`);
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const skills: SkillConfig[] = [];
    debugLogger.debug(`Found ${entries.length} entries in ${baseDir}`);

    for (const entry of entries) {
      // Only process directories (each skill is a directory)
      if (!entry.isDirectory()) {
        debugLogger.warn(`Skipping non-directory entry: ${entry.name}`);
        continue;
      }

      const skillDir = path.join(baseDir, entry.name);
      const skillManifest = path.join(skillDir, SKILL_MANIFEST_FILE);

      try {
        // Check if SKILL.md exists
        await fs.access(skillManifest);

        const content = await fs.readFile(skillManifest, 'utf8');
        const config = parseSkillContent(content, skillManifest);
        skills.push(config);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        debugLogger.error(
          `Failed to parse skill at ${skillDir}: ${errorMessage}`,
        );
        continue;
      }
    }

    return skills;
  } catch (error) {
    // Directory doesn't exist or can't be read
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    debugLogger.debug(
      `Cannot read skills directory ${baseDir}: ${errorMessage}`,
    );
    return [];
  }
}

export function parseSkillContent(
  content: string,
  filePath: string,
): SkillConfig {
  debugLogger.debug(`Parsing skill content from: ${filePath}`);

  // Normalize content to handle BOM and CRLF line endings
  const normalizedContent = normalizeContent(content);

  // Split frontmatter and content
  // Use (?:\n|$) to allow frontmatter ending with or without trailing newline
  const frontmatterRegex = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/;
  const match = normalizedContent.match(frontmatterRegex);

  if (!match) {
    throw new Error('Invalid format: missing YAML frontmatter');
  }

  const [, frontmatterYaml, body] = match;

  // Parse YAML frontmatter
  const rawFrontmatter = parseYaml(frontmatterYaml) as Record<string, unknown>;

  // Auto-migrate Claude Code-style frontmatter (allowed-tools, PascalCase tool
  // names) to Qwen form so skills from Anthropic's ecosystem load transparently.
  const { frontmatter, migrated, notes } =
    normalizeClaudeFrontmatter(rawFrontmatter);
  if (migrated) {
    debugLogger.debug(
      `Claude-compat migration applied to ${filePath}: ${notes.join(' ')}`,
    );
  }

  // Extract required fields
  const nameRaw = frontmatter['name'];
  const descriptionRaw = frontmatter['description'];

  if (nameRaw == null || nameRaw === '') {
    throw new Error('Missing "name" in frontmatter');
  }

  if (descriptionRaw == null || descriptionRaw === '') {
    throw new Error('Missing "description" in frontmatter');
  }

  // Convert to strings
  const name = String(nameRaw);
  const description = String(descriptionRaw);

  // Extract optional fields
  const allowedToolsRaw = frontmatter['allowedTools'] as unknown[] | undefined;
  let allowedTools: string[] | undefined;

  if (allowedToolsRaw !== undefined) {
    if (Array.isArray(allowedToolsRaw)) {
      allowedTools = allowedToolsRaw.map(String);
    } else {
      throw new Error('"allowedTools" must be an array');
    }
  }

  // Extract optional model field
  const model = parseModelField(frontmatter);
  const provenance = parseProvenanceField(frontmatter);

  const config: SkillConfig = {
    name,
    description,
    allowedTools,
    model,
    filePath,
    body: body.trim(),
    level: 'extension',
    provenance,
  };

  // Validate the parsed configuration
  const validation = validateConfig(config);
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  debugLogger.debug(`Successfully parsed skill: ${name} from ${filePath}`);
  return config;
}

/**
 * Parse the optional `provenance` object from skill frontmatter. Unknown
 * fields are ignored. Returns undefined when the key is missing or not an
 * object, so hand-authored skills parse cleanly.
 */
export function parseProvenanceField(
  frontmatter: Record<string, unknown>,
): SkillProvenance | undefined {
  const raw = frontmatter['provenance'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const provenance: SkillProvenance = {};
  if (typeof obj['sourceUser'] === 'string')
    provenance.sourceUser = obj['sourceUser'];
  if (typeof obj['sourceProject'] === 'string')
    provenance.sourceProject = obj['sourceProject'];
  if (typeof obj['sourceAgent'] === 'string')
    provenance.sourceAgent = obj['sourceAgent'];
  if (typeof obj['extractedAt'] === 'string')
    provenance.extractedAt = obj['extractedAt'];
  const extractedFromRaw = obj['extractedFrom'];
  if (Array.isArray(extractedFromRaw)) {
    provenance.extractedFrom = (extractedFromRaw as unknown[]).filter(
      (v): v is string => typeof v === 'string',
    );
  } else if (typeof extractedFromRaw === 'string') {
    // CSV form written by the simple YAML stringifier for one-level arrays
    // inside a nested provenance object.
    provenance.extractedFrom = extractedFromRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

export function validateConfig(
  config: Partial<SkillConfig>,
): SkillValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (typeof config.name !== 'string') {
    errors.push('Missing or invalid "name" field');
  } else if (config.name.trim() === '') {
    errors.push('"name" cannot be empty');
  }

  if (typeof config.description !== 'string') {
    errors.push('Missing or invalid "description" field');
  } else if (config.description.trim() === '') {
    errors.push('"description" cannot be empty');
  }

  // Validate allowedTools if present
  if (config.allowedTools !== undefined) {
    if (!Array.isArray(config.allowedTools)) {
      errors.push('"allowedTools" must be an array');
    } else {
      for (const tool of config.allowedTools) {
        if (typeof tool !== 'string') {
          errors.push('"allowedTools" must contain only strings');
          break;
        }
      }
    }
  }

  // Warn if body is empty
  if (!config.body || config.body.trim() === '') {
    warnings.push('Skill body is empty');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
