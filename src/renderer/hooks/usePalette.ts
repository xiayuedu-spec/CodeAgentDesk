import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { PaletteItem } from '../components/CommandPalette';

/** 命令面板（Ctrl+P）状态与交互：过滤、键盘导航、选中执行。 */
export function usePalette(items: () => PaletteItem[]) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteIndex, setPaletteIndex] = useState(0);

  const paletteItems = items();
  const paletteFiltered = paletteQuery.trim()
    ? paletteItems.filter((item) =>
        `${item.label} ${item.hint ?? ''}`
          .toLowerCase()
          .includes(paletteQuery.trim().toLowerCase()),
      )
    : paletteItems;
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
