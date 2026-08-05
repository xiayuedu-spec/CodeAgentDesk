# CodeAgentDesk 开发文档

> Claude Code 统一窗口管理器 —— 桌面应用
>
> 日期：2026-08-05 · 状态：设计稿

## 1. 背景与问题

Claude Code 以 CLI/终端会话方式工作。关闭终端窗口后，之前的会话"痕迹"不易找回：记录散落在 `~/.claude/projects/<编码目录>/<session-uuid>.jsonl`，没有统一入口查看、不能并行管理多个会话、不能跨会话全文搜索。

**关键洞察：会话记录其实一直在（append-only JSONL），缺的是管理它们的那层壳。**

## 2. 目标与非目标

### MVP 目标（第一版必须做到）
1. **多会话并行**：一个应用内用标签页同时跑多个 claude 会话，互不干扰。
2. **会话列表 + 一键恢复**：所有历史会话列出来，按项目目录分组；关掉应用再打开，一键 `--resume` 恢复。
3. **历史全文搜索**：在全部会话 JSONL 里搜关键词，结果按会话分组展示。
4. **会话详情查看 / 导出**：点开会话看到完整对话（代码块、工具调用），可复制、可导出 Markdown。

### 非目标（v1 不做，记入路线图）
- 关掉应用后后台继续跑（daemon 托管）——v1 行为：关闭即停止、记录保留、可恢复。
- 分屏多窗格（v1 只做标签页）。
- FTS5 全文索引（v1 用 ripgrep，够快够简单）。
- 云端同步、多人协作、认证。

## 3. 技术决策（已确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 形态 | 桌面应用 | 用户选定 |
| 技术栈 | Electron + Node (TypeScript 全栈) | node-pty/xterm.js 内嵌终端并托管 claude 进程；@vscode/ripgrep 自带搜索二进制 |
| 渲染层 | React + Vite | 生态成熟 |
| 元数据存储 | better-sqlite3（本地 SQLite） | npm 自带预编译二进制，**用户机器无需安装任何数据库**；仅开发/打包时用 electron-rebuild 或 electron-builder `install-app-deps` 适配 Electron ABI 一次 |
| 全文搜索 | @vscode/ripgrep 直接搜 JSONL | 无需系统装 rg；未来可平滑升级 FTS5 |
| 会话绑定 | 监听 `~/.claude/projects` 新增 JSONL，首行取 sessionId，再扫描事件校验 cwd | 不依赖 claude 输出 session id |
| 关闭行为 | 关闭应用 = 会话终止但记录保留，可恢复 | 用户选定 |

### 环境
- 主目标平台：Windows 11（用户当前环境）；Electron 天然跨平台，代码不做平台强绑定。
- claude 可执行文件：默认从 PATH 解析可执行文件；Windows 上 PATH 命中的是 `claude.ps1`，不能直接 spawn，需按 PATHEXT 解析 `claude.cmd`/`.exe` 或经 shell 启动。提供设置项自定义路径。

## 4. 架构总览

一个 Electron 主窗口。**主进程做全部"重活"**（进程托管、索引、搜索、存储），渲染进程只做 UI，通过类型化 IPC 通信。

