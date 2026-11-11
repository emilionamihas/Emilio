/**
 * Constantes físicas calibradas a partir de los valores medidos por la comunidad
 * (RLBot wiki / RocketSim) y convertidas de Unreal Units a metros (1 uu = 1 cm).
 *
 * Ejes del mundo: X = ancho del campo, Y = arriba, Z = largo del campo.
 * El equipo azul defiende Z negativo y el naranja Z positivo.
 *
 * Ejes locales del coche: X = adelante, Y = arriba, Z = derecha.
 */

export type CurvePoints = ReadonlyArray<readonly [number, number]>;

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;
export const GRAVITY = -6.5;

export const ARENA = {
  HALF_WIDTH: 40.96,
  HALF_LENGTH: 51.2,
  HEIGHT: 20.44,
  /** Plano diagonal de las esquinas: |x| + |z| = CORNER_DIAGONAL */
  CORNER_DIAGONAL: 80.64,
  /** Radio de las rampas curvas suelo-pared y pared-techo */
  FILLET_RADIUS: 3.0,
  /** Redondeo horizontal extra en las esquinas del octógono */
  CORNER_ROUND: 2.0,
  GOAL_HALF_WIDTH: 8.93,
  GOAL_HEIGHT: 6.4277,
  GOAL_DEPTH: 8.8,
  POST_RADIUS: 0.22,
} as const;

/**
 * Coeficientes por collider combinados con la regla Multiply de Rapier para obtener:
 *  coche-balón: fricción 2.0, restitución 0.0
 *  coche-arena: fricción 0.30, restitución 0.0
 *  balón-arena: fricción 0.35, restitución 0.6
 */
export const MATERIALS = {
  CAR_FRICTION: 1.309,
  BALL_FRICTION: 1.528,
  ARENA_FRICTION: 0.229,
  CAR_RESTITUTION: 0.0,
  BALL_RESTITUTION: 1.0,
  ARENA_RESTITUTION: 0.6,
} as const;

export const BALL = {
  RADIUS: 0.9125,
  MASS: 30,
  MAX_SPEED: 60,
  MAX_ANG_SPEED: 6,
  DRAG: 0.03,
} as const;

export interface WheelDef {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly front: boolean;
}

