---
title: 右栏数据的 hook 挂在 InfoPanel 内部，而不是 App
type: decision
status: verified
created: 2026-10-19T15:45:32.869Z
updated: 2026-10-19T15:45:32.869Z
files:
  - src/renderer/components/InfoPanel.tsx
  - src/renderer/hooks/useSessionRail.ts
---

## 现象
右栏每 15s 刷新一次，整个应用看起来在「周期性卡一下」。

## 结论
useSessionRail 原先在 App 里，bump 就是 App 的 setState → 每 15s 把 1900 行的容器连同侧栏/标签栏/终端栈一起重渲染。下沉到 InfoPanel 后只重渲染右栏这棵小树。

## 证据
src/renderer/components/InfoPanel.tsx · 提交 b86665a