```
┌─────────────────────────── Electron 主进程 ───────────────────────────┐
│                                                                        │
│  WindowManager       SessionManager       SessionIndexer/Watcher       │
│  (单例窗口/标签)       (node-pty 管理       (chokidar 监听             │
│                       claude 子进程)        ~/.claude/projects)        │
│                                                                        │
│  SearchService       ExportService        SessionStore (better-sqlite3)│
│  (@vscode/ripgrep)    (JSONL→Markdown)     (会话元数据索引)             │
│                                                                        │
└────────────────────────────┬───────────────────────────────────────────┘
                             │ 类型化 IPC (preload + contextBridge)
┌────────────────────────────┴───────────────────────────────────────────┐
│                       渲染进程 (React + Vite)                           │
│                                                                        │
│  侧边栏: 项目树→会话列表       标签栏: 打开的会话 (浏览器式)             │
│  xterm.js 终端面板            会话详情视图 (JSONL 渲染为聊天)            │
│  全局搜索视图 (按会话分组结果)                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 主进程组件职责

| 组件 | 职责 | 关键依赖 |
|---|---|---|
| `WindowManager` | 单实例锁、主窗口生命周期、标签状态管理 | Electron |
| `SessionManager` | spawn / 恢复 / 终止 claude；维护"窗口标签 ↔ 会话"绑定 | node-pty |
| `SessionIndexer` | 监听 JSONL 变化 → 增量更新 SQLite；提取标题、消息数、最后活动时间 | chokidar |
| `SessionStore` | SQLite 读写；会话元数据的唯一入口 | better-sqlite3 |
| `SearchService` | 对 JSONL 全文搜索，返回"会话 + 行号 + 命中片段" | @vscode/ripgrep |
| `ExportService` | JSONL 事件流 → 可读 Markdown | — |

**边界规则**：渲染进程不直接碰文件系统与进程，全部走 IPC。这既是安全隔离（渲染进程拿不到 Node 权限），也让主进程成为可单测的纯逻辑层。

## 5. 会话生命周期

### 5.1 新建会话（spawn）
1. 侧边栏点"＋ 新建会话"→ 目录选择对话框（默认上次使用的目录）。
2. `SessionManager.spawn(cwd)`：node-pty 以 `cwd` 启动 `claude`（设置 `TERM`、`COLORTERM` 环境变量）。立即创建标签页，xterm 渲染输出。
3. **绑定**：SessionIndexer 监听 `~/.claude/projects`。claude 启动后会出现新 JSONL；watcher 收到"新增文件"事件后，先读首行 `last-prompt` 取 `sessionId`，再扫描前 N 行（如 50 行）找第一个带顶层 `cwd` 的事件（实测前 3 行 `last-prompt`/`mode`/`permission-mode` 和 `file-history-snapshot` 不带 cwd，普通事件从第 4 行起带 `cwd` + `entrypoint:"cli"`），校验 `cwd` 与本次 spawn 一致、文件创建时间在 spawn 之后，即绑定 标签↔sessionId。文件刚创建时 cwd 事件可能尚未写入，需短暂等待/重试。
   - 为消除歧义：维护一个 `pendingSpawns: Set<{cwd, spawnedAt}>`，新文件与集合匹配；多个候选取最新；仍匹配不上时允许右键手动绑定。
4. 绑定成功后写入 SQLite（sessions 记录）。绑定前标签标题显示"启动中…"。

### 5.2 恢复会话（resume）
1. 侧边栏点某个会话 → `SessionManager.resume(sessionId, cwd)`：以 `cwd` 启动 `claude --resume <session-uuid>`。
2. 直接绑定（已知 sessionId，无需 watcher），并把 SQLite 中该会话 `ended_at` 清回 `NULL`。原 JSONL 继续 append，索引器从已处理偏移继续增量更新。

### 5.3 终止 / 关闭标签
1. 关闭标签：向 pty 发送 `Ctrl+C`（`\x03`），等 ~3s 未退出再 `pty.kill()` 强制结束并杀干净 claude 进程树；写入 `ended_at`。Windows 无 POSIX 信号，不使用 `SIGTERM`/`SIGKILL` 表述。
2. claude 自行退出（如用户输入 `/exit`）：pty `onExit` → 写 `ended_at`，标签进入"已结束"状态或自动关闭。

### 5.4 关闭应用
- 逐个对运行中的标签按 5.3 流程（Ctrl+C → 超时后 kill 进程树）终止 → 等 onExit → 写 `ended_at`。
- 落盘 SQLite、关闭 watcher 后退出。

### 5.5 崩溃恢复
- 启动时索引器先做一次增量同步（基于 `file_progress` 表；首次启动全量扫描）。
- 上次崩溃时标记为"运行中"但实际已停的会话，启动时统一修正为"已停止"（启发式：`last_activity_at` 早于本次启动时间，且无活跃 pty）。

## 6. 数据模型（SQLite）

库文件：`<userData>/app.db`，其中 `userData` 取 `app.getPath('userData')`（Windows 为 `%APPDATA%/codeagentdesk`）。

```sql
CREATE TABLE projects (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  path           TEXT NOT NULL UNIQUE,      -- 工作目录绝对路径
  encoded_dir    TEXT NOT NULL,             -- ~/.claude/projects 下的目录名
  last_active_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,       -- session-uuid == JSONL 文件名(去 .jsonl)
  project_id        INTEGER NOT NULL REFERENCES projects(id),
  cwd               TEXT NOT NULL,
  file_path         TEXT NOT NULL UNIQUE,   -- JSONL 绝对路径
  title             TEXT,                   -- 标题（优先 ai-title，回退首条用户消息）
  started_at        TEXT NOT NULL,
  ended_at          TEXT,                   -- NULL = 进行中
  last_activity_at  TEXT NOT NULL,
  message_count     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE file_progress (               -- 增量索引进度
  file_path        TEXT PRIMARY KEY,
  lines_processed  INTEGER NOT NULL DEFAULT 0,
  bytes_processed  INTEGER NOT NULL DEFAULT 0,
  file_size        INTEGER NOT NULL DEFAULT 0,  -- 上次处理时文件大小，用于检测重写/截断
  updated_at       TEXT NOT NULL
);

CREATE TABLE meta (                        -- 索引版本/模式信息
  key   TEXT PRIMARY KEY,
  value TEXT
);
```

**关键原则：JSONL 永远是源数据（source of truth），SQLite 只存元数据。** 详情视图、导出、搜索都直接读 JSONL，不冗余存消息正文。

索引器不假设 JSONL 严格 append-only：resume 会重复追加 `last-prompt`/`mode`/`ai-title` 等块，未来版本也可能重写文件。`file_progress` 记录字节偏移与文件大小，发现文件变短或首行变化时重置该文件全量重扫。

`message_count` 口径：统计 `origin.kind:"human"` 的用户输入次数（对话轮数），不含 hook 注入、sidechain 与元数据事件。

### 标题提取规则
优先取 JSONL 中**最后一次 `ai-title` 事件**（Claude Code 自带生成标题，resume 后会追加新值）；无 `ai-title` 时回退到**第一条 `origin.kind:"human"` 的用户文本消息**（跳过 tool_result 以及 hook/插件注入的 user 文本块），截断至约 40 字符。

## 7. UI 布局（单个主窗口）

```
┌──────────────┬──────────────────────────────────────────────┐
│ 全局搜索框    │  标签栏: [● 会话A ×] [○ 会话B ×]  [＋]        │
│──────────────│──────────────────────────────────────────────│
│ [会话] [搜索] │                                              │
│              │   主内容区                                    │
│ ▸ 项目A       │   - 默认: xterm.js 终端 (当前激活标签)        │
│   ● 会话A    │   - 切换按钮 / Ctrl+Shift+V: 会话详情视图      │
│   ○ 会话B    │                                              │
│ ▸ 项目B       │                                              │
│   ○ 会话C    │                                              │
│──────────────│                                              │
│ ＋ 新建会话   │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 侧边栏
- 顶部全局搜索框（切到"搜索"视图）。
- 底部模式切换：[会话] / [搜索]。
- **会话列表**：按项目分组，组内按 `last_activity_at` 倒序。每行显示：标题、项目名、相对时间、状态圆点（● 运行中 / ○ 已停止）、消息数。右键菜单：恢复 / 查看详情 / 复制路径 / 删除记录。
- **新建会话**按钮：目录选择。

### 主内容区
- **终端面板**：xterm.js，每个标签一个实例；pty 数据经 IPC 流式转发。
- **会话详情视图**：虚拟化列表渲染 JSONL 为聊天流——用户消息、assistant 消息（Markdown + 代码高亮）、工具调用折叠卡片（工具名 / 输入 / 输出）。按钮：复制消息、导出当前会话为 Markdown。
- **搜索视图**：ripgrep 命中按会话分组，显示命中片段，点击跳转详情或"恢复会话"。

### v1 范围外（路线图）
- 分屏多窗格（标签页内再分左右）。
- 会话收藏/标签/统计面板。

## 8. 搜索设计

- `SearchService` 用 `@vscode/ripgrep`（npm 包自带 rg 二进制，**用户无需装 ripgrep**）。
- 执行：`rg --json -i "<query>" <projectsDir> --glob "*.jsonl"`；收集命中 → 按 JSONL（会话）分组 → 返回 `{sessionId, project, line, snippet}`。单行 JSONL 可能包含整文件内容（tool_result/快照），snippet 必须截断、每会话命中数需设上限；渲染前过滤 `last-prompt`/`mode`/`ai-title` 等元数据事件。
- 渲染：按会话分组，显示命中行片段；点击可打开详情或恢复会话。
- 升级路径：数据量增长后可切 SQLite FTS5（用现有 `file_progress` 增量建索引），SearchService 接口保持不变。

## 9. 导出设计

`ExportService` 读 JSONL → 转换为 Markdown：
- 用户文本 → `**User**` 引用块
- assistant → `**Claude**`（保留代码围栏）
- 工具调用/结果 → 折叠块（`<details>`）或围栏块
- 解析兼容 `user.content` 为字符串或数组两种形态（实测都存在）；跳过 `last-prompt`/`mode`/`permission-mode`/`ai-title`/`file-history-snapshot`/hook 等元数据事件
- 通过 Electron 保存对话框写出 `.md`

纯函数，用样例 JSONL 做单测。

## 10. 错误处理

| 场景 | 行为 |
|---|---|
| PATH 找不到 claude | 标签页内显示明确错误 + toast；设置面板可配 claude 可执行文件路径（Windows 按 PATHEXT 解析 `.cmd`/`.exe`，`.ps1` 不作为直接 spawn 目标） |
| pty 启动失败 | 同上，标签内提示原因 |
| 会话进程中途崩溃 | toast"会话进程异常退出"；标记 ended；JSONL 保留，可恢复 |
| watcher 异常 | 记日志不崩溃；索引器下次启动重试 |
| SQLite 损坏 | 打开时迁移/校验失败 → 将坏库移开，从 JSONL 全量重建索引 |
| 超大 JSONL | 列表不整读文件；详情视图虚拟化、按行流式读取（单行可能很大，大块 tool_result 默认折叠）；搜索用 rg 返回行片段并截断/限量 |

## 11. 测试策略

- **单元测试（Vitest）**：JSONL 解析器（用真实会话样例做夹具，覆盖 `ai-title`、`user.content` 字符串/数组、缺 command_permissions 的短会话）、标题提取、Markdown 导出、SQLite schema/迁移、绑定匹配逻辑（pendingSpawns 匹配）。
- **集成测试**：用**mock claude**（按真实 JSONL 事件结构写入，并支持追加 `ai-title`/`last-prompt` 等块）跑 SessionManager spawn→绑定→索引链路，不依赖真实 claude；真实 claude 做冒烟测试。
- **E2E（Playwright for Electron，v1.5 后补）**：启动应用 → 新建会话（mock claude）→ 输入 → 关闭 → 重开 → 恢复 → 搜索 → 导出。
- **Windows 手工清单**：窗口关闭/重开、强制 kill、崩溃恢复、恢复含中文目录路径的会话。

## 12. 仓库结构

```
codeagentdesk/
├─ package.json / electron-builder.yml / tsconfig.json
├─ src/
│  ├─ main/                    # Electron 主进程
│  │  ├─ index.ts              # 入口、单例锁、创建窗口
│  │  ├─ ipc.ts                # 类型化 IPC 通道注册
│  │  ├─ window-manager.ts
│  │  ├─ session-manager.ts
│  │  ├─ indexer/
│  │  │  ├─ watcher.ts         # chokidar 监听 + 增量同步
│  │  │  └─ parser.ts          # JSONL 事件解析/标题/计数
│  │  ├─ store/
│  │  │  ├─ db.ts              # better-sqlite3 初始化/迁移/重建
│  │  │  └─ schema.sql
│  │  ├─ search.ts
│  │  ├─ export.ts
│  │  └─ config.ts             # 应用配置（claude 路径等）
│  ├─ preload/index.ts         # contextBridge 暴露类型化 API
│  ├─ renderer/                # React + Vite
│  │  ├─ main.tsx / App.tsx
│  │  ├─ components/
│  │  │  ├─ Sidebar.tsx / TabBar.tsx / TerminalPane.tsx
│  │  │  ├─ SessionDetail.tsx / SearchView.tsx
│  │  └─ hooks/
│  └─ shared/
│     ├─ types.ts              # IPC 消息类型
│     └─ ipc-contract.ts       # 通道名常量
├─ scripts/                     # mock claude、构建辅助
└─ docs/
```

## 13. 依赖清单

- 运行时：`electron`、`react`、`react-dom`、`node-pty`、`xterm`、`chokidar`、`better-sqlite3`、`@vscode/ripgrep`、`react-markdown` + 代码高亮插件
- 开发/构建：`electron-builder`、`vite`、`@vitejs/plugin-react`、`typescript`、`vitest`、`@testing-library/react`、`playwright`（E2E，v1.5）、`electron-rebuild`（或 electron-builder 自动 `install-app-deps`）

## 14. 里程碑

1. **脚手架**：Electron + Vite + React + TS 跑通，窗口打开，IPC bridge 可用。
2. **终端 + 会话绑定**：spawn claude 进 xterm 标签，watcher 绑定，会话出现在列表。
3. **存储 + 索引**：SQLite schema + 增量索引，标题/消息数/时间正确；恢复流程可用。
4. **详情 + 导出 + 搜索 UI**：三块界面 + 对应 IPC。
5. **打磨 + 打包**：错误态、崩溃恢复、`electron-builder` 出 Windows 安装包。

## 15. 风险与备注

- **绑定歧义**：同一目录瞬间创建多个 JSONL 时靠"最新 + cwd 匹配"消除，首行 `sessionId` 可快速区分；极端情况允许用户手动改绑（右键"绑定到…"）。
- **`--resume` 依赖**：已在本机 `claude --help` 验证为 `-r, --resume [value]`（按 session ID 恢复）；语义后续若变动，集中在 `SessionManager` 一处适配。
- **中文字符/特殊路径**：已实测目录名符合 `path.replace(/[\\:]/g, '-')`（如 `D:\ai\CodeAgentDesk` → `D--ai-CodeAgentDesk`）；仍以 JSONL 事件中的 `cwd` 字段为准校验，实现时补一条中文/特殊路径的端到端用例。
