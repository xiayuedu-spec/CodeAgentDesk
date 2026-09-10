import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { PaletteItem } from '../components/CommandPalette';

/** 命令面板（Ctrl+P）状态与交互：过滤、键盘导航、选中执行。 */
export function usePalette(buildItems: () => PaletteItem[]) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);

  // 面板关闭时不构建条目（避免每次渲染都重建数组）；打开时构建一次。
  const buildRef = useRef(buildItems);
  buildRef.current = buildItems;
  const paletteItems = useMemo(
    () => (paletteOpen ? buildRef.current() : []),
    [paletteOpen],
  );
  const paletteFiltered = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase();
    if (!query) return paletteItems;
    return paletteItems.filter((item) =>
      `${item.label} ${item.hint ?? ''}`.toLowerCase().includes(query),
    );
  }, [paletteItems, paletteQuery]);
  const paletteSafeIndex = paletteFiltered.length
    ? Math.min(paletteIndex, paletteFiltered.length - 1)
    : -1;

  function openPalette(): void {
    setPaletteQuery('');
    setPaletteIndex(0);
    setPaletteOpen(true);
  }

  function runPaletteItem(item: PaletteItem): void {
    setPaletteOpen(false);
    setPaletteQuery('');
    item.run();
  }

  function onPaletteKeyDown(event: ReactKeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (paletteFiltered.length) setPaletteIndex((i) => (i + 1) % paletteFiltered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (paletteFiltered.length) {
        setPaletteIndex((i) => (i - 1 + paletteFiltered.length) % paletteFiltered.length);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = paletteFiltered[paletteSafeIndex];
      if (item) runPaletteItem(item);
    } else if (event.key === 'Escape') {
      setPaletteOpen(false);
    }
  }

  return {
    paletteItems,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    paletteIndex,
    setPaletteIndex,
    openPalette,
    paletteFiltered,
    paletteSafeIndex,
    onPaletteKeyDown,
    runPaletteItem,
  };
}
