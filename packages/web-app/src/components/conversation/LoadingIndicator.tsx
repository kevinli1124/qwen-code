/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useState, type FC } from 'react';
import { useMessageStore } from '../../stores/messageStore';

// A curated subset of the CLI's WITTY_LOADING_PHRASES. The full list
// has ~140 entries per locale; for the web footer a handful rotated
// every ~15s gives the same "I'm working on it" vibe without noise.
const PHRASES: Record<'en' | 'zh-TW' | 'zh', string[]> = {
  en: [
    "I'm Feeling Lucky",
    'Shipping awesomeness…',
    'Reticulating splines…',
    'Warming up the AI hamsters…',
    'Compiling brilliance…',
    'Consulting the digital spirits…',
    'Summoning wisdom from the cloud…',
    'Brewing fresh bytes…',
    'Polishing the algorithms…',
    'Untangling neural nets…',
    'Counting electrons…',
    'Asking the magic conch shell…',
    'Tuning cosmic frequencies…',
    'Painting the serifs back on…',
    'Converting coffee into code…',
    'Debugging reality — hang tight…',
    'Resolving dependencies and existential crises…',
    'Defragmenting memories…',
    'Confuzzling the options…',
    'Loading wit.exe…',
  ],
  'zh-TW': [
    '正在努力工作中，請稍候…',
    '老闆在旁邊，快點載入啊！',
    '正在向伺服器投餵咖啡…',
    '伺服器正在深呼吸，準備放大招…',
    '正在賦能全鏈路，尋找關鍵抓手…',
    '正在降本增效，最佳化載入路徑…',
    '正在打破部門壁壘，沉澱方法論…',
    '大力出奇蹟，正在強行載入…',
    '只要我不寫程式，程式就沒有 Bug…',
    '正在將 Bug 轉化為 Feature…',
    '正在試圖理解去年的自己寫了什麼…',
    '正在程式猿力覺醒中，請耐心等待…',
    '每一行程式碼，都在努力讓世界變得更好一點點…',
    '每一個偉大的想法，都值得這份耐心的等待…',
    '正在擁抱變化，迭代核心價值…',
    '正在對齊顆粒度，打磨底層邏輯…',
    '正在詢問產品經理：這需求是真的嗎？',
    '正在給產品經理畫大餅，請稍等…',
    '頭髮掉光之前，一定能載入完…',
    '只要我不尷尬，Bug 就追不上我…',
  ],
  zh: [
    '正在努力工作中，请稍候…',
    '老板在旁边，快点加载啊！',
    '正在向服务器投喂咖啡…',
    '服务器正在深呼吸，准备放大招…',
    '正在赋能全链路，寻找关键抓手…',
    '正在降本增效，优化加载路径…',
    '大力出奇迹，正在强行加载…',
    '只要我不写代码，代码就没有 Bug…',
    '正在将 Bug 转化为 Feature…',
    '正在试图理解去年的自己写了什么…',
    '每一行代码，都在努力让世界变得更好一点…',
    '正在拥抱变化，迭代核心价值…',
    '正在对齐颗粒度，打磨底层逻辑…',
    '正在询问产品经理：这需求是真的吗？',
    '只要我不尴尬，Bug 就追不上我…',
  ],
};

function resolveLocale(lang: string | undefined): 'en' | 'zh-TW' | 'zh' {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh_tw') return 'zh-TW';
  if (lower.startsWith('zh')) return 'zh';
  return 'en';
}

const ROTATE_MS = 15000;

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

interface LoadingIndicatorProps {
  /** True while the agent is producing output (isStreaming). */
  visible: boolean;
}

export const LoadingIndicator: FC<LoadingIndicatorProps> = ({ visible }) => {
  const currentToolName = useMessageStore((s) => s.currentToolName);
  const phrases = useMemo(() => PHRASES[resolveLocale(navigator.language)], []);
  const [phrase, setPhrase] = useState(
    () => phrases[Math.floor(Math.random() * phrases.length)] ?? '',
  );
  // Track the moment streaming started + current tick for elapsed time.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Reset the clock each time visibility flips to true; rotate phrase
  // every ROTATE_MS and tick the clock every second while visible.
  useEffect(() => {
    if (!visible) {
      setStartedAt(null);
      return;
    }
    setStartedAt(Date.now());
    setNow(Date.now());
    setPhrase(phrases[Math.floor(Math.random() * phrases.length)] ?? '');
    const rotate = setInterval(() => {
      setPhrase(phrases[Math.floor(Math.random() * phrases.length)] ?? '');
    }, ROTATE_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, [visible, phrases]);

  if (!visible) return null;

  const elapsed = startedAt ? now - startedAt : 0;

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-[#8a8a8a]">
      <div className="flex items-center gap-1">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse"
          style={{ animationDelay: '300ms' }}
        />
      </div>
      {currentToolName ? (
        <span className="italic">
          Currently: <span className="text-[#b8b6b3]">{currentToolName}</span>
        </span>
      ) : (
        <span className="italic">{phrase}</span>
      )}
      <span className="font-mono text-[#6e6e6e]">
        ({formatElapsed(elapsed)})
      </span>
    </div>
  );
};
