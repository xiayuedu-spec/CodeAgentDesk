# CodeAgentDesk 设计语言（Design Language）

> 本文是本项目的 UI 规范与令牌清单，供后续迭代保持视觉一致。参考来源：`awesome-design-md` 设计库中的 **Linear**（深色产品 UI 表面色阶）、**Raycast**（命令面板式深色 chrome，明确不用投影）、**Claude**（暖色画布 / 圆角分层 / 投影克制）、**OpenCode**（终端原生 hairline 美学）。

## 1. 核心原则（借鉴后落地）

| 原则 | 说明 | 来源 |
|---|---|---|
| **深度靠表面色阶 + hairline，不靠重投影** | 浮层/卡片用 `1px var(--border-strong)` + 轻投影 + 顶部 `inset 0 1px 0 rgba(255,255,255,.06)` 高光；避免"软塌"的玻璃感 | Linear / Raycast |
| **强调色收敛** | `--accent` 只用于：主操作按钮、当前选中、focus ring、关键数值（百分比/进度）；**不做装饰**（卡片 hover 边框改用 `--border-strong` 提亮） | Linear / Raycast |
| **分区标签（eyebrow）** | 小节标题用 11px/600 + `letter-spacing: 0.06em` + 弱色，与正文形成层级 | Linear |
| **pill 规格统一** | 状态/标签/徽章：`padding 2px 9px`、`radius 999px`、`10.5px/600`、`letter-spacing .02em` | Linear status pill |
| **数值等宽** | 所有计数/时长/token 用 `font-variant-numeric: tabular-nums` + 右对齐 | Linear / Claude |
| **mono 只用于代码/路径/ID** | `--mono` 不进普通 UI 文本 | Linear |
| **focus 用柔光圈** | `box-shadow: 0 0 0 3px var(--accent-soft)` + 边框转 `--accent-dim`（不做粗彩环） | Linear（2px accent 50%） |

## 2. 令牌（styles.css）

### 颜色（每个主题块都要定义，共 7 套）
`--bg` `--bg-raised` `--bg-inset` / `--border` `--border-strong` / `--text` `--text-muted` `--text-faint` / `--accent` `--accent-dim` `--accent-soft` `--accent-strong` `--accent-glow` `--accent-glow-strong` / `--focus-ring` `--selection` `--warn` `--danger` + `color-scheme`

**文本三级**：`--text`（主/标题）→ `--text-muted`（正文/次要）→ `--text-faint`（元信息/分区标签）

### 圆角阶梯
| 用途 | 值 |
|---|---|
| 输入框 / 行内按钮 / pill 内容 | `--radius-sm`（8px） |
| 按钮 / 菜单 / 状态条 | `--radius-md`（12px） |
| 卡片 / 面板 / 弹层 | `--radius-lg`（16px）/ `--radius-md` |
| 徽章 / 状态标签 | `999px` |

### 投影
- `--shadow-card`：`0 1px 2px rgba(0,0,0,.18), 0 6px 16px rgba(0,0,0,.22)`
- `--shadow-pop`：`0 2px 6px rgba(0,0,0,.2), 0 10px 24px rgba(0,0,0,.28)`
- `--edge-highlight`：`inset 0 1px 0 rgba(255,255,255,.06)`（抬升面板顶部高光）

### 动效
- 统一 220ms `cubic-bezier(0.22, 1, 0.36, 1)`；弹层入场 `popoverIn`（位移 + 轻微缩放）、遮罩 `fadeIn`
- 数字变化用 `useAnimatedNumber`（400ms 三次缓动）

## 3. 组件规范

| 组件 | 规范 |
|---|---|
| 浮层（菜单/弹窗/弹层） | hairline 边框 + `--shadow-pop` + `--edge-highlight` + `blur(12px)`；点外部/Esc 关闭 |
| 卡片 | 无边框或 hairline；hover 仅边框提亮（`--border-strong`）+ `translateY(-1px)` |
| 主按钮 | `--accent` 底 + 白字；hover 用 `--accent-dim` |
| 次按钮 | `--bg-inset` 底 + hairline 边框 + `--text` |
| 危险操作 | `--danger` 描边/填充 + 应用内确认框（不用 `window.confirm`） |
| 空状态 | `EmptyState`：72px 圆角图标容器（accent 柔和底）+ 标题 + 提示 |
| 状态标签 | pill 规格；语义色：`--warn` / `--danger` / `--accent` |
| 数值展示 | `tabular-nums`；进度条高 5-6px、`999px` 圆角 |

## 4. 不做的事（Do's & Don'ts）

**Do**
- 抬升层次优先加 hairline 或上一档表面色，其次才考虑阴影
- 强调色集中使用：一屏内 accent 元素 ≤ 3 类
- 分区用 eyebrow 标签 + 分隔线表达，而不是靠加大字号

**Don't**
- 不给卡片/弹层叠多层重投影（深色下显脏）
- 不把 accent 用作装饰性边框/背景（除选中与 focus）
- 不在普通 UI 文本里用等宽字体
- 不在同一屏混用 >2 种圆角规格
- 不引入第四个表面色调（深色底 + 一档抬升 + 一档内嵌即可）

## 5. 迭代检查清单

1. 新颜色是否走主题变量（含全部 7 套主题 + `color-mix` 而非硬编码）？
2. 新面板是否用了 hairline + 轻投影（未叠多层阴影）？
3. 新数值是否 `tabular-nums`？
4. 新交互是否统一 220ms 缓动 + Esc/点外部关闭？
5. 新增主题是否同步 6 处（见 `agent.md` 主题系统）？
