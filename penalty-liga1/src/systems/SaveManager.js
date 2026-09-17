import { STORAGE_KEY } from '../config/gameConfig.js';

const DEFAULT_SAVE = {
  settings: { audio: true, difficulty: 'normal' },
  tournamentProgress: null
};

export function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    return { ...DEFAULT_SAVE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function saveGame(partial) {
  try {
    const current = loadSave();
    const next = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}
