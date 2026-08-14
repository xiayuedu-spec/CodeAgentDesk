import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface PaletteItem {
  key: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  items: PaletteItem[];
  query: string;
  index: number;
  onQueryChange: (query: string) => void;
  onHoverIndex: (index: number) => void;
  onKeyDown: (event: ReactKeyboardEvent) => void;
  onSelect: (item: PaletteItem) => void;
  onClose: () => void;
}

export function CommandPalette({
  items,
  query,
  index,
  onQueryChange,
  onHoverIndex,
  onKeyDown,
  onSelect,
  onClose,
}: CommandPaletteProps) {
  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入命令或搜索会话…（Ctrl+P）"
          aria-label="命令面板"
        />
        <ul className="palette-list">
          {items.length === 0 ? (
            <li className="palette-empty">无匹配</li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.key}
                className={`palette-item ${i === index ? 'active' : ''}`}
                onMouseEnter={() => onHoverIndex(i)}
                onClick={() => onSelect(item)}
              >
                <span className="palette-label">{item.label}</span>
                {item.hint ? <span className="palette-hint">{item.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
