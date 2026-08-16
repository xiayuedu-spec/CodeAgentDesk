# CodeAgentDesk Agent 交接文档

> Claude Code 统一窗口管理器（Electron 桌面应用）。给后续接手的 agent 看：**工程现状 + 坑点 + 开发约定**。
> 架构/数据/机制深度参考 `docs/ARCHITECTURE.md`；近期功能实现指南 `docs/FEATURES-HANDOFF.md`；功能总览 `README.md`；早期产品设计稿 `DESIGN.md`（归档参考）。

## 1. 快速开始

```powershell
# 开发模式（先编译主进程，再起 Vite + Electron）
npm run dev

# 质量门禁（每轮改动必须全过）
npm run typecheck   # tsc 双工程（main + renderer）
npm run test        # vitest（15 用例，src/main/__tests__）
npm run build       # tsc main + vite build

# 构建后运行 / 打包
npm start
npm run package     # electron-builder 打 Windows 安装包

# node-pty 原生模块重编译（重装依赖后必须执行）
npm run rebuild
```

版本：Electron 43.x、Vite 8.x、React 19、node-pty 1.1.0、chokidar 4.0.3（勿升 v5，纯 ESM）、TS 7、lucide-react。

## 2. 模块地图（当前）

```
src/
├─ main/                  # Electron 主进程（所有重活）
│  ├─ index.ts            # 入口：单实例、装配、watcher、通知（异常退出 + 长任务完成）
│  ├─ ipc.ts              # IPC 聚合入口：按域调用 registerXxxIpc
│  ├─ ipc-app.ts          # 应用信息/配置（目录/主题/限额/番茄钟/状态显示）/窗口/UI 状态/shell 打开
│  ├─ ipc-sessions.ts     # 会话生命周期/归档删除/终端 IO/搜索/置顶
│  ├─ ipc-groups.ts       # 分组增删改查/归属
│  ├─ ipc-summary.ts      # 日报周报（含复盘）月报/知识库（生成即落盘 + CLAUDE.md 同步 + 全局）
│  ├─ ipc-usage.ts        # dashboard/趋势/小时用量/效率洞察/时间线（dashboard 有 60s TTL）
│  ├─ ipc-fun.ts          # 成就/项目性格/彩蛋解锁（60s TTL）
│  ├─ ipc-utils.ts        # locateSessionFile / weekRangeFor / collectRangeText / emptyUsage
│  ├─ session-manager.ts  # node-pty 生命周期（startedAt→durationMs 供完成通知）
│  ├─ session-watcher.ts  # chokidar 监听 JSONL → 绑定 sessionId → 广播 sessionsChanged
│  ├─ session-library.ts  # JSONL 解析/搜索/用量增量缓存/活跃时长/小时聚合
│  ├─ session-meta-store.ts # session-meta.json（重命名/归档/分组/置顶/摘要标签，getVersion 缓存失效）
│  ├─ config.ts           # config.json + 目录解析 + 主题白名单
│  ├─ group-store.ts      # groups.json
│  ├─ knowledge.ts        # 知识库生成（增量指纹）+ syncClaudeMd + ensureGlobalKnowledge
│  ├─ summarize.ts        # claude -p 管线（总结/反思），Token 预算
│  ├─ export.ts           # Markdown 导出
│  └─ usage-warning.ts    # 整点限额预警（80%/100% 系统通知）
├─ preload/index.ts       # contextBridge 类型化 API；CHANNELS 与 IpcChannel 镜像（手写副本！）
├─ renderer/
│  ├─ App.tsx             # 容器：状态/effects/handlers/组装（sidebarFooterData/Actions 等分组 props）
│  ├─ session-utils.tsx   # SessionView/菜单状态/分组区块类型 + 标题/时间/高亮纯函数
│  ├─ theme.ts            # THEMES/THEME_SWATCHES/THEME_BACKGROUND（7 主题）
│  ├─ mbti.ts             # MBTI 推断纯函数
│  ├─ hooks/              # useUiState/useSearch/usePalette/useSummary/useDashboardStats/
│  │                      # useDismiss/useEscape/useAnimatedNumber/usePomodoro/useSessionAgentStatuses
│  └─ components/         # 展示组件；弹窗一律 lazy：SessionDetail/SummaryModal/CommandPalette/
│                         # UsageTrendModal/KnowledgeModal/Dashboard/EfficiencyInsights/Timeline/HourlyUsagePopover
└─ shared/                # ipc-contract.ts（通道唯一来源）+ types.ts（类型 + CodeAgentDeskApi）
```

