/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, type FC } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  settingsApi,
  type AppSettings,
  type DetectContextResult,
} from '../../api/settings';
import { useSettingsStore } from '../../stores/settingsStore';

interface Provider {
  id: string;
  label: string;
  authType: string;
  defaultBaseUrl: string;
  defaultModel: string;
  placeholder: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    authType: 'openai',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen3-235b-a22b',
    placeholder: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    authType: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    placeholder: 'sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    authType: 'anthropic',
    defaultBaseUrl: '',
    defaultModel: 'claude-sonnet-4-6',
    placeholder: 'sk-ant-...',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    authType: 'gemini',
    defaultBaseUrl: '',
    defaultModel: 'gemini-2.0-flash',
    placeholder: 'AIza...',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    authType: 'openai',
    defaultBaseUrl: '',
    defaultModel: '',
    placeholder: 'API Key',
  },
];

const LANGUAGES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'zh', label: '简体中文' },
  { value: 'ja', label: '日本語' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
];

const APPROVAL_MODES = [
  { value: 'default', label: 'Default — prompt on destructive actions' },
  { value: 'auto-edit', label: 'Auto-edit — auto-approve file edits' },
  { value: 'yolo', label: 'YOLO — auto-approve everything' },
];

function detectProvider(authType: string, baseUrl: string): string {
  if (authType === 'anthropic') return 'anthropic';
  if (authType === 'gemini') return 'gemini';
  if (baseUrl.includes('dashscope')) return 'qwen';
  if (baseUrl.includes('openai.com')) return 'openai';
  if (baseUrl) return 'custom';
  return 'qwen';
}

interface Props {
  onClose: () => void;
  isFirstRun?: boolean;
}

