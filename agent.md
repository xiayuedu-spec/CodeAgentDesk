# CodeAgentDesk Agent 交接文档

> Claude Code 统一窗口管理器：一个 Electron 桌面应用，用来并行管理、恢复、搜索和归档 `claude` 会话。设计说明见 `DESIGN.md`，本文是给后续接手的 agent 看的“工程现状 + 坑点”。

## 1. 快速开始

```powershell
# 开发模式（会先编译主进程，再起 Vite + Electron）
npm run dev

# 或者双击 start-dev.cmd（失败时会保留窗口显示原因）

# 只做类型检查 / 只做构建
npm run typecheck
npm run build

# 构建后运行 / 打包
npm start
npm run package

# node-pty 原生模块重编译（重装依赖后必须执行）
npm run rebuild
```

常用版本：Electron 43.x、Vite 8.x、React 18/19（npm 最新）、node-pty 1.1.0、chokidar 4.0.3、`@xterm/xterm`。

## 2. 架构

```
src/
├─ main/                  # Electron 主进程（所有重活）
│  ├─ index.ts            # 入口：单实例锁、装配、watcher 启动
│  ├─ ipc.ts              # 全部 IPC handler + 文件定位
│  ├─ window-manager.ts   # 主窗口 + broadcast
│  ├─ session-manager.ts  # node-pty 托管 claude 进程
│  ├─ session-watcher.ts  # 监听 JSONL 新增并绑定 sessionId
│  ├─ session-library.ts  # 扫描 JSONL、搜索、详情、用量统计
│  ├─ session-meta-store.ts  # session-meta.json（重命名/归档标记）
│  ├─ config.ts           # config.json（claude 目录）+ 目录解析
│  ├─ group-store.ts      # groups.json（手动分组定义：名称/颜色）
│  ├─ export.ts           # Markdown 导出
│  └─ ui-state.ts         # ui-state.json（自动恢复标签页）
├─ preload/index.ts       # contextBridge 暴露类型化 API
├─ renderer/              # React + Vite
│  ├─ App.tsx             # 容器组件：会话/分组状态 + effects + handlers + 组装（约 1400 行）
│  ├─ session-utils.tsx   # 共享类型（SessionView/Mode/菜单状态/分组区块）+ 纯函数（标题/时间/高亮）
│  ├─ theme.ts            # 主题常量（窗口底色/色卡/展示名）
│  ├─ hooks/              # 按功能域抽取的状态逻辑
│  │  ├─ useUiState.ts    # 应用信息 / Claude 目录配置 / 最近目录 / 设置弹窗 / 全局错误
│  │  ├─ useSearch.ts     # 模式切换 + 搜索输入与防抖结果
│  │  ├─ usePalette.ts    # 命令面板（过滤/键盘导航/选中执行）
│  │  └─ useSummary.ts    # 总结弹窗（今日/月度/日历/历史）
│  └─ components/
│     ├─ TitleBar.tsx     # 自绘窗口标题栏
│     ├─ TerminalPane.tsx # xterm + 复制粘贴/滚轮
│     ├─ SessionDetail.tsx # 会话详情视图（lazy）
│     ├─ SummaryModal.tsx # 总结弹窗：今日/月度/日历/历史（lazy）
│     ├─ CommandPalette.tsx # 命令面板（lazy）
│     ├─ SidebarBody.tsx  # 侧边栏主体：搜索框/模式切换/会话列表（含分组区块与行渲染）
│     ├─ SidebarFooter.tsx # 底部：新建菜单/分组管理/设置弹层
│     ├─ TabBar.tsx       # 标签栏（拖拽排序）
│     ├─ InfoPanel.tsx    # 右侧信息面板（token 用量）
│     ├─ Welcome.tsx      # 欢迎页
│     ├─ StatusBar.tsx    # 底部状态栏
│     ├─ SearchResults.tsx # 搜索结果视图
│     ├─ ContextMenus.tsx # 会话/分组/移动子菜单三件套
│     └─ ErrorBoundary.tsx # 崩溃兜底
└─ shared/
   ├─ ipc-contract.ts     # 通道名唯一来源
   └─ types.ts            # IPC 类型 + CodeAgentDeskApi
```

主进程持有全部能力（pty、搜索、存储、导出），渲染进程只通过 preload 暴露的类型化 API 调 IPC。

## 3. 数据位置

### Claude 目录（可配置）

解析优先级：`config.json#claudeDir` → `CLAUDE_CONFIG_DIR` → `~/.claude`。

会话文件固定形如：

