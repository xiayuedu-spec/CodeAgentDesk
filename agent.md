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
│  ├─ export.ts           # Markdown 导出
│  └─ ui-state.ts         # ui-state.json（自动恢复标签页）
├─ preload/index.ts       # contextBridge 暴露类型化 API
├─ renderer/              # React + Vite
│  ├─ App.tsx             # 主界面、模式切换、右键菜单
│  └─ components/
│     ├─ TitleBar.tsx     # 自绘窗口标题栏
│     ├─ TerminalPane.tsx # xterm + 复制粘贴/滚轮
│     └─ SessionDetail.tsx # 会话详情视图
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
- `session-meta.json`：`{ [sessionId]: { customName?, archived?, archivedAt?, archivedPath?, cwd? } }`
- `ui-state.json`：`{ openSessionIds: [], activeSessionId? }`（自动恢复上次打开的标签）
- `archive/<encodedDir>/<sessionId>.jsonl`：归档会话文件

## 4. Claude JSONL 事实清单（重要，别凭假设）

- 首行是 `last-prompt`，只有 `sessionId`/`leafUuid`，没有 `cwd`。
- 前 3 行（`last-prompt`/`mode`/`permission-mode`）和 `file-history-snapshot` 不带 `cwd`；从第 4 行起的大多数事件带顶层 `cwd` + `entrypoint:"cli"`。
- `ai-title` 事件是官方标题，可能多次出现，取最后一次；短会话可能没有。
- assistant 事件顶层类型可能是旧版 `message`（带 `role:"assistant"`）或新版 `assistant`，解析器两个都要兼容；user 事件顶层类型是 `user`。
- `user.message.content` 可能是字符串，也可能是 content block 数组（text / tool_result）。
- token 用量在 assistant 事件的 `message.usage`：`input_tokens`、`output_tokens`、`cache_read_input_tokens`、`cache_creation_input_tokens`；同一 `message.id` 会出现多次，统计时按 id 去重取最后一次。
- 会话绑定：watcher 监听 claudeHome，新增 `.jsonl` 后扫描前 200 行找顶层 `cwd` 与 pendingSpawn 匹配。

## 5. 已实现功能

- 多标签并行运行 claude（node-pty + xterm）
- 新建会话（目录选择）、历史会话一键 `--resume`（点击即恢复终端，不再自动弹详情）
- 自动恢复上次打开的标签页
- 会话重命名（右键）、归档、恢复；归档会话“借出”运行（借出期间仍留在归档列表并高亮，切走自动放回；右键可永久恢复）
- 会话详情视图（右键“查看详情”：用户/Claude 文本 + 工具调用折叠卡片，不展示 JSON 输入）
- 导出 Markdown、复制会话内容
- 全文搜索（返回可读的用户输入/Claude 输出，不带 JSON）
- token 用量 / 请求数实时统计（3 秒刷新）
- Info 面板：token 用量条形对比（输入/输出/缓存）+ 请求数徽标，可折叠（标签栏右侧图标，折叠后终端全宽）
- 状态色语义统一：启动=黄 / 运行=绿 / 结束=灰，侧边栏/标签/终端 chrome 三处状态点带 hover 提示
- 主题切换 cross-fade（240ms）
- Claude 目录可配置（侧边栏齿轮）
- 皮肤切换（左下角设置，3 列色卡紧凑弹窗）：深色默认 / Mac 浅色 / 护眼豆沙绿 / 暖纸米黄 / 琥珀夜间 / 柔雾深青；终端配色随主题联动，窗口底色同步
- 自绘窗口标题栏（Windows 隐藏系统标题栏，自定义最小化/最大化/关闭，窗口底色随主题同步）
- 终端轻量 chrome：标题、运行状态点、复制内容/查看详情按钮
- 底部状态栏：会话数、归档数、Claude 目录、版本号
- 克制动效（160ms 淡入）与右键菜单图标/分隔线
- 全局快捷键：`Ctrl+T` 新建、`Ctrl+W` 关闭、`Ctrl+K` 搜索、`Ctrl+1..9` 切标签
- 终端内 `Ctrl+C` 复制选中、`Ctrl+V` 粘贴、右键菜单复制/粘贴
- 终端栈常驻挂载：关闭一个标签不会卸载其他会话的终端
- 表面层次精修：面板内顶高光 + 柔和阴影、hover/焦点环（深色主题）
- 侧边栏可拖拽调宽（右缘手柄，180–480px）
- 会话列表键盘导航：聚焦列表后 ↑/↓ 移动 + Enter 打开；未按键不显示高亮（navIndex 初始 -1，避免默认高亮第一行）
- 激活终端自动聚焦：新建会话/切标签后 xterm 自动 `focus()`，可直接输入
- 会话行 hover 显示完整路径（`session-cwd` 加 `title`）
- 状态"启动中"呼吸动画（`startingPulse`，区别于 running 的外扩脉冲）
- 数字等宽对齐：`body` 设 `font-variant-numeric: tabular-nums`，token 数字刷新不抖动
- 圆角令牌化：`--radius-sm/md/lg` + `--shadow-card/pop`，主要控件统一走 `--radius-md`
- 无障碍属性：标签 `role="tab"` + `aria-selected`（tab-bar 为 `tablist`）、右键菜单 `role="menu"`（终端菜单带 `menuitem`）
- 欢迎页/空状态引导卡：品牌图标 + 「新建会话/打开历史会话」按钮 + 快捷键提示（替换原假终端行；无激活会话时显示，`grid-column: 1/-1`）
- 微交互：搜索/工具卡 hover 上浮 `translateY(-1px)`、全局按钮按压 `scale(0.98)`、标签切换时终端淡入（`viewIn`）
- 搜索命中关键词高亮（`<mark>`，`highlight()` 大小写不敏感分词）+ 搜索框一键清空按钮
- 会话行显示相对时间（"3 分钟前"，`renderTime`/`formatRelativeTime`）；消息数徽标曾加后回退，勿再添加
- 会话列表加载骨架屏（shimmer，`loadingList` 状态下 4 条占位）
- 标签拖拽排序（HTML5 drag 重排，顺序随 ui-state 持久化）

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

- 目前没有自动化测试，只有 `typecheck` / `build` / 手工清单。
- 建议后续按 `DESIGN.md` 第 11 节补 Vitest：JSONL 解析器、标题提取、Markdown 导出、绑定匹配逻辑。

## 9. 建议下一步

1. 历史列表实时刷新（watcher 事件推给渲染层，新会话结束即时出现）
2. 详情视图 Markdown + 代码高亮
3. 多选批量归档 / 导出
4. 用量趋势与月度报表
5. 系统通知（会话结束 / 异常退出）
6. 设置面板扩展（主题、字体、claude 可执行文件路径）
