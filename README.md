# CodeAgentDesk

Claude Code 统一窗口管理器（桌面端）。把散在终端里的 Claude Code 会话收进一个带侧边栏/标签页的桌面应用：管理会话生命周期、沉淀日报周报、维护项目知识库、监控 token 用量，并提供效率洞察与趣味化激励。

- 技术栈：Electron 43 · React 19 · TypeScript · Vite 8 · node-pty + xterm · chokidar · lucide-react
- 数据目录：`%APPDATA%/codeagentdesk`（Windows）
- 会话数据：Claude 目录（默认 `~/.claude`，设置中可改）下的 `projects/**/*.jsonl`

---

## 功能总览

### 会话管理
- 多会话标签页并行运行（node-pty 承载 `claude` 进程），拖拽排序、`Ctrl+1..9` 切换、活动提醒
- 分组管理：分组作为会话容器（运行中 + 历史都在组内，组区块默认在上方）、8 色 + 自定义颜色、折叠、会话拖拽归属
- 会话置顶/收藏（组内置顶排序 + 图钉标记）、归档/恢复、多选批量删除（应用内确认框）
- 全文搜索（命中带上下文预览，点击跳转详情定位）、会话详情、导出 Markdown、打开工作目录
- 右键菜单：重命名 / 归档 / 移动分组 / 置顶 / 恢复 / 查看详情 / 打开目录 / 复制

### 总结与复盘
- 日报 / 周报（末尾自动附**本周复盘**：做得好的 / 时间效率分析 / 下周改进）/ 月报
- 历史导航（任意天/周/月）+ 日历视图；所有总结可手动编辑、可重新生成

### 知识库
- 自动提炼项目会话为知识文档（增量更新、Token 预算控制）
- **同步 CLAUDE.md**：单项目 `@PROJECT_KNOWLEDGE.md` 导入 + 全局记忆 `~/.claude/CLAUDE.md → @GLOBAL_KNOWLEDGE.md`，新会话自动带项目/团队背景
- 导出 `PROJECT_KNOWLEDGE.md`、手动编辑

### 用量与效率
- 每小时限额（默认 1000 万 token，整点刷新，可配置）→ 左下角卡片 + 水位线柱状图 + 预警通知
- 用量趋势（7-90 天）、今日概览（含段位）、效率洞察（每周投入时长/省时估算/输出占比/等价物换算）
- 工作时间线回放（按天查看会话时间条，重叠自动分道）

### 趣味与激励（均不影响工作，可在设置切换显示）
- 成就徽章 / AI 段位 / 项目性格 / MBTI 推断 / 摸鱼指数 / 电子宠物树 / 番茄钟（时长可配）/ 幸运签 / 打字机开场
- Agent 状态表情（🧠 思考中 / ✨ 回合完成 / 😴 空闲 / 🚨 待审批）：状态栏 + 会话行（可切换为颜色圆点）
- 彩蛋：连点状态栏版本号 7 次解锁「霓虹」隐藏主题

---

## 快速开始

前置：Node.js ≥ 20、npm；Windows 下建议用 `npm.cmd`（部分 PowerShell 执行策略会拦截 `npm.ps1`）。

```bash
npm install        # postinstall 自动执行 patch-package（node-pty 修复补丁）
npm run dev        # 开发：tsc 编译 main + vite + electron
```

质量门禁（每次改动必须通过）：

```bash
npm run typecheck   # tsc 双工程（main + renderer）
npm run test        # vitest（15 用例，src/main/__tests__）
npm run build       # tsc main + vite build
```

打包安装包：`npm run package`（electron-builder，产物在 `dist/`）。重装依赖后若 node-pty 报错执行 `npm run rebuild`。

---

## 使用指南

### 快捷键
| 快捷键 | 作用 |
|---|---|
| `Ctrl+P` | 命令面板（新建会话 / 最近目录 / 各视图入口） |
| `Ctrl+K` | 全文搜索 |
| `Ctrl+T` | 新建会话 |
| `Ctrl+W` | 关闭当前会话标签 |
| `Ctrl+1..9` | 切换运行中会话 |
| `Esc` | 关闭所有弹窗（总结/概览/知识库/详情等；编辑中先取消编辑） |
| 连点版本号 ×7 | 解锁霓虹主题（彩蛋） |

### 核心流程
- **新建会话**：状态栏「首页」→ 新建，或 `Ctrl+T` 选择目录；历史会话右键「恢复会话」
- **归档/整理**：会话右键 → 归档；分组右键 → 改色/重命名/删除；置顶保持高频项目在前
- **周报复盘**：状态栏「今日总结」→ 周报 → 生成（自动附本周复盘）
- **项目知识库**：状态栏 ☰ 更多 → 项目知识库 → 生成（自动写 `PROJECT_KNOWLEDGE.md` 并同步 `CLAUDE.md`）；「🌐 全局知识库」对所有项目生效
- **监控与洞察**：左下角限额卡片（点击看每小时柱状图）；☰ 更多 → 用量趋势 / 今日概览 / 效率洞察 / 工作时间线

