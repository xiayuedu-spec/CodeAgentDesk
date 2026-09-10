# 主题系统实现说明（供接力开发）

> 读者：接手 CodeAgentDesk（或需要移植本主题系统）的 agent/开发者。
> 配套文档：`docs/DESIGN-LANGUAGE.md`（设计令牌与规范）、`docs/ARCHITECTURE.md`（整体架构）、`agent.md`（坑点清单）。
> 当前主题数：**9 套**（7 常规 + 2 隐藏彩蛋）。

---

## 1. 数据流总览

```
config.json (theme: ThemeName)
   │  main/config.ts  normalizeTheme() 白名单校验
   ▼
readClaudeConfigInfo() ──IPC config:get──▶ useUiState().claudeInfo.config
   │
   ├─ App.tsx effect: document.documentElement.dataset.theme = theme
   │        │
   │        ├─ styles.css: :root[data-theme='<name>'] { 变量块 }   ← 全局配色
   │        ├─ TerminalPane: MutationObserver 监听 data-theme → 终端配色表
   │        └─ window:set-background-color → Electron 窗口底色（防切换白闪）
   │
   └─ SidebarFooter: THEMES 列表渲染色板（隐藏主题按 isThemeUnlocked 过滤）
```

要点：**主题不写进 React 状态树**——只写 `document.documentElement.dataset.theme`，其余全部由 CSS 变量与 MutationObserver 派生。这样任意组件都不用感知主题。

---

## 2. 新增一套主题：7 处同步清单（缺一不可）

### ① `src/shared/types.ts` — 类型联合
```ts
export type ThemeName =
  | 'default' | 'mac' | 'green' | 'sepia' | 'amber' | 'mist'
  | 'warm'                      // 常规主题
  | 'neon' | 'term';            // 隐藏彩蛋主题
```

### ② `src/main/config.ts` — 持久化白名单
```ts
function normalizeTheme(value: unknown): ThemeName {
  const allowed: readonly ThemeName[] = ['default','mac','green','sepia','amber','mist','warm','neon','term'];
  return allowed.includes(value as ThemeName) ? (value as ThemeName) : 'default';
}
```
> 漏改这里：`config.json` 里存的合法主题名会被静默重置为 `default`（表现为"换主题后重启就变回去"）。

### ③ `src/renderer/theme.ts` — 三张表 + 隐藏主题判定
```ts
export const HIDDEN_THEMES: ThemeName[] = ['neon', 'term'];

export const THEME_BACKGROUND: Record<ThemeName, string> = { /* 每套都要有：窗口底色，防白闪 */ };
export const THEMES: { name: ThemeName; label: string }[] = [ /* 设置面板展示名 */ ];
export const THEME_SWATCHES: Record<ThemeName, { bg: string; fg: string; accent: string }> = { /* 色卡 */ };

/** 隐藏主题需解锁；常规主题恒为 true。 */
export function isThemeUnlocked(theme, unlocked): boolean {
  if (!HIDDEN_THEMES.includes(theme)) return true;
  if (theme === 'neon' && unlocked?.funUnlockedNeon === true) return true;
  return (unlocked?.funUnlockedThemes ?? []).includes(theme);
}
```
`Record<ThemeName, ...>` 的好处：漏一套会**编译报错**（比运行时才发现好得多）。

### ④ `src/renderer/styles.css` — 变量块
```css
:root[data-theme='<name>'] {
  color-scheme: light|dark;          /* 必填：影响原生控件（滚动条/输入框/选择器）*/
  --bg / --bg-raised / --bg-inset
  --border / --border-strong
  --text / --text-muted / --text-faint
  --accent / --accent-dim / --accent-strong
  --accent-soft / --accent-glow / --accent-glow-strong
  --focus-ring / --selection
  --warn / --danger
}
```
进阶（可选，见"终端风"示例）：覆盖 `--radius-sm/md/lg` 改圆角性格；再用 `:root[data-theme='x'] <选择器>` 做局部 override。

### ⑤ `src/renderer/components/TerminalPane.tsx` — 终端配色表（**最易漏**）
```ts
const TERMINAL_THEMES: Record<string, TerminalPalette> = {
  // ...
  warm: { background:'#faf9f5', foreground:'#3d3d3a', cursor:'#cc785c', selectionBackground:'#f0d9cd' },
  term: { background:'#0b0b0b', foreground:'#e8e8e8', cursor:'#30d158', selectionBackground:'#1f3a26' },
};
```
`terminalTheme(skin)` 找不到时回落 `default` —— 所以漏了不会报错，只会"界面换了、终端没换"。

### ⑥ `src/renderer/components/SidebarFooter.tsx` — 设置色板过滤
```tsx
{THEMES.filter((item) => isThemeUnlocked(item.name, claudeInfo.config)).map((item) => ( ... ))}
```

### ⑦ 浅色主题的 hover 覆盖
浅色底上，默认的"白色 rgba 高光"会失效；补 `:root[data-theme='<浅色名>'] <hover 选择器>` 规则（参考 mac / green / sepia 的既有写法）。

---

## 3. 隐藏主题（彩蛋）机制

