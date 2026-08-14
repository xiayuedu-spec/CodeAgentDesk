import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { UiState } from '../shared/types';

export function readUiState(): UiState {
  const file = uiStatePath();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<UiState>;
    return {
      openSessionIds: Array.isArray(parsed.openSessionIds) ? parsed.openSessionIds : [],
      activeSessionId: typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : undefined,
      collapsedGroups: Array.isArray(parsed.collapsedGroups)
        ? parsed.collapsedGroups.filter((item): item is string => typeof item === 'string')
        : [],
      collapsedSections: Array.isArray(parsed.collapsedSections)
        ? parsed.collapsedSections.filter((item): item is string => typeof item === 'string')
        : [],
    };
  } catch {
    return { openSessionIds: [] };
  }
}

export function writeUiState(state: UiState): void {
  const file = uiStatePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

function uiStatePath(): string {
  return path.join(app.getPath('userData'), 'ui-state.json');
}
