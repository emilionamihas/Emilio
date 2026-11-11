/**
 * Definición de acciones, perfil de controles por defecto (teclado/ratón y mando
 * con mapeo "standard" de la Gamepad API) y etiquetas legibles para la UI.
 */

export type ActionId =
  | 'accelerate'
  | 'brake'
  | 'steerLeft'
  | 'steerRight'
  | 'pitchUp'
  | 'pitchDown'
  | 'jump'
  | 'boost'
  | 'airRollLeft'
  | 'airRollRight'
  | 'airRollFree'
  | 'powerslide'
  | 'ballCam'
  | 'lookLeft'
  | 'lookRight'
  | 'lookUp'
  | 'lookDown'
  | 'scoreboard'
  | 'resetShot'
  | 'pause';

export type PadBinding =
  | { type: 'button'; index: number }
  | { type: 'axis'; index: number; dir: 1 | -1 };

export interface ActionBinding {
  keys: string[];
  pad: PadBinding[];
}

export type ControllerStyle = 'playstation' | 'xbox' | 'generic';

export interface ControlProfile {
  bindings: Record<ActionId, ActionBinding>;
  stickDeadzone: number;
  triggerDeadzone: number;
  dodgeDeadzone: number;
  sensitivity: number;
  ballCamToggle: boolean;
  vibration: boolean;
}

export interface ActionMeta {
  id: ActionId;
  label: string;
  group: 'Conducción' | 'Aire' | 'Cámara' | 'Interfaz';
}

export const ACTIONS: readonly ActionMeta[] = [
  { id: 'accelerate', label: 'Acelerar', group: 'Conducción' },
  { id: 'brake', label: 'Freno / Reversa', group: 'Conducción' },
  { id: 'steerLeft', label: 'Girar izquierda', group: 'Conducción' },
  { id: 'steerRight', label: 'Girar derecha', group: 'Conducción' },
  { id: 'jump', label: 'Salto', group: 'Conducción' },
  { id: 'boost', label: 'Boost', group: 'Conducción' },
  { id: 'powerslide', label: 'Powerslide (freno de mano)', group: 'Conducción' },
  { id: 'pitchUp', label: 'Morro arriba (pitch)', group: 'Aire' },
  { id: 'pitchDown', label: 'Morro abajo (pitch)', group: 'Aire' },
  { id: 'airRollLeft', label: 'Air Roll izquierda', group: 'Aire' },
  { id: 'airRollRight', label: 'Air Roll derecha', group: 'Aire' },
  { id: 'airRollFree', label: 'Air Roll libre', group: 'Aire' },
  { id: 'ballCam', label: 'Cambiar cámara (Ball Cam)', group: 'Cámara' },
  { id: 'lookLeft', label: 'Mirar izquierda', group: 'Cámara' },
  { id: 'lookRight', label: 'Mirar derecha', group: 'Cámara' },
  { id: 'lookUp', label: 'Mirar arriba', group: 'Cámara' },
  { id: 'lookDown', label: 'Mirar abajo', group: 'Cámara' },
  { id: 'scoreboard', label: 'Marcador', group: 'Interfaz' },
  { id: 'resetShot', label: 'Reiniciar balón (Juego libre)', group: 'Interfaz' },
  { id: 'pause', label: 'Pausa', group: 'Interfaz' },
];

const btn = (index: number): PadBinding => ({ type: 'button', index });
const axis = (index: number, dir: 1 | -1): PadBinding => ({ type: 'axis', index, dir });