export const CAR = {
  MASS: 180,
  /** Hitbox Octane: semiejes (adelante, arriba, lado) */
  HITBOX_HALF: [0.59, 0.1808, 0.421] as const,
  HITBOX_OFFSET: [0.1388, 0.2075, 0] as const,
  /** Inercia principal (roll X, yaw Y, pitch Z) */
  INERTIA: [12.5, 31.5, 22.8] as const,

  MAX_SPEED: 23,
  MAX_ANG_SPEED: 5.5,
  SUPERSONIC_START: 22,
  SUPERSONIC_MAINTAIN_MIN: 21,
  SUPERSONIC_MAINTAIN_TIME: 1.0,
  SPAWN_HEIGHT: 0.18,

  WHEELS: [
    { x: 0.5125, z: 0.259, radius: 0.125, front: true },
    { x: 0.5125, z: -0.259, radius: 0.125, front: true },
    { x: -0.3375, z: 0.295, radius: 0.15, front: false },
    { x: -0.3375, z: -0.295, radius: 0.15, front: false },
  ] as readonly WheelDef[],
  /** Longitud total del rayo de rueda (suspensión en reposo + radio) */
  WHEEL_RAY_LENGTH: 0.235,
  SUSPENSION_STIFFNESS: 150,
  SUSPENSION_DAMP_COMPRESS: 20,
  SUSPENSION_DAMP_RELAX: 14,
  BUMP_STOP_START: 0.12,
  BUMP_STOP_STIFFNESS: 2500,

  THROTTLE_CURVE: [
    [0, 16],
    [14, 1.6],
    [14.1, 0],
  ] as CurvePoints,
  BRAKE_ACCEL: 35,
  COAST_ACCEL: 5.25,
  AIR_THROTTLE_ACCEL: 0.6667,

  BOOST_ACCEL_GROUND: 9.9167,
  BOOST_ACCEL_AIR: 10.5833,
  BOOST_PER_SECOND: 33.333,
  BOOST_MIN_TIME: 0.1,
  BOOST_SPAWN: 33.3,

  /** Curvatura de giro (1/m) en función de la velocidad (m/s) */
  STEER_CURVATURE: [
    [0, 0.69],
    [5, 0.398],
    [10, 0.235],
    [15, 0.1375],
    [17.5, 0.11],
    [23, 0.088],
  ] as CurvePoints,
  POWERSLIDE_YAW_SCALE: 1.55,
  YAW_RESPONSE: 14,

  LAT_FRICTION_CURVE: [
    [0, 1],
    [1, 0.2],
  ] as CurvePoints,
  HANDBRAKE_LAT_FACTOR: 0.1,
  HANDBRAKE_RISE: 5,
  HANDBRAKE_FALL: 2,
  NON_STICKY_FRICTION_CURVE: [
    [0, 0.1],
    [0.7075, 0.5],
    [1, 1],
  ] as CurvePoints,
  STICKY_BASE: 0.5,

  JUMP_IMPULSE: 2.9167,
  JUMP_HOLD_ACCEL: 14.5833,
  JUMP_MIN_TIME: 0.025,
  JUMP_MAX_TIME: 0.2,
  JUMP_GROUND_RESET_PAD: 0.1,
  DOUBLE_JUMP_WINDOW: 1.25,

  FLIP_TORQUE_TIME: 0.65,
  FLIP_TORQUE_ROLL: 260,
  FLIP_TORQUE_PITCH: 224,
  FLIP_PITCHLOCK_TIME: 0.8,
  FLIP_INITIAL_VEL: 5.0,
  FLIP_FORWARD_SCALE: 1.0,
  FLIP_SIDE_SCALE: 1.9,
  FLIP_BACKWARD_SCALE: 2.5,
  FLIP_BACKWARD_X_SCALE: 16 / 15,
  FLIP_Z_DAMP_PER_TICK: 0.35,
  FLIP_Z_DAMP_START: 0.15,
  FLIP_Z_DAMP_END: 0.21,
  FLIP_INPUT_THRESHOLD: 0.1,

  /** Aceleraciones angulares de control aéreo (rad/s²): roll, pitch, yaw */
  AIR_TORQUE: [36.08, 12.146, 8.92] as const,
  AIR_DAMPING: [4.47, 2.8, 1.89] as const,

  TURTLE_FLIP_IMPULSE: 3.2,
  TURTLE_FLIP_SPIN: 5.5,
} as const;

export const BUMP = {
  GROUND_CURVE: [
    [0, 0.0],
    [14, 11.0],
    [22, 15.3],
  ] as CurvePoints,
  AIR_CURVE: [
    [0, 0.0],
    [14, 13.9],
    [22, 19.45],
  ] as CurvePoints,
  UP_CURVE: [
    [0, 0.0],
    [14, 2.78],
    [22, 4.17],
  ] as CurvePoints,
  FRONT_DOT: 0.55,
  COOLDOWN: 0.3,
} as const;

export const BALL_HIT = {
  /** Factor del impulso extra coche-balón según la velocidad relativa */
  SCALE_CURVE: [
    [0, 0.65],
    [5, 0.65],
    [23, 0.55],
    [46, 0.3],
  ] as CurvePoints,
  MAX_REL_SPEED: 46,
  VERTICAL_SCALE: 0.35,
  FORWARD_ADJUST: 0.35,
} as const;

export const PINCH = {
  MIN_CLOSING_SPEED: 2.5,
  GAIN: 1.65,
  NORMAL_LIFT: 0.25,
  COOLDOWN: 0.2,
  SURFACE_MARGIN: 0.08,
} as const;

export const BOOST_PAD = {
  BIG_AMOUNT: 100,
  SMALL_AMOUNT: 12,
  BIG_RESPAWN: 10,
  SMALL_RESPAWN: 4,
  BIG_RADIUS: 2.08,
  SMALL_RADIUS: 1.44,
  PICKUP_HEIGHT: 1.68,
} as const;

export const RULES = {
  MATCH_TIME: 300,
  KICKOFF_COUNTDOWN: 3,
  GOAL_CELEBRATION: 3,
  DEMO_RESPAWN: 3,
  GOAL_EXPLOSION_RADIUS: 30,
  GOAL_EXPLOSION_FORCE: 32,
} as const;
