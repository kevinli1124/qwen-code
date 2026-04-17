/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Config } from '@qwen-code/qwen-code-core';
import { getResponseTextFromParts } from '@qwen-code/qwen-code-core';
import {
  SOUL_TEMPLATES,
  LLM_GENERATED_OPTION,
  type SoulTemplate,
} from '../../../config/setup/soulTemplates.js';
import type { LoadedSettings } from '../../../config/settings.js';
import { SettingScope } from '../../../config/settings.js';
import { theme } from '../../semantic-colors.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step =
  | 'connection'
  | 'naming'
  | 'naming-llm'
  | 'soul'
  | 'soul-llm'
  | 'done';

interface LlmQuestion {
  q: string;
  options: string[];
}

const SOUL_QUESTIONS: LlmQuestion[] = [
  {
    q: '我說話的感覺像',
    options: ['資深同事（直接、有立場）', '安靜工具（中性、無閒聊）', '導師（耐心、善於解釋）', '幽默駭客（有個性、偶爾嗆）'],
  },
  {
    q: '技術上有問題，主動開口嗎',
    options: ['是，一定說', '只在相關時說', '只在被問時說'],
  },
  {
    q: '回答預設長度',
    options: ['極短（能一句話絕不兩句）', '匹配問題複雜度', '完整詳細優先'],
  },
  {
    q: '幽默感',
    options: ['完全不要', '偶爾自然出現', '有個性，可以輕微嘲諷'],
  },
  {
    q: '前提錯了，我的反應',
    options: ['直接說「這個前提不對，因為…」', '委婉提示：「我的理解有點不同…」'],
  },
];

// ─── Props ─────────────────────────────────────────────────────────────────────

