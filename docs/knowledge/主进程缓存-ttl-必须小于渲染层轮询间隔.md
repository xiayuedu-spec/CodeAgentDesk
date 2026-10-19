---
title: 主进程缓存 TTL 必须小于渲染层轮询间隔
type: pitfall
status: verified
created: 2026-10-19T15:45:32.862Z
updated: 2026-10-19T15:45:32.862Z
files:
  - src/main/git-info.ts
  - src/renderer/hooks/useSessionRail.ts
---

## 现象
右栏 git 的「未提交文件数」一直不更新，会话跑了一小时还是老数字。

## 结论
两层缓存叠加：右栏 15s 轮询 + 主进程 20s TTL，每次轮询都命中旧缓存，表现成「数据不刷新」。git-info 的 CACHE_TTL_MS 改成 10s。

## 证据
src/main/git-info.ts · 提交 e3b7fe8
