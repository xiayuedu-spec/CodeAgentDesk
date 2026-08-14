import type { ThemeName } from '../shared/types';

/** 窗口底色（主题切换时同步 Electron 窗口背景，避免白闪）。 */
export const THEME_BACKGROUND: Record<ThemeName, string> = {
  default: '#08090c',
  mac: '#ececef',
  green: '#c7edcc',
  sepia: '#f4ead8',
  amber: '#16120b',
  mist: '#131619',
};

export const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'default', label: '深色默认' },
  { name: 'mac', label: 'Mac 浅色' },
  { name: 'green', label: '护眼豆沙绿' },
  { name: 'sepia', label: '暖纸米黄' },
  { name: 'amber', label: '琥珀夜间' },
  { name: 'mist', label: '柔雾深青' },
];

export const THEME_SWATCHES: Record<ThemeName, { bg: string; fg: string; accent: string }> = {
  default: { bg: '#08090c', fg: '#e8ecf1', accent: '#34d3c0' },
  mac: { bg: '#ececef', fg: '#1d1d1f', accent: '#0a84ff' },
  green: { bg: '#c7edcc', fg: '#2f4a35', accent: '#2e8b57' },
  sepia: { bg: '#f4ead8', fg: '#3d3528', accent: '#a67c1f' },
  amber: { bg: '#16120b', fg: '#e2cfa5', accent: '#e0a64e' },
  mist: { bg: '#131619', fg: '#c6cdd4', accent: '#58a0a8' },
};
