/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Minimal CommonMark-ish → Telegram-HTML converter.
 *
 * Telegram's "HTML" parse mode accepts a whitelisted subset:
 *   <b>, <strong>, <i>, <em>, <u>, <s>, <strike>, <del>,
 *   <a href="…">, <code>, <pre>, <pre><code class="language-…">,
 *   <blockquote>, <tg-spoiler>
 * Everything else gets rejected with 400. We therefore:
 *   1. Pull code blocks + inline code out first (they must NOT be
 *      re-processed — nothing inside gets transformed).
 *   2. HTML-escape the rest.
 *   3. Apply bold / italic / link transforms.
 *   4. Put the code back, HTML-escaped internally.
 *
 * Kept deliberately minimal — CommonMark is a firehose, and a DIY parser
 * that tried to match all of it would be more bug-prone than useful. The
 * {@link messageTooLongForTelegram} helper + splitter is where we accept
 * the format's 4096-char limit.
 */

/** Telegram's per-message text cap (hard 400 above this). */
export const TELEGRAM_MAX_MESSAGE_LEN = 4096;

const CODE_BLOCK_RE = /```([^\n`]*)\n([\s\S]*?)```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

/** HTML-escape the five characters Telegram cares about. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Converts a Markdown string into Telegram-flavored HTML suitable for
 * `parse_mode: 'HTML'`. Never throws — worst case it returns text that
 * Telegram rejects, and the caller should fall back to plain text.
 */
export function markdownToTelegramHtml(md: string): string {
  // 1. Extract code spans + fences. Replace with sentinels so later regex
  //    passes can't touch the contents.
  const blocks: string[] = [];
  const inlines: string[] = [];

  let text = md.replace(CODE_BLOCK_RE, (_m, lang: string, body: string) => {
    const cleanLang = lang.trim().replace(/[^\w+#.-]/g, '');
    const escaped = escapeHtml(body.replace(/\n+$/, ''));
    const html = cleanLang
      ? `<pre><code class="language-${cleanLang}">${escaped}</code></pre>`
      : `<pre>${escaped}</pre>`;
    blocks.push(html);
    return `\u0000BLOCK${blocks.length - 1}\u0000`;
  });

  text = text.replace(INLINE_CODE_RE, (_m, body: string) => {
    inlines.push(`<code>${escapeHtml(body)}</code>`);
    return `\u0000INLINE${inlines.length - 1}\u0000`;
  });

  // 2. Now HTML-escape the remaining text so stray <, >, & don't trip
  //    Telegram's parser.
  text = escapeHtml(text);

  // 3. Markdown transforms on escaped text.
  // Headings → bold on their own line.
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
  // Bold: **…** or __…__
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  text = text.replace(/(^|[^_])__([^_\n]+)__/g, '$1<b>$2</b>');
  // Italic: *…* or _…_  (avoid matching inside bold markers by requiring
  // non-asterisk context; cheap heuristic, good enough for chat output)
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');
  text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<i>$2</i>');
  // Strikethrough: ~~…~~
  text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  // Links: [label](url) — already HTML-escaped, so url may contain &amp;
  // etc.; that's fine.
  text = text.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => {
      // Belt-and-suspenders: reject javascript: to stop a malicious model
      // output from rendering a clickable XSS vector in Telegram.
      if (/^javascript:/i.test(url)) return label;
      return `<a href="${url}">${label}</a>`;
    },
  );
  // Blockquote: lines starting with > → wrap each contiguous run.
  text = text.replace(
    /(^|\n)((?:&gt;\s?.*(?:\n|$))+)/g,
    (_m, lead: string, block: string) => {
      const stripped = block
        .split('\n')
        .map((l) => l.replace(/^&gt;\s?/, ''))
        .join('\n')
        .trimEnd();
      return `${lead}<blockquote>${stripped}</blockquote>\n`;
    },
  );

  // 4. Restore code sentinels with their HTML. The \u0000 bookends are
  //    intentional — they cannot appear in CommonMark input (NUL bytes
  //    aren't valid Markdown text) so this is a safe marker.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/\u0000INLINE(\d+)\u0000/g, (_m, i) => inlines[+i]);
  // eslint-disable-next-line no-control-regex
  text = text.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i) => blocks[+i]);

  return text;
}

/**
 * Strips Markdown decoration to plain text. Used as the fallback path when
 * Telegram rejects our HTML (parse_mode mismatch, unsupported tag, stray
 * angle bracket we missed). Losing the formatting is worse than losing the
 * message entirely.
 */
export function markdownToPlain(md: string): string {
  return md
    .replace(CODE_BLOCK_RE, (_m, _lang, body: string) => body)
    .replace(INLINE_CODE_RE, (_m, body: string) => body)
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Splits a long message into Telegram-safe chunks (each <= 4096 chars).
 * Splits on paragraph boundaries when possible, falls back to sentence,
 * then hard character breaks. Preserves unbroken code fences by never
 * splitting inside a ```…``` block.
 */
export function splitForTelegram(
  text: string,
  max: number = TELEGRAM_MAX_MESSAGE_LEN,
): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > max) {
    // Prefer to split at a blank line just before `max`.
    let cut = remaining.lastIndexOf('\n\n', max);
    if (cut < max / 2) cut = remaining.lastIndexOf('\n', max);
    if (cut < max / 2) cut = remaining.lastIndexOf(' ', max);
    if (cut <= 0) cut = max;

    // Don't split inside an open code fence. If the chunk has an odd
    // number of ``` tokens, pull the cut back to before the last fence.
    const candidate = remaining.slice(0, cut);
    const fences = (candidate.match(/```/g) ?? []).length;
    if (fences % 2 === 1) {
      const lastFence = candidate.lastIndexOf('```');
      if (lastFence > 0) cut = lastFence;
    }

    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

export function messageTooLongForTelegram(text: string): boolean {
  return text.length > TELEGRAM_MAX_MESSAGE_LEN;
}