```
<claudeHome>/projects/<encodedDir>/<sessionId>.jsonl
```

其中 `encodedDir = cwd.replace(/[\\:]/g, '-')`，例如 `D:\ai\CodeAgentDesk` → `D--ai-CodeAgentDesk`。

### 应用数据（Windows 为 %APPDATA%/codeagentdesk）

- `config.json`：`{ "claudeDir": "...", "theme": "default" | "mac" | "green" | "sepia" | "amber" | "mist" }`
- `session-meta.json`：`{ [sessionId]: { customName?, archived?, archivedAt?, archivedPath?, cwd?, summary?, tags?, group? } }`（`group` 为分组 id）
- `groups.json`：`[{ id, name, color }]`（手动分组定义，按数组顺序展示）
- `ui-state.json`：`{ openSessionIds: [], activeSessionId?, collapsedGroups: [], collapsedSections: [] }`（自动恢复上次打开的标签 + 分组/区块折叠状态）
- `recent-dirs.json`：最近使用的工作目录（去重，最多 8 个）
- `summaries.json`：已归档总结 `{ days: { [date]: {text,updatedAt} }, months: { [month]: {...} } }`
- `window-state.json`：窗口位置/大小/最大化状态（`getNormalBounds` 保存，恢复时校验屏幕可见性）
- `archive/<encodedDir>/<sessionId>.jsonl`：归档会话文件

## 4. Claude JSONL 事实清单（重要，别凭假设）

- 首行是 `last-prompt`，只有 `sessionId`/`leafUuid`，没有 `cwd`。
- 前 3 行（`last-prompt`/`mode`/`permission-mode`）和 `file-history-snapshot` 不带 `cwd`；从第 4 行起的大多数事件带顶层 `cwd` + `entrypoint:"cli"`。
- `ai-title` 事件是官方标题，可能多次出现，取最后一次；短会话可能没有。
- assistant 事件顶层类型可能是旧版 `message`（带 `role:"assistant"`）或新版 `assistant`，解析器两个都要兼容；user 事件顶层类型是 `user`。
- `user.message.content` 可能是字符串，也可能是 content block 数组（text / tool_result）。
- token 用量在 assistant 事件的 `message.usage`：`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`；同一 `message.id` 会出现多次，统计时按 id 去重取最后一次。
- 会话绑定：watcher 监听 claudeHome，新增 `.jsonl` 后扫描前 200 行找顶层 `cwd` 与 pendingSpawn 匹配。

## 5. 功能清单（当前全部已实现）

> 供与其他项目对比、后续集成新能力。按类别分组。

### 5.1 会话管理（核心）
- 多标签并行运行 claude（node-pty + xterm），每标签一个独立会话
- 新建会话（目录选择）；**最近目录快速新建**（`recent-dirs.json` 持久化、去重保留 8 个，新建弹层一键开会话）
- 历史会话一键 `--resume`（点击即恢复终端，不自动弹详情）
- 自动恢复上次打开的标签页（`ui-state.json`）
- 会话重命名（右键）、归档、恢复；归档会话"借出"运行（借出期间留在归档列表并高亮，切走自动放回；右键永久恢复）
- **归档多选删除**：归档列表复选框多选 + 全选，工具栏两段式确认删除（删 JSONL + 清理 session-meta；借出运行中的会话跳过）
- **手动分组管理**：`groups.json` 存分组（名称+颜色）；分组是会话管理的核心容器——**运行中 + 历史会话都按组归类**（运行中在前，点击行切换/恢复），分组区块默认在侧边栏上方、可折叠（折叠状态随 ui-state 持久化）；未分组会话回落到"当前会话 / 历史会话"区块（无"未分组"区块）；会话右键"移动到分组"（含新建分组/移出分组），分组右键重命名/删除（删除自动清空成员）；侧边栏底部"分组管理"弹层可建组/改名/换色/删组
- 历史列表实时刷新：watcher 检测 `.jsonl` 新增/删除 → 广播 `sessionsChanged` → 渲染层自动刷新
- 拖放目录开会话（虚线 overlay，`webUtils.getPathForFile` 取路径，主进程 `isDirectory` 校验）
- 终端栈常驻挂载：关闭一标签不卸载其他会话终端，滚动记录不丢
- 激活终端自动聚焦：新建/切标签后 xterm 直接可输入

### 5.2 搜索与详情
- 全文搜索：跨全部会话 JSONL，返回可读用户输入/Claude 输出（不带 JSON）
- 搜索命中关键词 `<mark>` 高亮 + 搜索框一键清空；**命中行点击 → 详情视图定位并高亮对应条目**
- 会话详情视图：用户/Claude 文本 + 工具调用折叠卡片（不展示 JSON 输入）
- 导出 Markdown、复制会话内容
- 会话行信息：相对时间（"3 分钟前"）、hover 完整路径

