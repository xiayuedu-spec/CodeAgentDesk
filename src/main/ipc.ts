import type { GroupStore } from './group-store';
import type { SessionMetaStore } from './session-meta-store';
import type { SessionManager } from './session-manager';
import type { SessionWatcher } from './session-watcher';
import { registerAppIpc } from './ipc-app';
import { registerGroupsIpc } from './ipc-groups';
import { registerSessionsIpc } from './ipc-sessions';
import { registerSummaryIpc } from './ipc-summary';
import { registerUsageIpc } from './ipc-usage';

/**
 * 按域注册全部 IPC 处理器：
 * - ipc-app：应用信息、配置（目录/主题/限额）、最近目录、窗口控制、UI 状态
 * - ipc-sessions：会话列表/创建/恢复/重命名/归档/删除/详情/总结/导出/终端 IO、搜索
 * - ipc-groups：分组增删改查、会话分组归属
 * - ipc-summary：日报/周报/月报、知识库
 * - ipc-usage：今日概览、用量趋势、每小时用量
 */
export function registerIpcHandlers(
  sessions: SessionManager,
  watcher: SessionWatcher,
  metaStore: SessionMetaStore,
  groups: GroupStore,
  onClaudeDirChanged: () => void,
): void {
  registerAppIpc({ onClaudeDirChanged });
  registerSessionsIpc({ sessions, watcher, metaStore });
  registerGroupsIpc({ groups, metaStore });
  registerSummaryIpc({ metaStore });
  registerUsageIpc({ sessions, metaStore });
}