export const SettingsModal: FC<Props> = ({ onClose, isFirstRun = false }) => {
  const [tab, setTab] = useState<'llm' | 'general'>('llm');
  const { serverSettings, setServerSettings, setModel } = useSettingsStore(
    useShallow((s) => ({
      serverSettings: s.serverSettings,
      setServerSettings: s.setServerSettings,
      setModel: s.setModel,
    })),
  );

  const initAuth = serverSettings?.security.auth;
  const initGeneral = serverSettings?.general;
  const initTools = serverSettings?.tools;

  const initProviderId = initAuth
    ? detectProvider(initAuth.selectedType, initAuth.baseUrl)
    : 'qwen';

  const [providerId, setProviderId] = useState(initProviderId);
  const [apiKey, setApiKey] = useState(initAuth?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState(initAuth?.baseUrl ?? '');
  const [model, setModelLocal] = useState(serverSettings?.model.name ?? '');
  const [agentName, setAgentName] = useState(initGeneral?.agentName ?? '');
  const [language, setLanguage] = useState(initGeneral?.language ?? 'auto');
  const [outputLanguage, setOutputLanguage] = useState(
    initGeneral?.outputLanguage ?? 'auto',
  );
  const [approvalMode, setApprovalMode] = useState(
    initTools?.approvalMode ?? 'default',
  );
  // contextWindowSize: empty string = auto (let core decide), number string = override
  const [contextWindowSize, setContextWindowSize] = useState<string>(
    serverSettings?.model.contextWindowSize != null
      ? String(serverSettings.model.contextWindowSize)
      : '',
  );
  const [detectStatus, setDetectStatus] = useState<
    'idle' | 'detecting' | 'done' | 'fail'
  >('idle');
  const [detectResult, setDetectResult] = useState<DetectContextResult | null>(
    null,
  );

  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'ok' | 'fail'
  >('idle');
  const [testError, setTestError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const provider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[0]!;

  // Auto-fill baseUrl and model when provider changes
  useEffect(() => {
    if (providerId !== 'custom') {
      setBaseUrl(provider.defaultBaseUrl);
      if (!model || PROVIDERS.some((p) => p.defaultModel === model)) {
        setModelLocal(provider.defaultModel);
      }
    }
  }, [providerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTest = async () => {
    setTestStatus('testing');
    setTestError('');
    try {
      const result = await settingsApi.test(apiKey, provider.authType, baseUrl);
      if (result.ok) {
        setTestStatus('ok');
      } else {
        setTestStatus('fail');
        setTestError(result.error ?? 'Connection failed');
      }
    } catch (err) {
      setTestStatus('fail');
      setTestError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDetect = async () => {
    setDetectStatus('detecting');
    setDetectResult(null);
    try {
      const result = await settingsApi.detectContext(apiKey, baseUrl, model);
      setDetectResult(result);
      setDetectStatus('done');
      if (result.detected !== null) {
        setContextWindowSize(String(result.detected));
      }
    } catch {
      setDetectStatus('fail');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedCtx = contextWindowSize.trim()
        ? Number(contextWindowSize.trim())
        : null;
      const patch: Partial<AppSettings> = {
        security: {
          auth: {
            selectedType: provider.authType,
            apiKey,
            baseUrl,
          },
        },
        model: {
          name: model,
          contextWindowSize: parsedCtx && parsedCtx > 0 ? parsedCtx : null,
        },
        general: {
          agentName,
          language,
          outputLanguage,
          setupCompleted: true,
        },
        tools: { approvalMode },
      };
      await settingsApi.patch(patch);
      const updated = await settingsApi.get();
      setServerSettings(updated);
      setModel(model);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 800);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg w-full max-w-lg mx-4 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e2e2e]">
          <div>
            <h2 className="text-sm font-semibold text-[#e8e6e3]">Settings</h2>
            {isFirstRun && (
              <p className="text-xs text-[#8a8a8a] mt-0.5">
                Configure your LLM to get started
              </p>
            )}
          </div>
          {!isFirstRun && (
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded text-[#8a8a8a] hover:text-[#e8e6e3] hover:bg-[#2e2e2e] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M1 1l10 10M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2e2e2e] px-5">
          {(['llm', 'general'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-accent text-[#e8e6e3]'
                  : 'border-transparent text-[#8a8a8a] hover:text-[#e8e6e3]'
              }`}
            >
              {t === 'llm' ? 'LLM' : 'General'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {tab === 'llm' && (
            <>
              {/* Provider */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  Provider
                </label>
                <select
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] focus:outline-none focus:border-accent"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestStatus('idle');
                  }}
                  placeholder={provider.placeholder}
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] font-mono placeholder-[#555] focus:outline-none focus:border-accent"
                />
              </div>

              {/* Base URL */}
              {(providerId === 'custom' ||
                providerId === 'qwen' ||
                providerId === 'openai') && (
                <div>
                  <label className="block text-xs text-[#8a8a8a] mb-1.5">
                    Base URL
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.example.com/v1"
                    className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] font-mono placeholder-[#555] focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              {/* Model */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModelLocal(e.target.value)}
                  placeholder={provider.defaultModel || 'model name'}
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] font-mono placeholder-[#555] focus:outline-none focus:border-accent"
                />
              </div>

              {/* Context Window */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  Context Window (tokens)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={contextWindowSize}
                    onChange={(e) => {
                      setContextWindowSize(e.target.value);
                      setDetectResult(null);
                      setDetectStatus('idle');
                    }}
                    placeholder="Auto-detect"
                    min={1024}
                    className="flex-1 bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] font-mono placeholder-[#555] focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={handleDetect}
                    disabled={
                      !apiKey ||
                      !baseUrl ||
                      !model ||
                      detectStatus === 'detecting'
                    }
                    className="px-3 py-2 text-xs rounded border border-[#2e2e2e] text-[#8a8a8a] hover:text-[#e8e6e3] hover:border-[#555] disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {detectStatus === 'detecting'
                      ? 'Detecting…'
                      : 'Auto-detect'}
                  </button>
                </div>
                {detectStatus === 'done' && detectResult && (
                  <p className="mt-1 text-xs">
                    {detectResult.detected !== null ? (
                      <span className="text-green-400">
                        ✓ API reported {detectResult.detected.toLocaleString()}{' '}
                        tokens
                      </span>
                    ) : (
                      <span className="text-[#8a8a8a]">
                        API did not return context size — using pattern
                        estimate: {detectResult.patternValue.toLocaleString()}
                      </span>
                    )}
                  </p>
                )}
                {detectStatus === 'fail' && (
                  <p className="mt-1 text-xs text-red-400">Detection failed</p>
                )}
                {!contextWindowSize && (
                  <p className="mt-1 text-xs text-[#555]">
                    Leave blank to use auto-estimate from model name
                  </p>
                )}
              </div>

              {/* Test connection */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTest}
                  disabled={!apiKey || testStatus === 'testing'}
                  className="px-3 py-1.5 text-xs rounded border border-[#2e2e2e] text-[#8a8a8a] hover:text-[#e8e6e3] hover:border-[#555] disabled:opacity-40 transition-colors"
                >
                  {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                </button>
                {testStatus === 'ok' && (
                  <span className="text-xs text-green-400">✓ Connected</span>
                )}
                {testStatus === 'fail' && (
                  <span className="text-xs text-red-400">
                    ✗ {testError || 'Failed'}
                  </span>
                )}
              </div>
            </>
          )}

          {tab === 'general' && (
            <>
              {/* Agent Name */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Qwen"
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] placeholder-[#555] focus:outline-none focus:border-accent"
                />
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  UI Language
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] focus:outline-none focus:border-accent"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Output Language */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  LLM Output Language
                </label>
                <select
                  value={outputLanguage}
                  onChange={(e) => setOutputLanguage(e.target.value)}
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] focus:outline-none focus:border-accent"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Approval Mode */}
              <div>
                <label className="block text-xs text-[#8a8a8a] mb-1.5">
                  Tool Approval Mode
                </label>
                <select
                  value={approvalMode}
                  onChange={(e) => setApprovalMode(e.target.value)}
                  className="w-full bg-[#242424] border border-[#2e2e2e] rounded px-3 py-2 text-sm text-[#e8e6e3] focus:outline-none focus:border-accent"
                >
                  {APPROVAL_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#2e2e2e]">
          {!isFirstRun && (
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs text-[#8a8a8a] hover:text-[#e8e6e3] transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !apiKey || !model}
            className="px-4 py-1.5 bg-accent text-white text-xs rounded hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};
