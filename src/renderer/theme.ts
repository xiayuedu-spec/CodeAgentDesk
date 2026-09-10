import type { ThemeName } from '../shared/types';

/** 隐藏主题（需彩蛋解锁后才在设置里出现）。 */
export const HIDDEN_THEMES: ThemeName[] = ['neon', 'term'];

/** 窗口底色（主题切换时同步 Electron 窗口背景，避免白闪）。 */
export const THEME_BACKGROUND: Record<ThemeName, string> = {
  default: '#08090c',
  mac: '#ececef',
  green: '#c7edcc',
  sepia: '#f4ead8',
  amber: '#16120b',
  mist: '#131619',
  warm: '#faf9f5',
  neon: '#0a0614',
  term: '#0b0b0b',
};

export const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'default', label: '深色默认' },
  { name: 'mac', label: 'Mac 浅色' },
  { name: 'green', label: '护眼豆沙绿' },
  { name: 'sepia', label: '暖纸米黄' },
  { name: 'amber', label: '琥珀夜间' },
  { name: 'mist', label: '柔雾深青' },
  { name: 'warm', label: '暖白珊瑚' },
  { name: 'neon', label: '霓虹·隐藏' },
  { name: 'term', label: '终端·隐藏' },
];

export const THEME_SWATCHES: Record<ThemeName, { bg: string; fg: string; accent: string }> = {
  default: { bg: '#08090c', fg: '#e8ecf1', accent: '#34d3c0' },
  mac: { bg: '#ececef', fg: '#1d1d1f', accent: '#0a84ff' },
  green: { bg: '#c7edcc', fg: '#2f4a35', accent: '#2e8b57' },
  sepia: { bg: '#f4ead8', fg: '#3d3528', accent: '#a67c1f' },
  amber: { bg: '#16120b', fg: '#e2cfa5', accent: '#e0a64e' },
  mist: { bg: '#131619', fg: '#c6cdd4', accent: '#58a0a8' },
  warm: { bg: '#faf9f5', fg: '#141413', accent: '#cc785c' },
  neon: { bg: '#0a0614', fg: '#e6e1ff', accent: '#00e5ff' },
  term: { bg: '#0b0b0b', fg: '#e8e8e8', accent: '#30d158' },
};

/** 主题是否已解锁（非隐藏主题恒为已解锁）。 */
export function isThemeUnlocked(
  theme: ThemeName,
  unlocked: { funUnlockedNeon?: boolean; funUnlockedThemes?: string[] } | undefined,
): boolean {
  if (!HIDDEN_THEMES.includes(theme)) return true;
  if (theme === 'neon' && unlocked?.funUnlockedNeon === true) return true;
  return (unlocked?.funUnlockedThemes ?? []).includes(theme);
}
