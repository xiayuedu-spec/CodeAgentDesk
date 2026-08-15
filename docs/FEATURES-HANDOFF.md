# 功能交接文档：近期新增功能实现指南（供二次开发借鉴）

> 用途：另一个项目需要借鉴本仓库近期新增的功能。本文档按「功能 → 交互 → 实现要点 → 涉及文件 → 坑位」组织，接手 agent 可按模块独立实现，也可整体移植。
> 技术栈参考：Electron + React 19 + TypeScript + Vite，IPC 走 preload 白名单，本地 JSON 存储（`%APPDATA%/app`）。

---

## 0. 通用基建与可复用模式（先读这个）

### 0.1 四端同步模式（新增任何 IPC 都必须走）
任何功能都要同步 4 处，缺一不可：
1. `shared/types.ts`：类型 + `CodeAgentDeskApi` 接口（preload 暴露给渲染层的 api 类型）
2. `shared/ipc-contract.ts`：`IpcChannel` 常量（主进程/渲染层共享的 channel 名）
3. `main/ipc-*.ts`：主进程 handler（按域拆分文件，见 0.2）
4. `preload/index.ts`：`CHANNELS` 常量（与 IpcChannel 同名镜像）+ `api` 实现

### 0.2 IPC 按域拆分
主进程 handler 按域拆文件：`ipc-app`（配置/窗口/UI 状态）、`ipc-sessions`、`ipc-groups`、`ipc-summary`（总结/知识库）、`ipc-usage`（统计/效率）、`ipc-fun`（趣味）。聚合入口 `ipc.ts` 的 `registerIpcHandlers(sessions, watcher, metaStore, groups, onClaudeDirChanged)` 逐个调用各域 register。各域 register 只接收自己需要的依赖，共享助手（`locateSessionFile`/`weekRangeFor`/`collectRangeText`/`emptyUsage`）放 `ipc-utils.ts`。

### 0.3 可复用 hooks（渲染层）
- `useDismiss(open, onClose, onEscape?)`：点击外部/右键/Esc 关闭弹层。⚠️ 若开关按钮在弹层外，按钮 onClick 必须 `event.stopPropagation()`，否则会被窗口 click 监听器立刻关闭（见坑位 #8）。
- `useEscape(open, onClose)`：弹窗按 Esc 关闭。
- `useAnimatedNumber(value, durationMs)`：数字平滑过渡（三次缓动）。
- `useAgentStatus` / `useSessionAgentStatuses`：见模块 B。
- `usePomodoro(durationMs)`：见模块 C。

### 0.4 主进程统计缓存（TTL）
高频统计（dashboard/funStats）在主进程加 60s TTL 缓存 + 显式失效函数（配置变化时调用），渲染层轮询/事件刷新打缓存，避免每次全量扫描会话文件。

### 0.5 Token 预算纪律（若功能要调 Claude）
每小时限额 1000 万 token 是硬约束：每会话最多读 N 字符、最多取 N 个会话、总输入截断到上限（约 4 万 token，占 <0.5%）、估算按 3 字符/token 保守高估、增量更新只处理变更会话。

---

## 模块 A：效率洞察与趣味数据（统计类）

### A1. 效率洞察（每周投入时长 / 省时估算 / 输出占比）
- **交互**：弹窗，‹ › 切周；卡片：会话数 / agent 投入时长 / 较上周时长 Δ / 约省时（人工 ×2.5 估算）/ 输出 token 占比；本周每日时长柱状图；耗时最多会话列表（时长+输出占比）。
- **实现要点**：
  - 活跃时长 `readSessionActiveMs(file)`：扫描会话 JSONL 的事件 `timestamp`，累计相邻间隔 ≤ 5 分钟的时长（排除挂机）；无时间戳回退为 `updatedAt - startedAt` 跨度。
  - 归周/归日按会话 `startedAt`；周范围 `weekRangeFor(monday?)`（周一为一周起点，跨 7 天）。
  - 聚合函数 `computeEfficiencyInsights(claudeHome, metaStore, weekStart?)`（`ipc-usage.ts` 导出，供其他模块复用）。
  - IPC：`efficiency:insights` → api `getEfficiencyInsights(weekStart?)`。
- **涉及**：`session-library.ts`、`ipc-usage.ts`、`components/EfficiencyInsightsModal.tsx`。

