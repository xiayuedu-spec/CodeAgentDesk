import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { shell } from 'electron';
import type { OpenFileResult } from '../shared/types';

/**
 * 在编辑器里打开文件到指定行。
 *
 * 优先用命令行编辑器（`code -g` / `cursor -g` / `subl`），都没有时退回系统默认程序，
 * 再不行就在文件管理器里选中它。**agent 做不到这件事**（它没法替你打开窗口），
 * 所以这是应用该补的链接能力。
 */

/** 依次尝试的编辑器命令（Windows 上是 .cmd 垫片，必须走 shell）。 */
const EDITORS: { command: string; args: (file: string, line?: number) => string[] }[] = [
  { command: 'code', args: (file, line) => ['-g', line ? `${file}:${line}` : file] },
  { command: 'cursor', args: (file, line) => ['-g', line ? `${file}:${line}` : file] },
  { command: 'subl', args: (file, line) => [line ? `${file}:${line}` : file] },
];

/** 探测结果缓存：避免每次点击都跑三次 `--version`。 */
let editorProbe: Promise<string | null> | null = null;

function tryEditor(command: string, file: string, line?: number): Promise<boolean> {
  const args = EDITORS.find((item) => item.command === command)?.args(file, line) ?? [file];
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: 8000, windowsHide: true, shell: process.platform === 'win32' },
      (error) => resolve(!error),
    );
  });
}

/** 找一个可用的编辑器命令（只探测一次）。 */
function detectEditor(): Promise<string | null> {
  if (editorProbe) return editorProbe;
  editorProbe = (async () => {
    for (const editor of EDITORS) {
      const ok = await new Promise<boolean>((resolve) => {
        execFile(
          editor.command,
          ['--version'],
          { timeout: 5000, windowsHide: true, shell: process.platform === 'win32' },
          (error) => resolve(!error),
        );
      });
      if (ok) return editor.command;
    }
    return null;
  })();
  return editorProbe;
}

/**
 * 打开文件（可选定位到行）。
 * `filePath` 可以是绝对路径，也可以是相对 `cwd` 的路径。
 */
export async function openFileInEditor(
  filePath: string,
  line?: number,
  cwd?: string,
): Promise<OpenFileResult> {
  const target = filePath && cwd && !/^([A-Za-z]:|[\\/])/.test(filePath)
    ? `${cwd}/${filePath}`.replace(/\/+/g, '/')
    : filePath;
  if (!target) return { ok: false, via: 'folder', message: '缺少文件路径' };
  if (!fs.existsSync(target)) return { ok: false, via: 'folder', message: '文件不存在' };

  const editor = await detectEditor();
  if (editor) {
    const ok = await tryEditor(editor, target, line);
    if (ok) return { ok: true, via: 'editor' };
  }

  // 没有命令行编辑器：交给系统默认程序（可能不是 IDE，但至少能看）。
  try {
    const error = await shell.openPath(target);
    if (!error) return { ok: true, via: 'default' };
  } catch {
    // 落到文件管理器
  }

  shell.showItemInFolder(target);
  return { ok: true, via: 'folder' };
}
