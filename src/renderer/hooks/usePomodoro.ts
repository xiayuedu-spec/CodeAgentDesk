import { useEffect, useRef, useState } from 'react';

/** 一个番茄钟时长（25 分钟）。 */
export const POMODORO_MS = 25 * 60_000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 完成提示音（Web Audio，无资源文件）。 */
function playChime(): void {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(1174.66, context.currentTime + 0.35);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.9);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.9);
  } catch {
    // 音频不可用时静默忽略。
  }
}

/** 番茄钟：25 分钟倒计时，完成时提示音 + finished 标记（供上层弹 toast）。 */
export function usePomodoro(durationMs: number = POMODORO_MS) {
  const [running, setRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [finished, setFinished] = useState(false);
  const endAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = (): void => {
      const left = (endAtRef.current ?? Date.now()) - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setRunning(false);
        setFinished(true);
        playChime();
        return;
      }
      setRemainingMs(left);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const toggle = (): void => {
    if (running) {
      setRunning(false);
      return;
    }
    if (remainingMs <= 0) setRemainingMs(durationMs);
    endAtRef.current = Date.now() + Math.max(1, remainingMs);
    setFinished(false);
    setRunning(true);
  };

  const reset = (): void => {
    setRunning(false);
    setRemainingMs(durationMs);
    endAtRef.current = null;
    setFinished(false);
  };

  return {
    running,
    finished,
    remainingText: formatRemaining(remainingMs),
    progress: 1 - remainingMs / durationMs,
    toggle,
    reset,
  };
}