### 解锁链
`StatusBar.tsx`：
```ts
const UNLOCK_CHAIN: { count: number; theme: ThemeName }[] = [
  { count: 7,  theme: 'neon' },
  { count: 14, theme: 'term' },
];
// 版本号按钮 onClick：累计点击（不因解锁清零），达到阈值且未解锁则触发
const next = versionClicks + 1;
setVersionClicks(next);
for (const step of UNLOCK_CHAIN) {
  if (next >= step.count && !unlockedThemes.includes(step.theme)) onUnlockTheme(step.theme);
}
```
`unlockedThemes` 由 App 从配置派生：
```tsx
unlockedThemes={[
  ...(claudeInfo?.config.funUnlockedNeon === true ? ['neon'] : []),
  ...(claudeInfo?.config.funUnlockedThemes ?? []),
]}
```

### 持久化
IPC `fun:unlock-theme`（`main/ipc-fun.ts`）：
```ts
ipcMain.handle(IpcChannel.funUnlockTheme, (_e, theme: string) => {
  const config = readConfig();
  const unlocked = new Set(config.funUnlockedThemes ?? []);
  if (typeof theme === 'string' && theme) unlocked.add(theme);
  writeConfig({ ...config, funUnlockedThemes: [...unlocked], funUnlockedNeon: config.funUnlockedNeon === true || unlocked.has('neon') });
  return readClaudeConfigInfo();
});
```
- `funUnlockedThemes: string[]` 是通用字段；`funUnlockedNeon: boolean` 是历史字段，仅为兼容旧配置保留。
- 新增隐藏主题只需：`HIDDEN_THEMES` 加名 + `UNLOCK_CHAIN` 加一档（阈值递增）+ 上述 7 处同步。

---

## 4. 参考实现：两套已落地主题

### 暖白珊瑚（Anthropic 暖色，常规主题）
| 令牌 | 值 | 依据 |
|---|---|---|
| `--bg` | `#faf9f5` | Claude 的 tinted cream canvas（刻意避开冷灰白） |
| `--bg-raised` / `--bg-inset` | `#f2ece1` / `#fffefb` | 表面色阶：比画布深一档 / 亮一档 |
| `--border` / `--border-strong` | `#e6dfd8` / `#d5cabb` | hairline 同色系，像"层级差"而非墨线 |
| `--text` / `--text-muted` / `--text-faint` | `#141413` / `#6c6a64` / `#8e8b82` | 暖黑 + 两级弱化 |
| `--accent` / `--accent-dim` / `--accent-strong` | `#cc785c` / `#a9583e` / `#d98f75` | 珊瑚（Anthropic 签名色），active 变暗 |
| `--warn` / `--danger` | `#d4a017` / `#c64545` | 语义色 |
| `color-scheme` | `light` | — |

终端：`background #faf9f5` / `cursor #cc785c` / `selection #f0d9cd`。

### 终端（OpenCode 式极简，隐藏彩蛋）
变量块取 OpenCode 语义色（accent 用 success 绿），并额外做**性格 override**：
```css
:root[data-theme='term'] {
  color-scheme: dark;
  --bg:#0b0b0b; --bg-raised:#121212; --bg-inset:#060606;
  --border:#262626; --border-strong:#3a3a3a;
  --text:#e8e8e8; --text-muted:#9a9a9a; --text-faint:#6e6e6e;
  --accent:#30d158; --accent-dim:#26a344; --accent-strong:#4ade80;
  --warn:#ff9f0a; --danger:#ff3b30;
  /* 收紧圆角阶梯：终端风不用大圆角 */
  --radius-sm:3px; --radius-md:4px; --radius-lg:6px;
}
/* 全 hairline 文字块：去掉投影与毛玻璃 */
:root[data-theme='term'] .context-menu,
:root[data-theme='term'] .settings-popover,
:root[data-theme='term'] .day-panel,
:root[data-theme='term'] .toast, /* …其余浮层选择器 */
{
  box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none;
  background: var(--bg-raised);
}
/* 关掉装饰性光晕（侧边栏 / 首页图标） */
:root[data-theme='term'] .sidebar::before,
:root[data-theme='term'] .welcome-icon::after { display: none; }
```
> 这个写法是"主题即性格"的模板：新增主题若要改圆角/投影/动效性格，都用同一位置聚合覆盖，不要散落到组件里。

---

## 5. 校验清单（提 PR 前逐条过）

1. **7 处全改**：类型 / config 白名单 / theme.ts 三表+HIDDEN / CSS 变量块 / 终端配色 / 设置过滤 / 浅色 hover。
2. `npm run typecheck`：`Record<ThemeName, …>` 会揪出漏写的表项。
3. 手动切换每套主题，检查：侧边栏、终端、状态栏、各弹窗（总结/概览/知识库/效率洞察/时间线/备份/统计）、设置面板、空状态、滚动条。
4. 隐藏主题：清掉 `config.json` 的 `funUnlockedThemes` → 应看不到该主题 → 连点版本号到阈值 → toast 解锁 → 设置里出现。
5. 切换主题不应白闪（`window:set-background-color` 已接）；终端应同时变色（`TERMINAL_THEMES` 已补）。
6. `npm run test` + `npm run build` 通过。

---

## 6. 移裁到其他项目的最小改造

若不使用本项目的 config/IPC 结构，保留三件事即可复刻整套机制：
1. **单一真源**：`data-theme` 属性 + CSS 变量块（组件不感知主题）。
2. **隐藏主题解锁**：一个持久化的 `unlockedThemes: string[]` + 判定函数 `isThemeUnlocked()`。
3. **主题级性格覆盖**：`:root[data-theme='x'] <选择器>` 聚合块（圆角/投影/动效），而不是在组件里写 `if (theme==='x')`。
