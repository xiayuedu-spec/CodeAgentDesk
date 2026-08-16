import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/** 需要随备份迁移的应用数据文件（均为小 JSON）。会话 JSONL 在 Claude 目录，另行说明。 */
const STORE_FILES = [
  'config.json',
  'session-meta.json',
  'groups.json',
  'ui-state.json',
  'recent-dirs.json',
  'summaries.json',
  'knowledge.json',
  'window-state.json',
];

export interface BackupResult {
  ok: boolean;
  path?: string;
  message?: string;
}

/** 导出备份：把全部应用数据 JSON 复制到用户选择的目录（codeagentdesk-backup-<日期>/）。 */
export async function exportBackup(): Promise<BackupResult> {
  const userData = app.getPath('userData');
  const result = await dialog.showOpenDialog({
    title: '选择备份保存位置',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, message: '已取消' };
  const destDir = path.join(
    result.filePaths[0],
    `codeagentdesk-backup-${new Date().toISOString().slice(0, 10)}`,
  );
  try {
    fs.mkdirSync(destDir, { recursive: true });
    let copied = 0;
    for (const name of STORE_FILES) {
      const source = path.join(userData, name);
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(destDir, name));
        copied += 1;
      }
    }
    return { ok: true, path: destDir, message: `已备份 ${copied} 个数据文件` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/** 导入迁移：从备份目录复制数据文件到应用数据目录；导入前先给当前数据留快照。 */
export async function importBackup(): Promise<BackupResult> {
  const userData = app.getPath('userData');
  const result = await dialog.showOpenDialog({
    title: '选择备份目录（codeagentdesk-backup-*）',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, message: '已取消' };
  const sourceDir = result.filePaths[0];
  try {
    const snapshot = path.join(userData, `pre-import-${Date.now()}`);
    fs.mkdirSync(snapshot, { recursive: true });
    let found = 0;
    for (const name of STORE_FILES) {
      const source = path.join(sourceDir, name);
      const current = path.join(userData, name);
      if (fs.existsSync(current)) {
        fs.copyFileSync(current, path.join(snapshot, name));
      }
      if (fs.existsSync(source)) {
        fs.copyFileSync(source, current);
        found += 1;
      }
    }
    if (found === 0) return { ok: false, message: '所选目录中没有可导入的数据文件' };
    return {
      ok: true,
      path: sourceDir,
      message: `已导入 ${found} 个数据文件（原数据快照到 pre-import-*）`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
