import { useEffect, useState } from 'react';

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

/**
 * 全局委托式 Tooltip：任意元素加 `data-tip="..."` 即生效（替代原生 title，样式随主题）。
 * 200ms 延迟出现；滚动/点击/Esc 关闭。
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<TooltipState | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let current: Element | null = null;

    const clear = (): void => {
      if (showTimer) clearTimeout(showTimer);
      showTimer = null;
      current = null;
      setTip(null);
    };

    const onOver = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.('[data-tip]');
      if (!target || target === current) return;
      const text = target.getAttribute('data-tip') ?? '';
      if (!text) return;
      if (showTimer) clearTimeout(showTimer);
      current = target;
      showTimer = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        setTip({ text, x: rect.left + rect.width / 2, y: rect.top });
      }, 200);
    };

    const onOut = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest?.('[data-tip]');
      if (target && target === current) clear();
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousedown', clear);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('keydown', clear);
    return () => {
      if (showTimer) clearTimeout(showTimer);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousedown', clear);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('keydown', clear);
    };
  }, []);

  if (!tip) return null;
  return (
    <div className="app-tooltip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
