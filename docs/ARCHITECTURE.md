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
| app | `app:get-info` `config:get` `config:set-claude-dir` `config:set-theme` `config:set-token-limit` `config:set-agent-status-style` `config:set-pomodoro-minutes` `config:pick-claude-dir` `recent-dirs:get` `ui:get-state` `ui:save-state` `window:*` `session:open-cwd` `update:check/install` `backup:export/import` `usage:stat-increment/stat-list` | 应用信息、配置、窗口控制、UI 状态、shell 打开路径、自动更新、备份迁移、使用统计 |
| sessions | `sessions:list` `session:create/resume/rename/archive/delete/detail/summarize/export/read-text/usage/write/resize/close` `archive:restore` `search:query` `session:set-pinned` | 会话生命周期、终端 IO、搜索 |
| groups | `groups:list/create/rename/delete/set-color` `session:set-group` | 分组管理 |
| summary | `day:summarize` `week:summarize` `month:summarize` `summaries:list/get` `summary:save` `knowledge:generate/list/get/save/export/ensure-global` | 总结、知识库 |
| usage | `dashboard:stats` `usage:trend` `usage:hourly` `efficiency:insights` `timeline:day` | 统计、效率、时间线 |
| fun | `fun:stats` `fun:unlock-neon` | 成就/性格/彩蛋 |
| events | `session:data/exited/bound/error` `sessions:changed` `window:maximized-changed` `update:status` | 主→渲染广播 |

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
| `usage-stats.json` | 功能使用计数：`{ [key]: { count, lastAt } }`（key 白名单校验，仅本地） |
| `window-state.json` | 窗口位置/大小/最大化 |
| `pre-import-<ts>/` | 导入备份前的原数据快照（备份/迁移用） |
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

### 4.9 自动更新（`updater.ts`）
`setupAutoUpdater()` 仅在 `app.isPackaged` 时生效：`autoDownload=false` → `update-available` 广播并自动 `downloadUpdate()` → `update-downloaded` 广播（渲染层 toast + 菜单项「重启并安装更新」）→ `quitAndInstall()`。
发布源在 `electron-builder.yml` 的 `publish`（GitHub Releases，打包需 `GH_TOKEN`；内网可改 generic）。开发模式 `checkForUpdates()` 返回 `kind:'dev'` 安全降级。

### 4.10 备份 / 迁移（`backup.ts`）
- 导出：把 `STORE_FILES`（config/session-meta/groups/ui-state/recent-dirs/summaries/knowledge/window-state）复制到所选目录的 `codeagentdesk-backup-<日期>/`。
- 导入：先从备份目录复制数据文件到 userData，导入前把原文件快照到 `pre-import-<ts>/`（可回退）；找不到任何目标文件则报错不写入。
- 会话 JSONL 在 Claude 目录，不在备份范围（文档已提示）。

### 4.11 功能使用统计（`usage-store.ts`）
`incrementUsage(key)` 仅接受白名单 key（防污染），写 `{count,lastAt}`；渲染层在关键动作处调用（命令面板/搜索/总结/知识库/详情/导出/番茄钟/各视图打开）。纯本地、不采集内容，用于季度功能审计。

### 4.12 会话洞察（`session-insights.ts`）
从会话 JSONL **一次顺序扫描**同时产出三块信息，按 mtime+size 缓存（容量 60）：

- **计划**：`TodoWrite` 工具调用的**末次快照**（todos 数组 + status），记录快照次数与时间戳。
- **改动**：`Edit` / `MultiEdit` / `Write` / `NotebookEdit` / `str_replace_editor` 的 `file_path` 与 old/new 片段。行级增删用近似 diff：先裁公共前后缀，再对中段做 LCS（中段 > 200 行退化为整段替换统计），避免原地改一行被算成整块 +N/-N。
- **痕迹（`stats`）**：真实轮次（含文本的 user 消息，纯 tool_result 不算）、工具调用数、`is_error` 的 tool_result 数、首末时间戳、活跃时长（相邻事件 ≤5 分钟累加，与效率洞察同口径）。**不读 token 也能回答"这个会话跑了多久、失败几次"**。

边界（写进界面提示）：每片段每侧保留 1200 字符、每文件 8 个片段、最多 60 个文件，超出只计数；**口径是"会话记录里的工具调用意图"，不等于工作区当前内容**。IPC：`session:insights`。

**内存预算**：主进程三处解析缓存都按「条数 × 单条最坏体积」定过上限——`detailCache` 20 条（单条最坏约 20MB）、`readableLinesCache` 20 条（搜索用原始行，单条可达数 MB）、`insightsCache` 20 条（单条最坏约 1.1MB）。另外 `pushAssistantDetail` 存进 `toolUses` 的 `toolInput` **必须按 `MAX_TEXT_LENGTH` 截断**：一次 Write 的 input 可能是整个文件，且会被复制进对应的 tool_result 条目长期驻留。

