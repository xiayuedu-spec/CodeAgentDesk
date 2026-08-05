# CodeAgentDesk

Claude Code 统一窗口管理器（Electron + React + TypeScript）：并行运行、恢复、搜索、归档 Claude Code 会话，并查看 token 用量、导出对话。

## 功能

- 多标签并行运行 claude（xterm 终端）
- 新建会话、历史会话一键恢复、启动自动恢复上次打开的标签
- 点击历史会话即恢复终端；右键“查看详情”阅读完整对话（工具调用折叠，不展示 JSON 输入）
- 导出 Markdown、复制会话内容
- 全文搜索（可读的用户输入 / Claude 输出）
- 重命名、归档 / 恢复；归档会话可临时借出运行
- token 用量 / 请求数统计（实时刷新）
- Claude 目录可配置
- 全局快捷键：`Ctrl+T` 新建、`Ctrl+W` 关闭、`Ctrl+K` 搜索、`Ctrl+1..9` 切标签
- 终端内 `Ctrl+C` 复制 / `Ctrl+V` 粘贴，右键复制 / 粘贴

## 环境要求

- Windows 11（主目标），Node.js 20+
- 已安装 Claude Code CLI（`claude` 在 PATH 中）

## 快速开始

```powershell
# 首次：安装依赖并重编译 node-pty 原生模块
npm install
npm run rebuild

# 开发模式
npm run dev
# 或双击 start-dev.cmd
```

## 脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式（Vite + Electron） |
| `npm run build` | 主进程 + 渲染层构建 |
| `npm start` | 构建后运行 |
| `npm run typecheck` | 类型检查 |
| `npm run rebuild` | 重编译 node-pty（重装依赖后执行） |
| `npm run package` | electron-builder 打 Windows 安装包 |

## 数据位置

- Claude 目录：默认 `~/.claude`，可在应用侧边栏齿轮中修改，也支持 `CLAUDE_CONFIG_DIR`
- 会话文件：`<claudeDir>/projects/<encodedDir>/<sessionId>.jsonl`
- 应用数据（Windows）：`%APPDATA%/codeagentdesk/`（config.json、session-meta.json、ui-state.json、archive/）

## 已知注意

- node-pty 在 VS2022 环境编译；仓库内置 patch-package 补丁（Spectre 与 AttachConsole 修复），重装依赖后执行 `npm run rebuild`
- chokidar 固定 v4（v5 为纯 ESM，主进程 CommonJS 不兼容）
- Claude TUI 全屏模式下终端滚轮由 claude 控制，历史内容请在“查看详情”中阅读
- 交接与实现细节见 `agent.md`，产品设计见 `DESIGN.md`
