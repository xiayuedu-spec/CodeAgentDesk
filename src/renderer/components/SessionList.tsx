import { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { MIN_VIRTUALIZE, useRowWindow } from '../hooks/useRowWindow';

interface SessionListProps<T> {
  items: T[];
  /**
   * 渲染一行，必须返回带 `key` 的元素。
   * `index` 是该行的全局导航下标（键盘上下键使用）。
   */
  renderRow: (item: T, index: number) => ReactNode;
  /** 首行的全局导航下标：组内/区块内的行下标连续，故 局部下标 + firstIndex = 全局下标。 */
  firstIndex: number;
  /** 当前键盘焦点行下标。 */
  focusIndex: number;
  /** 侧栏滚动容器（`sidebar-body`）。 */
  scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * 会话行列表：行数多时自动窗口化（只渲染视口附近的行 + 上下占位 padding）。
 * 行高由 `useRowWindow` 实测，小列表渲染结构完全不变。
 */
export function SessionList<T>({
  items,
  renderRow,
  firstIndex,
  focusIndex,
  scrollRef,
}: SessionListProps<T>) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const { start, end, padTop, padBottom } = useRowWindow({
    listRef,
    scrollRef,
    count: items.length,
    firstIndex,
    focusIndex,
  });
  const virtual = items.length > MIN_VIRTUALIZE; // 与 hook 的阈值同源，避免类名抖动导致入场动画重播
  const padded = padTop > 0 || padBottom > 0;

  return (
    <ul
      ref={listRef}
      className={`session-list${virtual ? ' virtual' : ''}`}
      style={padded ? { paddingTop: padTop, paddingBottom: padBottom } : undefined}
    >
      {items.slice(start, end).map((item, offset) => renderRow(item, firstIndex + start + offset))}
    </ul>
  );
}
