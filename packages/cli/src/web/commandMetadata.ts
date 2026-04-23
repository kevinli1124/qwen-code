/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Curated metadata for built-in slash commands, served via GET /api/commands
 * to power the web UI's slash autocomplete. Kept manual (rather than reading
 * BuiltinCommandLoader at runtime) so the web server doesn't drag in all
 * command modules and their transitive deps.
 *
 * Descriptions are intentionally short — the frontend shows them in a
 * narrow dropdown.
 */

export interface CommandMetadata {
  name: string;
  description: string;
  category?: string;
  /**
   * Where the command should run. 'local' = handled by the web UI
   * directly (no child CLI round-trip); 'cli' = sent to the CLI as a
   * user message (may fail if not supported in non-interactive mode —
   * the frontend should only show commands that actually work).
   */
  runner?: 'local' | 'cli';
}

interface CommandDef extends CommandMetadata {
  /** Per-locale overrides for description. */
  i18n?: Partial<Record<'en' | 'zh-TW' | 'zh', string>>;
}

// Ordered: info → session → config → agents → ext → setup → misc.
const COMMAND_DEFS: CommandDef[] = [
  {
    name: 'about',
    description: 'Show version and build info',
    category: 'info',
    runner: 'local',
    i18n: { 'zh-TW': '顯示版本與建置資訊', zh: '显示版本和构建信息' },
  },
  {
    name: 'help',
    description: 'List available commands',
    category: 'info',
    runner: 'local',
    i18n: { 'zh-TW': '列出可用的指令', zh: '列出可用的命令' },
  },
  {
    name: 'status',
    description: 'Show current session status',
    category: 'info',
    runner: 'local',
    i18n: { 'zh-TW': '顯示目前 session 狀態', zh: '显示当前会话状态' },
  },
  {
    name: 'stats',
    description: 'Show token / tool usage stats',
    category: 'info',
    runner: 'local',
    i18n: {
      'zh-TW': '顯示 token / 工具使用統計',
      zh: '显示 token / 工具使用统计',
    },
  },
  {
    name: 'tools',
    description: 'List available tools',
    category: 'info',
    runner: 'local',
    i18n: { 'zh-TW': '列出可用的工具', zh: '列出可用的工具' },
  },
  {
    name: 'context',
    description: 'Inspect assembled context',
    category: 'info',
    runner: 'cli',
    i18n: { 'zh-TW': '檢視組合後的上下文', zh: '查看组合后的上下文' },
  },
  {
    name: 'docs',
    description: 'Open Qwen Code documentation',
    category: 'info',
    runner: 'cli',
    i18n: { 'zh-TW': '開啟 Qwen Code 文件', zh: '打开 Qwen Code 文档' },
  },

  {
    name: 'clear',
    description: 'Clear current conversation',
    category: 'session',
    runner: 'local',
    i18n: { 'zh-TW': '清除目前對話', zh: '清除当前对话' },
  },
  {
    name: 'compress',
    description: 'Compress conversation to save tokens',
    category: 'session',
    runner: 'cli',
    i18n: { 'zh-TW': '壓縮對話以節省 token', zh: '压缩对话以节省 token' },
  },
  {
    name: 'summary',
    description: 'Summarize the current session',
    category: 'session',
    runner: 'cli',
    i18n: { 'zh-TW': '摘要目前 session', zh: '总结当前会话' },
  },
  {
    name: 'copy',
    description: 'Copy last assistant response',
    category: 'session',
    runner: 'cli',
    i18n: { 'zh-TW': '複製最後一則助理回應', zh: '复制最后一条助手回复' },
  },
  {
    name: 'export',
    description: 'Export session (html/md/json/jsonl)',
    category: 'session',
    runner: 'cli',
    i18n: {
      'zh-TW': '匯出 session (html/md/json/jsonl)',
      zh: '导出会话 (html/md/json/jsonl)',
    },
  },
  {
    name: 'resume',
    description: 'Resume a previous session',
    category: 'session',
    runner: 'cli',
    i18n: { 'zh-TW': '繼續先前的 session', zh: '恢复先前的会话' },
  },
  {
    name: 'restore',
    description: 'Restore from a checkpoint',
    category: 'session',
    runner: 'cli',
    i18n: { 'zh-TW': '從 checkpoint 還原', zh: '从检查点恢复' },
  },

  {
    name: 'model',
    description: 'Switch active model',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '切換使用中的模型', zh: '切换当前模型' },
  },
  {
    name: 'auth',
    description: 'Configure authentication',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '設定驗證 / 登入', zh: '配置认证' },
  },
  {
    name: 'approval-mode',
    description: 'Toggle approval mode (default/auto-edit/yolo)',
    category: 'config',
    runner: 'cli',
    i18n: {
      'zh-TW': '切換核准模式 (default/auto-edit/yolo)',
      zh: '切换审批模式',
    },
  },
  {
    name: 'permissions',
    description: 'Manage tool permissions',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '管理工具權限', zh: '管理工具权限' },
  },
  {
    name: 'theme',
    description: 'Change UI theme',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '變更 UI 主題', zh: '更改 UI 主题' },
  },
  {
    name: 'language',
    description: 'Change output language',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '變更輸出語言', zh: '更改输出语言' },
  },
  {
    name: 'editor',
    description: 'Configure default editor',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '設定預設編輯器', zh: '配置默认编辑器' },
  },
  {
    name: 'settings',
    description: 'Open settings editor',
    category: 'config',
    runner: 'cli',
    i18n: { 'zh-TW': '開啟設定編輯器', zh: '打开设置编辑器' },
  },

  {
    name: 'agents',
    description: 'Manage / create subagents',
    category: 'agents',
    runner: 'cli',
    i18n: { 'zh-TW': '管理 / 建立 subagent', zh: '管理 / 创建子代理' },
  },
  {
    name: 'skills',
    description: 'List / manage skills',
    category: 'agents',
    runner: 'local',
    i18n: { 'zh-TW': '列出 / 管理 skill', zh: '列出 / 管理技能' },
  },
  {
    name: 'hooks',
    description: 'Manage hooks',
    category: 'agents',
    runner: 'cli',
    i18n: { 'zh-TW': '管理 hook', zh: '管理钩子' },
  },
  {
    name: 'memory',
    description: 'Manage long-term memory',
    category: 'agents',
    runner: 'cli',
    i18n: { 'zh-TW': '管理長期記憶', zh: '管理长期记忆' },
  },
  {
    name: 'plan',
    description: 'Enter plan mode',
    category: 'agents',
    runner: 'cli',
    i18n: { 'zh-TW': '進入計畫模式', zh: '进入计划模式' },
  },

  {
    name: 'mcp',
    description: 'Manage MCP servers',
    category: 'ext',
    runner: 'cli',
    i18n: { 'zh-TW': '管理 MCP server', zh: '管理 MCP 服务器' },
  },
  {
    name: 'extensions',
    description: 'List / install extensions',
    category: 'ext',
    runner: 'cli',
    i18n: { 'zh-TW': '列出 / 安裝擴充功能', zh: '列出 / 安装扩展' },
  },

  {
    name: 'init',
    description: 'Initialize QWEN.md for this project',
    category: 'setup',
    runner: 'cli',
    i18n: { 'zh-TW': '為此專案初始化 QWEN.md', zh: '为此项目初始化 QWEN.md' },
  },
  {
    name: 'ide',
    description: 'Connect to IDE companion',
    category: 'setup',
    runner: 'cli',
    i18n: { 'zh-TW': '連線到 IDE 伴隨程式', zh: '连接到 IDE 伙伴' },
  },
  {
    name: 'setup-gateway',
    description: 'Set up messaging gateway (Telegram, etc.)',
    category: 'setup',
    runner: 'cli',
    i18n: { 'zh-TW': '設定訊息 gateway（Telegram 等）', zh: '设置消息网关' },
  },
  {
    name: 'setup-github',
    description: 'Set up GitHub integration',
    category: 'setup',
    runner: 'cli',
    i18n: { 'zh-TW': '設定 GitHub 整合', zh: '设置 GitHub 集成' },
  },
  {
    name: 'directory',
    description: 'Add a directory to the include list',
    category: 'setup',
    runner: 'cli',
    i18n: { 'zh-TW': '新增目錄到包含清單', zh: '添加目录到包含列表' },
  },
  {
    name: 'trust',
    description: 'Manage folder trust',
    category: 'setup',
    runner: 'cli',
    i18n: { 'zh-TW': '管理資料夾信任設定', zh: '管理文件夹信任' },
  },

  {
    name: 'bug',
    description: 'Report a bug',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '回報 bug', zh: '报告 bug' },
  },
  {
    name: 'btw',
    description: 'Quick note / side remark',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '順便一提 / 附註', zh: '顺便说一下 / 附注' },
  },
  {
    name: 'insight',
    description: 'Open insight panel',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '開啟洞察面板', zh: '打开洞察面板' },
  },
  {
    name: 'statusline',
    description: 'Configure status line',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '設定狀態列', zh: '配置状态栏' },
  },
  {
    name: 'vim',
    description: 'Toggle vim keybindings',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '切換 vim 快捷鍵', zh: '切换 vim 快捷键' },
  },
  {
    name: 'quit',
    description: 'Exit Qwen Code',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '結束 Qwen Code', zh: '退出 Qwen Code' },
  },
  {
    name: 'reload',
    description: 'Reload extensions / config',
    category: 'misc',
    runner: 'cli',
    i18n: { 'zh-TW': '重新載入擴充功能 / 設定', zh: '重新加载扩展 / 配置' },
  },
];

// Normalize a locale code to the keys we actually have translations for.
function resolveLocale(lang: string | null | undefined): 'en' | 'zh-TW' | 'zh' {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  if (lower === 'zh-tw' || lower === 'zh_tw') return 'zh-TW';
  if (lower.startsWith('zh')) return 'zh';
  return 'en';
}

export function getLocalizedCommandMetadata(
  lang?: string | null,
): CommandMetadata[] {
  const locale = resolveLocale(lang);
  return COMMAND_DEFS.map(({ i18n, ...rest }) => ({
    ...rest,
    description:
      locale === 'en' ? rest.description : (i18n?.[locale] ?? rest.description),
  }));
}

export const BUILTIN_COMMAND_METADATA: CommandMetadata[] =
  getLocalizedCommandMetadata(null);