### A2. 趣味数据（成就徽章 / 项目性格）+ 等价物 + 段位
- **成就**：`ipc-fun.ts` 定义徽章表（🐣首个会话 / 🥇100 会话 / 🔥连续 7 天 / 🌙凌晨活跃 / ⚡单日输出 50 万+ / 🎯本周省时 10h+ / 🧹同周归档 10+），从记录数据一次性判定 unlocked。
- **项目性格**：按会话数取前 5 项目，平均跨度 ≥45min→深耕型 / 会话≥10→高频协作型 / ≤10min→快闪型 / 其他→稳定推进型，附统计。
- **等价物/段位**（纯渲染层）：token≈书（10 万/本）、省时≈工作日（8h/天）；今日段位按输出分档 🥉→👑。
- **MBTI**：`renderer/mbti.ts` 纯函数，I/E 按深夜活跃占比、N/S 按活跃项目数、T/F 按输出占比、J/P 按分组+置顶+归档率，输出四字母+倾向度+解读。
- **摸鱼指数 / 电子宠物树**：摸鱼按今日输出分档给趣味文案；宠物树按**累计输出 token**（`DashboardStats.totalOutputTokens`，dashboard 单次遍历顺带累计）5 阶段成长（🌰→🌱→🌿→🌳→🌟🌳）+ 进度条。
- IPC：`fun:stats`（60s TTL）→ api `getFunStats()`。
- **涉及**：`main/ipc-fun.ts`、`renderer/mbti.ts`、`components/EfficiencyInsightsModal.tsx`、`components/Welcome.tsx`、`components/Dashboard.tsx`。

### A3. Dashboard 单次遍历 + TTL（性能关键）
- `dashboardStats` handler 对全部会话**单次遍历**同时累计：今日会话数/项目分布/今日 token/当前小时 token/累计输出；60s TTL 缓存；`configSetTokenLimit` 时显式失效。
- 渲染层 `useDashboardStats`：挂载刷新 + 60s 兜底 + `onSessionsChanged` 事件刷新（主进程 TTL 兜底，不会反复全量扫描）。

---

## 模块 B：Agent 状态机（🧠/✨/😴/🚨）

- **目标**：每个运行中会话显示 agent 状态：🧠 思考中 → ✨ 回合刚完成（4s）→ 😴 空闲；🚨 有待处理审批。
- **交互**：状态栏最左侧显示**当前活动会话**状态表情；会话列表每行左侧显示各自状态（可设置切换为颜色圆点）。
- **实现要点**（`renderer/hooks/useAgentStatus.ts`，`useSessionAgentStatuses` 按 pty id 维护 Map）：
  1. 订阅 `onSessionData`，按 id 过滤。
  2. **真实活动量判定**：3 秒窗口内累计输出字节 ≥ 24 才视为思考（过滤 TUI spinner/状态栏微重绘噪声）。
  3. 停止 8s 后：该段活动持续 ≥ 20s → ✨ 4s → 😴；否则直接 😴。
  4. 🚨 只在**安静期**检测：最近 600 字符命中审批特征（`allow?` / `proceed?` / `y/n` / 是否继续 / 允许 / 批准）。
  5. 会话退出（`onSessionExited`）清理状态与定时器。
  6. **resize 重绘突发**：`TerminalPane` 在 `onResize` 后广播 `window.dispatchEvent(new CustomEvent('agent-status-ignore', { detail: id }))`，状态机在 1.5s 内忽略该会话输出——否则切标签/调整大小时 TUI 整屏重绘会被误判为"思考"（核心坑位）。
- **显示方式设置**：`AppConfig.agentStatusStyle: 'emoji' | 'dot'`（config 持久化，设置弹窗二选一，会话行条件渲染表情或彩色圆点）。
- **涉及**：`hooks/useAgentStatus.ts`、`components/TerminalPane.tsx`（resize 广播）、`components/SidebarBody.tsx`（行内表情/圆点）、`components/StatusBar.tsx`（活动会话表情）、`components/SidebarFooter.tsx`（设置）。

---

## 模块 C：工作流趣味（番茄钟 / 幸运签 / 打字机 / 彩蛋主题）