interface SetupWizardProps {
  config: Config;
  settings: LoadedSettings;
  onComplete: (agentName: string) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const SetupWizard: React.FC<SetupWizardProps> = ({
  config,
  settings,
  onComplete,
}) => {
  // ── Step ──
  const [step, setStep] = useState<Step>('connection');

  // ── Connection ──
  const [connStatus, setConnStatus] = useState<'testing' | 'ok' | 'fail'>('testing');
  const [connModel, setConnModel] = useState('');
  const [connError, setConnError] = useState('');

  // ── Naming ──
  const [nameInput, setNameInput] = useState('');
  const [nameMode, setNameMode] = useState<'type' | 'llm'>('type');
  const [, setNameModeIdx] = useState(0); // 0=自己輸入, 1=讓AI取名
  const [llmNames, setLlmNames] = useState<string[]>([]);
  const [llmNameIdx, setLlmNameIdx] = useState(0);
  const [loadingNames, setLoadingNames] = useState(false);

  // ── Soul ──
  const [soulIdx, setSoulIdx] = useState(0);
  const soulOptions = [...SOUL_TEMPLATES, LLM_GENERATED_OPTION];

  // ── Soul LLM questionnaire ──
  const [qIdx, setQIdx] = useState(0);
  const [qAnswers, setQAnswers] = useState<number[]>([]);
  const [qCursorIdx, setQCursorIdx] = useState(0);
  const [generatingSoul, setGeneratingSoul] = useState(false);
  const [generatedSoul, setGeneratedSoul] = useState('');
  const [soulPreview, setSoulPreview] = useState(false);

  // ── Final agentName ──
  const [agentName, setAgentName] = useState('');

  // ─── Connection test on mount ─────────────────────────────────────────────

  useEffect(() => {
    if (step !== 'connection') return;
    const test = async () => {
      try {
        const generator = config.getContentGenerator();
        if (!generator) throw new Error('未設定 LLM 連線');
        const model = config.getModel();
        const resp = await generator.generateContent(
          {
            model,
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          },
          'setup-ping',
        );
        const parts = resp.candidates?.[0]?.content?.parts ?? [];
        const text = getResponseTextFromParts(parts);
        if (text !== undefined) {
          setConnModel(model);
          setConnStatus('ok');
        } else {
          throw new Error('空回應');
        }
      } catch (e) {
        setConnError(e instanceof Error ? e.message : String(e));
        setConnStatus('fail');
      }
    };
    void test();
  }, [config, step]);

  // ─── LLM name suggestions ─────────────────────────────────────────────────

  const fetchLlmNames = useCallback(async () => {
    setLoadingNames(true);
    try {
      const generator = config.getContentGenerator();
      const model = config.getModel();
      const resp = await generator.generateContent(
        {
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: '請給我 3 個簡短的 AI 助理名字（中文或英文皆可），只列名字，一行一個，不加編號或解釋。',
                },
              ],
            },
          ],
        },
        'setup-names',
      );
      const parts = resp.candidates?.[0]?.content?.parts ?? [];
      const text = getResponseTextFromParts(parts) ?? '';
      const names = text
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      setLlmNames(names.length > 0 ? names : ['Kai', 'Nova', 'Aria']);
    } catch {
      setLlmNames(['Kai', 'Nova', 'Aria']);
    } finally {
      setLoadingNames(false);
    }
  }, [config]);

  // ─── LLM soul generation ──────────────────────────────────────────────────

  const generateSoul = useCallback(
    async (answers: number[]) => {
      setGeneratingSoul(true);
      const summary = SOUL_QUESTIONS.map(
        (q, i) => `${q.q}：${q.options[answers[i]] ?? '未回答'}`,
      ).join('\n');
      try {
        const generator = config.getContentGenerator();
        const model = config.getModel();
        const prompt = `根據以下使用者偏好，用繁體中文（臺灣）寫一份精簡的 soul.md。
只包含 Voice / Tone / Brevity / Opinions / Humor / Bluntness 六個 section，每個 section 1-3 條。
不要加多餘說明，不要加 changelog，直接輸出 Markdown。

偏好：
${summary}`;
        const resp = await generator.generateContent(
          {
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          },
          'setup-soul',
        );
        const parts = resp.candidates?.[0]?.content?.parts ?? [];
        const text = getResponseTextFromParts(parts) ?? '';
        setGeneratedSoul(text || '# Agent Soul\n\n## Voice\n直接、有立場。\n');
      } catch {
        setGeneratedSoul('# Agent Soul\n\n## Voice\n直接、有立場。\n');
      } finally {
        setGeneratingSoul(false);
        setSoulPreview(true);
      }
    },
    [config],
  );

  // ─── Write and complete ───────────────────────────────────────────────────

  const finalize = useCallback(
    (finalName: string, soulContent: string) => {
      try {
        // Write soul.md
        const soulPath = path.join(os.homedir(), '.qwen', 'soul.md');
        fs.mkdirSync(path.dirname(soulPath), { recursive: true });
        fs.writeFileSync(soulPath, soulContent, 'utf-8');
        // Save settings
        settings.setValue(SettingScope.User, 'general.agentName', finalName);
        settings.setValue(SettingScope.User, 'general.setupCompleted', true);
      } catch {
        // best effort
      }
      setAgentName(finalName);
      setStep('done');
      setTimeout(() => onComplete(finalName), 800);
    },
    [settings, onComplete],
  );

  // ─── Keyboard handling ────────────────────────────────────────────────────

  useInput((input, key) => {
    // ── Connection ──
    if (step === 'connection') {
      if (connStatus !== 'testing' && key.return) {
        setStep('naming');
      }
      return;
    }

    // ── Naming ──
    if (step === 'naming') {
      if (nameMode === 'type') {
        if (key.return) {
          if (input === '') {
            // toggle to LLM mode
            setNameMode('llm');
            setNameModeIdx(1);
          } else {
            const finalName = nameInput.trim() || 'Agent';
            setStep('soul');
            setNameInput(finalName);
          }
          return;
        }
        if (key.downArrow) {
          setNameMode('llm');
          setNameModeIdx(1);
          return;
        }
        if (key.backspace || key.delete) {
          setNameInput((prev) => prev.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          setNameInput((prev) => prev + input);
        }
      } else {
        // llm mode
        if (key.upArrow) {
          setNameMode('type');
          setNameModeIdx(0);
          return;
        }
        if (key.return) {
          // fetch LLM names
          void fetchLlmNames();
          setStep('naming-llm');
          return;
        }
      }
      return;
    }

    // ── Naming LLM ──
    if (step === 'naming-llm') {
      if (loadingNames) return;
      if (key.upArrow) {
        setLlmNameIdx((i) => (i - 1 + llmNames.length) % llmNames.length);
      }
      if (key.downArrow) {
        setLlmNameIdx((i) => (i + 1) % llmNames.length);
      }
      if (key.return) {
        const chosen = llmNames[llmNameIdx] ?? 'Agent';
        setNameInput(chosen);
        setStep('soul');
      }
      return;
    }

    // ── Soul ──
    if (step === 'soul') {
      if (key.upArrow) {
        setSoulIdx((i) => (i - 1 + soulOptions.length) % soulOptions.length);
      }
      if (key.downArrow) {
        setSoulIdx((i) => (i + 1) % soulOptions.length);
      }
      if (key.return) {
        const chosen = soulOptions[soulIdx];
        if (!chosen) return;
        if (chosen.id === 'llm') {
          setStep('soul-llm');
          setQIdx(0);
          setQAnswers([]);
          setQCursorIdx(0);
        } else {
          const tpl = chosen as SoulTemplate;
          finalize(nameInput, tpl.content);
        }
      }
      return;
    }

    // ── Soul LLM questionnaire ──
    if (step === 'soul-llm') {
      if (soulPreview) {
        // confirm generated soul
        if (key.return) {
          finalize(nameInput, generatedSoul);
        }
        return;
      }
      if (generatingSoul) return;
      const curQ = SOUL_QUESTIONS[qIdx];
      if (!curQ) return;
      if (key.upArrow) {
        setQCursorIdx((i) => (i - 1 + curQ.options.length) % curQ.options.length);
      }
      if (key.downArrow) {
        setQCursorIdx((i) => (i + 1) % curQ.options.length);
      }
      if (key.return) {
        const newAnswers = [...qAnswers, qCursorIdx];
        if (qIdx + 1 < SOUL_QUESTIONS.length) {
          setQAnswers(newAnswers);
          setQIdx(qIdx + 1);
          setQCursorIdx(0);
        } else {
          setQAnswers(newAnswers);
          void generateSoul(newAnswers);
        }
      }
      return;
    }
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  const divider = '─'.repeat(48);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Text bold color={theme.text.accent}>
        {'  ◆ 初始設定精靈'}
      </Text>
      <Text color={theme.text.secondary}>{divider}</Text>

      {/* Step: Connection */}
      {step === 'connection' && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold>Step 1 / 3 — LLM 連線確認</Text>
          {connStatus === 'testing' && (
            <Text color={theme.text.secondary}>  正在測試連線...</Text>
          )}
          {connStatus === 'ok' && (
            <>
              <Text color="green">  ✓ 連線成功　模型：{connModel}</Text>
              <Text color={theme.text.secondary}>  按 Enter 繼續</Text>
            </>
          )}
          {connStatus === 'fail' && (
            <>
              <Text color="red">  ✗ 連線失敗：{connError}</Text>
              <Text color={theme.text.secondary}>
                {'  請先完成 LLM 設定（/auth）後重啟。或按 Enter 跳過，稍後設定。'}
              </Text>
            </>
          )}
        </Box>
      )}

      {/* Step: Naming */}
      {step === 'naming' && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold>Step 2 / 3 — Agent 名字</Text>
          <Box>
            <Text color={nameMode === 'type' ? theme.text.accent : theme.text.secondary}>
              {nameMode === 'type' ? '▶ ' : '  '}
            </Text>
            <Text>自己輸入：</Text>
            <Text color={theme.text.accent}>{nameInput}</Text>
            <Text color={theme.text.secondary}>█</Text>
          </Box>
          <Box>
            <Text color={nameMode === 'llm' ? theme.text.accent : theme.text.secondary}>
              {nameMode === 'llm' ? '▶ ' : '  '}
            </Text>
            <Text color={nameMode === 'llm' ? theme.text.accent : theme.text.secondary}>
              讓 AI 取名
            </Text>
          </Box>
          <Text color={theme.text.secondary}>  ↑↓ 切換模式　Enter 確認</Text>
        </Box>
      )}

      {/* Step: Naming LLM */}
      {step === 'naming-llm' && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold>Step 2 / 3 — AI 建議名字</Text>
          {loadingNames ? (
            <Text color={theme.text.secondary}>  生成中...</Text>
          ) : (
            <>
              {llmNames.map((name, i) => (
                <Box key={name}>
                  <Text color={i === llmNameIdx ? theme.text.accent : theme.text.secondary}>
                    {i === llmNameIdx ? '▶ ' : '  '}
                  </Text>
                  <Text color={i === llmNameIdx ? theme.text.accent : undefined}>
                    {name}
                  </Text>
                </Box>
              ))}
              <Text color={theme.text.secondary}>  ↑↓ 選擇　Enter 確認</Text>
            </>
          )}
        </Box>
      )}

      {/* Step: Soul */}
      {step === 'soul' && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold>Step 3 / 3 — Agent Soul（個性）</Text>
          {soulOptions.map((opt, i) => (
            <Box key={opt.id}>
              <Text color={i === soulIdx ? theme.text.accent : theme.text.secondary}>
                {i === soulIdx ? '▶ ' : '  '}
              </Text>
              <Text color={i === soulIdx ? theme.text.accent : undefined}>
                {opt.label}
              </Text>
              <Text color={theme.text.secondary}>{'  '}{opt.description}</Text>
            </Box>
          ))}
          <Text color={theme.text.secondary}>  ↑↓ 選擇　Enter 確認</Text>
        </Box>
      )}

      {/* Step: Soul LLM questionnaire */}
      {step === 'soul-llm' && !soulPreview && !generatingSoul && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold>
            Soul 設定問題 {qIdx + 1} / {SOUL_QUESTIONS.length}
          </Text>
          <Text>{SOUL_QUESTIONS[qIdx]?.q}</Text>
          {SOUL_QUESTIONS[qIdx]?.options.map((opt, i) => (
            <Box key={opt}>
              <Text color={i === qCursorIdx ? theme.text.accent : theme.text.secondary}>
                {i === qCursorIdx ? '▶ ' : '  '}
              </Text>
              <Text color={i === qCursorIdx ? theme.text.accent : undefined}>{opt}</Text>
            </Box>
          ))}
          <Text color={theme.text.secondary}>  ↑↓ 選擇　Enter 確認</Text>
        </Box>
      )}

      {step === 'soul-llm' && generatingSoul && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.secondary}>  Soul 生成中，請稍候...</Text>
        </Box>
      )}

      {step === 'soul-llm' && soulPreview && !generatingSoul && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold>Soul 預覽</Text>
          <Text color={theme.text.secondary}>{divider}</Text>
          <Text>{generatedSoul.slice(0, 400)}{generatedSoul.length > 400 ? '\n...' : ''}</Text>
          <Text color={theme.text.secondary}>{divider}</Text>
          <Text color={theme.text.secondary}>  按 Enter 確認並完成設定</Text>
        </Box>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <Box flexDirection="column" marginTop={1} gap={1}>
          <Text bold color="green">✓ 設定完成</Text>
          <Text>  Agent 名字：<Text bold color={theme.text.accent}>{agentName}</Text></Text>
          <Text color={theme.text.secondary}>  Soul 已寫入 ~/.qwen/soul.md</Text>
          <Text color={theme.text.secondary}>  正在啟動...</Text>
        </Box>
      )}
    </Box>
  );
};
