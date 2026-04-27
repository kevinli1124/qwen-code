import { tokenLimit } from '../packages/core/dist/src/core/tokenLimits.js';

const models = [
  'qwen3.5-plus',
  'qwen-plus-latest',
  'qwen3-max',
  'qwen3-coder-plus',
  'qwen3-235b-a22b',
  'qwen2.5-plus',
  'qwen',
  'gemma-4-31b-it',
  'gpt-4o',
  'claude-sonnet-4-6',
];

console.log('Model'.padEnd(28), 'Input ctx'.padStart(12), 'Output limit'.padStart(14));
console.log('-'.repeat(56));
for (const m of models) {
  const input = tokenLimit(m, 'input').toLocaleString();
  const output = tokenLimit(m, 'output').toLocaleString();
  console.log(m.padEnd(28), input.padStart(12), output.padStart(14));
}