主进程持有全部能力，渲染层只经 preload 类型化 API 调 IPC（`sandbox:true` + `contextIsolation`）。事件（sessionData/Exited/Bound/Error、sessionsChanged）由主进程 `broadcast` → 渲染层 `onXxx(callback)` 订阅并返回退订函数。

## 3. Claude JSONL 事实清单（重要，别凭假设）

- 首行是 `last-prompt`，只有 `sessionId`/`leafUuid`，没有 `cwd`。
- 前 3 行（`last-prompt`/`mode`/`permission-mode`）和 `file-history-snapshot` 不带 `cwd`；从第 4 行起大多事件带顶层 `cwd` + `entrypoint:"cli"`。
- `ai-title` 事件是官方标题，可能多次出现，取最后一次；短会话可能没有。
- assistant 事件顶层类型可能是旧版 `message`（带 `role:"assistant"`）或新版 `assistant`，解析器两个都兼容；user 事件顶层类型是 `user`。
- `user.message.content` 可能是字符串，也可能是 content block 数组（text / tool_result）。
- token 用量在 assistant 事件 `message.usage`：`input_tokens`/`output_tokens`/`cache_read_input_tokens`/`cache_creation_input_tokens`；同一 `message.id` 出现多次，按 id 去重取最后一次。
- 事件带 `timestamp`（ISO）——活跃时长/时间线/效率统计都依赖它。
- 会话绑定：watcher 监听 claudeHome，新增 `.jsonl` 后扫描前 200 行找顶层 `cwd` 与 pendingSpawn 匹配。

## 4. 数据位置

- 会话文件：`<claudeHome>/projects/<cwd 编码(\\/:→-)>/<sessionId>.jsonl`；归档后移入 `<userData>/archive/<编码>/`。claudeHome 解析：`config.json#claudeDir` → `CLAUDE_CONFIG_DIR` → `~/.claude`。
- 应用数据（Windows `%APPDATA%/codeagentdesk`）：`config.json`（claudeDir/theme/tokenLimitPerHour/pomodoroMinutes/agentStatusStyle/funUnlockedNeon）、`session-meta.json`（customName/archived/summary/tags/group/pinned）、`groups.json`、`ui-state.json`（openSessionIds/activeSessionId/collapsedGroups/collapsedSections）、`recent-dirs.json`、`summaries.json`（day/week/month）、`knowledge.json`（文本+sessionIds 指纹）、`window-state.json`、`error.log`。

## 5. 坑点清单（都踩过）

### 环境/工程
1. **node-pty 编译**：VS2022 缺 Spectre 库（MSB8040），`patches/node-pty+1.1.0.patch` 自动移除 SpectreMitigation + AttachConsole 兜底；重装依赖后必须 `npm run rebuild`。
2. **chokidar 用 v4**：v5 纯 ESM，CJS 主进程 require 不了。
3. **Electron 二进制缺失**：`node node_modules/electron/install.js` 联网补装。
4. **preload 是 sandbox:true**：不能 require 本地模块；`preload/index.ts` 的 `CHANNELS` 是手写副本，改 `shared/ipc-contract.ts` 必须同步（四端同步见 §6）。
5. **Windows npm 脚本**：部分 PowerShell 执行策略拦截 `npm.ps1` → 用 `npm.cmd`。
6. **git 提交**：中文多行信息用多个 `-m`，避免 `\"` 与反引号（PowerShell 解析问题）。

