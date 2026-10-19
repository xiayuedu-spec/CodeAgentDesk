import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc-contract';
import type { TaskScriptList } from '../shared/types';
import { listScripts, startTask, stopTask } from './task-runner';
import { broadcast } from './window-manager';

/** 任务运行器域 IPC：列出 package.json scripts、启动/停止、流式输出。 */
export function registerTasksIpc(): void {
  ipcMain.handle(
    IpcChannel.taskListScripts,
    (_event, cwd: string): TaskScriptList => listScripts(cwd),
  );

  ipcMain.handle(
    IpcChannel.taskStart,
    (_event, payload: { cwd: string; script: string }): { id: string; manager: string } | null =>
      startTask(payload.cwd, payload.script, {
        onData: (id, chunk) => broadcast(IpcChannel.taskRun, { id, kind: 'data', chunk }),
        onExit: (id, code) => broadcast(IpcChannel.taskRun, { id, kind: 'exit', code }),
      }),
  );

  ipcMain.handle(
    IpcChannel.taskStop,
    (_event, id: string): { ok: boolean } => ({ ok: stopTask(id) }),
  );
}