### C1. 番茄钟（可配置时长）
- `hooks/usePomodoro(durationMs)`：25min 默认，倒计时每秒 tick；完成时 Web Audio 双音阶提示音（无资源文件）+ `finished` 标记供上层弹 toast。
- 状态栏 🍅 按钮：左键开始/暂停、右键重置（`onContextMenu` preventDefault）；运行中高亮 + 进度 tooltip。
- 时长配置：`AppConfig.pomodoroMinutes`（1-180，默认 25），设置弹窗输入+保存；hook 在「未运行时且配置变化」时同步剩余时间。
- **涉及**：`hooks/usePomodoro.ts`、`components/StatusBar.tsx`、`components/SidebarFooter.tsx`、`main/ipc-app.ts`。

### C2. 首页趣味（幸运签 / 打字机 / 摸鱼 / 宠物树 / MBTI 同页）
- 幸运签：16 条程序员风味"宜/忌"，按日期哈希确定性轮换（`fortuneOf(dateKey)`）。
- 打字机：`useTypewriter(text, speed)` 逐字显示标题 + 闪烁光标（CSS `cursorBlink`）。
- **涉及**：`components/Welcome.tsx`。

### C3. 霓虹彩蛋主题
- 连点状态栏版本号 7 次 → IPC `fun:unlock-neon` 写 `AppConfig.funUnlockedNeon` → toast 提示 → 设置皮肤列表出现隐藏主题「霓虹」（深紫底 + 青色霓虹 accent + 品红选区，纯 CSS 变量块 `:root[data-theme='neon']`）。
- 主题类型 `ThemeName`、`normalizeTheme` 白名单、`theme.ts`（THEMES/THEME_SWATCHES/THEME_BACKGROUND）、设置弹窗过滤未解锁主题，四处同步。
- **涉及**：`main/ipc-fun.ts`、`main/config.ts`、`renderer/theme.ts`、`components/SidebarFooter.tsx`、`components/StatusBar.tsx`。

---

## 模块 D：工作时间线回放

- **交互**：弹窗，‹ › 切天（今天标注）；左侧 0-24 小时刻度；每个会话一条时间条（top=startedAt、height=起止跨度），**同项目同色**（cwd 哈希取 HSL）；重叠会话**贪心分道**（按开始时间排入第一条已结束的泳道，`grid-template-columns` 分列）；点击时间条打开会话详情；顶部汇总（会话数/首末段/活跃合计）。
- **实现**：IPC `timeline:day` → `computeDayTimeline(claudeHome, metaStore, date)`：按 startedAt 归日，跨午夜收窄到当天，复用 `readSessionActiveMs` 算活跃时长；渲染层 `TimelineModal`（HOUR_TICKS 刻度 + 绝对定位 bar）。
- **涉及**：`main/ipc-usage.ts`、`components/TimelineModal.tsx`、`components/Dashboard.tsx`（入口按钮）。

---

## 模块 E：导航与交互优化

### E1. 首页随时可开
- `homeOpen` 状态：状态栏「首页」按钮 → 内容区全宽渲染 Welcome（`grid-column: 1/-1` 天然适配，`.content.home` 隐藏右侧信息列）；点击任意会话标签/行自动退出首页（`activeId` 变化 effect + TabBar onSelect 包装）。
- **涉及**：`App.tsx`、`styles.css`。

### E2. 状态栏收纳
- 底部只留高频：agent 表情 · 会话/归档数 · 首页 · 今日总结 · 番茄钟 · ☰更多；低频入口（用量趋势/知识库/效率洞察/今日概览/时间线）收进「更多」弹出菜单（带图标，向上弹出，点外部/Esc 关闭——`useDismiss` + 按钮 `stopPropagation`）。
- **涉及**：`components/StatusBar.tsx`。

### E3. 命令面板精简
- 会话相关只留「新建会话… + 最近目录」；**逐条历史/归档会话、导出当前会话、切换主题**项全部移除（右键菜单保留这些操作，功能不丢）。

### E4. 全部弹窗 Esc 关闭
- `useEscape(open, onClose)` 覆盖：日报/周报/月报、今日概览、知识库、用量趋势、效率洞察、时间线、会话详情、删除确认框；SummaryModal 特殊：编辑中先 Esc 取消编辑、再按才关闭。命令面板原本已有 Esc。

---

## 模块 F：视觉统一（一次性改造清单）

