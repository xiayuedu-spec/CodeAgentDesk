import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { TaskProgressEvent } from '../../shared/types';

interface TaskProgressState {
  progress: TaskProgressEvent | null;
  /** 已上报的阶段名（按序号累积，用于展示"已完成"的历史阶段）。 */
  stages: Record<number, string>;
}

/** 订阅长任务阶段进度（周报/知识库生成），完成或出错后自动收起。 */
export function useTaskProgress(): TaskProgressState {
  const [progress, setProgress] = useState<TaskProgressEvent | null>(null);
  const [stages, setStages] = useState<Record<number, string>>({});

  useEffect(() => {
    let clearTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = window.codeagentdesk.onTaskProgress((event) => {
      if (clearTimer) {
        clearTimeout(clearTimer);
        clearTimer = null;
      }
      if (event.done) {
        setProgress((previous) => (previous ? { ...previous, done: true } : null));
        // 完成后短暂停留，让用户看到"全部完成"再收起。
        clearTimer = setTimeout(() => {
          setProgress(null);
          setStages({});
        }, 900);
        return;
      }
      setStages((previous) => ({ ...previous, [event.index]: event.stage }));
      setProgress(event);
    });
    return () => {
      if (clearTimer) clearTimeout(clearTimer);
      unsubscribe();
    };
  }, []);

  return { progress, stages };
}

/** 阶段进度面板：任务名 + 阶段列表（已完成打勾）+ 进度条。 */
export function TaskProgressPanel({
  progress,
  stages,
}: {
  progress: TaskProgressEvent;
  stages: Record<number, string>;
}) {
  const steps = Array.from({ length: Math.max(1, progress.total) }, (_, index) => index + 1);
  const percent = progress.done
    ? 100
    : Math.round(((progress.index - 0.5) / Math.max(1, progress.total)) * 100);
  return (
    <div className="task-progress" role="status" aria-live="polite">
      <div className="task-progress-title">
        <span>{progress.title}</span>
        {progress.done ? (
          <Check size={13} className="task-progress-check" />
        ) : (
          <Loader2 size={13} className="spin" />
        )}
      </div>
      <div className="task-progress-steps">
        {steps.map((step) => {
          const state = progress.done || step < progress.index ? 'done' : step === progress.index ? 'active' : '';
          return (
            <div key={step} className={`task-progress-step${state ? ` ${state}` : ''}`}>
              {state === 'done' ? <Check size={11} /> : <Loader2 size={11} />}
              {stages[step] ?? (state === 'done' ? '已完成' : '等待中')}
            </div>
          );
        })}
      </div>
      <div className="task-progress-bar">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
