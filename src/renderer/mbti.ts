import type { GroupRecord, SessionRecord } from '../shared/types';

export interface MbtiDimension {
  /** 主导特质（字母）。 */
  trait: string;
  /** 特质名（如 内向）。 */
  label: string;
  /** 主导特质的倾向度（50-95）。 */
  percent: number;
}

export interface MbtiResult {
  code: string;
  dims: MbtiDimension[];
  summary: string;
}

const TRAIT_NAMES: Record<string, string> = {
  I: '内向',
  E: '外向',
  N: '直觉',
  S: '实感',
  T: '思考',
  F: '情感',
  J: '判断',
  P: '感知',
};

const FLAVOR: Record<string, string> = {
  I: '习惯在安静的时段深潜',
  E: '保持高频多线推进',
  N: '喜欢多项目探索尝新',
  S: '深耕少数项目、稳扎稳打',
  T: '产出导向，出手快',
  F: '读得多、想得多、偏陪伴型',
  J: '爱整理，结构清晰',
  P: '随性推进，灵活应变',
};

function clampPercent(value: number): number {
  return Math.round(Math.min(95, Math.max(50, value)));
}

/**
 * 基于使用习惯的娱乐向 MBTI 推断（非严谨心理测评）：
 * - I/E：深夜（23-5 点）活跃会话占比 → 高则偏 I
 * - N/S：活跃项目数量 → 多则偏 N（探索型），少则偏 S（深耕型）
 * - T/F：今日输出 token 占比 → 高则偏 T（产出型），低则偏 F
 * - J/P：分组数 / 置顶数 / 归档率 → 结构化程度高则偏 J
 */
export function computeMbti(
  records: SessionRecord[],
  groups: GroupRecord[],
  todayInputTokens: number,
  todayOutputTokens: number,
): MbtiResult | null {
  const total = records.length;
  if (total === 0) return null;

  // I/E
  let night = 0;
  for (const record of records) {
    const hour = new Date(record.updatedAt).getHours();
    if (hour >= 23 || hour < 5) night += 1;
  }
  const nightRatio = night / total;
  const iPercent = clampPercent(50 + (nightRatio - 0.15) * 300);

  // N/S
  const projects = new Set(records.map((record) => record.cwd).filter(Boolean));
  const nPercent = clampPercent(50 + (projects.size - 3) * 12);

  // T/F
  const totalToday = todayInputTokens + todayOutputTokens;
  const outputRatio = totalToday > 0 ? todayOutputTokens / totalToday : 0;
  const tPercent = clampPercent(50 + (outputRatio - 0.45) * 280);

  // J/P
  const pinned = records.filter((record) => record.pinned === true).length;
  const archived = records.filter((record) => record.archived).length;
  const archivedRatio = archived / total;
  const structureScore =
    (groups.length >= 3 ? 1 : groups.length >= 1 ? 0.5 : 0) +
    (pinned >= 2 ? 1 : 0) +
    (archivedRatio >= 0.3 ? 1 : 0);
  const jPercent = clampPercent(50 + (structureScore - 1.2) * 25);

  const candidates: MbtiDimension[] = [
    { trait: iPercent >= 50 ? 'I' : 'E', label: TRAIT_NAMES[iPercent >= 50 ? 'I' : 'E'], percent: iPercent },
    { trait: nPercent >= 50 ? 'N' : 'S', label: TRAIT_NAMES[nPercent >= 50 ? 'N' : 'S'], percent: nPercent },
    { trait: tPercent >= 50 ? 'T' : 'F', label: TRAIT_NAMES[tPercent >= 50 ? 'T' : 'F'], percent: tPercent },
    { trait: jPercent >= 50 ? 'J' : 'P', label: TRAIT_NAMES[jPercent >= 50 ? 'J' : 'P'], percent: jPercent },
  ];
  const code = candidates.map((dim) => dim.trait).join('');

  const summary = `${candidates
    .map((dim) => FLAVOR[dim.trait])
    .join('，')}。深夜活跃占比 ${Math.round(nightRatio * 100)}% · 活跃项目 ${projects.size} 个 · 归档率 ${Math.round(archivedRatio * 100)}% · 置顶 ${pinned} 个。`;

  return { code, dims: candidates, summary };
}
