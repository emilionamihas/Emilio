import { CAR, type WheelDef } from './PhysicsConstants';

export type CarId = 'vector' | 'talon' | 'bastion';
export type CarStyle = 'sport' | 'boxy' | 'van';

/**
 * Coches del garaje. Los tres comparten aceleración, salto y control aéreo
 * (como en el juego de referencia); lo que cambia es el hitbox, las ruedas y
 * la carrocería. Dimensiones en metros (1 uu = 1 cm).
 */
export interface CarPreset {
  id: CarId;
  name: string;
  tagline: string;
  hitboxClass: string;
  style: CarStyle;
  /** Semiejes del hitbox: adelante, arriba, lado */
  hitboxHalf: readonly [number, number, number];
  hitboxOffset: readonly [number, number, number];
  wheels: readonly WheelDef[];
  /** Requiere el código secreto */
  secret: boolean;
}

const STANDARD_WHEELS: readonly WheelDef[] = CAR.WHEELS;

const TALL_WHEELS: readonly WheelDef[] = [
  { x: 0.5125, z: 0.259, radius: 0.15, front: true },
  { x: 0.5125, z: -0.259, radius: 0.15, front: true },
  { x: -0.3375, z: 0.295, radius: 0.15, front: false },
  { x: -0.3375, z: -0.295, radius: 0.15, front: false },
];

export const CAR_PRESETS: readonly CarPreset[] = [
  {
    id: 'vector',
    name: 'Vector',
    tagline: 'Deportivo equilibrado. El estándar competitivo.',
    hitboxClass: 'Hitbox estándar',
    style: 'sport',
    hitboxHalf: [0.59, 0.1808, 0.421],
    hitboxOffset: [0.1388, 0.2075, 0],
    wheels: STANDARD_WHEELS,
    secret: false,
  },
  {
    id: 'talon',
    name: 'Talon',
    tagline: 'Carrocería cuadrada sobre el hitbox estándar: lo que ves es lo que golpeas.',
    hitboxClass: 'Hitbox estándar',
    style: 'boxy',
    hitboxHalf: [0.59, 0.1808, 0.421],
    hitboxOffset: [0.1388, 0.2075, 0],
    wheels: STANDARD_WHEELS,
    secret: true,
  },
  {
    id: 'bastion',
    name: 'Bastion',
    tagline: 'Furgón alto y estrecho. Ideal para bloquear y para dribles de techo.',
    hitboxClass: 'Hitbox alto',
    style: 'van',
    hitboxHalf: [0.6036, 0.2083, 0.3836],
    hitboxOffset: [0.1138, 0.215, 0],
    wheels: TALL_WHEELS,
    secret: true,
  },
];

export const SECRET_CODE = 'nitrosecret';

export function getPreset(id: CarId): CarPreset {
  return CAR_PRESETS.find((p) => p.id === id) ?? CAR_PRESETS[0];
}

/** Inercia de una caja sólida con las dimensiones del hitbox (roll, yaw, pitch). */
export function presetInertia(p: CarPreset): [number, number, number] {
  const L = p.hitboxHalf[0] * 2;
  const H = p.hitboxHalf[1] * 2;
  const W = p.hitboxHalf[2] * 2;
  const k = CAR.MASS / 12;
  return [k * (H * H + W * W), k * (L * L + W * W), k * (L * L + H * H)];
}

export const ACCENT_COLORS: ReadonlyArray<{ name: string; hex: number }> = [
  { name: 'Platino', hex: 0xd9dee8 },
  { name: 'Carbono', hex: 0x22262e },
  { name: 'Lima', hex: 0x9be564 },
  { name: 'Magenta', hex: 0xe0418f },
  { name: 'Oro', hex: 0xf0b429 },
  { name: 'Turquesa', hex: 0x2ec4b6 },
  { name: 'Violeta', hex: 0x8e6cf0 },
  { name: 'Rojo', hex: 0xe5383b },
];
