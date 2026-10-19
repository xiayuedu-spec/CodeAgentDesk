# 项目知识索引

> 由 CodeAgentDesk 自动生成，**不要手改这个文件**：改卡片请用应用，或直接编辑同目录下的卡片文件。

## 踩坑（2）

- ✅ [主进程缓存 TTL 必须小于渲染层轮询间隔](主进程缓存-ttl-必须小于渲染层轮询间隔.md) — 两层缓存叠加：右栏 15s 轮询 + 主进程 20s TTL，每次轮询都命中旧缓存，表现成「数据不刷新」。git-info 的 CACHE_TTL_MS 改成 
- ✅ [状态栏加 overflow:hidden 会把向上弹出的菜单整块裁掉](状态栏加-overflow-hidden-会把向上弹出的菜单整块裁掉.md) — 「更多」菜单与审批收件箱都是 position:absolute; bottom:calc(100% + 8px) 的子元素，父级 overflow 只要不是 

## 决策（1）

- ✅ [右栏数据的 hook 挂在 InfoPanel 内部，而不是 App](右栏数据的-hook-挂在-infopanel-内部-而不是-app.md) — useSessionRail 原先在 App 里，bump 就是 App 的 setState → 每 15s 把 1900 行的容器连同侧栏/标签栏/终端栈一
