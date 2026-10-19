---
title: 状态栏加 overflow:hidden 会把向上弹出的菜单整块裁掉
type: pitfall
status: verified
created: 2026-10-19T15:45:32.859Z
updated: 2026-10-19T15:45:32.859Z
files:
  - src/renderer/styles.css
  - src/renderer/components/StatusBar.tsx
---

## 现象
点击状态栏「更多」没反应：状态在切换（active 样式也变了），但菜单看不见。

## 结论
「更多」菜单与审批收件箱都是 position:absolute; bottom:calc(100% + 8px) 的子元素，父级 overflow 只要不是 visible 就被裁掉。窄窗口防溢出要靠子元素 min-width:0 + 省略号，最外层交给 body{overflow:hidden} 兜底。

## 证据
src/renderer/styles.css（.status-bar）· 提交 de15fca
