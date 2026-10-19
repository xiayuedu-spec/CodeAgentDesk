import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, Square, TerminalSquare, X } from 'lucide-react';
import type { TaskRunEvent, TaskScriptList } from '../../shared/types';
import { useEscape } from '../hooks/useEscape';
import { useToast } from '../toast';
import { EmptyState } from './EmptyState';
import { SkeletonStack } from './Skeleton';

interface TaskRunnerModalProps {
  cwd: string;
  title?: string;
  onClose: () => void;
}

/** 前端保留的输出上限（字符）：够看报错，又不会把 DOM 撑爆。 */
const MAX_LOG_CHARS = 200_000;

interface RunState {
  id: string;
  script: string;
  code: number | null | undefined;
  output: string;
}

/**
 * 任务运行器：跑 `package.json` 里声明的脚本（npm/pnpm/yarn/bun 自动识别）。
 * 只跑声明过的脚本，不提供自由 shell——临时命令走会话里的 Claude Code，可记录可审计。
 */
export function TaskRunnerModal({ cwd, title, onClose }: TaskRunnerModalProps) {
  useEscape(true, onClose);
  const toast = useToast();
  const [scripts, setScripts] = useState<TaskScriptList | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [starting, setStarting] = useState(false);
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.codeagentdesk
      .listTaskScripts(cwd)
      .then((value) => {
        if (!cancelled) setScripts(value);
      })
      .catch(() => {
        if (!cancelled) setScripts({ cwd, manager: 'npm', scripts: [], hasPackageJson: false });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  // 订阅输出：只认当前任务 id，避免旧任务的尾巴混进来。
  useEffect(() => {
    return window.codeagentdesk.onTaskRun((event: TaskRunEvent) => {
      setRun((current) => {
        if (!current || current.id !== event.id) return current;
        if (event.kind === 'exit') return { ...current, code: event.code ?? null };
        const merged = (current.output + (event.chunk ?? '')).slice(-MAX_LOG_CHARS);
        return { ...current, output: merged };
      });
    });
  }, []);

  // 输出自动滚到底（跟 tail -f 的预期一致）。
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [run?.output]);

  const start = useCallback(
    async (script: string) => {
      if (run && run.code === undefined) return; // 有任务在跑
      setStarting(true);
      try {
        const started = await window.codeagentdesk.startTask(cwd, script);
        if (!started) {
          toast.error('启动失败（可能已有 3 个任务在跑）');
          return;
        }
        setRun({ id: started.id, script, code: undefined, output: '' });
      } finally {
        setStarting(false);
      }
    },
    [cwd, run, toast],
  );

  const stop = useCallback(async () => {
    if (!run || run.code !== undefined) return;
    await window.codeagentdesk.stopTask(run.id);
  }, [run]);

  const running = Boolean(run && run.code === undefined);

  return (
    <div className="day-overlay" onClick={onClose}>
      <div className="day-panel task-panel" onClick={(event) => event.stopPropagation()}>
        <div className="day-header">
          <span className="day-title">
            <TerminalSquare size={14} /> 任务
            {scripts ? <span className="diff-branch">{scripts.manager}</span> : null}
            {title ? <span className="diff-session">{title}</span> : null}
          </span>
          <div className="day-actions">
            {run ? (
              <span className={`task-status ${running ? 'running' : run.code === 0 ? 'ok' : 'fail'}`}>
                {running ? (
                  <>
                    <Loader2 size={11} className="spin" /> 运行中
                  </>
                ) : run.code === 0 ? (
                  '通过'
                ) : (
                  `退出码 ${run.code ?? '未知'}`
                )}
              </span>
            ) : null}
            <button type="button" className="icon-button" title="关闭" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="day-body task-body">
          {!scripts ? (
            <SkeletonStack rows={4} />
          ) : !scripts.hasPackageJson ? (
            <EmptyState
              icon={<TerminalSquare size={20} strokeWidth={1.6} />}
              title="这个目录没有 package.json"
              hint="任务运行器只跑项目里声明过的脚本"
            />
          ) : scripts.scripts.length === 0 ? (
            <EmptyState
              icon={<TerminalSquare size={20} strokeWidth={1.6} />}
              title="package.json 里没有 scripts"
            />
          ) : (
            <div className="task-split">
              <ul className="task-scripts">
                {scripts.scripts.map((script) => {
                  const active = run?.script === script.name;
                  return (
                    <li key={script.name}>
                      <button
                        type="button"
                        className={`task-script${active ? ' active' : ''}`}
                        title={`${scripts.manager} run ${script.name}\n${script.command}`}
                        disabled={starting || (running && !active)}
                        onClick={() => void start(script.name)}
                      >
                        <Play size={11} className="task-script-play" />
                        <span className="task-script-name">{script.name}</span>
                        <span className="task-script-cmd">{script.command}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="task-output-wrap">
                {run ? (
                  <>
                    <div className="task-output-head">
                      <span className="task-output-name">
                        {scripts.manager} run {run.script}
                      </span>
                      {running ? (
                        <button type="button" className="task-stop" onClick={() => void stop()}>
                          <Square size={11} /> 停止
                        </button>
                      ) : null}
                    </div>
                    <pre className="task-log" ref={logRef}>
                      {run.output || '（等待输出…）'}
                    </pre>
                  </>
                ) : (
                  <div className="task-hint">左侧选一个脚本运行，输出会实时显示在这里</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