### 5.3 总结与 AI
- 会话 AI 摘要+标签：详情视图 ✨ 按钮，`claude -p` 无头生成，存 `session-meta.json`（`summary`/`tags`，60s 超时）；历史/归档行显示标签 chips + 摘要行
- 总结体系（自动归档到 `summaries.json`）：**今日/周报/月度**总结（周报聚合周一~周日，复用 `claude -p` 管线）+ **日历**（每格显示当天会话数、有归档带圆点、点某天查看或"找回"）+ **历史查看**（周/月/日列表看全文）；模态五标签（今日/周报/月度/日历/历史）；入口：底部状态栏胶囊 / 欢迎页 / Ctrl+P
- 相关 IPC：`session:summarize`、`day:summarize`（可传日期）、`month:summarize`、`summaries:list`、`summaries:get`

### 5.4 界面与主题
- 6 套主题：深色默认 / Mac 浅色 / 护眼豆沙绿 / 暖纸米黄 / 琥珀夜间 / 柔雾深青；设置弹窗色卡切换；终端配色联动、窗口底色同步、切换 cross-fade（240ms）
- 自绘窗口标题栏（Windows 隐藏系统标题栏，自定义最小化/最大化/关闭，底色随主题同步）
- 侧边栏（右缘）与右侧 Info 面板（左缘）均可拖拽调宽，180–480px
- Info 面板：token 用量条形对比（输入/输出/缓存）+ 请求数徽标，可折叠（折叠后终端全宽）
- 状态色语义统一：启动=黄 / 运行=绿 / 结束=灰，侧边栏/标签/终端 chrome 三处一致 + hover 提示
- 欢迎页引导卡、列表骨架屏、微交互（hover 上浮/按压反馈/切换淡入）、表面层次（面板内高光+柔和阴影）、圆角令牌化、数字等宽对齐、启动呼吸动画
- 无障碍：tab `role="tab"`/`aria-selected`、右键菜单 `role="menu"`/`menuitem`

### 5.5 交互与快捷键
- 命令面板 `Ctrl+P`：新建/最近目录/恢复历史/归档/搜索/导出/切主题/设置/每日总结，输入过滤 + ↑↓/Enter
- 全局快捷键：`Ctrl+T` 新建、`Ctrl+W` 关闭、`Ctrl+K` 搜索、`Ctrl+P` 命令面板、`Ctrl+1..9` 切标签
- 会话列表键盘导航：聚焦后 ↑↓/Enter 打开（未按键不高亮）
- 终端内 `Ctrl+C` 复制选中、`Ctrl+V` 粘贴、右键菜单复制/粘贴
- 未激活标签活动提醒：非激活标签有新输出时 dot 变黄快闪，切到后清除
- **系统通知**：会话**意外异常退出**时发 Windows 通知（主动关闭/归档/正常结束不打扰；`Notification` 点击聚焦窗口，`app.setAppUserModelId` 已配置）
- **用量趋势**：状态栏 / `Ctrl+P` 入口，近 14 天按日堆叠柱状图（`UsageTrendModal` 自绘 SVG，复用 usage 增量缓存聚合）
- **Token 限额预警**：主进程每 5 分钟检查近 1 小时窗口消耗（`getUsageWindow`，复用增量缓存），达限额 80%/100% 时系统通知（每档一次）；默认限额 1000 万/小时，可用 `config.json#tokenLimitPerHour` 覆盖；Dashboard/欢迎页显示消耗进度条（80% 黄 / 100% 红）
- **今日概览 Dashboard**：欢迎页（无会话时）内联展示今日统计（运行中/今日会话/输入输出 token/知识库项目数/今日总结状态）+ 今日活跃项目 chips + 快捷入口；`Ctrl+P`"今日概览"弹窗随时可看（`dashboard:stats` 聚合 listSessions + usage 趋势 + 知识库 + 总结）
- **项目知识库**：状态栏 / `Ctrl+P` 入口，按项目聚合会话 → `claude -p` 提炼知识文档（架构/命令/坑/决策/待办），存 `knowledge.json`（含会话指纹 `sessionIds`）；**增量更新**只处理新增/变更会话并把旧知识库作为上下文合并（无新增返回"已是最新"），另有全量重建；**使用方式**：查看/编辑/复制，或**导出 `PROJECT_KNOWLEDGE.md`** 到项目目录，新会话中让 claude 读取即可复用项目经验；**token 预算**：每会话 8k 字符、总输入 120k 字符（约 4 万 token，占小时限额 0.4%），估算按 3 字符/token 保守高估
- 标签拖拽排序（顺序随 ui-state 持久化）
- 底部状态栏：会话数、归档数、今日总结入口、Claude 目录、版本号

