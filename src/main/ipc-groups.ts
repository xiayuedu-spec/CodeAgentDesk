import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type { GroupOpResult, GroupRecord } from '../shared/types';
import type { GroupStore } from './group-store';
import type { SessionMetaStore } from './session-meta-store';

export interface GroupsIpcDeps {
  groups: GroupStore;
  metaStore: SessionMetaStore;
}

/** 分组域 IPC：分组增删改查与颜色、会话分组归属。 */
export function registerGroupsIpc({ groups, metaStore }: GroupsIpcDeps): void {
  ipcMain.handle(IpcChannel.groupsList, (): GroupRecord[] => groups.list());

  ipcMain.handle(IpcChannel.groupsCreate, (_event, name: string): GroupRecord => {
    return groups.create(typeof name === 'string' ? name : '');
  });

  ipcMain.handle(
    IpcChannel.groupsRename,
    (_event, payload: { id: string; name: string }): GroupOpResult => {
      if (!payload.name.trim()) return { ok: false, message: '名称不能为空' };
      if (!groups.rename(payload.id, payload.name)) return { ok: false, message: '分组不存在' };
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.groupsDelete,
    (_event, id: string): GroupOpResult => {
      if (!groups.delete(id)) return { ok: false, message: '分组不存在' };
      metaStore.clearGroup(id);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.groupsSetColor,
    (_event, payload: { id: string; color: string }): GroupOpResult => {
      if (!groups.setColor(payload.id, payload.color)) return { ok: false, message: '分组不存在' };
      return { ok: true };
    },
  );

  ipcMain.handle(
    IpcChannel.sessionSetGroup,
    (_event, payload: { sessionId: string; groupId: string | null }): GroupOpResult => {
      const sessionId = payload.sessionId.trim();
      if (!sessionId) return { ok: false, message: '缺少会话信息' };
      metaStore.setGroup(sessionId, payload.groupId);
      return { ok: true };
    },
  );
}
