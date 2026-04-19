/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  markdownToTelegramHtml,
  markdownToPlain,
  splitForTelegram,
  TELEGRAM_MAX_MESSAGE_LEN,
} from './markdown-to-telegram.js';

describe('markdownToTelegramHtml', () => {
  it('escapes raw HTML special characters outside code', () => {
    expect(markdownToTelegramHtml('a < b & c > d')).toBe(
      'a &lt; b &amp; c &gt; d',
    );
  });

  it('converts bold / italic / strikethrough', () => {
    expect(markdownToTelegramHtml('**bold** and *italic* and ~~s~~')).toBe(
      '<b>bold</b> and <i>italic</i> and <s>s</s>',
    );
  });

  it('converts inline code and escapes its contents', () => {
    expect(markdownToTelegramHtml('see `a < b` here')).toBe(
      'see <code>a &lt; b</code> here',
    );
  });

  it('converts fenced code with language hint', () => {
    const out = markdownToTelegramHtml('```python\nprint(1 < 2)\n```');
    expect(out).toBe(
      '<pre><code class="language-python">print(1 &lt; 2)</code></pre>',
    );
  });

  it('converts fenced code with no language', () => {
    expect(markdownToTelegramHtml('```\nplain\n```')).toBe('<pre>plain</pre>');
  });

  it('converts headings to bold on their own line', () => {
    expect(markdownToTelegramHtml('# Title\ntext')).toBe('<b>Title</b>\ntext');
    expect(markdownToTelegramHtml('### deeper')).toBe('<b>deeper</b>');
  });

  it('converts links', () => {
    expect(markdownToTelegramHtml('see [docs](https://example.com) here')).toBe(
      'see <a href="https://example.com">docs</a> here',
    );
  });

  it('strips javascript: links to protect against malicious model output', () => {
    // Use a URL without parens — our link regex halts at the first ')'
    // and a pathological attacker could put parens in the URL, but the
    // defense we care about is the javascript: scheme specifically.
    const out = markdownToTelegramHtml('click [x](javascript:alert)');
    expect(out).toBe('click x');
  });

  it('converts blockquotes', () => {
    const out = markdownToTelegramHtml('> quoted\n> second line\nafter');
    expect(out).toContain('<blockquote>');
    expect(out).toContain('quoted');
    expect(out).toContain('second line');
  });

  it('does not transform markdown inside code blocks', () => {
    const out = markdownToTelegramHtml(
      '```\n**not bold** and *not italic*\n```',
    );
    expect(out).toBe('<pre>**not bold** and *not italic*</pre>');
  });

  it('does not transform markdown inside inline code', () => {
    expect(markdownToTelegramHtml('`**verbatim**`')).toBe(
      '<code>**verbatim**</code>',
    );
  });
});

describe('markdownToPlain', () => {
  it('strips bold/italic/code markers', () => {
    expect(markdownToPlain('**bold** `code` *italic* ~~strike~~')).toBe(
      'bold code italic strike',
    );
  });

  it('preserves code block bodies', () => {
    expect(markdownToPlain('```js\nconst x = 1;\n```')).toContain(
      'const x = 1;',
    );
  });

  it('strips heading hashes', () => {
    expect(markdownToPlain('## Hello')).toBe('Hello');
  });

  it('keeps link text, drops URL', () => {
    expect(markdownToPlain('[docs](https://example.com)')).toBe('docs');
  });
});

describe('splitForTelegram', () => {
  it('returns single chunk when under the limit', () => {
    expect(splitForTelegram('hello')).toEqual(['hello']);
  });

  it('splits long text on paragraph boundaries', () => {
    const para = 'x'.repeat(2000);
    const combined = [para, para, para].join('\n\n');
    const chunks = splitForTelegram(combined);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LEN);
    }
  });

  it('falls back to a hard cut when no whitespace exists', () => {
    const blob = 'a'.repeat(TELEGRAM_MAX_MESSAGE_LEN + 500);
    const chunks = splitForTelegram(blob);
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBeLessThanOrEqual(TELEGRAM_MAX_MESSAGE_LEN);
  });

  it('avoids splitting inside an open code fence', () => {
    // Fence opens near end, would otherwise straddle the cut.
    const head = 'x\n'.repeat(1500); // ~3000 chars
    const fence = '```\n' + 'y\n'.repeat(800) + '```';
    const combined = head + fence;
    const chunks = splitForTelegram(combined, 3500);
    // The first chunk should not leave an unclosed ``` behind.
    const fencesInFirst = (chunks[0].match(/```/g) ?? []).length;
    expect(fencesInFirst % 2).toBe(0);
  });
});