### 4.13 工作区 git 摘要（`git-info.ts`）
`git -C <cwd> status --porcelain=v1 --branch -uno` 一次调用取「分支 + 未提交数 + ahead/behind」，4s 超时，按 cwd 缓存 **10s**（必须小于右栏 15s 的轮询间隔，否则每次轮询都吃上一条缓存，未提交数看起来永不更新）。非仓库 / 没装 git / 超时统一返回 `null`，界面直接不显示该行。IPC：`session:git`。

### 4.14 右栏仪表（`components/InfoPanel.tsx` + `hooks/useSessionRail.ts`）
Token 统计默认关闭后，右栏从"用量展示"改成**当前会话的仪表**：状态 + 活跃时长 → 计划进度（可「继续未完成的 N 项」一键注入提示）→ 本次改动（文件 +N/-M）→ 痕迹（轮次/工具调用/失败/开始时间）→ git 分支与未提交数 → 会话 ID/目录。
数据由 `useSessionRail` 拉取，**hook 挂在 InfoPanel 内部**（不是 App）：15s 一次的 `bump()` 只重渲染右栏这棵小树，不会把 2000 行的 App 连同侧栏/标签栏/终端栈一起叫醒。**洞察与 git 在同一个 15s 轮询里刷新**（git 的未提交数会随会话推进变化，不能只在 cwd 变化时取一次）；轮询条件是会话 running + 面板展开 + 窗口可见，否则停。数据**按 sessionId / cwd 缓存在渲染层**：切回看过的会话立刻有内容（不会闪"读取中"），换会话时也不会把上一个会话的数字短暂显示在新会话上；单次读取失败保留旧值、不清空。

**活跃时长口径统一**：`readSessionActiveMs`（效率洞察）与 `session-insights` 的 `stats.activeMs`（右栏）都用「相邻事件 ≤5 分钟累加」且扫描上限同为 6 万行，同一个会话在两处必须显示同一个数。

改动文件行可直接点击 → 打开洞察弹窗并定位到该文件（`initialPath`）。**续做提示是单行文本 + 一次回车写进 pty**，不用 bracketed paste，避免不同 TUI 版本把转义序列当字面量。点击后会先在原位展开**预览**（可读的提示全文 + 发送/取消），确认后才写入——往终端整句打字不可撤销，不能让一次误触把话发进正在跑的会话；换会话时预览自动收起。

### 4.15 待审批收件箱（状态栏）
`useSessionAgentStatuses` 已经能判定每个运行中会话处于 `approval`（输出里出现审批提示且安静下来）。状态栏据此聚合出「在等你确认」入口：`⚠ N` 胶囊（语义色 + 轻呼吸），点开浮层列出等待中的会话（标题 + 目录），点击直达该会话；全部处理后浮层自动收起。会话**刚进入**等待状态时再弹一次 toast（同一段等待只提醒一次，用 pty id 集合去重），这样即使不看状态栏也能察觉。埋点 `approval.jump`。
### 4.16 工作区改动审查（`git-diff.ts` + `GitDiffModal`）
与会话洞察互补，但**数据源完全不同**：insights 是"会话记录里的工具调用意图"，这里是"磁盘上真的变了什么"。

- **取数**：`git status --porcelain=v1 -uall -z`（拿未跟踪文件）+ `git diff HEAD --unified=3 --no-color -M`（工作区 + 暂存 vs 最后一次提交）并行跑；未跟踪文件直接读内容合成"全新增"的 hunk（二进制 / >200KB 只标记不读，且校验路径不逃出 cwd 根）。
- **解析**：`parseUnifiedDiff` 是纯函数（可单测）——按 `diff --git` 聚块，认 `---/+++`、`@@` 头推进新旧行号、`new file mode`/`deleted file mode`/`rename from`/`Binary files`；二进制文件没有 `---/+++` 行，路径从 `diff --git` 行尾兜底。
- **预算**：每文件最多 400 行入内存（计数仍按完整行数，超出的只标记 `truncated`）、最多 80 个文件、git stdout 8MB、超时 8s。
- **入口**：右栏 git 卡片（「审查改动 / 查看工作区 diff」）+ 会话右键菜单「审查工作区改动」（归档会话也能看，只要能定位 cwd）。
- **界面**：左文件列表（M/A/D/R/U 状态色块 + 行数）右逐 hunk 展示（行号 + `+`/`-` 前缀 + 背景染色），顶部显示分支与总计，带重新读取。

#### 落地：暂存与提交（`git-write.ts`）
只读审查之外，弹窗底部提供"暂存 → 提交"的闭环：

