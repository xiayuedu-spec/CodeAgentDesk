# CodeAgentDesk

Claude Code 统一窗口管理器（Electron + React + TypeScript）：并行运行、恢复、搜索、归档 Claude Code 会话，并查看 token 用量、导出对话。

## 功能

### 会话管理

- 多标签并行运行 claude（xterm 终端），标签可拖拽排序、未激活标签有活动提醒
- 新建会话：目录选择 / 最近目录快速新建 / 拖放目录到窗口
- 历史会话一键 `--resume` 恢复；启动自动恢复上次打开的标签与折叠状态
- 重命名、归档 / 恢复；归档会话可临时"借出"运行（切走自动放回）
- **归档多选删除**：选择模式（工具栏进入）勾选 + 全选 + 两段式确认；右键菜单亦可删除单个

### 分组

- 手动分组管理：创建 / 重命名 / 换色 / 删除分组（删除自动清空成员）
- 会话右键"移动到分组"（含新建分组 / 移出分组）
- 侧边栏分组区块默认在上方，组内混排运行中 + 历史会话（运行中在前）
- 分组与"当前会话 / 历史会话"区块均可折叠，状态持久化

### 查看与搜索

- 点击历史会话即恢复终端；右键"查看详情"阅读完整对话（工具调用折叠，不展示 JSON 输入）
- 全文搜索：可读的用户输入 / Claude 输出，命中高亮
- 导出 Markdown、复制会话内容
- 会话 AI 摘要 + 标签（详情视图 ✨ 按钮，`claude -p` 无头生成）
- 每日 / 月度总结 + 日历回看（底部状态栏 / 欢迎页 / `Ctrl+P` 入口）

### 界面

- **6 套皮肤**：深色默认 / Mac 浅色 / 护眼豆沙绿 / 暖纸米黄 / 琥珀夜间 / 柔雾深青（左下角设置切换，终端配色联动）
- 自绘窗口标题栏与终端轻量 chrome；窗口位置 / 大小 / 最大化状态持久化
- 底部状态栏：会话数、归档数、今日总结入口、Claude 目录、版本
- 命令面板 `Ctrl+P`：新建 / 恢复 / 搜索 / 切换主题 / 总结 / 设置等
- 全局快捷键：`Ctrl+T` 新建、`Ctrl+W` 关闭、`Ctrl+K` 搜索、`Ctrl+1..9` 切标签
- 终端内 `Ctrl+C` 复制 / `Ctrl+V` 粘贴，右键复制 / 粘贴
- token 用量 / 请求数统计（实时刷新）
- Claude 目录可配置（侧边栏齿轮；解析优先级 `config.json` → `CLAUDE_CONFIG_DIR` → `~/.claude`）

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
- 会话文件：`<claudeDir>/projects/<encodedDir>/<sessionId>.jsonl`；归档后移入 `<userData>/archive/<encodedDir>/`
- 应用数据（Windows）：`%APPDATA%/codeagentdesk/`
  - `config.json`：Claude 目录、主题
  - `session-meta.json`：重命名 / 归档 / 分组 / 摘要标签
  - `groups.json`：分组定义（名称 / 颜色）
  - `ui-state.json`：打开的标签与折叠状态
  - `recent-dirs.json`：最近目录、`summaries.json`：日/月总结、`window-state.json`：窗口状态

## 已知注意

- node-pty 在 VS2022 环境编译；仓库内置 patch-package 补丁（Spectre 与 AttachConsole 修复），重装依赖后执行 `npm run rebuild`
- chokidar 固定 v4（v5 为纯 ESM，主进程 CommonJS 不兼容）
- Claude TUI 全屏模式下终端滚轮由 claude 控制，历史内容请在"查看详情"中阅读
- **删除归档会话为永久操作**（文件 + 元数据，不可恢复）
- 交接与实现细节见 `agent.md`，产品设计见 `DESIGN.md`
- 新增皮肤需同步 5 处（类型 / 配置 / 色卡 / 终端配色 / CSS 变量），清单见 `agent.md`
