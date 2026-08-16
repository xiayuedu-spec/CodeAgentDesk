# CodeAgentDesk 架构文档

> 当前架构深度参考。功能总览见 `README.md`，开发交接/踩坑见 `agent.md`。

## 1. 进程与目录

- **主进程**（`src/main`）：会话管理、node-pty 承载 `claude`、JSONL 解析与统计、总结/知识库（调 `claude -p`）、IPC handler、系统通知、限额预警。
- **预加载**（`src/preload`）：`contextBridge` 暴露类型化 `window.codeagentdesk` API；channel 常量 `CHANNELS` 与主进程 `IpcChannel` 镜像。
- **渲染层**（`src/renderer`）：React 19 + Vite；容器组件 `App.tsx` 持有状态/副作用，展示组件收 `data/actions` props。
- **共享**（`src/shared`）：`types.ts`（类型 + `CodeAgentDeskApi`）、`ipc-contract.ts`（channel 常量）。

```
main ──ipcMain.handle──> preload ──contextBridge──> renderer (window.codeagentdesk.*)
renderer ──ipcRenderer.invoke──> main handler
main ──webContents.send(broadcast)──> renderer（sessionData/exited/changed 等事件）
```

## 2. IPC 通道表（按域）

| 域 | 通道（节选） | 说明 |
|---|---|---|
| app | `app:get-info` `config:get` `config:set-claude-dir` `config:set-theme` `config:set-token-limit` `config:set-agent-status-style` `config:set-pomodoro-minutes` `config:pick-claude-dir` `recent-dirs:get` `ui:get-state` `ui:save-state` `window:*` `session:open-cwd` | 应用信息、配置、窗口控制、UI 状态、shell 打开路径 |
| sessions | `sessions:list` `session:create/resume/rename/archive/delete/detail/summarize/export/read-text/usage/write/resize/close` `archive:restore` `search:query` `session:set-pinned` | 会话生命周期、终端 IO、搜索 |
| groups | `groups:list/create/rename/delete/set-color` `session:set-group` | 分组管理 |
| summary | `day:summarize` `week:summarize` `month:summarize` `summaries:list/get` `summary:save` `knowledge:generate/list/get/save/export/ensure-global` | 总结、知识库 |
| usage | `dashboard:stats` `usage:trend` `usage:hourly` `efficiency:insights` `timeline:day` | 统计、效率、时间线 |
| fun | `fun:stats` `fun:unlock-neon` | 成就/性格/彩蛋 |
| events | `session:data/exited/bound/error` `sessions:changed` `window:maximized-changed` | 主→渲染广播 |

事件广播（主进程 `broadcast(channel, payload)` → 渲染层 `onXxx(callback)` 订阅并返回退订函数）。

## 3. 数据存储

### 应用数据（`%APPDATA%/codeagentdesk/`）
| 文件 | 内容 |
|---|---|
| `config.json` | `claudeDir` / `theme` / `tokenLimitPerHour` / `pomodoroMinutes` / `agentStatusStyle` / `funUnlockedNeon` |
| `session-meta.json` | 按 sessionId：`customName` / `archived`(+`archivedAt/archivedPath`) / `summary`+`tags` / `group` / `pinned`(+`pinnedAt`)；`getVersion()` 供会话记录缓存失效 |
| `groups.json` | 分组：`id` / `name` / `color` |
| `ui-state.json` | `openSessionIds` / `activeSessionId` / `collapsedGroups` / `collapsedSections` |
| `recent-dirs.json` | 新建会话的最近目录 |
| `summaries.json` | `day` / `week` / `month` 三类总结（key = 日期/周一日期） |
| `knowledge.json` | 按项目 key（cwd 编码）存知识文本 + `sessionIds` 指纹（增量用） |
| `window-state.json` | 窗口位置/大小/最大化 |
| `error.log` | 主进程未捕获异常 |

### 会话数据（Claude 目录）
- 路径：`<claudeDir>/projects/<cwd 编码(\\/: → -)>/<sessionId>.jsonl`；归档后移到 `<userData>/archive/<编码>/`。
- JSONL 每行一个事件，关键字段：`type`（user/assistant/message/ai-title…）、`message.content`（文本或块数组）、`timestamp`（ISO，供活跃时长）、`cwd`、`sessionId`。
- `session-meta` 与文件解耦：记录列表由文件扫描（`listSessions`，带 mtime/size/metaVersion 缓存）+ 元数据合并而成。

