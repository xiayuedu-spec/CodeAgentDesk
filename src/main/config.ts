import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppConfig, ClaudeConfigInfo, ThemeName } from '../shared/types';

export function readConfig(): AppConfig {
  const file = configPath();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AppConfig;
    return {
      claudeDir: typeof parsed.claudeDir === 'string' ? parsed.claudeDir : undefined,
      theme: normalizeTheme(parsed.theme),
      tokenLimitPerHour:
        typeof parsed.tokenLimitPerHour === 'number' && parsed.tokenLimitPerHour > 0
          ? parsed.tokenLimitPerHour
          : undefined,
    };
  } catch {
    return {};
  }
}

export function writeConfig(config: AppConfig): void {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
}

export function resolveClaudeHome(config: AppConfig): string {
  if (config.claudeDir?.trim()) return path.resolve(config.claudeDir.trim());
  if (process.env.CLAUDE_CONFIG_DIR?.trim()) {
    return path.resolve(process.env.CLAUDE_CONFIG_DIR.trim());
  }
  return path.join(os.homedir(), '.claude');
}

export function readClaudeConfigInfo(): ClaudeConfigInfo {
  const config = readConfig();
  return { config, resolvedClaudeDir: resolveClaudeHome(config) };
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function normalizeTheme(value: unknown): ThemeName {
  const allowed: readonly ThemeName[] = [
    'default',
    'mac',
    'green',
    'sepia',
    'amber',
    'mist',
    'neon',
  ];
  return allowed.includes(value as ThemeName) ? (value as ThemeName) : 'default';
}
