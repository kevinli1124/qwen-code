import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SubagentValidator } from '../packages/core/dist/src/subagents/validation.js';

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const yaml = match[1];
  const content = match[2];
  const data = {};
  let currentKey = null;
  let multiline = '';
  let listKey = null;
  const lines = yaml.split(/\r?\n/);
  for (const line of lines) {
    if (/^\s*-\s+/.test(line) && listKey) {
      data[listKey] = data[listKey] || [];
      data[listKey].push(line.replace(/^\s*-\s+/, '').trim());
      continue;
    }
    listKey = null;
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (m) {
      if (currentKey && multiline.trim()) data[currentKey] = multiline.trim();
      currentKey = m[1];
      const val = m[2].trim();
      if (val === '') {
        multiline = '';
        listKey = currentKey;
      } else {
        data[currentKey] = val;
        multiline = '';
        currentKey = null;
      }
    } else if (currentKey) {
      multiline += ' ' + line.trim();
    }
  }
  if (currentKey && multiline.trim()) data[currentKey] = multiline.trim();
  return { data, content };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const agentsDir = path.join(repoRoot, '.qwen', 'agents');

const files = fs.readdirSync(agentsDir).filter(
  (f) => f.endsWith('.md') && f !== 'README.md',
);

const validator = new SubagentValidator();
let failed = 0;

console.log(`Validating ${files.length} agents in ${agentsDir}\n`);

for (const file of files) {
  const fullPath = path.join(agentsDir, file);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const { data: fm, content } = parseFrontmatter(raw);

  const config = {
    name: fm.name,
    description: fm.description,
    systemPrompt: content.trim(),
    level: 'project',
    tools: fm.tools || [],
    modelConfig: { model: fm.model || 'inherit' },
    runConfig: {
      max_time_minutes: fm.max_time_minutes || 10,
      max_turns: fm.max_turns || 50,
    },
  };

  const result = validator.validateConfig(config);
  if (result.isValid) {
    const tools = Array.isArray(config.tools)
      ? `${config.tools.length} tools`
      : config.tools === '*'
        ? 'all tools'
        : 'no tools';
    console.log(`  ✓ ${config.name.padEnd(15)} model=${config.modelConfig.model.padEnd(10)} ${tools}`);
  } else {
    failed++;
    console.log(`  ✗ ${file}`);
    for (const err of result.errors || []) {
      console.log(`      - ${err.field || ''}: ${err.message}`);
    }
  }
}

console.log();
if (failed === 0) {
  console.log(`✓ All ${files.length} agents validated successfully.`);
} else {
  console.log(`✗ ${failed} of ${files.length} agents failed validation.`);
  process.exit(1);
}
