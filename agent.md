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

- `config.json`：`{ "claudeDir": "..." }`
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
- 新建会话（目录选择）、历史会话一键 `--resume`
- 自动恢复上次打开的标签页
- 会话重命名（右键）、归档、恢复、归档会话“借出”运行
- 会话详情视图（用户/Claude 文本 + 工具调用折叠卡片）
- 导出 Markdown、复制会话内容
- 全文搜索（返回可读的用户输入/Claude 输出，不带 JSON）
- token 用量 / 请求数实时统计（3 秒刷新）
- Claude 目录可配置（侧边栏齿轮）
- 全局快捷键：`Ctrl+T` 新建、`Ctrl+W` 关闭、`Ctrl+K` 搜索、`Ctrl+1..9` 切标签
- 终端内 `Ctrl+C` 复制选中、`Ctrl+V` 粘贴、右键菜单复制/粘贴

## 6. 已知坑与工作区补丁

1. **node-pty 编译**：本机 VS2022 缺 Spectre 库（MSB8040），`patches/node-pty+1.1.0.patch` 通过 patch-package 自动移除 `SpectreMitigation`；同时把 `conpty_console_list_agent.js` 的 `AttachConsole` 失败包成空列表，避免 Electron 无控制台时崩溃。重装依赖后必须 `npm run rebuild` 重新编译原生模块。
2. **chokidar 用 v4**：v5 是纯 ESM，CJS 主进程 require 不了，不要升到 v5。
3. **Electron 二进制**：如果 `node_modules/electron/dist` 不存在，需要 `node node_modules/electron/install.js` 联网补装。
4. **preload 是 sandbox:true**：不能 `require` 本地模块，`preload/index.ts` 里通道名是手写副本，改 `shared/ipc-contract.ts` 时必须同步。
5. **dev 脚本**：Vite 固定 `127.0.0.1:5173`；`concurrently` 里 `&&` 后面不能再用 `npm:xxx` 简写，必须写 `npm run dev:electron`。
6. **终端滚轮**：Claude TUI 用 alternate screen 时滚轮行为由 claude 自己决定；xterm 已挂自定义 wheel handler（scrollLines）并设 `scrollback: 10000`。读历史对话以“会话详情视图”为准。
7. **详情视图不能卸载终端**：`App.tsx` 里终端栈常驻挂载，详情打开时只加 `.hidden`，否则退出详情会丢滚动记录。
8. **归档会话“借出”**：点击归档行 → 先把 JSONL 移回 projects 并 resume，但 UI 里仍标记归档；切到其他标签或关闭时自动移回归档目录。

## 7. 开发约定

- 编辑用 `apply_patch`，尽量 ASCII 注释；界面文案保持中文。
- 新增 IPC 通道按顺序改四处：`shared/ipc-contract.ts` → `shared/types.ts` → `main/ipc.ts` → `preload/index.ts`（注意第 4 条的同步副本）。
- 会话文件定位统一走 `ipc.ts` 里的 `locateSessionFile()`，不要各写各的路径。
- 提交前至少跑 `npm run typecheck` 和 `npm run build`。

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
