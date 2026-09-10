import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/** 行数低于该阈值不做窗口化（短列表全量渲染，零风险）。 */
export const MIN_VIRTUALIZE = 60;
/** 视口上下各多渲染几行，滚动时不露白。 */
const OVERSCAN = 6;
/** 首帧渲染的行数上限：窗口在 layout effect 里立刻算好，这里只避免"先全量渲染一帧"。 */
const INITIAL_ROWS = 40;
/** 首帧测量前的行高估算值（与 CSS min-height 保持一致）。 */
const FALLBACK_ROW_HEIGHT = 48;

interface Window {
  start: number;
  end: number;
}

/**
 * 固定行高长列表的窗口化渲染（不引第三方依赖）。
 *
 * 行高由首行实测（`offsetHeight` + flex gap）而非硬编码，主题改字号/内边距也不会错位；
 * 列表在滚动容器中的绝对偏移每次渲染重新计算，因此上方标题区展开/折叠同样安全。
 */
export function useRowWindow({
  listRef,
  scrollRef,
  count,
  firstIndex,
  focusIndex,
}: {
  listRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  count: number;
  /** 本列表首行在导航序号中的全局下标（组内行连续，故可用 start + 局部下标）。 */
  firstIndex: number;
  /** 需要保持可见的导航焦点行（键盘上下切换时用）。 */
  focusIndex: number;
}): { start: number; end: number; padTop: number; padBottom: number } {
  const [rowHeight, setRowHeight] = useState(FALLBACK_ROW_HEIGHT);
  const [range, setRange] = useState<Window>({
    start: 0,
    end: Math.min(count, INITIAL_ROWS),
  });
  const virtual = count > MIN_VIRTUALIZE;

  /** 列表相对滚动内容顶部的偏移。 */
  const listOffset = useCallback((): number | null => {
    const list = listRef.current;
    const scroll = scrollRef.current;
    if (!list || !scroll) return null;
    return (
      list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
    );
  }, [listRef, scrollRef]);

  const update = useCallback(() => {
    const scroll = scrollRef.current;
    const list = listRef.current;
    if (!scroll || !list || count <= MIN_VIRTUALIZE) {
      setRange((previous) =>
        previous.start === 0 && previous.end === count ? previous : { start: 0, end: count },
      );
      return;
    }
    const offset = listOffset();
    if (offset == null) return;

    // 实测行高：整行包含 flex gap，窗口推进时以它为步长。
    const first = list.firstElementChild as HTMLElement | null;
    if (first && first.offsetHeight > 0) {
      const gap = Number.parseFloat(getComputedStyle(list).rowGap || '0') || 0;
      const measured = first.offsetHeight + gap;
      setRowHeight((previous) => (Math.abs(previous - measured) > 0.5 ? measured : previous));
    }

    const unit = rowHeight;
    const top = scroll.scrollTop - offset - OVERSCAN * unit;
    const bottom = scroll.scrollTop - offset + scroll.clientHeight + OVERSCAN * unit;
    const start = Math.max(0, Math.min(count, Math.floor(top / unit)));
    const end = Math.max(start, Math.min(count, Math.ceil(bottom / unit)));
    setRange((previous) => (previous.start === start && previous.end === end ? previous : { start, end }));
  }, [count, listOffset, listRef, rowHeight, scrollRef]);

  // 滚动 / 容器尺寸变化时重算窗口。
  useEffect(() => {
    if (!virtual) {
      update();
      return;
    }
    const scroll = scrollRef.current;
    if (!scroll) return;
    scroll.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    update();
    return () => {
      scroll.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [scrollRef, update, virtual]);

  // 每次渲染后校正一次（上方区块折叠、搜索过滤、行高实测变化都会影响偏移）。
  useLayoutEffect(() => {
    update();
  });

  // 键盘导航：焦点行不在窗口内时，先把容器滚到它附近，下一帧自然进入窗口。
  useEffect(() => {
    if (!virtual || focusIndex < firstIndex || focusIndex >= firstIndex + count) return;
    const scroll = scrollRef.current;
    const list = listRef.current;
    if (!scroll || !list) return;
    const element = list.querySelector(`[data-nav-index="${focusIndex}"]`);
    if (element) return; // 已在 DOM 中，交给外层 scrollIntoView
    const offset = listOffset();
    if (offset == null) return;
    const rowTop = offset + (focusIndex - firstIndex) * rowHeight;
    const viewTop = scroll.scrollTop;
    const viewBottom = viewTop + scroll.clientHeight;
    if (rowTop < viewTop) scroll.scrollTo({ top: Math.max(0, rowTop - OVERSCAN * rowHeight) });
    else if (rowTop + rowHeight > viewBottom) {
      scroll.scrollTo({ top: rowTop + rowHeight - scroll.clientHeight + OVERSCAN * rowHeight });
    }
  }, [count, firstIndex, focusIndex, listOffset, listRef, rowHeight, scrollRef, virtual, range]);

  if (!virtual) return { start: 0, end: count, padTop: 0, padBottom: 0 };
  const start = Math.max(0, Math.min(range.start, count));
  const end = Math.max(start, Math.min(range.end, count));
  return {
    start,
    end,
    padTop: start * rowHeight,
    padBottom: (count - end) * rowHeight,
  };
}
