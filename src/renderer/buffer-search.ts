/**
 * 在终端缓冲区里找一段文本——纯函数，便于单测。
 *
 * 关键点：TUI 会按窗宽折行，一句话可能被拆到两行；直接逐行 `includes` 会漏。
 * 所以把各行**去空白后拼成一条长串**再找，命中后用每行的起点反查行号。
 */

export interface BufferMatch {
  /** 命中所在的缓冲区行（0 = 缓冲第一行）。 */
  row: number;
  /** 命中完整落在该行时的列号（跨行时为 -1，只滚动不高亮）。 */
  column: number;
}

/** 归一化：折叠空白、小写。 */
function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 找第 `fromEnd` 次出现（0 = 从末尾数第一次，用于同一句话出现多次时定位对应那一次）。
 * `lines` 是缓冲区的可视文本（每行一条）。
 */
export function findInBufferLines(
  lines: string[],
  text: string,
  fromEnd = 0,
): BufferMatch | null {
  const needle = normalize(text).replace(/\s/g, '');
  // 单字符针太容易误命中；4 字下限由 needleCandidates 保证（这里只挡 0/1 字）
  if (needle.length < 2) return null;

  const starts: number[] = [];
  const stripped: string[] = [];
  let cursor = 0;
  for (const line of lines) {
    const piece = normalize(line).replace(/\s/g, '');
    starts.push(cursor);
    stripped.push(piece);
    cursor += piece.length;
  }
  const joined = stripped.join('');

  let searchFrom = joined.length;
  let found = -1;
  for (let attempt = 0; attempt <= fromEnd; attempt += 1) {
    found = joined.lastIndexOf(needle, searchFrom - 1);
    if (found < 0) break;
    searchFrom = found;
  }
  if (found < 0) return null;

  // 反查行号：最大的 starts[i] <= found
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= found) low = mid;
    else high = mid - 1;
  }
  const row = low;

  // 只有整段命中都在同一行内才能给列号（跨行时列号对不上，调用方只滚动）
  const column = normalize(lines[row] ?? '').indexOf(normalize(text));
  return { row, column };
}

/**
 * 逐级缩短的"针"：长句折行时短针更可能命中。
 * 去重并保持顺序，长度不足 4 的丢弃。
 */
export function needleCandidates(text: string): string[] {
  const plain = normalize(text);
  const candidates = [plain.slice(0, 24), plain.slice(0, 12), plain.slice(0, 8)];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (candidate.length < 4 || seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}
