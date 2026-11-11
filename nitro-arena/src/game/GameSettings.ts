import type { BotDifficulty, GameMode } from '../core/types';
import type { QualityLevel } from '../render/Materials';

export interface GameSettings {
  lastMode: GameMode;
  difficulty: BotDifficulty;
  quality: QualityLevel;
  /** Escala de resolución interna (0.5–1) multiplicada por el devicePixelRatio limitado */
  renderScale: number;
  maxPixelRatio: number;
  shadows: boolean;
  showFps: boolean;
  infiniteBoostFreeplay: boolean;
  friendlyDemos: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  lastMode: '1v1',
  difficulty: 'pro',
  quality: 'realista',
  renderScale: 1,
  maxPixelRatio: 1.5,
  shadows: true,
  showFps: true,
  infiniteBoostFreeplay: true,
  friendlyDemos: false,
};