### 5.6 数据与配置
- Claude 目录可配置（侧边栏齿轮）；解析优先级 `config.json#claudeDir` → `CLAUDE_CONFIG_DIR` → `~/.claude`
- 数据文件：`config.json`（claudeDir/theme）、`session-meta.json`（重命名/归档/摘要/标签）、`ui-state.json`（标签恢复）、`recent-dirs.json`、`summaries.json`（日/月总结）、`archive/`（归档会话 JSONL）
- 会话文件定位统一走 `ipc.ts` 的 `locateSessionFile()`

### 5.7 工程底座
- Electron + React + Vite + TS；主进程持有全部能力（pty/搜索/存储/导出/总结），渲染层经 preload 类型化 API 调 IPC（`sandbox:true` + `contextIsolation`）
- `shared/ipc-contract.ts` 通道名唯一来源 + `shared/types.ts` 类型；新增通道改四处
- 元数据用 JSON 文件存储（未用 SQLite）；node-pty 编译补丁（patch-package）、chokidar v4、`webUtils` 拖放取路径
- 依赖：electron / react / node-pty / @xterm / chokidar / lucide-react / patch-package
- 健壮性：`before-quit` 清理全部 pty；主进程 `uncaughtException`/`unhandledRejection` 写 `userData/error.log`；渲染层 `ErrorBoundary` 兜底（不白屏）；生产构建由 `vite.config.mts` 注入 CSP（开发模式跳过）；`app.setAppUserModelId` 对齐 electron-builder appId
- 性能：会话列表有增量缓存（`session-library.ts` 按 mtime/size + `metaStore.getVersion()` 失效，只重读变化的 JSONL）；用量统计按字节偏移增量读（每 3s 轮询只扫新增行，超 2MB 回退全量）；`SessionDetail`/`SummaryModal`/`CommandPalette` 用 `React.lazy` 分包（`chunkSizeWarningLimit: 600`）

### 5.8 未实现（路线图，供对比）
- 分屏 split view（标签页内多窗格）
- 批量归档 / 批量导出 / 历史会话彻底删除（归档删除已支持）
- 系统通知（会话结束/异常）
- 会话固定/收藏
- 详情视图 Markdown 渲染 + 代码高亮
- 用量趋势图表 / 成本统计
- 后台 daemon 续跑（关应用会话继续）
- Prompt 模板库
- 跨会话 AI 问答（RAG）
- 项目交接文档 / 周报（目前只有每日/月度总结）
- 会话对比、任务/待办提取

## 6. 已知坑与工作区补丁

