/**
 * @license
 * Copyright 2025 Qwen team
 * SPDX-License-Identifier: Apache-2.0
 */

// Traditional Chinese (Taiwan) translations for Qwen Code CLI

export default {
  // ============================================================================
  // Help / UI Components
  // ============================================================================
  '↑ to manage attachments': '↑ 管理附件',
  '← → select, Delete to remove, ↓ to exit': '← → 選擇，Delete 刪除，↓ 退出',
  'Attachments: ': '附件：',

  'Basics:': '基本功能：',
  'Add context': '新增上下文',
  'Use {{symbol}} to specify files for context (e.g., {{example}}) to target specific files or folders.':
    '使用 {{symbol}} 指定檔案作為上下文（例如，{{example}}），用於定位特定檔案或資料夾',
  '@': '@',
  '@src/myFile.ts': '@src/myFile.ts',
  'Shell mode': 'Shell 模式',
  'YOLO mode': 'YOLO 模式',
  'plan mode': '規劃模式',
  'auto-accept edits': '自動接受編輯',
  'Accepting edits': '接受編輯',
  '(shift + tab to cycle)': '(shift + tab 切換)',
  '(tab to cycle)': '(按 tab 切換)',
  'Execute shell commands via {{symbol}} (e.g., {{example1}}) or use natural language (e.g., {{example2}}).':
    '透過 {{symbol}} 執行 shell 指令（例如，{{example1}}）或使用自然語言（例如，{{example2}}）',
  '!': '!',
  '!npm run start': '!npm run start',
  'start server': 'start server',
  'Commands:': '指令：',
  'shell command': 'shell 指令',
  'Model Context Protocol command (from external servers)':
    '模型上下文協定指令（來自外部伺服器）',
  'Keyboard Shortcuts:': '鍵盤快速鍵：',
  'Toggle this help display': '切換此說明顯示',
  'Toggle shell mode': '切換命令列模式',
  'Open command menu': '開啟指令選單',
  'Add file context': '新增檔案上下文',
  'Accept suggestion / Autocomplete': '接受建議 / 自動完成',
  'Reverse search history': '反向搜尋歷史',
  'Press ? again to close': '再次按 ? 關閉',
  'for shell mode': '命令列模式',
  'for commands': '指令選單',
  'for file paths': '檔案路徑',
  'to clear input': '清除輸入',
  'to cycle approvals': '切換核准模式',
  'to quit': '結束',
  'for newline': '換行',
  'to clear screen': '清除畫面',
  'to search history': '搜尋歷史',
  'to paste images': '貼上圖片',
  'for external editor': '外部編輯器',
  'Jump through words in the input': '在輸入中按單字跳轉',
  'Close dialogs, cancel requests, or quit application':
    '關閉對話方塊、取消請求或結束應用程式',
  'New line': '換行',
  'New line (Alt+Enter works for certain linux distros)':
    '換行（某些 Linux 發行版支援 Alt+Enter）',
  'Clear the screen': '清除畫面',
  'Open input in external editor': '在外部編輯器中開啟輸入',
  'Send message': '傳送訊息',
  'Initializing...': '正在初始化...',
  'Connecting to MCP servers... ({{connected}}/{{total}})':
    '正在連線到 MCP 伺服器... ({{connected}}/{{total}})',
  'Type your message or @path/to/file': '輸入訊息或 @ 檔案路徑',
  '? for shortcuts': '按 ? 查看快速鍵',
  "Press 'i' for INSERT mode and 'Esc' for NORMAL mode.":
    "按 'i' 進入插入模式，按 'Esc' 進入正常模式",
  'Cancel operation / Clear input (double press)':
    '取消操作 / 清除輸入（雙按）',
  'Cycle approval modes': '循環切換核准模式',
  'Cycle through your prompt history': '循環瀏覽提示歷史',
  'For a full list of shortcuts, see {{docPath}}':
    '完整快速鍵清單，請參閱 {{docPath}}',
  'docs/keyboard-shortcuts.md': 'docs/keyboard-shortcuts.md',
  'for help on Qwen Code': '取得 Qwen Code 說明',
  'show version info': '顯示版本資訊',
  'submit a bug report': '提交錯誤報告',
  'About Qwen Code': '關於 Qwen Code',
  Status: '狀態',

  // ============================================================================
  // System Information Fields
  // ============================================================================
  'Qwen Code': 'Qwen Code',
  Runtime: '執行環境',
  OS: '作業系統',
  Auth: '驗證',
  'CLI Version': 'CLI 版本',
  'Git Commit': 'Git 提交',
  Model: '模型',
  'Fast Model': '快速模型',
  Sandbox: '沙箱',
  'OS Platform': '作業系統平台',
  'OS Arch': '作業系統架構',
  'OS Release': '作業系統版本',
  'Node.js Version': 'Node.js 版本',
  'NPM Version': 'NPM 版本',
  'Session ID': '工作階段 ID',
  'Auth Method': '驗證方式',
  'Base URL': '基礎 URL',
  Proxy: '代理伺服器',
  'Memory Usage': '記憶體使用',
  'IDE Client': 'IDE 用戶端',

  // ============================================================================
  // Commands - General
  // ============================================================================
  'Analyzes the project and creates a tailored QWEN.md file.':
    '分析專案並建立客製化的 QWEN.md 檔案',
  'List available Qwen Code tools. Usage: /tools [desc]':
    '列出可用的 Qwen Code 工具。用法：/tools [desc]',
  'List available skills.': '列出可用技能。',
  'Available Qwen Code CLI tools:': '可用的 Qwen Code CLI 工具：',
  'No tools available': '沒有可用工具',
  'View or change the approval mode for tool usage':
    '檢視或變更工具使用的核准模式',
  'Invalid approval mode "{{arg}}". Valid modes: {{modes}}':
    '無效的核准模式 "{{arg}}"。有效模式：{{modes}}',
  'Approval mode set to "{{mode}}"': '核准模式已設定為 "{{mode}}"',
  'View or change the language setting': '檢視或變更語言設定',
  'change the theme': '變更佈景主題',
  'Select Theme': '選擇佈景主題',
  Preview: '預覽',
  '(Use Enter to select, Tab to configure scope)':
    '（使用 Enter 選擇，Tab 設定範圍）',
  '(Use Enter to apply scope, Tab to go back)':
    '（使用 Enter 套用範圍，Tab 返回）',
  'Theme configuration unavailable due to NO_COLOR env variable.':
    '由於 NO_COLOR 環境變數，佈景主題設定不可用。',
  'Theme "{{themeName}}" not found.': '找不到佈景主題 "{{themeName}}"。',
  'Theme "{{themeName}}" not found in selected scope.':
    '在所選範圍中找不到佈景主題 "{{themeName}}"。',
  'Clear conversation history and free up context': '清除對話歷史並釋放上下文',
  'Compresses the context by replacing it with a summary.':
    '以摘要取代方式壓縮上下文',
  'open full Qwen Code documentation in your browser':
    '在瀏覽器中開啟完整的 Qwen Code 文件',
  'Configuration not available.': '設定不可用',
  'change the auth method': '變更驗證方法',
  'Configure authentication information for login': '設定登入驗證資訊',
  'Copy the last result or code snippet to clipboard':
    '將最後的結果或程式碼片段複製到剪貼簿',

  // ============================================================================
  // Commands - Agents
  // ============================================================================
  'Manage subagents for specialized task delegation.':
    '管理用於專門任務委派的子代理',
  'Manage existing subagents (view, edit, delete).':
    '管理現有子代理（檢視、編輯、刪除）',
  'Create a new subagent with guided setup.': '透過引導式設定建立新的子代理',

  // ============================================================================
  // Agents - Management Dialog
  // ============================================================================
  Agents: '智慧代理',
  'Choose Action': '選擇操作',
  'Edit {{name}}': '編輯 {{name}}',
  'Edit Tools: {{name}}': '編輯工具: {{name}}',
  'Edit Color: {{name}}': '編輯色彩: {{name}}',
  'Delete {{name}}': '刪除 {{name}}',
  'Unknown Step': '未知步驟',
  'Esc to close': '按 Esc 關閉',
  'Enter to select, ↑↓ to navigate, Esc to close':
    'Enter 選擇，↑↓ 導覽，Esc 關閉',
  'Esc to go back': '按 Esc 返回',
  'Enter to confirm, Esc to cancel': 'Enter 確認，Esc 取消',
  'Enter to select, ↑↓ to navigate, Esc to go back':
    'Enter 選擇，↑↓ 導覽，Esc 返回',
  'Enter to submit, Esc to go back': 'Enter 提交，Esc 返回',
  'Invalid step: {{step}}': '無效步驟: {{step}}',
  'No subagents found.': '找不到子代理。',
  "Use '/agents create' to create your first subagent.":
    "使用 '/agents create' 建立您的第一個子代理。",
  '(built-in)': '（內建）',
  '(overridden by project level agent)': '（已被專案層級代理覆寫）',
  'Project Level ({{path}})': '專案層級 ({{path}})',
  'User Level ({{path}})': '使用者層級 ({{path}})',
  'Built-in Agents': '內建代理',
  'Extension Agents': '延伸功能代理',
  'Using: {{count}} agents': '使用中: {{count}} 個代理',
  'View Agent': '檢視代理',
  'Edit Agent': '編輯代理',
  'Delete Agent': '刪除代理',
  Back: '返回',
  'No agent selected': '未選擇代理',
  'File Path: ': '檔案路徑: ',
  'Tools: ': '工具: ',
  'Color: ': '色彩: ',
  'Description:': '描述:',
  'System Prompt:': '系統提示:',
  'Open in editor': '在編輯器中開啟',
  'Edit tools': '編輯工具',
  'Edit color': '編輯色彩',
  '❌ Error:': '❌ 錯誤:',
  'Are you sure you want to delete agent "{{name}}"?':
    '您確定要刪除代理 "{{name}}" 嗎？',

  // ============================================================================
  // Agents - Creation Wizard
  // ============================================================================
  'Project Level (.qwen/agents/)': '專案層級 (.qwen/agents/)',
  'User Level (~/.qwen/agents/)': '使用者層級 (~/.qwen/agents/)',
  '✅ Subagent Created Successfully!': '✅ 子代理建立成功！',
  'Subagent "{{name}}" has been saved to {{level}} level.':
    '子代理 "{{name}}" 已儲存至 {{level}} 層級。',
  'Name: ': '名稱: ',
  'Location: ': '位置: ',
  '❌ Error saving subagent:': '❌ 儲存子代理時發生錯誤:',
  'Warnings:': '警告:',
  'Name "{{name}}" already exists at {{level}} level - will overwrite existing subagent':
    '名稱 "{{name}}" 在 {{level}} 層級已存在 - 將覆寫現有子代理',
  'Name "{{name}}" exists at user level - project level will take precedence':
    '名稱 "{{name}}" 在使用者層級存在 - 專案層級將優先',
  'Name "{{name}}" exists at project level - existing subagent will take precedence':
    '名稱 "{{name}}" 在專案層級存在 - 現有子代理將優先',
  'Description is over {{length}} characters': '描述超過 {{length}} 個字元',
  'System prompt is over {{length}} characters':
    '系統提示超過 {{length}} 個字元',
  'Step {{n}}: Choose Location': '步驟 {{n}}: 選擇位置',
  'Step {{n}}: Choose Generation Method': '步驟 {{n}}: 選擇產生方式',
  'Generate with Qwen Code (Recommended)': '使用 Qwen Code 產生（建議）',
  'Manual Creation': '手動建立',
  'Describe what this subagent should do and when it should be used. (Be comprehensive for best results)':
    '描述此子代理應做什麼及何時使用。（為獲得最佳結果，請全面描述）',
  'e.g., Expert code reviewer that reviews code based on best practices...':
    '例如：專業的程式碼審查員，根據最佳實務審查程式碼...',
  'Generating subagent configuration...': '正在產生子代理設定...',
  'Failed to generate subagent: {{error}}': '產生子代理失敗: {{error}}',
  'Step {{n}}: Describe Your Subagent': '步驟 {{n}}: 描述您的子代理',
  'Step {{n}}: Enter Subagent Name': '步驟 {{n}}: 輸入子代理名稱',
  'Step {{n}}: Enter System Prompt': '步驟 {{n}}: 輸入系統提示',
  'Step {{n}}: Enter Description': '步驟 {{n}}: 輸入描述',
  'Step {{n}}: Select Tools': '步驟 {{n}}: 選擇工具',
  'All Tools (Default)': '所有工具（預設）',
  'All Tools': '所有工具',
  'Read-only Tools': '唯讀工具',
  'Read & Edit Tools': '讀取和編輯工具',
  'Read & Edit & Execution Tools': '讀取、編輯和執行工具',
  'All tools selected, including MCP tools': '已選擇所有工具，包括 MCP 工具',
  'Selected tools:': '已選擇的工具:',
  'Read-only tools:': '唯讀工具:',
  'Edit tools:': '編輯工具:',
  'Execution tools:': '執行工具:',
  'Step {{n}}: Choose Background Color': '步驟 {{n}}: 選擇背景色彩',
  'Step {{n}}: Confirm and Save': '步驟 {{n}}: 確認並儲存',
  'Esc to cancel': '按 Esc 取消',
  'Press Enter to save, e to save and edit, Esc to go back':
    '按 Enter 儲存，e 儲存並編輯，Esc 返回',
  'Press Enter to continue, {{navigation}}Esc to {{action}}':
    '按 Enter 繼續，{{navigation}}Esc {{action}}',
  cancel: '取消',
  'go back': '返回',
  '↑↓ to navigate, ': '↑↓ 導覽，',
  'Enter a clear, unique name for this subagent.':
    '為此子代理輸入一個清晰、唯一的名稱。',
  'e.g., Code Reviewer': '例如：程式碼審查員',
  'Name cannot be empty.': '名稱不能為空。',
  "Write the system prompt that defines this subagent's behavior. Be comprehensive for best results.":
    '撰寫定義此子代理行為的系統提示。為獲得最佳結果，請全面描述。',
  'e.g., You are an expert code reviewer...':
    '例如：您是一位專業的程式碼審查員...',
  'System prompt cannot be empty.': '系統提示不能為空。',
  'Describe when and how this subagent should be used.':
    '描述何時及如何使用此子代理。',
  'e.g., Reviews code for best practices and potential bugs.':
    '例如：審查程式碼以尋找最佳實務和潛在錯誤。',
  'Description cannot be empty.': '描述不能為空。',
  'Failed to launch editor: {{error}}': '啟動編輯器失敗: {{error}}',
  'Failed to save and edit subagent: {{error}}':
    '儲存並編輯子代理失敗: {{error}}',

  // ============================================================================
  // Extensions - Management Dialog
  // ============================================================================
  'Manage Extensions': '管理延伸功能',
  'Extension Details': '延伸功能詳細資訊',
  'View Extension': '檢視延伸功能',
  'Update Extension': '更新延伸功能',
  'Disable Extension': '停用延伸功能',
  'Enable Extension': '啟用延伸功能',
  'Uninstall Extension': '解除安裝延伸功能',
  'Select Scope': '選擇範圍',
  'User Scope': '使用者範圍',
  'Workspace Scope': '工作區範圍',
  'No extensions found.': '找不到延伸功能。',
  Active: '已啟用',
  Disabled: '已停用',
  'Update available': '有可用更新',
  'Up to date': '已是最新',
  'Checking...': '檢查中...',
  'Updating...': '更新中...',
  Unknown: '未知',
  Error: '錯誤',
  'Version:': '版本：',
  'Status:': '狀態：',
  'Are you sure you want to uninstall extension "{{name}}"?':
    '確定要解除安裝延伸功能 "{{name}}" 嗎？',
  'This action cannot be undone.': '此操作無法復原。',
  'Extension "{{name}}" disabled successfully.':
    '延伸功能 "{{name}}" 已成功停用。',
  'Extension "{{name}}" enabled successfully.':
    '延伸功能 "{{name}}" 已成功啟用。',
  'Extension "{{name}}" updated successfully.':
    '延伸功能 "{{name}}" 已成功更新。',
  'Failed to update extension "{{name}}": {{error}}':
    '更新延伸功能 "{{name}}" 失敗：{{error}}',
  'Select the scope for this action:': '選擇此操作的範圍：',
  'User - Applies to all projects': '使用者 - 套用至所有專案',
  'Workspace - Applies to current project only': '工作區 - 僅套用至目前專案',
  'Name:': '名稱：',
  'MCP Servers:': 'MCP 伺服器：',
  'Settings:': '設定：',
  active: '已啟用',
  'View Details': '檢視詳細資訊',
  'Update failed:': '更新失敗：',
  'Updating {{name}}...': '正在更新 {{name}}...',
  'Update complete!': '更新完成！',
  'User (global)': '使用者（全域）',
  'Workspace (project-specific)': '工作區（專案特定）',
  'Disable "{{name}}" - Select Scope': '停用 "{{name}}" - 選擇範圍',
  'Enable "{{name}}" - Select Scope': '啟用 "{{name}}" - 選擇範圍',
  'No extension selected': '未選擇延伸功能',
  'Press Y/Enter to confirm, N/Esc to cancel': '按 Y/Enter 確認，N/Esc 取消',
  'Y/Enter to confirm, N/Esc to cancel': 'Y/Enter 確認，N/Esc 取消',
  '{{count}} extensions installed': '已安裝 {{count}} 個延伸功能',
  "Use '/extensions install' to install your first extension.":
    "使用 '/extensions install' 安裝您的第一個延伸功能。",
  'up to date': '已是最新',
  'update available': '有可用更新',
  'checking...': '檢查中...',
  'not updatable': '無法更新',
  error: '錯誤',

  // ============================================================================
  // Commands - General (continued)
  // ============================================================================
  'View and edit Qwen Code settings': '檢視和編輯 Qwen Code 設定',
  Settings: '設定',
  'To see changes, Qwen Code must be restarted. Press r to exit and apply changes now.':
    '要查看變更，必須重新啟動 Qwen Code。按 r 結束並立即套用變更。',
  'The command "/{{command}}" is not supported in non-interactive mode.':
    '不支援在非互動模式下使用指令 "/{{command}}"。',

  // ============================================================================
  // Settings Labels
  // ============================================================================
  'Vim Mode': 'Vim 模式',
  'Disable Auto Update': '停用自動更新',
  'Attribution: commit': '署名：提交',
  'Terminal Bell Notification': '終端機響鈴通知',
  'Enable Usage Statistics': '啟用使用統計',
  Theme: '佈景主題',
  'Preferred Editor': '慣用編輯器',
  'Auto-connect to IDE': '自動連線至 IDE',
  'Enable Prompt Completion': '啟用提示完成',
  'Debug Keystroke Logging': '除錯按鍵記錄',
  'Language: UI': '語言：介面',
  'Language: Model': '語言：模型',
  'Output Format': '輸出格式',
  'Hide Window Title': '隱藏視窗標題',
  'Show Status in Title': '在標題中顯示狀態',
  'Hide Tips': '隱藏提示',
  'Show Line Numbers in Code': '在程式碼中顯示行號',
  'Show Citations': '顯示引用',
  'Custom Witty Phrases': '自訂詼諧短語',
  'Show Welcome Back Dialog': '顯示歡迎回來對話方塊',
  'Enable User Feedback': '啟用使用者意見反應',
  'How is Qwen doing this session? (optional)': 'Qwen 這次表現如何？（選填）',
  Bad: '不滿意',
  Fine: '還行',
  Good: '滿意',
  Dismiss: '忽略',
  'Not Sure Yet': '暫不評價',
  'Any other key': '任意其他鍵',
  'Disable Loading Phrases': '停用載入短語',
  'Screen Reader Mode': '螢幕閱讀器模式',
  'IDE Mode': 'IDE 模式',
  'Max Session Turns': '最大工作階段輪次',
  'Skip Next Speaker Check': '略過下一個說話者檢查',
  'Skip Loop Detection': '略過迴圈偵測',
  'Skip Startup Context': '略過啟動上下文',
  'Enable OpenAI Logging': '啟用 OpenAI 記錄',
  'OpenAI Logging Directory': 'OpenAI 記錄目錄',
  Timeout: '逾時',
  'Max Retries': '最大重試次數',
  'Disable Cache Control': '停用快取控制',
  'Memory Discovery Max Dirs': '記憶體探索最大目錄數',
  'Load Memory From Include Directories': '從包含目錄載入記憶體',
  'Respect .gitignore': '遵守 .gitignore',
  'Respect .qwenignore': '遵守 .qwenignore',
  'Enable Recursive File Search': '啟用遞迴檔案搜尋',
  'Disable Fuzzy Search': '停用模糊搜尋',
  'Interactive Shell (PTY)': '互動式 Shell (PTY)',
  'Show Color': '顯示色彩',
  'Auto Accept': '自動接受',
  'Use Ripgrep': '使用 Ripgrep',
  'Use Builtin Ripgrep': '使用內建 Ripgrep',
  'Enable Tool Output Truncation': '啟用工具輸出截斷',
  'Tool Output Truncation Threshold': '工具輸出截斷閾值',
  'Tool Output Truncation Lines': '工具輸出截斷行數',
  'Folder Trust': '資料夾信任',
  'Vision Model Preview': '視覺模型預覽',
  'Tool Schema Compliance': '工具 Schema 相容性',
  'Auto (detect from system)': '自動（從系統偵測）',
  Text: '文字',
  JSON: 'JSON',
  Plan: '規劃',
  Default: '預設',
  'Auto Edit': '自動編輯',
  YOLO: 'YOLO',
  'toggle vim mode on/off': '切換 vim 模式開關',
  'check session stats. Usage: /stats [model|tools]':
    '檢查工作階段統計資訊。用法：/stats [model|tools]',
  'Show model-specific usage statistics.': '顯示模型相關的使用統計資訊',
  'Show tool-specific usage statistics.': '顯示工具相關的使用統計資訊',
  'exit the cli': '結束命令列介面',
  'Open MCP management dialog, or authenticate with OAuth-enabled servers':
    '開啟 MCP 管理對話方塊，或向支援 OAuth 的伺服器進行驗證',
  'List configured MCP servers and tools, or authenticate with OAuth-enabled servers':
    '列出已設定的 MCP 伺服器和工具，或向支援 OAuth 的伺服器進行驗證',
  'Manage workspace directories': '管理工作區目錄',
  'Add directories to the workspace. Use comma to separate multiple paths':
    '將目錄新增至工作區。使用逗號分隔多個路徑',
  'Show all directories in the workspace': '顯示工作區中的所有目錄',
  'set external editor preference': '設定外部編輯器慣好',
  'Select Editor': '選擇編輯器',
  'Editor Preference': '編輯器慣好',
  'These editors are currently supported. Please note that some editors cannot be used in sandbox mode.':
    '目前支援以下編輯器。請注意，某些編輯器無法在沙箱模式下使用。',
  'Your preferred editor is:': '您的慣用編輯器是：',
  'Manage extensions': '管理延伸功能',
  'Manage installed extensions': '管理已安裝的延伸功能',
  'List active extensions': '列出作用中的延伸功能',
  'Update extensions. Usage: update <extension-names>|--all':
    '更新延伸功能。用法：update <extension-names>|--all',
  'Disable an extension': '停用延伸功能',
  'Enable an extension': '啟用延伸功能',
  'Install an extension from a git repo or local path':
    '從 Git 存放庫或本機路徑安裝延伸功能',
  'Uninstall an extension': '解除安裝延伸功能',
  'No extensions installed.': '未安裝延伸功能。',
  'Usage: /extensions update <extension-names>|--all':
    '用法：/extensions update <延伸功能名稱>|--all',
  'Extension "{{name}}" not found.': '找不到延伸功能 "{{name}}"。',
  'No extensions to update.': '沒有可更新的延伸功能。',
  'Usage: /extensions install <source>': '用法：/extensions install <來源>',
  'Installing extension from "{{source}}"...':
    '正在從 "{{source}}" 安裝延伸功能...',
  'Extension "{{name}}" installed successfully.':
    '延伸功能 "{{name}}" 安裝成功。',
  'Failed to install extension from "{{source}}": {{error}}':
    '從 "{{source}}" 安裝延伸功能失敗：{{error}}',
  'Usage: /extensions uninstall <extension-name>':
    '用法：/extensions uninstall <延伸功能名稱>',
  'Uninstalling extension "{{name}}"...': '正在解除安裝延伸功能 "{{name}}"...',
  'Extension "{{name}}" uninstalled successfully.':
    '延伸功能 "{{name}}" 解除安裝成功。',
  'Failed to uninstall extension "{{name}}": {{error}}':
    '解除安裝延伸功能 "{{name}}" 失敗：{{error}}',
  'Usage: /extensions {{command}} <extension> [--scope=<user|workspace>]':
    '用法：/extensions {{command}} <延伸功能> [--scope=<user|workspace>]',
  'Unsupported scope "{{scope}}", should be one of "user" or "workspace"':
    '不支援的範圍 "{{scope}}"，應為 "user" 或 "workspace"',
  'Extension "{{name}}" disabled for scope "{{scope}}"':
    '延伸功能 "{{name}}" 已在範圍 "{{scope}}" 中停用',
  'Extension "{{name}}" enabled for scope "{{scope}}"':
    '延伸功能 "{{name}}" 已在範圍 "{{scope}}" 中啟用',
  'Do you want to continue? [Y/n]: ': '是否繼續？[Y/n]：',
  'Do you want to continue?': '是否繼續？',
  'Installing extension "{{name}}".': '正在安裝延伸功能 "{{name}}"。',
  '**Extensions may introduce unexpected behavior. Ensure you have investigated the extension source and trust the author.**':
    '**延伸功能可能會引入非預期行為。請確保您已調查過延伸功能來源並信任作者。**',
  'This extension will run the following MCP servers:':
    '此延伸功能將執行以下 MCP 伺服器：',
  local: '本機',
  remote: '遠端',
  'This extension will add the following commands: {{commands}}.':
    '此延伸功能將新增以下指令：{{commands}}。',
  'This extension will append info to your QWEN.md context using {{fileName}}':
    '此延伸功能將使用 {{fileName}} 向您的 QWEN.md 上下文附加資訊',
  'This extension will exclude the following core tools: {{tools}}':
    '此延伸功能將排除以下核心工具：{{tools}}',
  'This extension will install the following skills:':
    '此延伸功能將安裝以下技能：',
  'This extension will install the following subagents:':
    '此延伸功能將安裝以下子代理：',
  'Installation cancelled for "{{name}}".': '已取消安裝 "{{name}}"。',
  'You are installing an extension from {{originSource}}. Some features may not work perfectly with Qwen Code.':
    '您正在從 {{originSource}} 安裝延伸功能。某些功能可能無法與 Qwen Code 完美相容。',
  '--ref and --auto-update are not applicable for marketplace extensions.':
    '--ref 和 --auto-update 不適用於市集延伸功能。',
  'Extension "{{name}}" installed successfully and enabled.':
    '延伸功能 "{{name}}" 安裝成功並已啟用。',
  'Installs an extension from a git repository URL, local path, or claude marketplace (marketplace-url:plugin-name).':
    '從 Git 存放庫 URL、本機路徑或 Claude 市集（marketplace-url:plugin-name）安裝延伸功能。',
  'The github URL, local path, or marketplace source (marketplace-url:plugin-name) of the extension to install.':
    '要安裝的延伸功能的 GitHub URL、本機路徑或市集來源（marketplace-url:plugin-name）。',
  'The git ref to install from.': '要安裝的 Git 參考。',
  'Enable auto-update for this extension.': '為此延伸功能啟用自動更新。',
  'Enable pre-release versions for this extension.':
    '為此延伸功能啟用預先發行版本。',
  'Acknowledge the security risks of installing an extension and skip the confirmation prompt.':
    '確認安裝延伸功能的安全風險並略過確認提示。',
  'The source argument must be provided.': '必須提供來源引數。',
  'Extension "{{name}}" successfully uninstalled.':
    '延伸功能 "{{name}}" 解除安裝成功。',
  'Uninstalls an extension.': '解除安裝延伸功能。',
  'The name or source path of the extension to uninstall.':
    '要解除安裝的延伸功能的名稱或來源路徑。',
  'Please include the name of the extension to uninstall as a positional argument.':
    '請將要解除安裝的延伸功能名稱作為位置引數。',
  'Enables an extension.': '啟用延伸功能。',
  'The name of the extension to enable.': '要啟用的延伸功能名稱。',
  'The scope to enable the extenison in. If not set, will be enabled in all scopes.':
    '啟用延伸功能的範圍。如果未設定，將在所有範圍中啟用。',
  'Extension "{{name}}" successfully enabled for scope "{{scope}}".':
    '延伸功能 "{{name}}" 已在範圍 "{{scope}}" 中啟用。',
  'Extension "{{name}}" successfully enabled in all scopes.':
    '延伸功能 "{{name}}" 已在所有範圍中啟用。',
  'Invalid scope: {{scope}}. Please use one of {{scopes}}.':
    '無效的範圍：{{scope}}。請使用 {{scopes}} 之一。',
  'Disables an extension.': '停用延伸功能。',
  'The name of the extension to disable.': '要停用的延伸功能名稱。',
  'The scope to disable the extenison in.': '停用延伸功能的範圍。',
  'Extension "{{name}}" successfully disabled for scope "{{scope}}".':
    '延伸功能 "{{name}}" 已在範圍 "{{scope}}" 中停用。',
  'Extension "{{name}}" successfully updated: {{oldVersion}} → {{newVersion}}.':
    '延伸功能 "{{name}}" 更新成功：{{oldVersion}} → {{newVersion}}。',
  'Unable to install extension "{{name}}" due to missing install metadata':
    '由於缺少安裝中繼資料，無法安裝延伸功能 "{{name}}"',
  'Extension "{{name}}" is already up to date.':
    '延伸功能 "{{name}}" 已是最新版本。',
  'Updates all extensions or a named extension to the latest version.':
    '將所有延伸功能或指定延伸功能更新至最新版本。',
  'The name of the extension to update.': '要更新的延伸功能名稱。',
  'Update all extensions.': '更新所有延伸功能。',
  'Either an extension name or --all must be provided':
    '必須提供延伸功能名稱或 --all',
  'Lists installed extensions.': '列出已安裝的延伸功能。',
  'Path:': '路徑：',
  'Source:': '來源：',
  'Type:': '類型：',
  'Ref:': '參考：',
  'Release tag:': '發行標籤：',
  'Enabled (User):': '已啟用（使用者）：',
  'Enabled (Workspace):': '已啟用（工作區）：',
  'Context files:': '上下文檔案：',
  'Skills:': '技能：',
  'Agents:': '代理：',
  'MCP servers:': 'MCP 伺服器：',
  'Link extension failed to install.': '連結延伸功能安裝失敗。',
  'Extension "{{name}}" linked successfully and enabled.':
    '延伸功能 "{{name}}" 連結成功並已啟用。',
  'Links an extension from a local path. Updates made to the local path will always be reflected.':
    '從本機路徑連結延伸功能。對本機路徑的更新將始終反映。',
  'The name of the extension to link.': '要連結的延伸功能名稱。',
  'Set a specific setting for an extension.': '為延伸功能設定特定設定。',
  'Name of the extension to configure.': '要設定的延伸功能名稱。',
  'The setting to configure (name or env var).':
    '要設定的項目（名稱或環境變數）。',
  'The scope to set the setting in.': '設定設定的範圍。',
  'List all settings for an extension.': '列出延伸功能的所有設定。',
  'Name of the extension.': '延伸功能名稱。',
  'Extension "{{name}}" has no settings to configure.':
    '延伸功能 "{{name}}" 沒有可設定的設定。',
  'Settings for "{{name}}":': '"{{name}}" 的設定：',
  '(workspace)': '（工作區）',
  '(user)': '（使用者）',
  '[not set]': '［未設定］',
  '[value stored in keychain]': '［值儲存在金鑰鏈中］',
  'Manage extension settings.': '管理延伸功能設定。',
  'You need to specify a command (set or list).':
    '您需要指定指令（set 或 list）。',

  // ============================================================================
  // Plugin Choice / Marketplace
  // ============================================================================
  'No plugins available in this marketplace.': '此市集中沒有可用的外掛程式。',
  'Select a plugin to install from marketplace "{{name}}":':
    '從市集 "{{name}}" 中選擇要安裝的外掛程式：',
  'Plugin selection cancelled.': '外掛程式選擇已取消。',
  'Select a plugin from "{{name}}"': '從 "{{name}}" 中選擇外掛程式',
  'Use ↑↓ or j/k to navigate, Enter to select, Escape to cancel':
    '使用 ↑↓ 或 j/k 導覽，Enter 選擇，Escape 取消',
  '{{count}} more above': '上方還有 {{count}} 項',
  '{{count}} more below': '下方還有 {{count}} 項',
  'manage IDE integration': '管理 IDE 整合',
  'check status of IDE integration': '檢查 IDE 整合狀態',
  'install required IDE companion for {{ideName}}':
    '安裝 {{ideName}} 所需的 IDE 配套工具',
  'enable IDE integration': '啟用 IDE 整合',
  'disable IDE integration': '停用 IDE 整合',
  'IDE integration is not supported in your current environment. To use this feature, run Qwen Code in one of these supported IDEs: VS Code or VS Code forks.':
    '您目前的環境不支援 IDE 整合。要使用此功能，請在以下支援的 IDE 之一中執行 Qwen Code：VS Code 或 VS Code 衍生版本。',
  'Set up GitHub Actions': '設定 GitHub Actions',
  'Configure terminal keybindings for multiline input (VS Code, Cursor, Windsurf, Trae)':
    '設定終端機按鍵繫結以支援多行輸入（VS Code、Cursor、Windsurf、Trae）',
  'Please restart your terminal for the changes to take effect.':
    '請重新啟動終端機以使變更生效。',
  'Failed to configure terminal: {{error}}': '設定終端機失敗：{{error}}',
  'Could not determine {{terminalName}} config path on Windows: APPDATA environment variable is not set.':
    '無法確定 {{terminalName}} 在 Windows 上的設定路徑：未設定 APPDATA 環境變數。',
  '{{terminalName}} keybindings.json exists but is not a valid JSON array. Please fix the file manually or delete it to allow automatic configuration.':
    '{{terminalName}} keybindings.json 存在但不是有效的 JSON 陣列。請手動修正檔案或刪除它以允許自動設定。',
  'File: {{file}}': '檔案：{{file}}',
  'Failed to parse {{terminalName}} keybindings.json. The file contains invalid JSON. Please fix the file manually or delete it to allow automatic configuration.':
    '解析 {{terminalName}} keybindings.json 失敗。檔案包含無效的 JSON。請手動修正檔案或刪除它以允許自動設定。',
  'Error: {{error}}': '錯誤：{{error}}',
  'Shift+Enter binding already exists': 'Shift+Enter 繫結已存在',
  'Ctrl+Enter binding already exists': 'Ctrl+Enter 繫結已存在',
  'Existing keybindings detected. Will not modify to avoid conflicts.':
    '偵測到現有按鍵繫結。為避免衝突，不會修改。',
  'Please check and modify manually if needed: {{file}}':
    '如有需要，請手動檢查並修改：{{file}}',
  'Added Shift+Enter and Ctrl+Enter keybindings to {{terminalName}}.':
    '已為 {{terminalName}} 新增 Shift+Enter 和 Ctrl+Enter 按鍵繫結。',
  'Modified: {{file}}': '已修改：{{file}}',
  '{{terminalName}} keybindings already configured.':
    '{{terminalName}} 按鍵繫結已設定。',
  'Failed to configure {{terminalName}}.': '設定 {{terminalName}} 失敗。',
  'Your terminal is already configured for an optimal experience with multiline input (Shift+Enter and Ctrl+Enter).':
    '您的終端機已設定為支援多行輸入（Shift+Enter 和 Ctrl+Enter）的最佳體驗。',

  // ============================================================================
  // Commands - Hooks
  // ============================================================================
  'Manage Qwen Code hooks': '管理 Qwen Code Hook',
  'List all configured hooks': '列出所有已設定的 Hook',
  'Enable a disabled hook': '啟用已停用的 Hook',
  'Disable an active hook': '停用已啟用的 Hook',
  Hooks: 'Hook',
  'Loading hooks...': '正在載入 Hook...',
  'Error loading hooks:': '載入 Hook 發生錯誤：',
  'Press Escape to close': '按 Escape 關閉',
  'Press Escape, Ctrl+C, or Ctrl+D to cancel':
    '按 Escape、Ctrl+C 或 Ctrl+D 取消',
  'Press Space, Enter, or Escape to dismiss': '按空格、Enter 或 Escape 關閉',
  'No hook selected': '未選擇 Hook',
  'No hook events found.': '找不到 Hook 事件。',
  '{{count}} hook configured': '{{count}} 個 Hook 已設定',
  '{{count}} hooks configured': '{{count}} 個 Hook 已設定',
  'This menu is read-only. To add or modify hooks, edit settings.json directly or ask Qwen Code.':
    '此選單為唯讀。要新增或修改 Hook，請直接編輯 settings.json 或詢問 Qwen Code。',
  'Enter to select · Esc to cancel': 'Enter 選擇 · Esc 取消',
  'Exit codes:': '結束代碼：',
  'Configured hooks:': '已設定的 Hook：',
  'No hooks configured for this event.': '此事件未設定 Hook。',
  'To add hooks, edit settings.json directly or ask Qwen.':
    '要新增 Hook，請直接編輯 settings.json 或詢問 Qwen。',
  'Enter to select · Esc to go back': 'Enter 選擇 · Esc 返回',
  'Hook details': 'Hook 詳細資訊',
  'Event:': '事件：',
  'Extension:': '延伸功能：',
  'Desc:': '描述：',
  'No hook config selected': '未選擇 Hook 設定',
  'To modify or remove this hook, edit settings.json directly or ask Qwen to help.':
    '要修改或移除此 Hook，請直接編輯 settings.json 或詢問 Qwen。',
  'Hook Configuration - Disabled': 'Hook 設定 - 已停用',
  'All hooks are currently disabled. You have {{count}} that are not running.':
    '所有 Hook 目前已停用。您有 {{count}} 個未執行中。',
  '{{count}} configured hook': '{{count}} 個已設定的 Hook',
  '{{count}} configured hooks': '{{count}} 個已設定的 Hook',
  'When hooks are disabled:': '當 Hook 被停用時：',
  'No hook commands will execute': '不會執行任何 Hook 指令',
  'StatusLine will not be displayed': '不會顯示狀態列',
  'Tool operations will proceed without hook validation':
    '工具操作將在沒有 Hook 驗證的情況下繼續',
  'To re-enable hooks, remove "disableAllHooks" from settings.json or ask Qwen Code.':
    '要重新啟用 Hook，請從 settings.json 中移除 "disableAllHooks" 或詢問 Qwen Code。',
  Project: '專案',
  User: '使用者',
  System: '系統',
  Extension: '延伸功能',
  'Local Settings': '本機設定',
  'User Settings': '使用者設定',
  'System Settings': '系統設定',
  Extensions: '延伸功能',
  '✓ Enabled': '✓ 已啟用',
  '✗ Disabled': '✗ 已停用',
  'Before tool execution': '工具執行前',
  'After tool execution': '工具執行後',
  'After tool execution fails': '工具執行失敗後',
  'When notifications are sent': '傳送通知時',
  'When the user submits a prompt': '使用者提交提示時',
  'When a new session is started': '新工作階段開始時',
  'Right before Qwen Code concludes its response': 'Qwen Code 結束回應之前',
  'When a subagent (Agent tool call) is started':
    '子代理（Agent 工具呼叫）啟動時',
  'Right before a subagent concludes its response': '子代理結束回應之前',
  'Before conversation compaction': '對話壓縮前',
  'When a session is ending': '工作階段結束時',
  'When a permission dialog is displayed': '顯示權限對話方塊時',
  'Input to command is JSON of tool call arguments.':
    '指令輸入為工具呼叫引數的 JSON。',
  'Input to command is JSON with fields "inputs" (tool call arguments) and "response" (tool call response).':
    '指令輸入為包含 "inputs"（工具呼叫引數）和 "response"（工具呼叫回應）欄位的 JSON。',
  'Input to command is JSON with tool_name, tool_input, tool_use_id, error, error_type, is_interrupt, and is_timeout.':
    '指令輸入為包含 tool_name、tool_input、tool_use_id、error、error_type、is_interrupt 和 is_timeout 的 JSON。',
  'Input to command is JSON with notification message and type.':
    '指令輸入為包含通知訊息和類型的 JSON。',
  'Input to command is JSON with original user prompt text.':
    '指令輸入為包含原始使用者提示文字的 JSON。',
  'Input to command is JSON with session start source.':
    '指令輸入為包含工作階段啟動來源的 JSON。',
  'Input to command is JSON with session end reason.':
    '指令輸入為包含工作階段結束原因的 JSON。',
  'Input to command is JSON with agent_id and agent_type.':
    '指令輸入為包含 agent_id 和 agent_type 的 JSON。',
  'Input to command is JSON with agent_id, agent_type, and agent_transcript_path.':
    '指令輸入為包含 agent_id、agent_type 和 agent_transcript_path 的 JSON。',
  'Input to command is JSON with compaction details.':
    '指令輸入為包含壓縮詳細資訊的 JSON。',
  'Input to command is JSON with tool_name, tool_input, and tool_use_id. Output JSON with hookSpecificOutput containing decision to allow or deny.':
    '指令輸入為包含 tool_name、tool_input 和 tool_use_id 的 JSON。輸出包含 hookSpecificOutput 的 JSON，其中包含允許或拒絕的決定。',
  'stdout/stderr not shown': 'stdout/stderr 不顯示',
  'show stderr to model and continue conversation':
    '向模型顯示 stderr 並繼續對話',
  'show stderr to user only': '僅向使用者顯示 stderr',
  'stdout shown in transcript mode (ctrl+o)': 'stdout 以記錄模式顯示 (ctrl+o)',
  'show stderr to model immediately': '立即向模型顯示 stderr',
  'show stderr to user only but continue with tool call':
    '僅向使用者顯示 stderr 但繼續工具呼叫',
  'block processing, erase original prompt, and show stderr to user only':
    '封鎖處理，清除原始提示，僅向使用者顯示 stderr',
  'stdout shown to Qwen': '向 Qwen 顯示 stdout',
  'show stderr to user only (blocking errors ignored)':
    '僅向使用者顯示 stderr（略過封鎖錯誤）',
  'command completes successfully': '指令成功完成',
  'stdout shown to subagent': '向子代理顯示 stdout',
  'show stderr to subagent and continue having it run':
    '向子代理顯示 stderr 並繼續執行',
  'stdout appended as custom compact instructions':
    'stdout 作為自訂壓縮指示附加',
  'block compaction': '封鎖壓縮',
  'show stderr to user only but continue with compaction':
    '僅向使用者顯示 stderr 但繼續壓縮',
  'use hook decision if provided': '如果提供則使用 Hook 決定',
  'Config not loaded.': '設定未載入。',
  'Hooks are not enabled. Enable hooks in settings to use this feature.':
    'Hook 未啟用。請在設定中啟用 Hook 以使用此功能。',
  'No hooks configured. Add hooks in your settings.json file.':
    '未設定 Hook。請在 settings.json 檔案中新增 Hook。',
  'Configured Hooks ({{count}} total)': '已設定的 Hook（共 {{count}} 個）',

  // ============================================================================
  // Commands - Session Export
  // ============================================================================
  'Export current session message history to a file':
    '將目前工作階段的訊息記錄匯出至檔案',
  'Export session to HTML format': '將工作階段匯出為 HTML 檔案',
  'Export session to JSON format': '將工作階段匯出為 JSON 檔案',
  'Export session to JSONL format (one message per line)':
    '將工作階段匯出為 JSONL 檔案（每行一則訊息）',
  'Export session to markdown format': '將工作階段匯出為 Markdown 檔案',

  // ============================================================================
  // Commands - Insights
  // ============================================================================
  'generate personalized programming insights from your chat history':
    '根據您的對話記錄產生個人化程式設計洞察',

  // ============================================================================
  // Commands - Session History
  // ============================================================================
  'Resume a previous session': '繼續先前的工作階段',
  'Restore a tool call. This will reset the conversation and file history to the state it was in when the tool call was suggested':
    '還原某次工具呼叫。這將把對話與檔案歷史重置到提出該工具呼叫建議時的狀態',
  'Could not detect terminal type. Supported terminals: VS Code, Cursor, Windsurf, and Trae.':
    '無法偵測終端機類型。支援的終端機：VS Code、Cursor、Windsurf 和 Trae。',
  'Terminal "{{terminal}}" is not supported yet.':
    '終端機 "{{terminal}}" 尚未支援。',

  // ============================================================================
  // Commands - Language
  // ============================================================================
  'Invalid language. Available: {{options}}':
    '無效的語言。可用選項：{{options}}',
  'Language subcommands do not accept additional arguments.':
    '語言子指令不接受額外引數',
  'Current UI language: {{lang}}': '目前 UI 語言：{{lang}}',
  'Current LLM output language: {{lang}}': '目前 LLM 輸出語言：{{lang}}',
  'LLM output language not set': '未設定 LLM 輸出語言',
  'Set UI language': '設定 UI 語言',
  'Set LLM output language': '設定 LLM 輸出語言',
  'Usage: /language ui [{{options}}]': '用法：/language ui [{{options}}]',
  'Usage: /language output <language>': '用法：/language output <語言>',
  'Example: /language output 中文': '範例：/language output 中文',
  'Example: /language output English': '範例：/language output English',
  'Example: /language output 日本語': '範例：/language output 日本語',
  'Example: /language output Português': '範例：/language output Português',
  'UI language changed to {{lang}}': 'UI 語言已變更為 {{lang}}',
  'LLM output language set to {{lang}}': 'LLM 輸出語言已設定為 {{lang}}',
  'LLM output language rule file generated at {{path}}':
    'LLM 輸出語言規則檔案已產生於 {{path}}',
  'Please restart the application for the changes to take effect.':
    '請重新啟動應用程式以使變更生效。',
  'Failed to generate LLM output language rule file: {{error}}':
    '產生 LLM 輸出語言規則檔案失敗：{{error}}',
  'Invalid command. Available subcommands:': '無效的指令。可用的子指令：',
  'Available subcommands:': '可用的子指令：',
  'To request additional UI language packs, please open an issue on GitHub.':
    '如需請求其他 UI 語言套件，請在 GitHub 上提交 issue',
  'Available options:': '可用選項：',
  'Set UI language to {{name}}': '將 UI 語言設定為 {{name}}',

  // ============================================================================
  // Commands - Approval Mode
  // ============================================================================
  'Tool Approval Mode': '工具核准模式',
  'Current approval mode: {{mode}}': '目前核准模式：{{mode}}',
  'Available approval modes:': '可用的核准模式：',
  'Approval mode changed to: {{mode}}': '核准模式已變更為：{{mode}}',
  'Approval mode changed to: {{mode}} (saved to {{scope}} settings{{location}})':
    '核准模式已變更為：{{mode}}（已儲存至{{scope}}設定{{location}}）',
  'Usage: /approval-mode <mode> [--session|--user|--project]':
    '用法：/approval-mode <mode> [--session|--user|--project]',
  'Scope subcommands do not accept additional arguments.':
    '範圍子指令不接受額外引數',
  'Plan mode - Analyze only, do not modify files or execute commands':
    '規劃模式 - 僅分析，不修改檔案或執行指令',
  'Default mode - Require approval for file edits or shell commands':
    '預設模式 - 需要核准檔案編輯或 shell 指令',
  'Auto-edit mode - Automatically approve file edits':
    '自動編輯模式 - 自動核准檔案編輯',
  'YOLO mode - Automatically approve all tools': 'YOLO 模式 - 自動核准所有工具',
  '{{mode}} mode': '{{mode}} 模式',
  'Settings service is not available; unable to persist the approval mode.':
    '設定服務不可用；無法持久化核准模式。',
  'Failed to save approval mode: {{error}}': '儲存核准模式失敗：{{error}}',
  'Failed to change approval mode: {{error}}': '變更核准模式失敗：{{error}}',
  'Apply to current session only (temporary)': '僅套用至目前工作階段（暫時）',
  'Persist for this project/workspace': '持久化至此專案/工作區',
  'Persist for this user on this machine': '持久化至此電腦上的此使用者',
  'Analyze only, do not modify files or execute commands':
    '僅分析，不修改檔案或執行指令',
  'Require approval for file edits or shell commands':
    '需要核准檔案編輯或 shell 指令',
  'Automatically approve file edits': '自動核准檔案編輯',
  'Automatically approve all tools': '自動核准所有工具',
  'Workspace approval mode exists and takes priority. User-level change will have no effect.':
    '工作區核准模式已存在並具有優先權。使用者層級的變更將無效。',
  'Apply To': '套用至',
  'Workspace Settings': '工作區設定',

  // ============================================================================
  // Commands - Memory
  // ============================================================================
  'Commands for interacting with memory.': '用於與記憶互動的指令',
  'Show the current memory contents.': '顯示目前記憶內容',
  'Show project-level memory contents.': '顯示專案層級記憶內容',
  'Show global memory contents.': '顯示全域記憶內容',
  'Add content to project-level memory.': '新增內容至專案層級記憶',
  'Add content to global memory.': '新增內容至全域記憶',
  'Refresh the memory from the source.': '從來源重新整理記憶',
  'Usage: /memory add --project <text to remember>':
    '用法：/memory add --project <要記住的文字>',
  'Usage: /memory add --global <text to remember>':
    '用法：/memory add --global <要記住的文字>',
  'Attempting to save to project memory: "{{text}}"':
    '正在嘗試儲存至專案記憶："{{text}}"',
  'Attempting to save to global memory: "{{text}}"':
    '正在嘗試儲存至全域記憶："{{text}}"',
  'Current memory content from {{count}} file(s):':
    '來自 {{count}} 個檔案的目前記憶內容：',
  'Memory is currently empty.': '記憶目前為空',
  'Project memory file not found or is currently empty.':
    '找不到專案記憶檔案或目前為空',
  'Global memory file not found or is currently empty.':
    '找不到全域記憶檔案或目前為空',
  'Global memory is currently empty.': '全域記憶目前為空',
  'Global memory content:\n\n---\n{{content}}\n---':
    '全域記憶內容：\n\n---\n{{content}}\n---',
  'Project memory content from {{path}}:\n\n---\n{{content}}\n---':
    '專案記憶內容來自 {{path}}：\n\n---\n{{content}}\n---',
  'Project memory is currently empty.': '專案記憶目前為空',
  'Refreshing memory from source files...': '正在從來源檔案重新整理記憶...',
  'Add content to the memory. Use --global for global memory or --project for project memory.':
    '新增內容至記憶。使用 --global 表示全域記憶，使用 --project 表示專案記憶',
  'Usage: /memory add [--global|--project] <text to remember>':
    '用法：/memory add [--global|--project] <要記住的文字>',
  'Attempting to save to memory {{scope}}: "{{fact}}"':
    '正在嘗試儲存至記憶 {{scope}}："{{fact}}"',

  // ============================================================================
  // Commands - MCP
  // ============================================================================
  'Authenticate with an OAuth-enabled MCP server':
    '向支援 OAuth 的 MCP 伺服器進行驗證',
  'List configured MCP servers and tools': '列出已設定的 MCP 伺服器和工具',
  'Restarts MCP servers.': '重新啟動 MCP 伺服器',
  'Open MCP management dialog': '開啟 MCP 管理對話方塊',
  'Could not retrieve tool registry.': '無法擷取工具登錄。',
  'No MCP servers configured with OAuth authentication.':
    '未設定支援 OAuth 驗證的 MCP 伺服器',
  'MCP servers with OAuth authentication:': '支援 OAuth 驗證的 MCP 伺服器：',
  'Use /mcp auth <server-name> to authenticate.':
    '使用 /mcp auth <server-name> 進行驗證',
  "MCP server '{{name}}' not found.": "找不到 MCP 伺服器 '{{name}}'",
  "Successfully authenticated and refreshed tools for '{{name}}'.":
    "成功驗證並重新整理了 '{{name}}' 的工具",
  "Failed to authenticate with MCP server '{{name}}': {{error}}":
    "驗證 MCP 伺服器 '{{name}}' 失敗：{{error}}",
  "Re-discovering tools from '{{name}}'...":
    "正在重新探索 '{{name}}' 的工具...",
  "Discovered {{count}} tool(s) from '{{name}}'.":
    "從 '{{name}}' 探索了 {{count}} 個工具。",
  'Authentication complete. Returning to server details...':
    '驗證完成，正在返回伺服器詳細資訊...',
  'Authentication successful.': '驗證成功。',
  'If the browser does not open, copy and paste this URL into your browser:':
    '如果瀏覽器未自動開啟，請複製以下 URL 並貼上到瀏覽器中：',
  'Make sure to copy the COMPLETE URL - it may wrap across multiple lines.':
    '⚠️  請確保複製完整的 URL —— 它可能跨越多行。',

  // ============================================================================
  // MCP Management Dialog
  // ============================================================================
  'Manage MCP servers': '管理 MCP 伺服器',
  'Server Detail': '伺服器詳細資訊',
  'Disable Server': '停用伺服器',
  Tools: '工具',
  'Tool Detail': '工具詳細資訊',
  'MCP Management': 'MCP 管理',
  'Loading...': '載入中...',
  'Unknown step': '未知步驟',
  'Esc to back': 'Esc 返回',
  '↑↓ to navigate · Enter to select · Esc to close':
    '↑↓ 導覽 · Enter 選擇 · Esc 關閉',
  '↑↓ to navigate · Enter to select · Esc to back':
    '↑↓ 導覽 · Enter 選擇 · Esc 返回',
  '↑↓ to navigate · Enter to confirm · Esc to back':
    '↑↓ 導覽 · Enter 確認 · Esc 返回',
  'User Settings (global)': '使用者設定（全域）',
  'Workspace Settings (project-specific)': '工作區設定（專案層級）',
  'Disable server:': '停用伺服器：',
  'Select where to add the server to the exclude list:':
    '選擇將伺服器新增至排除清單的位置：',
  'Press Enter to confirm, Esc to cancel': '按 Enter 確認，Esc 取消',
  'View tools': '檢視工具',
  Reconnect: '重新連線',
  Enable: '啟用',
  Disable: '停用',
  Authenticate: '驗證',
  'Re-authenticate': '重新驗證',
  'Clear Authentication': '清除驗證',
  disabled: '已停用',
  'Server:': '伺服器：',
  '(disabled)': '(已停用)',
  'Error:': '錯誤：',
  tool: '工具',
  tools: '個工具',
  connected: '已連線',
  connecting: '連線中',
  disconnected: '已中斷連線',
  'User MCPs': '使用者 MCP',
  'Project MCPs': '專案 MCP',
  'Extension MCPs': '延伸功能 MCP',
  server: '個伺服器',
  servers: '個伺服器',
  'Add MCP servers to your settings to get started.':
    '請在設定中新增 MCP 伺服器以開始使用。',
  'Run qwen --debug to see error logs': '執行 qwen --debug 查看錯誤記錄',
  'OAuth Authentication': 'OAuth 驗證',
  'Press Enter to start authentication, Esc to go back':
    '按 Enter 開始驗證，Esc 返回',
  'Authenticating... Please complete the login in your browser.':
    '驗證中... 請在瀏覽器中完成登入。',
  'Press Enter or Esc to go back': '按 Enter 或 Esc 返回',
  'Command:': '指令：',
  'Working Directory:': '工作目錄：',
  'Capabilities:': '功能：',
  'No tools available for this server.': '此伺服器沒有可用工具。',
  destructive: '破壞性',
  'read-only': '唯讀',
  'open-world': '開放世界',
  idempotent: '冪等',
  'Tools for {{name}}': '{{name}} 的工具',
  'Tools for {{serverName}}': '{{serverName}} 的工具',
  '{{current}}/{{total}}': '{{current}}/{{total}}',
  Type: '類型',
  Parameters: '參數',
  'No tool selected': '未選擇工具',
  Annotations: '備註',
  Title: '標題',
  'Read Only': '唯讀',
  Destructive: '破壞性',
  Idempotent: '冪等',
  'Open World': '開放世界',
  Server: '伺服器',
  '{{count}} invalid tools': '{{count}} 個無效工具',
  invalid: '無效',
  'invalid: {{reason}}': '無效：{{reason}}',
  'missing name': '缺少名稱',
  'missing description': '缺少描述',
  '(unnamed)': '(未命名)',
  'Warning: This tool cannot be called by the LLM':
    '警告：此工具無法被 LLM 呼叫',
  Reason: '原因',
  'Tools must have both name and description to be used by the LLM.':
    '工具必須同時具有名稱和描述才能被 LLM 使用。',

  // ============================================================================
  // Commands - Chat
  // ============================================================================
  'Manage conversation history.': '管理對話歷史',
  'List saved conversation checkpoints': '列出已儲存的對話檢查點',
  'No saved conversation checkpoints found.': '找不到已儲存的對話檢查點',
  'List of saved conversations:': '已儲存的對話清單：',
  'Note: Newest last, oldest first': '注意：最新的在最後，最舊的在最前',
  'Save the current conversation as a checkpoint. Usage: /chat save <tag>':
    '將目前對話儲存為檢查點。用法：/chat save <tag>',
  'Missing tag. Usage: /chat save <tag>': '缺少標籤。用法：/chat save <tag>',
  'Delete a conversation checkpoint. Usage: /chat delete <tag>':
    '刪除對話檢查點。用法：/chat delete <tag>',
  'Missing tag. Usage: /chat delete <tag>':
    '缺少標籤。用法：/chat delete <tag>',
  "Conversation checkpoint '{{tag}}' has been deleted.":
    "對話檢查點 '{{tag}}' 已刪除",
  "Error: No checkpoint found with tag '{{tag}}'.":
    "錯誤：找不到標籤為 '{{tag}}' 的檢查點",
  'Resume a conversation from a checkpoint. Usage: /chat resume <tag>':
    '從檢查點繼續對話。用法：/chat resume <tag>',
  'Missing tag. Usage: /chat resume <tag>':
    '缺少標籤。用法：/chat resume <tag>',
  'No saved checkpoint found with tag: {{tag}}.':
    '找不到標籤為 {{tag}} 的已儲存檢查點',
  'A checkpoint with the tag {{tag}} already exists. Do you want to overwrite it?':
    '標籤為 {{tag}} 的檢查點已存在。您要覆寫它嗎？',
  'No chat client available to save conversation.':
    '沒有可用的對話用戶端來儲存對話',
  'Conversation checkpoint saved with tag: {{tag}}.':
    '對話檢查點已儲存，標籤：{{tag}}',
  'No conversation found to save.': '找不到要儲存的對話',
  'No chat client available to share conversation.':
    '沒有可用的對話用戶端來分享對話',
  'Invalid file format. Only .md and .json are supported.':
    '無效的檔案格式。僅支援 .md 和 .json 檔案',
  'Error sharing conversation: {{error}}': '分享對話時發生錯誤：{{error}}',
  'Conversation shared to {{filePath}}': '對話已分享至 {{filePath}}',
  'No conversation found to share.': '找不到要分享的對話',
  'Share the current conversation to a markdown or json file. Usage: /chat share <file>':
    '將目前對話分享至 markdown 或 json 檔案。用法：/chat share <file>',

  // ============================================================================
  // Commands - Summary
  // ============================================================================
  'Generate a project summary and save it to .qwen/PROJECT_SUMMARY.md':
    '產生專案摘要並儲存至 .qwen/PROJECT_SUMMARY.md',
  'No chat client available to generate summary.':
    '沒有可用的對話用戶端來產生摘要',
  'Already generating summary, wait for previous request to complete':
    '正在產生摘要，請等待上一個請求完成',
  'No conversation found to summarize.': '找不到要摘要的對話',
  'Failed to generate project context summary: {{error}}':
    '產生專案上下文摘要失敗：{{error}}',
  'Saved project summary to {{filePathForDisplay}}.':
    '專案摘要已儲存至 {{filePathForDisplay}}',
  'Saving project summary...': '正在儲存專案摘要...',
  'Generating project summary...': '正在產生專案摘要...',
  'Failed to generate summary - no text content received from LLM response':
    '產生摘要失敗 - 未從 LLM 回應中收到文字內容',

  // ============================================================================
  // Commands - Model
  // ============================================================================
  'Switch the model for this session (--fast for suggestion model)':
    '切換此工作階段的模型（--fast 可設定建議模型）',
  'Set a lighter model for prompt suggestions and speculative execution':
    '設定用於輸入建議和推測執行的輕量模型',
  'Content generator configuration not available.': '內容產生器設定不可用',
  'Authentication type not available.': '驗證類型不可用',
  'No models available for the current authentication type ({{authType}}).':
    '目前驗證類型 ({{authType}}) 沒有可用的模型',

  // ============================================================================
  // Commands - Clear
  // ============================================================================
  'Starting a new session, resetting chat, and clearing terminal.':
    '正在開始新工作階段，重置對話並清除畫面。',
  'Starting a new session and clearing.': '正在開始新工作階段並清除畫面。',

  // ============================================================================
  // Commands - Compress
  // ============================================================================
  'Already compressing, wait for previous request to complete':
    '正在壓縮中，請等待上一個請求完成',
  'Failed to compress chat history.': '壓縮對話歷史失敗',
  'Failed to compress chat history: {{error}}': '壓縮對話歷史失敗：{{error}}',
  'Compressing chat history': '正在壓縮對話歷史',
  'Chat history compressed from {{originalTokens}} to {{newTokens}} tokens.':
    '對話歷史已從 {{originalTokens}} 個 token 壓縮至 {{newTokens}} 個 token。',
  'Compression was not beneficial for this history size.':
    '對於此歷史記錄大小，壓縮沒有效益。',
  'Chat history compression did not reduce size. This may indicate issues with the compression prompt.':
    '對話歷史壓縮未能縮小大小。這可能表示壓縮提示存在問題。',
  'Could not compress chat history due to a token counting error.':
    '由於 token 計數錯誤，無法壓縮對話歷史。',
  'Chat history is already compressed.': '對話歷史已經壓縮。',

  // ============================================================================
  // Commands - Directory
  // ============================================================================
  'Configuration is not available.': '設定不可用。',
  'Please provide at least one path to add.': '請提供至少一個要新增的路徑。',
  'The /directory add command is not supported in restrictive sandbox profiles. Please use --include-directories when starting the session instead.':
    '/directory add 指令在限制性沙箱設定檔中不受支援。請改為在啟動工作階段時使用 --include-directories。',
  "Error adding '{{path}}': {{error}}": "新增 '{{path}}' 時發生錯誤：{{error}}",
  'Successfully added QWEN.md files from the following directories if there are:\n- {{directories}}':
    '如果存在，已成功從以下目錄新增 QWEN.md 檔案：\n- {{directories}}',
  'Error refreshing memory: {{error}}': '重新整理記憶體時發生錯誤：{{error}}',
  'Successfully added directories:\n- {{directories}}':
    '成功新增目錄：\n- {{directories}}',
  'Current workspace directories:\n{{directories}}':
    '目前工作區目錄：\n{{directories}}',

  // ============================================================================
  // Commands - Docs
  // ============================================================================
  'Please open the following URL in your browser to view the documentation:\n{{url}}':
    '請在瀏覽器中開啟以下 URL 以檢視文件：\n{{url}}',
  'Opening documentation in your browser: {{url}}':
    '正在瀏覽器中開啟文件：{{url}}',

  // ============================================================================
  // Dialogs - Tool Confirmation
  // ============================================================================
  'Do you want to proceed?': '是否繼續？',
  'Yes, allow once': '是，允許一次',
  'Allow always': '一律允許',
  Yes: '是',
  No: '否',
  'No (esc)': '否 (esc)',
  'Yes, allow always for this session': '是，本次工作階段一律允許',
  'Modify in progress:': '正在修改：',
  'Save and close external editor to continue': '儲存並關閉外部編輯器以繼續',
  'Apply this change?': '是否套用此變更？',
  'Yes, allow always': '是，一律允許',
  'Modify with external editor': '使用外部編輯器修改',
  'No, suggest changes (esc)': '否，建議變更 (esc)',
  "Allow execution of: '{{command}}'?": "允許執行：'{{command}}'？",
  'Yes, allow always ...': '是，一律允許 ...',
  'Always allow in this project': '在此專案中一律允許',
  'Always allow {{action}} in this project': '在此專案中一律允許{{action}}',
  'Always allow for this user': '對此使用者一律允許',
  'Always allow {{action}} for this user': '對此使用者一律允許{{action}}',
  'Yes, restore previous mode ({{mode}})': '是，還原先前的模式 ({{mode}})',
  'Yes, and auto-accept edits': '是，並自動接受編輯',
  'Yes, and manually approve edits': '是，並手動核准編輯',
  'No, keep planning (esc)': '否，繼續規劃 (esc)',
  'URLs to fetch:': '要擷取的 URL：',
  'MCP Server: {{server}}': 'MCP 伺服器：{{server}}',
  'Tool: {{tool}}': '工具：{{tool}}',
  'Allow execution of MCP tool "{{tool}}" from server "{{server}}"?':
    '允許執行來自伺服器 "{{server}}" 的 MCP 工具 "{{tool}}"？',
  'Yes, always allow tool "{{tool}}" from server "{{server}}"':
    '是，一律允許來自伺服器 "{{server}}" 的工具 "{{tool}}"',
  'Yes, always allow all tools from server "{{server}}"':
    '是，一律允許來自伺服器 "{{server}}" 的所有工具',

  // ============================================================================
  // Dialogs - Shell Confirmation
  // ============================================================================
  'Shell Command Execution': 'Shell 指令執行',
  'A custom command wants to run the following shell commands.':
    '自訂指令想要執行以下 shell 指令。',
  'A custom command wants to run the following shell commands:':
    '自訂指令想要執行以下 shell 指令：',

  // ============================================================================
  // Dialogs - Pro Quota
  // ============================================================================
  'Pro quota limit reached for {{model}}.': '{{model}} 的 Pro 配額已達到上限',
  'Change auth (executes the /auth command)': '變更驗證（執行 /auth 指令）',
  'Continue with {{model}}': '使用 {{model}} 繼續',

  // ============================================================================
  // Dialogs - Welcome Back
  // ============================================================================
  'Current Plan:': '目前計畫：',
  'Progress: {{done}}/{{total}} tasks completed':
    '進度：已完成 {{done}}/{{total}} 個工作',
  ', {{inProgress}} in progress': '，{{inProgress}} 個進行中',
  'Pending Tasks:': '待處理工作：',
  'What would you like to do?': '您想要做什麼？',
  'Choose how to proceed with your session:': '選擇如何繼續您的工作階段：',
  'Start new chat session': '開始新的對話工作階段',
  'Continue previous conversation': '繼續先前的對話',
  '👋 Welcome back! (Last updated: {{timeAgo}})':
    '👋 歡迎回來！（最後更新：{{timeAgo}}）',
  '🎯 Overall Goal:': '🎯 整體目標：',

  // ============================================================================
  // Dialogs - Auth
  // ============================================================================
  'Get started': '開始使用',
  'Select Authentication Method': '選擇驗證方式',
  'OpenAI API key is required to use OpenAI authentication.':
    '使用 OpenAI 驗證需要 OpenAI API 金鑰',
  'You must select an auth method to proceed. Press Ctrl+C again to exit.':
    '您必須選擇驗證方法才能繼續。再次按 Ctrl+C 結束',
  'Terms of Services and Privacy Notice': '服務條款和隱私聲明',
  'Qwen OAuth': 'Qwen OAuth (免費)',
  'Discontinued — switch to Coding Plan or API Key':
    '已停用 — 請切換至 Coding Plan 或 API Key',
  'Qwen OAuth free tier was discontinued on 2026-04-15. Run /auth to switch provider.':
    'Qwen OAuth 免費方案已於 2026-04-15 停用。請執行 /auth 切換服務提供商。',
  'Qwen OAuth free tier was discontinued on 2026-04-15. Please select Coding Plan or API Key instead.':
    'Qwen OAuth 免費方案已於 2026-04-15 停用。請改選 Coding Plan 或 API Key。',
  'Qwen OAuth free tier was discontinued on 2026-04-15. Please select a model from another provider or run /auth to switch.':
    'Qwen OAuth 免費方案已於 2026-04-15 停用。請選擇其他提供商的模型或執行 /auth 切換。',
  '\n⚠ Qwen OAuth free tier was discontinued on 2026-04-15. Please select another option.\n':
    '\n⚠ Qwen OAuth 免費方案已於 2026-04-15 停用。請選擇其他選項。\n',
  'Paid \u00B7 Up to 6,000 requests/5 hrs \u00B7 All Alibaba Cloud Coding Plan Models':
    '付費 \u00B7 每 5 小時最多 6,000 次請求 \u00B7 支援阿里雲百煉 Coding Plan 全部模型',
  'Alibaba Cloud Coding Plan': '阿里雲百煉 Coding Plan',
  'Bring your own API key': '使用自己的 API 金鑰',
  'Use coding plan credentials or your own api-keys/providers.':
    '使用 Coding Plan 憑證或您自己的 API 金鑰/提供商。',
  OpenAI: 'OpenAI',
  'Failed to login. Message: {{message}}': '登入失敗。訊息：{{message}}',
  'Authentication is enforced to be {{enforcedType}}, but you are currently using {{currentType}}.':
    '驗證方式被強制設定為 {{enforcedType}}，但您目前使用的是 {{currentType}}',
  'Qwen OAuth authentication timed out. Please try again.':
    'Qwen OAuth 驗證逾時。請重試',
  'Qwen OAuth authentication cancelled.': 'Qwen OAuth 驗證已取消',
  'Qwen OAuth Authentication': 'Qwen OAuth 驗證',
  'Please visit this URL to authorize:': '請造訪此 URL 進行授權：',
  'Or scan the QR code below:': '或掃描下方的 QR 碼：',
  'Waiting for authorization': '等待授權中',
  'Time remaining:': '剩餘時間：',
  '(Press ESC or CTRL+C to cancel)': '（按 ESC 或 CTRL+C 取消）',
  'Qwen OAuth Authentication Timeout': 'Qwen OAuth 驗證逾時',
  'OAuth token expired (over {{seconds}} seconds). Please select authentication method again.':
    'OAuth 權杖已過期（超過 {{seconds}} 秒）。請重新選擇驗證方法',
  'Press any key to return to authentication type selection.':
    '按任意鍵返回驗證類型選擇',
  'Waiting for Qwen OAuth authentication...': '正在等待 Qwen OAuth 驗證...',
  'Note: Your existing API key in settings.json will not be cleared when using Qwen OAuth. You can switch back to OpenAI authentication later if needed.':
    '注意：使用 Qwen OAuth 時，settings.json 中現有的 API 金鑰不會被清除。如果需要，您可以稍後切換回 OpenAI 驗證。',
  'Note: Your existing API key will not be cleared when using Qwen OAuth.':
    '注意：使用 Qwen OAuth 時，現有的 API 金鑰不會被清除。',
  'Authentication timed out. Please try again.': '驗證逾時。請重試。',
  'Waiting for auth... (Press ESC or CTRL+C to cancel)':
    '正在等待驗證...（按 ESC 或 CTRL+C 取消）',
  'Missing API key for OpenAI-compatible auth. Set settings.security.auth.apiKey, or set the {{envKeyHint}} environment variable.':
    '缺少 OpenAI 相容驗證的 API 金鑰。請設定 settings.security.auth.apiKey 或設定 {{envKeyHint}} 環境變數。',
  '{{envKeyHint}} environment variable not found.':
    '找不到 {{envKeyHint}} 環境變數。',
  '{{envKeyHint}} environment variable not found. Please set it in your .env file or environment variables.':
    '找不到 {{envKeyHint}} 環境變數。請在 .env 檔案或系統環境變數中進行設定。',
  '{{envKeyHint}} environment variable not found (or set settings.security.auth.apiKey). Please set it in your .env file or environment variables.':
    '找不到 {{envKeyHint}} 環境變數（或設定 settings.security.auth.apiKey）。請在 .env 檔案或系統環境變數中進行設定。',
  'Missing API key for OpenAI-compatible auth. Set the {{envKeyHint}} environment variable.':
    '缺少 OpenAI 相容驗證的 API 金鑰。請設定 {{envKeyHint}} 環境變數。',
  'Anthropic provider missing required baseUrl in modelProviders[].baseUrl.':
    'Anthropic 提供商缺少必要的 baseUrl，請在 modelProviders[].baseUrl 中設定。',
  'ANTHROPIC_BASE_URL environment variable not found.':
    '找不到 ANTHROPIC_BASE_URL 環境變數。',
  'Invalid auth method selected.': '選擇了無效的驗證方式。',
  'Failed to authenticate. Message: {{message}}': '驗證失敗。訊息：{{message}}',
  'Authenticated successfully with {{authType}} credentials.':
    '使用 {{authType}} 憑證成功驗證。',
  'Invalid QWEN_DEFAULT_AUTH_TYPE value: "{{value}}". Valid values are: {{validValues}}':
    '無效的 QWEN_DEFAULT_AUTH_TYPE 值："{{value}}"。有效值為：{{validValues}}',
  'OpenAI Configuration Required': '需要設定 OpenAI',
  'Please enter your OpenAI configuration. You can get an API key from':
    '請輸入您的 OpenAI 設定。您可以從以下地址取得 API 金鑰：',
  'API Key:': 'API 金鑰：',
  'Invalid credentials: {{errorMessage}}': '憑證無效：{{errorMessage}}',
  'Failed to validate credentials': '驗證憑證失敗',
  'Press Enter to continue, Tab/↑↓ to navigate, Esc to cancel':
    '按 Enter 繼續，Tab/↑↓ 導覽，Esc 取消',

  // ============================================================================
  // Dialogs - Model
  // ============================================================================
  'Select Model': '選擇模型',
  '(Press Esc to close)': '（按 Esc 關閉）',
  'Current (effective) configuration': '目前（實際生效）設定',
  AuthType: '驗證類型',
  'API Key': 'API 金鑰',
  unset: '未設定',
  '(default)': '(預設)',
  '(set)': '(已設定)',
  '(not set)': '(未設定)',
  Modality: '模態',
  'Context Window': '上下文視窗',
  text: '文字',
  'text-only': '純文字',
  image: '圖片',
  pdf: 'PDF',
  audio: '音訊',
  video: '影片',
  'not set': '未設定',
  none: '無',
  unknown: '未知',
  "Failed to switch model to '{{modelId}}'.\n\n{{error}}":
    "無法切換至模型 '{{modelId}}'.\n\n{{error}}",
  'Qwen 3.6 Plus — efficient hybrid model with leading coding performance':
    'Qwen 3.6 Plus — 高效混合架構，程式設計性能業界領先',
  'The latest Qwen Vision model from Alibaba Cloud ModelStudio (version: qwen3-vl-plus-2025-09-23)':
    '來自阿里雲 ModelStudio 的最新 Qwen Vision 模型（版本：qwen3-vl-plus-2025-09-23）',

  // ============================================================================
  // Dialogs - Permissions
  // ============================================================================
  'Manage folder trust settings': '管理資料夾信任設定',
  'Manage permission rules': '管理權限規則',
  Allow: '允許',
  Ask: '詢問',
  Deny: '拒絕',
  Workspace: '工作區',
  "Qwen Code won't ask before using allowed tools.":
    'Qwen Code 使用已允許的工具前不會詢問。',
  'Qwen Code will ask before using these tools.':
    'Qwen Code 使用這些工具前會先詢問。',
  'Qwen Code is not allowed to use denied tools.':
    'Qwen Code 不允許使用被拒絕的工具。',
  'Manage trusted directories for this workspace.':
    '管理此工作區的受信任目錄。',
  'Any use of the {{tool}} tool': '{{tool}} 工具的任何使用',
  "{{tool}} commands matching '{{pattern}}'":
    "符合 '{{pattern}}' 的 {{tool}} 指令",
  'From user settings': '來自使用者設定',
  'From project settings': '來自專案設定',
  'From session': '來自工作階段',
  'Project settings (local)': '專案設定（本機）',
  'Saved in .qwen/settings.local.json': '儲存在 .qwen/settings.local.json',
  'Project settings': '專案設定',
  'Checked in at .qwen/settings.json': '儲存在 .qwen/settings.json',
  'User settings': '使用者設定',
  'Saved in at ~/.qwen/settings.json': '儲存在 ~/.qwen/settings.json',
  'Add a new rule…': '新增規則…',
  'Add {{type}} permission rule': '新增{{type}}權限規則',
  'Permission rules are a tool name, optionally followed by a specifier in parentheses.':
    '權限規則是一個工具名稱，可選擇性地後跟括號中的限定符。',
  'e.g.,': '例如',
  or: '或',
  'Enter permission rule…': '輸入權限規則…',
  'Enter to submit · Esc to cancel': 'Enter 提交 · Esc 取消',
  'Where should this rule be saved?': '此規則應儲存在哪裡？',
  'Enter to confirm · Esc to cancel': 'Enter 確認 · Esc 取消',
  'Delete {{type}} rule?': '刪除{{type}}規則？',
  'Are you sure you want to delete this permission rule?':
    '確定要刪除此權限規則嗎？',
  'Permissions:': '權限：',
  '(←/→ or tab to cycle)': '（←/→ 或 tab 切換）',
  'Press ↑↓ to navigate · Enter to select · Type to search · Esc to cancel':
    '按 ↑↓ 導覽 · Enter 選擇 · 輸入搜尋 · Esc 取消',
  'Search…': '搜尋…',
  'Use /trust to manage folder trust settings for this workspace.':
    '使用 /trust 管理此工作區的資料夾信任設定。',
  'Add directory…': '新增目錄…',
  'Add directory to workspace': '新增工作區目錄',
  'Qwen Code can read files in the workspace, and make edits when auto-accept edits is on.':
    'Qwen Code 可以讀取工作區中的檔案，並在自動接受編輯模式開啟時進行編輯。',
  'Qwen Code will be able to read files in this directory and make edits when auto-accept edits is on.':
    'Qwen Code 將能夠讀取此目錄中的檔案，並在自動接受編輯模式開啟時進行編輯。',
  'Enter the path to the directory:': '輸入目錄路徑：',
  'Enter directory path…': '輸入目錄路徑…',
  'Tab to complete · Enter to add · Esc to cancel':
    'Tab 完成 · Enter 新增 · Esc 取消',
  'Remove directory?': '移除目錄？',
  'Are you sure you want to remove this directory from the workspace?':
    '確定要將此目錄從工作區中移除嗎？',
  '  (Original working directory)': '  （原始工作目錄）',
  '  (from settings)': '  （來自設定）',
  'Directory does not exist.': '目錄不存在。',
  'Path is not a directory.': '路徑不是目錄。',
  'This directory is already in the workspace.': '此目錄已在工作區中。',
  'Already covered by existing directory: {{dir}}': '已被現有目錄涵蓋：{{dir}}',

  // ============================================================================
  // Status Bar
  // ============================================================================
  'Using:': '已載入: ',
  '{{count}} open file': '{{count}} 個開啟的檔案',
  '{{count}} open files': '{{count}} 個開啟的檔案',
  '(ctrl+g to view)': '（按 ctrl+g 檢視）',
  '{{count}} {{name}} file': '{{count}} 個 {{name}} 檔案',
  '{{count}} {{name}} files': '{{count}} 個 {{name}} 檔案',
  '{{count}} MCP server': '{{count}} 個 MCP 伺服器',
  '{{count}} MCP servers': '{{count}} 個 MCP 伺服器',
  '{{count}} Blocked': '{{count}} 個已封鎖',
  '(ctrl+t to view)': '（按 ctrl+t 檢視）',
  '(ctrl+t to toggle)': '（按 ctrl+t 切換）',
  'Press Ctrl+C again to exit.': '再次按 Ctrl+C 結束',
  'Press Ctrl+D again to exit.': '再次按 Ctrl+D 結束',
  'Press Esc again to clear.': '再次按 Esc 清除',
  'Press ↑ to edit queued messages': '按 ↑ 編輯排隊訊息',

  // ============================================================================
  // MCP Status
  // ============================================================================
  'No MCP servers configured.': '未設定 MCP 伺服器',
  '⏳ MCP servers are starting up ({{count}} initializing)...':
    '⏳ MCP 伺服器正在啟動（{{count}} 個正在初始化）...',
  'Note: First startup may take longer. Tool availability will update automatically.':
    '注意：首次啟動可能需要更長時間。工具可用性將自動更新',
  'Configured MCP servers:': '已設定的 MCP 伺服器：',
  Ready: '就緒',
  'Starting... (first startup may take longer)':
    '正在啟動...（首次啟動可能需要更長時間）',
  Disconnected: '已中斷連線',
  '{{count}} tool': '{{count}} 個工具',
  '{{count}} tools': '{{count}} 個工具',
  '{{count}} prompt': '{{count}} 個提示',
  '{{count}} prompts': '{{count}} 個提示',
  '(from {{extensionName}})': '（來自 {{extensionName}}）',
  OAuth: 'OAuth',
  'OAuth expired': 'OAuth 已過期',
  'OAuth not authenticated': 'OAuth 未驗證',
  'tools and prompts will appear when ready': '工具和提示將在就緒時顯示',
  '{{count}} tools cached': '{{count}} 個工具已快取',
  'Tools:': '工具：',
  'Parameters:': '參數：',
  'Prompts:': '提示：',
  Blocked: '已封鎖',
  '💡 Tips:': '💡 提示：',
  Use: '使用',
  'to show server and tool descriptions': '顯示伺服器和工具描述',
  'to show tool parameter schemas': '顯示工具參數結構描述',
  'to hide descriptions': '隱藏描述',
  'to authenticate with OAuth-enabled servers': '向支援 OAuth 的伺服器進行驗證',
  Press: '按',
  'to toggle tool descriptions on/off': '切換工具描述開關',
  "Starting OAuth authentication for MCP server '{{name}}'...":
    "正在為 MCP 伺服器 '{{name}}' 啟動 OAuth 驗證...",
  'Restarting MCP servers...': '正在重新啟動 MCP 伺服器...',

  // ============================================================================
  // Startup Tips
  // ============================================================================
  'Tips:': '提示：',
  'Use /compress when the conversation gets long to summarize history and free up context.':
    '對話變長時用 /compress，摘要歷史並釋放上下文。',
  'Start a fresh idea with /clear or /new; the previous session stays available in history.':
    '用 /clear 或 /new 開啟新想法；先前的工作階段會保留在歷史記錄中。',
  'Use /bug to submit issues to the maintainers when something goes off.':
    '遇到問題時，用 /bug 將問題提交給維護者。',
  'Switch auth type quickly with /auth.': '用 /auth 快速切換驗證方式。',
  'You can run any shell commands from Qwen Code using ! (e.g. !ls).':
    '在 Qwen Code 中使用 ! 可執行任意 shell 指令（例如 !ls）。',
  'Type / to open the command popup; Tab autocompletes slash commands and saved prompts.':
    '輸入 / 開啟指令快顯視窗；按 Tab 自動完成斜線指令和已儲存的提示詞。',
  'You can resume a previous conversation by running qwen --continue or qwen --resume.':
    '執行 qwen --continue 或 qwen --resume 可繼續先前的工作階段。',
  'You can switch permission mode quickly with Shift+Tab or /approval-mode.':
    '按 Shift+Tab 或輸入 /approval-mode 可快速切換權限模式。',
  'You can switch permission mode quickly with Tab or /approval-mode.':
    '按 Tab 或輸入 /approval-mode 可快速切換權限模式。',
  'Try /insight to generate personalized insights from your chat history.':
    '試試 /insight，從對話記錄中產生個人化洞察。',
  'Add a QWEN.md file to give Qwen Code persistent project context.':
    '新增 QWEN.md 檔案，為 Qwen Code 提供持久的專案上下文。',
  'Use /btw to ask a quick side question without disrupting the conversation.':
    '用 /btw 快速問一個小問題，不會打斷目前對話。',
  'Context is almost full! Run /compress now or start /new to continue.':
    '上下文即將用完！請立即執行 /compress 或使用 /new 開啟新工作階段。',
  'Context is getting full. Use /compress to free up space.':
    '上下文空間不足，用 /compress 釋放空間。',
  'Long conversation? /compress summarizes history to free context.':
    '對話太長？用 /compress 摘要歷史，釋放上下文。',

  // ============================================================================
  // Exit Screen / Stats
  // ============================================================================
  'Agent powering down. Goodbye!': 'Qwen Code 正在關閉，再見！',
  'To continue this session, run': '要繼續此工作階段，請執行',
  'Interaction Summary': '互動摘要',
  'Session ID:': '工作階段 ID：',
  'Tool Calls:': '工具呼叫：',
  'Success Rate:': '成功率：',
  'User Agreement:': '使用者同意率：',
  reviewed: '已審閱',
  'Code Changes:': '程式碼變更：',
  Performance: '效能',
  'Wall Time:': '總耗時：',
  'Agent Active:': '代理活躍時間：',
  'API Time:': 'API 時間：',
  'Tool Time:': '工具時間：',
  'Session Stats': '工作階段統計',
  'Model Usage': '模型使用情況',
  Reqs: '請求數',
  'Input Tokens': '輸入 token 數',
  'Output Tokens': '輸出 token 數',
  'Savings Highlight:': '節省亮點：',
  'of input tokens were served from the cache, reducing costs.':
    '從快取載入 token，降低了成本',
  'Tip: For a full token breakdown, run `/stats model`.':
    '提示：要查看完整的權杖明細，請執行 `/stats model`',
  'Model Stats For Nerds': '模型統計（技術細節）',
  'Tool Stats For Nerds': '工具統計（技術細節）',
  Metric: '指標',
  API: 'API',
  Requests: '請求數',
  Errors: '錯誤數',
  'Avg Latency': '平均延遲',
  Tokens: '權杖',
  Total: '總計',
  Prompt: '提示',
  Cached: '已快取',
  Thoughts: '思考',
  Tool: '工具',
  Output: '輸出',
  'No API calls have been made in this session.':
    '本次工作階段中未進行任何 API 呼叫',
  'Tool Name': '工具名稱',
  Calls: '呼叫次數',
  'Success Rate': '成功率',
  'Avg Duration': '平均耗時',
  'User Decision Summary': '使用者決策摘要',
  'Total Reviewed Suggestions:': '已審閱建議總數：',
  ' » Accepted:': ' » 已接受：',
  ' » Rejected:': ' » 已拒絕：',
  ' » Modified:': ' » 已修改：',
  ' Overall Agreement Rate:': ' 整體同意率：',
  'No tool calls have been made in this session.':
    '本次工作階段中未進行任何工具呼叫',
  'Session start time is unavailable, cannot calculate stats.':
    '工作階段開始時間不可用，無法計算統計資訊',

  // ============================================================================
  // Command Format Migration
  // ============================================================================
  'Command Format Migration': '指令格式移轉',
  'Found {{count}} TOML command file:': '發現 {{count}} 個 TOML 指令檔案：',
  'Found {{count}} TOML command files:': '發現 {{count}} 個 TOML 指令檔案：',
  '... and {{count}} more': '... 以及其他 {{count}} 個',
  'The TOML format is deprecated. Would you like to migrate them to Markdown format?':
    'TOML 格式已棄用。是否將它們移轉至 Markdown 格式？',
  '(Backups will be created and original files will be preserved)':
    '（將建立備份，原始檔案將保留）',

  // ============================================================================
  // Loading Phrases
  // ============================================================================
  'Waiting for user confirmation...': '等待使用者確認...',
  '(esc to cancel, {{time}})': '（按 esc 取消，{{time}}）',
  WITTY_LOADING_PHRASES: [
    // --- 職場打拼系列 ---
    '正在努力工作中，請稍候...',
    '老闆在旁邊，快點載入啊！',
    '頭髮掉光之前，一定能載入完...',
    '伺服器正在深呼吸，準備放大招...',
    '正在向伺服器投餵咖啡...',

    // --- 科技黑話系列 ---
    '正在賦能全鏈路，尋找關鍵抓手...',
    '正在降本增效，最佳化載入路徑...',
    '正在打破部門壁壘，沉澱方法論...',
    '正在擁抱變化，迭代核心價值...',
    '正在對齊顆粒度，打磨底層邏輯...',
    '大力出奇蹟，正在強行載入...',

    // --- 工程師自嘲系列 ---
    '只要我不寫程式，程式就沒有 Bug...',
    '正在將 Bug 轉化為 Feature...',
    '只要我不尷尬，Bug 就追不上我...',
    '正在試圖理解去年的自己寫了什麼...',
    '正在程式猿力覺醒中，請耐心等待...',

    // --- 合作愉快系列 ---
    '正在詢問產品經理：這需求是真的嗎？',
    '正在給產品經理畫大餅，請稍等...',

    // --- 溫暖治癒系列 ---
    '每一行程式碼，都在努力讓世界變得更好一點點...',
    '每一個偉大的想法，都值得這份耐心的等待...',
    '別急，美好的事物總是需要一點時間去醞釀...',
    '願你的程式碼永無 Bug，願你的夢想終將成真...',
    '哪怕只有 0.1% 的進度，也是在向目標靠近...',
    '載入的是位元組，承載的是對技術的熱愛...',
  ],

  // ============================================================================
  // Extension Settings Input
  // ============================================================================
  'Enter value...': '請輸入值...',
  'Enter sensitive value...': '請輸入敏感值...',
  'Press Enter to submit, Escape to cancel': '按 Enter 提交，Escape 取消',

  // ============================================================================
  // Command Migration Tool
  // ============================================================================
  'Markdown file already exists: {{filename}}':
    'Markdown 檔案已存在：{{filename}}',
  'TOML Command Format Deprecation Notice': 'TOML 指令格式棄用通知',
  'Found {{count}} command file(s) in TOML format:':
    '發現 {{count}} 個 TOML 格式的指令檔案：',
  'The TOML format for commands is being deprecated in favor of Markdown format.':
    '指令的 TOML 格式正在被棄用，推薦使用 Markdown 格式。',
  'Markdown format is more readable and easier to edit.':
    'Markdown 格式更易讀、更易編輯。',
  'You can migrate these files automatically using:':
    '您可以使用以下指令自動移轉這些檔案：',
  'Or manually convert each file:': '或手動轉換每個檔案：',
  'TOML: prompt = "..." / description = "..."':
    'TOML：prompt = "..." / description = "..."',
  'Markdown: YAML frontmatter + content': 'Markdown：YAML frontmatter + 內容',
  'The migration tool will:': '移轉工具將：',
  'Convert TOML files to Markdown': '將 TOML 檔案轉換為 Markdown',
  'Create backups of original files': '建立原始檔案的備份',
  'Preserve all command functionality': '保留所有指令功能',
  'TOML format will continue to work for now, but migration is recommended.':
    'TOML 格式目前仍可使用，但建議移轉。',

  // ============================================================================
  // Extensions - Explore Command
  // ============================================================================
  'Open extensions page in your browser': '在瀏覽器中開啟延伸功能市集頁面',
  'Unknown extensions source: {{source}}.': '未知的延伸功能來源：{{source}}。',
  'Would open extensions page in your browser: {{url}} (skipped in test environment)':
    '將在瀏覽器中開啟延伸功能頁面：{{url}}（測試環境中已略過）',
  'View available extensions at {{url}}': '在 {{url}} 檢視可用延伸功能',
  'Opening extensions page in your browser: {{url}}':
    '正在瀏覽器中開啟延伸功能頁面：{{url}}',
  'Failed to open browser. Check out the extensions gallery at {{url}}':
    '開啟瀏覽器失敗。請造訪延伸功能市集：{{url}}',

  // ============================================================================
  // Retry / Rate Limit
  // ============================================================================
  'Rate limit error: {{reason}}': '觸發速率限制：{{reason}}',
  'Retrying in {{seconds}} seconds… (attempt {{attempt}}/{{maxRetries}})':
    '將於 {{seconds}} 秒後重試…（第 {{attempt}}/{{maxRetries}} 次）',
  'Press Ctrl+Y to retry': '按 Ctrl+Y 重試。',
  'No failed request to retry.': '沒有可重試的失敗請求。',
  'to retry last request': '重試上一次請求',

  // ============================================================================
  // Coding Plan Authentication
  // ============================================================================
  'API key cannot be empty.': 'API 金鑰不能為空。',
  'Invalid API key. Coding Plan API keys start with "sk-sp-". Please check.':
    '無效的 API 金鑰，Coding Plan API 金鑰均以 "sk-sp-" 開頭，請檢查',
  'You can get your Coding Plan API key here':
    '您可以在這裡取得 Coding Plan API 金鑰',
  'API key is stored in settings.env. You can migrate it to a .env file for better security.':
    'API 金鑰已儲存在 settings.env 中。您可以將其移轉至 .env 檔案以獲得更好的安全性。',
  'New model configurations are available for Alibaba Cloud Coding Plan. Update now?':
    '阿里雲百煉 Coding Plan 有新模型設定可用。是否立即更新？',
  'Coding Plan configuration updated successfully. New models are now available.':
    'Coding Plan 設定更新成功。新模型現已可用。',
  'Coding Plan API key not found. Please re-authenticate with Coding Plan.':
    '找不到 Coding Plan API 金鑰。請重新透過 Coding Plan 驗證。',
  'Failed to update Coding Plan configuration: {{message}}':
    '更新 Coding Plan 設定失敗：{{message}}',

  // ============================================================================
  // Custom API Key Configuration
  // ============================================================================
  'You can configure your API key and models in settings.json':
    '您可以在 settings.json 中設定 API 金鑰和模型',
  'Refer to the documentation for setup instructions': '請參考文件了解設定說明',

  // ============================================================================
  // Auth Dialog - View Titles and Labels
  // ============================================================================
  'API-KEY': 'API-KEY',
  'Coding Plan': 'Coding Plan',
  "Paste your api key of ModelStudio Coding Plan and you're all set!":
    '貼上您的百煉 Coding Plan API 金鑰，即可完成設定！',
  Custom: '自訂',
  'More instructions about configuring `modelProviders` manually.':
    '關於手動設定 `modelProviders` 的更多說明。',
  'Select API-KEY configuration mode:': '選擇 API-KEY 設定模式：',
  '(Press Escape to go back)': '(按 Escape 鍵返回)',
  '(Press Enter to submit, Escape to cancel)': '(按 Enter 提交，Escape 取消)',
  'Select Region for Coding Plan': '選擇 Coding Plan 區域',
  'Choose based on where your account is registered':
    '請根據您的帳號註冊地區選擇',
  'Enter Coding Plan API Key': '輸入 Coding Plan API 金鑰',

  // ============================================================================
  // Coding Plan International Updates
  // ============================================================================
  'New model configurations are available for {{region}}. Update now?':
    '{{region}} 有新的模型設定可用。是否立即更新？',
  '{{region}} configuration updated successfully. Model switched to "{{model}}".':
    '{{region}} 設定更新成功。模型已切換至 "{{model}}"。',
  'Authenticated successfully with {{region}}. API key and model configs saved to settings.json (backed up).':
    '成功透過 {{region}} 驗證。API 金鑰和模型設定已儲存至 settings.json（已備份）。',

  // ============================================================================
  // Context Usage
  // ============================================================================
  'Context Usage': '上下文使用狀況',
  'Context window': '上下文視窗',
  Used: '已使用',
  Free: '可用',
  'Autocompact buffer': '自動壓縮緩衝區',
  'Usage by category': '分類用量',
  'System prompt': '系統提示',
  'Built-in tools': '內建工具',
  'MCP tools': 'MCP 工具',
  'Memory files': '記憶檔案',
  Skills: '技能',
  Messages: '訊息',
  tokens: 'tokens',
  'Estimated pre-conversation overhead': '預估對話前額外負擔',
  'No API response yet. Send a message to see actual usage.':
    '尚無 API 回應。傳送訊息以查看實際使用情況。',
  'Show context window usage breakdown.': '顯示上下文視窗使用情況分解。',
  'Run /context detail for per-item breakdown.':
    '執行 /context detail 查看詳細分解。',
  'Show context window usage breakdown. Use "/context detail" for per-item breakdown.':
    '顯示上下文視窗使用情況分解。輸入 "/context detail" 查看詳細分解。',
  'body loaded': '內容已載入',
  memory: '記憶',
  '{{region}} configuration updated successfully.': '{{region}} 設定更新成功。',
  'Authenticated successfully with {{region}}. API key and model configs saved to settings.json.':
    '成功透過 {{region}} 驗證。API 金鑰和模型設定已儲存至 settings.json。',
  'Tip: Use /model to switch between available Coding Plan models.':
    '提示：使用 /model 切換可用的 Coding Plan 模型。',

  // ============================================================================
  // Ask User Question Tool
  // ============================================================================
  'Please answer the following question(s):': '請回答以下問題：',
  'Cannot ask user questions in non-interactive mode. Please run in interactive mode to use this tool.':
    '無法在非互動模式下詢問使用者問題。請在互動模式下執行以使用此工具。',
  'User declined to answer the questions.': '使用者拒絕回答問題。',
  'User has provided the following answers:': '使用者提供了以下答案：',
  'Failed to process user answers:': '處理使用者答案失敗：',
  'Type something...': '輸入內容...',
  Submit: '提交',
  'Submit answers': '提交答案',
  Cancel: '取消',
  'Your answers:': '您的答案：',
  '(not answered)': '(未回答)',
  'Ready to submit your answers?': '準備好提交您的答案了嗎？',
  '↑/↓: Navigate | ←/→: Switch tabs | Enter: Select':
    '↑/↓: 導覽 | ←/→: 切換索引標籤 | Enter: 選擇',
  '↑/↓: Navigate | ←/→: Switch tabs | Space/Enter: Toggle | Esc: Cancel':
    '↑/↓: 導覽 | ←/→: 切換索引標籤 | Space/Enter: 切換 | Esc: 取消',
  '↑/↓: Navigate | Space/Enter: Toggle | Esc: Cancel':
    '↑/↓: 導覽 | Space/Enter: 切換 | Esc: 取消',
  '↑/↓: Navigate | Enter: Select | Esc: Cancel':
    '↑/↓: 導覽 | Enter: 選擇 | Esc: 取消',

  // ============================================================================
  // Commands - Auth
  // ============================================================================
  'Configure Qwen authentication information with Qwen-OAuth or Alibaba Cloud Coding Plan':
    '使用 Qwen OAuth 或阿里雲百煉 Coding Plan 設定 Qwen 驗證資訊',
  'Authenticate using Qwen OAuth': '使用 Qwen OAuth 進行驗證',
  'Authenticate using Alibaba Cloud Coding Plan':
    '使用阿里雲百煉 Coding Plan 進行驗證',
  'Region for Coding Plan (china/global)': 'Coding Plan 區域 (china/global)',
  'API key for Coding Plan': 'Coding Plan 的 API 金鑰',
  'Show current authentication status': '顯示目前驗證狀態',
  'Authentication completed successfully.': '驗證完成。',
  'Starting Qwen OAuth authentication...': '正在啟動 Qwen OAuth 驗證...',
  'Successfully authenticated with Qwen OAuth.': '已成功透過 Qwen OAuth 驗證。',
  'Failed to authenticate with Qwen OAuth: {{error}}':
    'Qwen OAuth 驗證失敗：{{error}}',
  'Processing Alibaba Cloud Coding Plan authentication...':
    '正在處理阿里雲百煉 Coding Plan 驗證...',
  'Successfully authenticated with Alibaba Cloud Coding Plan.':
    '已成功透過阿里雲百煉 Coding Plan 驗證。',
  'Failed to authenticate with Coding Plan: {{error}}':
    'Coding Plan 驗證失敗：{{error}}',
  '中國 (China)': '中國 (China)',
  '阿里云百炼 (aliyun.com)': '阿里雲百煉 (aliyun.com)',
  Global: '全球',
  'Alibaba Cloud (alibabacloud.com)': 'Alibaba Cloud (alibabacloud.com)',
  'Select region for Coding Plan:': '選擇 Coding Plan 區域：',
  'Enter your Coding Plan API key: ': '請輸入您的 Coding Plan API 金鑰：',
  'Select authentication method:': '選擇驗證方式：',
  '\n=== Authentication Status ===\n': '\n=== 驗證狀態 ===\n',
  '⚠️  No authentication method configured.\n': '⚠️  未設定驗證方式。\n',
  'Run one of the following commands to get started:\n':
    '執行以下指令之一開始設定：\n',
  '  qwen auth qwen-oauth     - Authenticate with Qwen OAuth (discontinued)':
    '  qwen auth qwen-oauth     - 使用 Qwen OAuth 登入（已停用）',
  '  qwen auth coding-plan      - Authenticate with Alibaba Cloud Coding Plan\n':
    '  qwen auth coding-plan      - 使用阿里雲百煉 Coding Plan 驗證\n',
  'Or simply run:': '或者直接執行：',
  '  qwen auth                - Interactive authentication setup\n':
    '  qwen auth                - 互動式驗證設定\n',
  '✓ Authentication Method: Qwen OAuth': '✓ 驗證方式：Qwen OAuth',
  '  Type: Free tier (discontinued 2026-04-15)':
    '  類型：免費方案（2026-04-15 已停用）',
  '  Limit: No longer available': '  限額：已不可用',
  'Qwen OAuth free tier was discontinued on 2026-04-15. Run /auth to switch to Coding Plan, OpenRouter, Fireworks AI, or another provider.':
    'Qwen OAuth 免費方案已於 2026-04-15 停用。請執行 /auth 切換至 Coding Plan、OpenRouter、Fireworks AI 或其他服務提供商。',
  '  Models: Qwen latest models\n': '  模型：Qwen 最新模型\n',
  '✓ Authentication Method: Alibaba Cloud Coding Plan':
    '✓ 驗證方式：阿里雲百煉 Coding Plan',
  '中国 (China) - 阿里云百炼': '中國 (China) - 阿里雲百煉',
  'Global - Alibaba Cloud': '全球 - Alibaba Cloud',
  '  Region: {{region}}': '  區域：{{region}}',
  '  Current Model: {{model}}': '  目前模型：{{model}}',
  '  Config Version: {{version}}': '  設定版本：{{version}}',
  '  Status: API key configured\n': '  狀態：API 金鑰已設定\n',
  '⚠️  Authentication Method: Alibaba Cloud Coding Plan (Incomplete)':
    '⚠️  驗證方式：阿里雲百煉 Coding Plan（不完整）',
  '  Issue: API key not found in environment or settings\n':
    '  問題：在環境變數或設定中找不到 API 金鑰\n',
  '  Run `qwen auth coding-plan` to re-configure.\n':
    '  執行 `qwen auth coding-plan` 重新設定。\n',
  '✓ Authentication Method: {{type}}': '✓ 驗證方式：{{type}}',
  '  Status: Configured\n': '  狀態：已設定\n',
  'Failed to check authentication status: {{error}}':
    '檢查驗證狀態失敗：{{error}}',
  'Select an option:': '請選擇：',
  'Raw mode not available. Please run in an interactive terminal.':
    '原始模式不可用。請在互動式終端機中執行。',
  '(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)\n':
    '(使用 ↑ ↓ 箭頭導覽，Enter 選擇，Ctrl+C 結束)\n',
  compact: '緊湊',
  'Hide tool output and thinking for a cleaner view (toggle with Ctrl+O).':
    '緊湊模式下隱藏工具輸出和思考過程，介面更簡潔（Ctrl+O 切換）。',
  'Press Ctrl+O to show full tool output': '按 Ctrl+O 查看詳細工具呼叫結果',

  'Switch to plan mode or exit plan mode': '切換至規劃模式或退出規劃模式',
  'Exited plan mode. Previous approval mode restored.':
    '已退出規劃模式，已還原先前的核准模式。',
  'Enabled plan mode. The agent will analyze and plan without executing tools.':
    '已啟用規劃模式。代理將只分析和規劃，而不執行工具。',
  'Already in plan mode. Use "/plan exit" to exit plan mode.':
    '已處於規劃模式。使用 "/plan exit" 退出規劃模式。',
  'Not in plan mode. Use "/plan" to enter plan mode first.':
    '未處於規劃模式。請先使用 "/plan" 進入規劃模式。',

  "Set up Qwen Code's status line UI": '設定 Qwen Code 的狀態列',
};