## 4. 关键机制

### 4.1 会话绑定（watcher）
新建会话时 `watcher.registerPending(id, cwd)`；`chokidar` 监听 Claude 目录新增 JSONL → 首行取 sessionId → `sessions.bind(id, sessionId)` 并把 cwd 关联到运行中会话。

### 4.2 用量增量缓存
`readSessionUsage(file)` 按**文件字节偏移**只读新增行（`usageCache`），避免 3s 轮询全量重扫；文件被截断时从头重读。

### 4.3 活跃时长与效率
- `readSessionActiveMs(file)`：按事件 `timestamp` 顺序累计相邻间隔 ≤ 5 分钟的时长（排除挂机）。
- 效率聚合 `computeEfficiencyInsights(claudeHome, metaStore, weekStart?)`：会话按 `startedAt` 归周/日，输出会话数/总时长/省时（×1.5 估算）/输出占比/每日分布/耗时 TOP。
- 周范围 `weekRangeFor(monday?)`：周一为起点，跨 7 天。

### 4.4 Agent 状态机（渲染层 `useSessionAgentStatuses`）
按 pty id 维护状态 Map，事件驱动：
- 3 秒窗口内输出 ≥ 24 字节 → 🧠 思考中；停止 8s 后，该段活动 ≥ 20s → ✨ 4s → 😴，否则直接 😴。
- 安静期且尾部 600 字符命中审批特征（`allow?`/`proceed?`/`y/n`/允许/是否继续/批准）→ 🚨。
- `TerminalPane` resize 后广播 `agent-status-ignore`（1.5s 窗口）忽略 TUI 整屏重绘突发。

### 4.5 统计缓存
`dashboardStats` / `funStats` 主进程 60s TTL；配置变化（如 `configSetTokenLimit`）显式失效；渲染层用 60s 兜底定时 + `sessionsChanged` 事件刷新。

### 4.6 CLAUDE.md 同步（知识库）
- 单项目：`syncClaudeMd(cwd)` 在 `<cwd>/CLAUDE.md` 幂等加入 `@PROJECT_KNOWLEDGE.md`（不破坏用户内容）；生成知识库即落盘（`knowledgeGenerate`）。
- 全局：`ensureGlobalKnowledge(claudeHome)` 创建 `<claudeHome>/GLOBAL_KNOWLEDGE.md`（带模板）+ 在全局记忆 `<claudeHome>/CLAUDE.md` 加入 `@GLOBAL_KNOWLEDGE.md`。

### 4.7 周报复盘
`weekSummarize` 先 `summarizeWeekText`，再基于效率统计调用 `summarizeWeekReflection`（输入截断 1.2 万字符）生成「本周复盘」追加；反思失败自动降级不阻塞周报。

### 4.8 限额预警
`usage-warning.ts`：每 5 分钟轮询 `getCurrentHourUsage`（整点口径，按 updatedAt 归小时），80%/100% 分级系统通知，按自然小时重置。

## 5. 渲染层模式

- **容器-展示**：`App.tsx` 持有状态/effects/handlers，向下传 `data`/`actions` 分组 props（SidebarBody/StatusBar/ContextMenus 等）。
- **lazy 弹窗**：SessionDetail / SummaryModal / CommandPalette / UsageTrendModal / KnowledgeModal / Dashboard / EfficiencyInsights / Timeline / HourlyUsagePopover 均懒加载。
- **hooks**：`useUiState`（配置/目录/设置）、`useSearch`、`usePalette`（命令面板）、`useSummary`、`useDashboardStats`（60s+事件刷新）、`useDismiss`（点外部/Esc 关弹层）、`useEscape`、`useAnimatedNumber`、`usePomodoro`、`useSessionAgentStatuses`。
- **主题**：`:root[data-theme=...]` 变量块 ×7；所有颜色走 `var(--*)` / `color-mix`；新增主题需同步 6 处（`ThemeName` / `normalizeTheme` / `theme.ts` 三表 / CSS 变量块 / 设置过滤逻辑）。

## 6. 测试

- Vitest（`npm run test`），用例在 `src/main/__tests__/`：export（Markdown 导出）、session-library（解析/搜索/用量）、summarize（`parseSummary`）。
- 主进程模块用 `vi.mock('electron')` 隔离；测试文件已被 tsconfig 排除在构建外。
