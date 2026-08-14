import { spawn } from 'node:child_process';

const MAX_SESSION_INPUT = 20000;
const MAX_DAY_INPUT = 40000;
const TIMEOUT_MS = 60000;

export interface SummaryResult {
  summary: string;
  tags: string[];
}

/** 调 claude 无头模式（`claude -p`），指令+内容走 stdin。Windows 需 shell 启动 .cmd。 */
export function runClaude(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let child: ReturnType<typeof spawn> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const done = (error: Error | null, output?: string): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child && child.exitCode === null) child.kill();
      if (error) reject(error);
      else resolve(output as string);
    };

    timer = setTimeout(() => {
      child?.kill();
      done(new Error('调用 claude 超时'));
    }, TIMEOUT_MS);

    try {
      child = spawn('claude', ['-p'], {
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      done(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => done(error));
    child.on('close', (code) => {
      if (code !== 0) {
        done(new Error(stderr.trim() || `claude 退出码 ${code}`));
        return;
      }
      done(null, stdout);
    });
    child.stdin?.end(input);
  });
}

export async function summarizeSession(text: string): Promise<SummaryResult> {
  const instruction =
    '请总结下面的 Claude Code 会话记录，输出两行：第一行以 摘要: 开头接一句中文概括；第二行以 标签: 开头接逗号分隔的短标签。只输出这两行。\n\n--- 会话记录（截断）---\n';
  const output = await runClaude(instruction + text.slice(-MAX_SESSION_INPUT));
  return parseSummary(output);
}

export async function summarizeDayText(text: string): Promise<string> {
  const instruction =
    '请根据与 Claude Code 的交互会话记录，生成一份今日总结（Markdown）：\n' +
    '## 今日完成\n分项目列出做了什么\n## 难点与解决\n## 遗留 / 下一步\n简洁、要点式。\n\n--- 会话记录（截断）---\n';
  const output = await runClaude(instruction + text.slice(-MAX_DAY_INPUT));
  return output.trim();
}

export async function summarizeMonthText(text: string): Promise<string> {
  const instruction =
    '请根据与 Claude Code 的交互会话记录，生成一份月度总结（Markdown）：\n' +
    '## 本月成果\n按项目归纳本月完成的主要工作\n## 关键决策 / 技术沉淀\n## 问题与复盘\n## 下月建议\n要点式、有数据感。\n\n--- 会话记录（截断）---\n';
  const output = await runClaude(instruction + text.slice(-MAX_DAY_INPUT));
  return output.trim();
}

export async function summarizeWeekText(text: string): Promise<string> {
  const instruction =
    '请根据与 Claude Code 的交互会话记录，生成一份本周总结（Markdown）：\n' +
    '## 本周完成\n按项目归纳本周完成的主要工作\n## 难点与解决\n## 遗留 / 下周计划\n简洁、要点式。\n\n--- 会话记录（截断）---\n';
  const output = await runClaude(instruction + text.slice(-MAX_DAY_INPUT));
  return output.trim();
}

/** 解析摘要输出（`摘要：…` / `标签：…` 两行），供测试直接调用。 */
export function parseSummary(output: string): SummaryResult {
  let summary = '';
  let tags: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('摘要')) {
      summary = trimmed.replace(/^摘要[:：]?\s*/, '').trim();
    } else if (trimmed.startsWith('标签')) {
      tags = trimmed
        .replace(/^标签[:：]?\s*/, '')
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5);
    }
  }
  if (!summary && !tags.length) {
    summary = output.trim().slice(0, 80);
  }
  return { summary, tags };
}