1. **node-pty 编译**：本机 VS2022 缺 Spectre 库（MSB8040），`patches/node-pty+1.1.0.patch` 通过 patch-package 自动移除 `SpectreMitigation`；同时把 `conpty_console_list_agent.js` 的 `AttachConsole` 失败包成空列表，避免 Electron 无控制台时崩溃。重装依赖后必须 `npm run rebuild` 重新编译原生模块。
2. **chokidar 用 v4**：v5 是纯 ESM，CJS 主进程 require 不了，不要升到 v5。
3. **Electron 二进制**：如果 `node_modules/electron/dist` 不存在，需要 `node node_modules/electron/install.js` 联网补装。
4. **preload 是 sandbox:true**：不能 `require` 本地模块，`preload/index.ts` 里通道名是手写副本，改 `shared/ipc-contract.ts` 时必须同步。
5. **dev 脚本**：Vite 固定 `127.0.0.1:5173`；`concurrently` 里 `&&` 后面不能再用 `npm:xxx` 简写，必须写 `npm run dev:electron`。
6. **终端滚轮**：Claude TUI 用 alternate screen 时滚轮行为由 claude 自己决定；xterm 使用默认滚轮行为并设 `scrollback: 10000`。读历史对话以“会话详情视图”为准。
7. **终端栈必须常驻挂载**：`App.tsx` 中终端栈在非搜索分支始终渲染，当前无激活会话（欢迎页）时只加 `.hidden`，详情打开时也只加 `.hidden`。关闭激活标签后若卸载其他终端，会导致其他标签的滚动记录丢失。
8. **归档会话“借出”**：点击归档行 → 先把 JSONL 移回 projects 并 resume，但 UI 里仍标记归档并高亮；切到其他标签或关闭时自动移回归档目录；右键“恢复”才是永久取消归档。
9. **自绘标题栏**：Windows 用 `titleBarStyle: 'hidden'` + `-webkit-app-region` 做拖拽区，窗口按钮走 `window:*` IPC；主题切换时通过 `window:set-background-color` 同步窗口底色，避免切换白闪。Mac 皮肤暂未做交通灯。
10. **设置弹窗定位**：紧凑设置弹窗是 `position:absolute; left:0; right:auto; bottom:42px; width:300px`，从侧边栏齿轮向右展开，避免被侧边栏裁切。内容再变多时建议改回独立设置页，而不是继续加高弹窗。
11. **AI 摘要用 claude 无头模式**：`summarize.ts` 用 `spawn('claude', ['-p'], { shell: process.platform === 'win32' })`，指令和会话文本（截断 20k 字符）都写进 stdin（`-p` 无参数，避免 shell 引号问题）；Windows 上 claude 是 `.cmd` 包装器，`spawn` 不能直接跑，必须 `shell:true`。消耗一次真实 token 调用、需 claude 在 PATH；60s 超时 kill；输出按 `摘要：`/`标签：` 两行解析，兜底取首行。`resolveClaudeCommand` 已从 SessionManager 抽成公共函数供 pty 用（`session-manager.ts`）。
12. **sessionCreate 校验目录**：新建/拖放开会话前 `fs.statSync(cwd).isDirectory()` 校验，非目录抛错给渲染层。
13. **拖放路径用 `webUtils.getPathForFile`**：Electron ≥32 已移除 `File.path`（43 里是 undefined），必须经 preload 暴露 `webUtils.getPathForFile(file)`（官方 pattern）；拖放监听挂在 window 的 **capture 阶段**，避免被 xterm 等子元素 stopPropagation 截断。

## 7. 开发约定

- 编辑用 `apply_patch`，尽量 ASCII 注释；界面文案保持中文。
- 新增 IPC 通道按顺序改四处：`shared/ipc-contract.ts` → `shared/types.ts` → `main/ipc.ts` → `preload/index.ts`（注意第 4 条的同步副本）。
- 会话文件定位统一走 `ipc.ts` 里的 `locateSessionFile()`，不要各写各的路径。
- 提交前至少跑 `npm run typecheck` 和 `npm run build`。

### 主题系统约定（新增皮肤必看）

新增一套皮肤需要同步以下 5 处，缺一处就会出现“文档说有、代码没有”或配色错乱：

1. `src/shared/types.ts`：`ThemeName` 联合类型加新值
2. `src/main/config.ts`：`normalizeTheme` 的 `allowed` 白名单加新值
3. `src/renderer/App.tsx`：
   - `THEME_BACKGROUND`（窗口底色）
   - `THEME_SWATCHES`（设置弹窗色卡预览）
   - `THEMES`（展示名称）
4. `src/renderer/components/TerminalPane.tsx`：`TERMINAL_THEMES` 加终端配色
5. `src/renderer/styles.css`：加 `:root[data-theme='<name>']` 变量块，必须包含
   `--bg/--bg-raised/--bg-inset/--border/--border-strong/--text/--text-muted/--text-faint/--accent/--accent-dim/--accent-glow/--accent-glow-strong/--accent-soft/--accent-strong/--focus-ring/--selection/--warn/--danger`

浅色皮肤（如 mac/green/sepia）还需要补 `hover` 用深色底色的覆盖规则，避免白色 rgba 在浅底上失效。硬编码主题色已全部收口为 CSS 变量，新增主题不要再写死 rgba。

## 8. 测试现状

- Vitest（`npm run test`）：已覆盖 buildMarkdown 导出、JSONL 解析（readChatEntries / readSessionInfo / readSessionDetail 工具链）、parseSummary 摘要解析，共 15 个用例。
- 主进程测试用 vi.mock('electron') 隔离；测试文件在 src/**/__tests__/，已从构建 tsconfig 排除（vitest.config.mts）。
- 后续可补：用量聚合、缓存失效、分组/归档逻辑。

## 9. 建议下一步

1. ~~历史列表实时刷新~~（已完成：watcher → `sessionsChanged` → 渲染层刷新）
2. 详情视图 Markdown + 代码高亮
3. 多选批量归档 / 导出
4. 用量趋势与月度报表
5. 系统通知（会话结束 / 异常退出）
6. 设置面板扩展（主题、字体、claude 可执行文件路径）