export function defaultProfile(): ControlProfile {
  return {
    bindings: {
      accelerate: { keys: ['KeyW', 'ArrowUp'], pad: [btn(7)] },
      brake: { keys: ['KeyS', 'ArrowDown'], pad: [btn(6)] },
      steerLeft: { keys: ['KeyA', 'ArrowLeft'], pad: [axis(0, -1)] },
      steerRight: { keys: ['KeyD', 'ArrowRight'], pad: [axis(0, 1)] },
      pitchUp: { keys: ['KeyS', 'ArrowDown'], pad: [axis(1, 1)] },
      pitchDown: { keys: ['KeyW', 'ArrowUp'], pad: [axis(1, -1)] },
      jump: { keys: ['Space', 'Mouse2'], pad: [btn(0)] },
      boost: { keys: ['Mouse0', 'KeyF'], pad: [btn(1)] },
      airRollLeft: { keys: ['KeyQ'], pad: [btn(4)] },
      airRollRight: { keys: ['KeyE'], pad: [btn(5)] },
      airRollFree: { keys: ['ShiftLeft'], pad: [btn(2)] },
      powerslide: { keys: ['ShiftLeft'], pad: [btn(2)] },
      ballCam: { keys: ['KeyC'], pad: [btn(3)] },
      lookLeft: { keys: ['KeyJ'], pad: [axis(2, -1)] },
      lookRight: { keys: ['KeyL'], pad: [axis(2, 1)] },
      lookUp: { keys: ['KeyI'], pad: [axis(3, -1)] },
      lookDown: { keys: ['KeyK'], pad: [axis(3, 1)] },
      scoreboard: { keys: ['Tab'], pad: [btn(8)] },
      resetShot: { keys: ['KeyR'], pad: [btn(11)] },
      pause: { keys: ['Escape'], pad: [btn(9)] },
    },
    stickDeadzone: 0.12,
    triggerDeadzone: 0.05,
    dodgeDeadzone: 0.5,
    sensitivity: 1.3,
    ballCamToggle: true,
    vibration: true,
  };
}

const KEY_NAMES: Record<string, string> = {
  Space: 'Espacio',
  ShiftLeft: 'Shift Izq',
  ShiftRight: 'Shift Der',
  ControlLeft: 'Ctrl Izq',
  ControlRight: 'Ctrl Der',
  AltLeft: 'Alt Izq',
  AltRight: 'Alt Der',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Tab: 'Tab',
  Enter: 'Intro',
  Backspace: 'Retroceso',
  CapsLock: 'Bloq Mayús',
  Mouse0: 'Clic Izq',
  Mouse1: 'Clic Central',
  Mouse2: 'Clic Der',
  Mouse3: 'Ratón 4',
  Mouse4: 'Ratón 5',
};

export function keyLabel(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

const PS_BUTTONS = [
  'Cruz ✕', 'Círculo ○', 'Cuadrado □', 'Triángulo △', 'L1', 'R1', 'L2', 'R2',
  'Share/Create', 'Options', 'L3', 'R3', 'D-Pad ↑', 'D-Pad ↓', 'D-Pad ←', 'D-Pad →', 'PS', 'Touchpad',
];
const XBOX_BUTTONS = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'View', 'Menu', 'LS', 'RS', 'D-Pad ↑', 'D-Pad ↓', 'D-Pad ←', 'D-Pad →', 'Xbox', 'Share',
];
const AXIS_NAMES = ['Stick Izq X', 'Stick Izq Y', 'Stick Der X', 'Stick Der Y'];

export function padLabel(b: PadBinding, style: ControllerStyle): string {
  if (b.type === 'button') {
    const names = style === 'playstation' ? PS_BUTTONS : XBOX_BUTTONS;
    return names[b.index] ?? `Botón ${b.index}`;
  }
  const base = AXIS_NAMES[b.index] ?? `Eje ${b.index}`;
  if (b.index === 0 || b.index === 2) return `${base} ${b.dir > 0 ? '→' : '←'}`;
  if (b.index === 1 || b.index === 3) return `${base} ${b.dir > 0 ? '↓' : '↑'}`;
  return `${base} ${b.dir > 0 ? '+' : '−'}`;
}

export function samePad(a: PadBinding, b: PadBinding): boolean {
  if (a.type !== b.type || a.index !== b.index) return false;
  return a.type === 'button' || (b.type === 'axis' && a.dir === b.dir);
}