### 功能实现
7. **useDismiss 与开关按钮**：开关按钮在弹层外时，onClick 必须 `event.stopPropagation()`，否则窗口 click 监听会立刻关闭弹层（状态栏「更多」踩过）。
8. **agent 状态机 resize 噪声**：TerminalPane resize 会触发 Claude TUI 整屏重绘（一大波数据）；必须广播 `agent-status-ignore`（1.5s 窗口）忽略，否则"点进去就思考中→回合完成→空闲"假循环。
9. **TUI 周期性重绘**：Claude Code 状态栏每秒重绘，纯"有数据=思考"会永远卡在思考中——用活动量门限（3s/≥24B）+ 长静默阈值（8s）+ 真实回合判定（≥20s 才 ✨）。
10. **`.settings-action` 全宽陷阱**：复用全宽按钮样式做行内"保存"会挤爆输入框——必须覆盖 `.settings-limit-save { flex:none; width:auto; margin-top:0 }`。
11. **数字输入框默认白底**：设置里的 number input 必须显式 `background: var(--bg-inset); color: var(--text)`，否则深色主题下扎眼；加防御规则 `.settings-popover input`。
12. **统计缓存与配置联动**：有 TTL 的统计（dashboard/funStats）要在配置变化（如限额）时显式失效，否则改完限额界面不更新。
13. **`??` 与 `||` 混用**：TS5076，需加括号 `a ?? (b || c)`。
14. **会话列表缓存**：`session-library.ts` 按 mtime/size + `metaStore.getVersion()` 失效；改 meta 时必须 `version += 1`（setPinned/rename 等已处理）。
15. **终端栈常驻挂载**：非搜索分支始终渲染，无激活/开详情时只加 `.hidden`——卸载会导致滚动记录丢失。
16. **自绘标题栏**：`titleBarStyle:'hidden'` + `-webkit-app-region`；主题切换用 `window:set-background-color` 防白闪。
17. **归档借出**：点击归档行→移回 projects + resume 但 UI 仍标记归档；切走自动放回；右键「恢复」才永久取消归档。
18. **claude -p 调用**：Windows 上 claude 是 `.cmd`，`spawn` 必须 `shell:true`；指令+内容走 stdin；60s 超时；消耗真实 token，注意预算。
19. **拖放路径**：Electron ≥32 移除 `File.path`，必须 `webUtils.getPathForFile`；监听挂 window **capture 阶段**。

### 主题系统（新增皮肤同步 6 处）
1. `src/shared/types.ts`：`ThemeName` 联合类型
2. `src/main/config.ts`：`normalizeTheme` 白名单
3. `src/renderer/theme.ts`：`THEMES` / `THEME_SWATCHES` / `THEME_BACKGROUND`
4. `src/renderer/styles.css`：`:root[data-theme='<name>']` 变量块（`--bg/--bg-raised/--bg-inset/--border/--border-strong/--text/--text-muted/--text-faint/--accent/--accent-dim/--accent-glow/--accent-glow-strong/--accent-soft/--accent-strong/--focus-ring/--selection/--warn/--danger`，另需 `color-scheme`）
5. `src/renderer/components/SidebarFooter.tsx`：设置色板（隐藏主题需按 `funUnlockedNeon` 过滤）
6. 浅色皮肤补 hover 深色底覆盖规则

## 6. 开发约定

- 新增 IPC 通道按顺序改四处：`shared/ipc-contract.ts`（channel）→ `shared/types.ts`（类型 + `CodeAgentDeskApi`）→ `main/ipc-*.ts`（对应域 handler）→ `preload/index.ts`（CHANNELS 副本 + api）。
- 会话文件定位统一走 `ipc-utils.ts` 的 `locateSessionFile()`。
- 弹窗组件一律 `React.lazy`；空状态用 `EmptyState`；数字展示用 `useAnimatedNumber`；弹窗支持 Esc（`useEscape`）。
- 高频统计主进程加 TTL + 显式失效；任何调 claude 的功能声明输入上限并优先增量。
- 提交前至少 `npm run typecheck` + `npm run test` + `npm run build`；提交信息中文、多个 `-m`。

## 7. 测试现状

- Vitest（`npm run test`）：15 用例，覆盖 buildMarkdown 导出、JSONL 解析工具链、parseSummary。
- 主进程测试用 `vi.mock('electron')`；测试文件在 `src/**/__tests__/`，已从构建 tsconfig 排除（`vitest.config.mts`）。
- 可补：用量聚合、活跃时长、MBTI/宠物树等纯函数（`renderer/mbti.ts` 建议补用例）。

## 8. 建议下一步（按 ROI）

1. **知识库同步 CLAUDE.md** ✅（已实现：单项目 + 全局）
2. 上下文占用预警（侧边栏估算 token，长会话标红）
3. 日报/周报定时提醒（晚间通知生成草稿）
4. 会话标签系统（自定义标签跨分组筛选）
5. 团队向：CLAUDE.md 模板库、知识库/总结同步团队 git 仓库、团队周报汇总
6. 功能使用统计（本地统计各功能使用次数，指导培训/删减）