### 配置（`config.json`）
| 字段 | 说明 |
|---|---|
| `claudeDir` | Claude 数据目录（默认 `~/.claude`，解析优先级：config → `CLAUDE_CONFIG_DIR` → 默认） |
| `theme` | 主题：default / mac / green / sepia / amber / mist / neon(隐藏彩蛋) |
| `tokenLimitPerHour` | 每小时 token 限额（默认 10000000） |
| `pomodoroMinutes` | 番茄钟时长（默认 25） |
| `agentStatusStyle` | 会话状态显示：`emoji`（默认）/ `dot` |
| `funUnlockedNeon` | 是否已解锁霓虹主题 |

---

## 目录结构

```
src/
├── main/          # Electron 主进程：会话、pty、统计、总结、知识库、IPC handler
│   ├── index.ts           # 入口：单实例、装配、watcher、通知
│   ├── ipc.ts             # IPC 聚合入口（按域分发）
│   ├── ipc-app.ts         # 应用信息/配置/窗口/UI 状态
│   ├── ipc-sessions.ts    # 会话生命周期/终端 IO/搜索
│   ├── ipc-groups.ts      # 分组
│   ├── ipc-summary.ts     # 日报周报月报（含复盘）/知识库
│   ├── ipc-usage.ts       # 今日概览/趋势/小时用量/效率洞察/时间线
│   ├── ipc-fun.ts         # 成就/性格/彩蛋
│   ├── ipc-utils.ts       # 共享助手（文件定位/周范围/文本收集）
│   ├── session-manager.ts # node-pty 生命周期（含 startedAt/时长）
│   ├── session-library.ts # JSONL 解析/搜索/用量增量缓存/活跃时长
│   ├── summarize.ts       # 调 claude -p（总结/反思），Token 预算
│   ├── knowledge.ts       # 知识库生成 + CLAUDE.md 同步
│   └── usage-warning.ts   # 整点限额预警
├── preload/        # contextBridge 白名单 API（与 IpcChannel 镜像）
├── renderer/       # React 渲染层
│   ├── App.tsx            # 容器：状态/副作用/组装
│   ├── components/        # 展示组件（弹窗 lazy 加载）
│   ├── hooks/             # useDismiss/useEscape/useAnimatedNumber/usePomodoro/agent 状态机…
│   ├── mbti.ts            # MBTI 推断纯函数
│   └── styles.css         # 主题变量 + v5 视觉体系（滚动条/空状态/hover 统一）
└── shared/         # 主/渲染共享：types.ts、ipc-contract.ts
docs/
├── ARCHITECTURE.md       # 架构 / 数据 / 关键机制深度文档
└── FEATURES-HANDOFF.md   # 近期功能交接文档（供其他项目二次开发借鉴）
agent.md                  # 开发交接：工程现状 + 踩坑清单
DESIGN.md                 # 早期产品设计稿（归档参考）
```

---

## 开发规范（改动必读）

1. **四端同步**：新增任何 IPC 必须同步 `shared/types.ts`（类型 + api）→ `shared/ipc-contract.ts`（channel）→ `main/ipc-*.ts`（handler）→ `preload/index.ts`（CHANNELS 镜像 + api）。
2. **IPC 按域拆分**：handler 放对应域文件，`ipc.ts` 只做聚合；共享助手放 `ipc-utils.ts`。
3. **质量门禁**：每轮功能通过 `typecheck` + `test` + `build` 后提交；提交信息中文、多个 `-m`（避免引号/反引号解析问题）。
4. **Token 预算**：任何调 `claude -p` 的功能必须声明输入上限（每会话 N 字符、总输入 ≤ 约 4 万 token）并优先增量处理。
5. **渲染模式**：弹窗一律 `lazy()`；空状态用 `EmptyState`；数字展示用 `useAnimatedNumber`；弹窗统一支持 Esc 关闭（`useEscape`）。
6. **统计缓存**：高频统计在主进程加 TTL 缓存，配置变化时显式失效（如限额）。

---

## 已知口径（避免误读数据）

- **小时用量**：会话按 `updatedAt`（最后写入）归入所在小时——跨小时长任务会把用量集中到结束小时（柱状图/预警在该边界有延迟或集中）。
- **效率时长**：按会话事件时间戳累计相邻间隔 ≤ 5 分钟的"活跃时长"，排除挂机；无时间戳回退为会话跨度。
- **省时估算**：人工完成同等任务约为 agent 耗时的 2.5 倍（纯估算，透明标注）。
- **Token 估算**：3 字符/token 保守高估。

## 文档索引

- [架构深度文档](docs/ARCHITECTURE.md)：进程模型、IPC 通道表、存储 schema、关键机制
- [功能交接文档](docs/FEATURES-HANDOFF.md)：近期功能实现指南 + 踩坑清单（供二次开发）
- [开发交接](agent.md)：工程现状 + 坑点（给后续接手 agent）
- [早期设计稿](DESIGN.md)：产品背景与早期决策（归档参考，现状以架构文档为准）