- **暂存**：文件行左侧的圆形勾选（`git add -- <path>` / `git reset -q HEAD -- <path>`），头部「全部暂存」走 `git add -A`。取消暂存遇到 unborn HEAD（仓库还没有第一个提交）`reset` 会失败，退化为 `git rm --cached`。
- **提交**：`git commit -m <message>`，**只提交已暂存**（不带 `-a`，避免把没 review 的文件带进去）；按钮在"提交信息为空"或"已暂存 0 个"时禁用；**不追加 `--no-verify`**——仓库自己的 pre-commit hook 该跑就跑，失败原样回显。
- **失败处理**：git 的 stderr 取前 4 行回给界面（`nothing to commit`、`user.name` 未配置、hook 失败都能看懂），提交信息**保留不清空**。
- **安全**：message 走 `execFile` 单参数传递（无 shell 拼接）、上限 4000 字、空值拒绝。
- **测试**：`git-write.test.ts` 是**真跑 git 的集成测试**（临时仓库 + 环境变量设身份），覆盖暂存/取消/全部暂存/非仓库/空信息/真实提交/无暂存内容/超长信息。


### 4.18 知识卡片（`knowledge-cards.ts` + `KnowledgeCardsModal`）
与 4.x 的 AI 概览（`PROJECT_KNOWLEDGE.md` 一整篇）互补：这里是**可检索、可验证、可过期**的条目。

- **形态**：一张卡片一个文件，放在仓库 `docs/knowledge/<slug>.md`，front-matter（title/type/status/created/updated/session/files）+ 三个固定小节（现象 / 结论 / 证据）。同目录 `README.md` 是**自动生成**的索引（按类型分组、带 ✅/📝 标记），人和 Claude 都从索引进入。
- **为什么一卡一文件**：PR review 变成"加一个文件"，diff 干净；grep 友好；新增/修改互不冲突（一篇大 Markdown 每人都改同一处必然冲突）。
- **类型**：pitfall（踩坑）/ decision（决策）/ flow（流程）/ module（模块说明）—— 正好对应新人入职要看的四类。
- **可信度**：`draft`（待确认）/ `verified`（有人验证过）。没有这层，AI 生成的知识会腐烂成"没人敢信的猜测集"。
- **过期**：卡片记录 `files`（涉及源码），将来可比对文件 mtime/是否存在来标"可能过期"（**本期未实现**，字段已留）。
- **跟随仓库**：卡片是提交进 git 的文件，同事拉代码就拿到，不需要服务器。IPC：`knowledge:cards-list` / `knowledge:card-save` / `knowledge:card-delete`。

## 5. 渲染层模式

- **容器-展示**：`App.tsx` 持有状态/effects/handlers，向下传 `data`/`actions` 分组 props（SidebarBody/StatusBar/TabBar/ContextMenus 等）。
- **lazy 弹窗**：SessionDetail / SummaryModal / CommandPalette / UsageTrendModal / KnowledgeModal / Dashboard / EfficiencyInsights / Timeline / Backup / UsageStats / SessionInsights / HourlyUsagePopover 均懒加载。
- **hooks**：`useUiState`（配置/目录/设置）、`useSearch`、`usePalette`（命令面板）、`useSummary`、`useDashboardStats`（60s+事件刷新）、`useDismiss`（点外部/Esc 关弹层）、`useEscape`、`useAnimatedNumber`、`usePomodoro`、`useSessionAgentStatuses`、`useRowWindow`（固定行高列表窗口化，见下）、`useSessionRail`（右栏数据，挂在 InfoPanel 内部）、`useOverlays`（10 个浮层开关 + 4 个带埋点的 opener）。

`App.tsx` 是容器（状态/effects/handlers），已按职责外提两块：浮层开关 → `useOverlays`（10 个布尔量 + 4 个带埋点的 opener）；派生会话列表 → `useSessionLists`（历史/归档拆分、分组区块、未分组回落、导航序号、日历计数，约 140 行纯计算）。App 从 1997 行降到 1863 行。剩余大头是 49 个 handler（归档/分组/重命名/置顶/搜索/总结/知识库），需要按域继续拆。
- **长列表窗口化**：`components/SessionList.tsx` + `hooks/useRowWindow.ts`。行数 > 60 时只渲染视口附近的行，上下用 padding 占位（行高由首行实测，不硬编码）；键盘导航焦点行不在窗口内时，由 hook 直接滚动容器把它带进窗口。行结构统一为两行制（标题行 + 次要信息行），所有行等高是窗口化的前提。
- **状态标记**：agent 状态标记同时用于状态栏、侧边栏会话行、标签页（`agentStatusStyle` 三态：emoji / 单色图标 / 圆点，统一由 `AgentStatusMark` 渲染）。
- **终端 chrome**：只有一层——`TabBar` 兼作终端操作条（复制内容 / 查看详情），`TerminalPane` 只渲染 xterm 宿主；选中自动复制提示为浮层徽章。
- **主题**：`:root[data-theme=...]` 变量块 ×7；所有颜色走 `var(--*)` / `color-mix`；新增主题需同步 6 处（`ThemeName` / `normalizeTheme` / `theme.ts` 三表 / CSS 变量块 / 设置过滤逻辑）。

## 6. 测试

- Vitest（`npm run test`），用例在 `src/main/__tests__/`：export（Markdown 导出）、session-library（解析/搜索/用量）、summarize（`parseSummary` + 长任务取消语义）。
- 主进程模块用 `vi.mock('electron')` 隔离；测试文件已被 tsconfig 排除在构建外。
