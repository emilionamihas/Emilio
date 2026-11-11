export type Team = 0 | 1;

export const TEAM_NAMES = ['Azul', 'Naranja'] as const;
export const TEAM_COLORS = [0x2f86ff, 0xff8a1f] as const;

/** Entradas de control de un coche en un tick (humano o bot). */
export interface CarControls {
  /** -1 (reversa) .. 1 (acelerar) */
  throttle: number;
  /** -1 izquierda .. 1 derecha (suelo) */
  steer: number;
  /** -1 morro abajo .. 1 morro arriba */
  pitch: number;
  /** -1 izquierda .. 1 derecha (aire) */
  yaw: number;
  /** -1 izquierda .. 1 derecha */
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
  dodgeDeadzone: number;
}

export function emptyControls(): CarControls {
  return {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
    dodgeDeadzone: 0.5,
  };
}

export type GameMode = '1v1' | '2v2' | '3v3' | 'freeplay';
export type BotDifficulty = 'novato' | 'pro' | 'allstar';