1. **自定义滚动条**：`*::-webkit-scrollbar { width: 6px }` + 圆角 thumb（`var(--border-strong)`，hover 变 accent）+ Firefox `scrollbar-width: thin`。
2. **空状态插画化**：`EmptyState` 组件（72px 圆角图标容器 + accent 柔和底 + 标题 + 提示），替换所有 `archive-empty` 纯文字空态。
3. **数字过渡**：`useAnimatedNumber`（400ms 三次缓动）用于限额百分比/token、今日概览数字。
4. **渐变色点缀**：侧边栏 `::before` radial accent 光晕（`--accent-soft`，所有主题都定义）；首页图标外圈光晕；注意光晕 z-index 与内容层（`.sidebar-body/.sidebar-footer` 设 `position:relative; z-index:1`）。
5. **hover 统一**：卡片（dashboard/eff/summary）统一 `translateY(-1px) + accent 边框 + 220ms`。
6. **图标补齐**：所有文字按钮补 lucide 图标。
7. **输入框主题化**：⚠️ 设置里的数字输入框（限额/番茄钟）必须显式给 `background: var(--bg-inset); color: var(--text)`，否则浏览器默认白底在深色主题下扎眼；加防御规则 `.settings-popover input` 兜底。
8. **行内按钮宽度**：⚠️ 复用 `.settings-action`（全宽按钮）做行内"保存"会被 `width:100%` 挤爆输入框——必须覆盖 `.settings-limit-save { flex:none; width:auto; margin-top:0; height:28px }`。

---

## 模块 G：近期实用功能（小功能清单）

| 功能 | 实现要点 |
|---|---|
| 打开工作目录 | IPC `session:open-cwd` → `shell.openPath(cwd)`；右键菜单项，无 cwd 置灰 |
| 分组颜色调整 | 已有 `groups:set-color` IPC，补右键菜单颜色选择器（8 预设 + `input[type=color]` 自定义，选中描边） |
| 搜索内联预览 | `SearchHit.context[]`（命中行 ±2 行，含 hitIndex）+ 多行预览渲染，命中行高亮；点击跳详情定位 |
| 会话置顶/收藏 | `SessionMeta.pinned/pinnedAt` + `session:set-pinned` IPC；分组/未分组列表 `withPinnedFirst` 稳定分区；行内图钉图标；右键菜单置顶/取消置顶 |
| 任务完成通知 | `SessionManager` 记 startedAt，onExit 带 `durationMs`；退出码 0 且运行 ≥3min 且窗口不在前台 → 系统通知（复用焦点恢复 helper） |
| 归档删除确认框 | 替换 `window.confirm` 为应用内 `.confirm-overlay/.confirm-dialog` 弹窗，Esc 取消 |
| 日志口径标注 | 小时用量按 updatedAt 归小时（跨小时长任务集中到结束小时），函数注释标明口径 |

---

## 坑位清单（二次开发务必避开）

1. **`??` 与 `||` 混用**会触发 TS5076，需加括号：`a ?? (b || c)`。
2. **useDismiss 与开关按钮**：开关按钮在弹层外时，onClick 必须 `stopPropagation()`，否则窗口 click 监听会立刻关闭弹层（状态栏「更多」踩过）。
3. **agent 状态机的 resize 噪声**：TerminalPane resize 会触发 TUI 整屏重绘（一大波数据），必须用 `agent-status-ignore` 事件窗口忽略，否则"点进去就思考中→回合完成→空闲"假循环。
4. **TUI 周期性重绘**：Claude Code 状态栏每秒重绘，纯"有数据=思考"会永远卡在思考中——必须用活动量门限（3s/24B）+ 长静默阈值（8s）。
5. **`.settings-action` 全宽陷阱**：行内复用必须覆盖 width。
6. **数字输入框默认白底**：必须显式主题化，否则深色主题下扎眼。
7. **统计缓存与配置联动**：有 TTL 的统计要在配置变化（如限额）时显式失效。
8. **周/日归口**：统一按 `startedAt` 归周/日，跨午夜/跨周会话收窄，文档注释标明口径（避免审计歧义）。

---

## 工程实践（接手 agent 的操作约定）

- 命令：`npm.cmd run typecheck`（tsc 双工程）、`npm.cmd run test`（vitest，15 用例）、`npm.cmd run build`（tsc main + vite）。
- 提交：每轮功能通过 typecheck + 全量测试后 `git commit` + `git push`；提交信息中文、多个 `-m`（避免引号/反引号问题）。
- 测试：主进程纯逻辑（导出/解析/汇总）用 vitest + `vi.mock('electron')`；测试文件放 `src/main/__tests__/`，tsconfig 已排除。
- 弹窗组件一律 `lazy()` 懒加载，减小主 chunk。
