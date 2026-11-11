import { GamepadHandler } from '../controls/GamepadHandler';
import { KeyboardHandler } from '../controls/KeyboardHandler';
import { defaultProfile, type ActionId, type ControlProfile } from '../controls/ControlMapper';
import { StorageManager, STORAGE_KEYS } from './StorageManager';
import { clamp } from '../utils/math';
import type { CarControls } from './types';

export interface FrameInput {
  car: CarControls;
  lookX: number;
  lookY: number;
  ballCamHeld: boolean;
  ballCamPressed: boolean;
  scoreboardHeld: boolean;
  pausePressed: boolean;
  resetPressed: boolean;
  launchPressed: boolean;
  lastDevice: 'keyboard' | 'gamepad';
}

/**
 * Input Manager unificado: combina teclado, ratón y mando a través del perfil
 * de bindings y produce los controles analógicos del coche en cada tick.
 */
export class InputManager {
  readonly keyboard: KeyboardHandler;
  readonly gamepad: GamepadHandler;
  profile: ControlProfile;
  private prev = new Map<ActionId, boolean>();
  private lastDevice: 'keyboard' | 'gamepad' = 'keyboard';

  constructor(gameSurface: HTMLElement) {
    this.keyboard = new KeyboardHandler(gameSurface);
    this.gamepad = new GamepadHandler();
    this.profile = StorageManager.load(STORAGE_KEYS.controls, defaultProfile());
  }

  saveProfile(): void {
    StorageManager.save(STORAGE_KEYS.controls, this.profile);
  }

  resetProfile(): void {
    this.profile = defaultProfile();
    this.saveProfile();
  }

  private keyValue(action: ActionId): number {
    for (const k of this.profile.bindings[action].keys) {
      if (this.keyboard.isDown(k)) return 1;
    }
    return 0;
  }

  private padValue(action: ActionId): number {
    let v = 0;
    const p = this.profile;
    for (const b of p.bindings[action].pad) {
      v = Math.max(v, this.gamepad.value(b, p.stickDeadzone, p.triggerDeadzone, p.deadzoneShape));
    }
    return v;
  }

  /** Valor analógico 0..1 de una acción (máximo entre dispositivos). */
  value(action: ActionId): number {
    const k = this.keyValue(action);
    const g = this.padValue(action);
    if (g > 0.05) this.lastDevice = 'gamepad';
    else if (k > 0) this.lastDevice = 'keyboard';
    return Math.max(k, g);
  }

  private pressed(action: ActionId): boolean {
    const now = this.value(action) > 0.5;
    const before = this.prev.get(action) ?? false;
    this.prev.set(action, now);
    return now && !before;
  }

  sample(): FrameInput {
    this.gamepad.poll();
    const p = this.profile;
    const steerRaw = this.value('steerRight') - this.value('steerLeft');
    const pitchRaw = (this.value('pitchUp') - this.value('pitchDown')) * (p.invertPitch ? -1 : 1);
    const steer = clamp(steerRaw * p.steeringSensitivity, -1, 1);
    const air = p.aerialSensitivity;
    const pitch = clamp(pitchRaw * air, -1, 1);
    const freeRoll = this.value('airRollFree') > 0.5;
    let roll = this.value('airRollRight') - this.value('airRollLeft');
    if (freeRoll) roll += steerRaw * air;
    const ballCamHeld = this.value('ballCam') > 0.5;

    const out: FrameInput = {
      car: {
        throttle: clamp(this.value('accelerate') - this.value('brake'), -1, 1),
        steer,
        pitch,
        yaw: freeRoll ? 0 : clamp(steerRaw * air, -1, 1),
        roll: clamp(roll, -1, 1),
        jump: this.value('jump') > 0.5,
        boost: this.value('boost') > 0.5,
        handbrake: this.value('powerslide') > 0.5,
        dodgeDeadzone: this.profile.dodgeDeadzone,
      },
      lookX: clamp((this.value('lookRight') - this.value('lookLeft')) * p.lookSensitivity, -1, 1),
      lookY: clamp((this.value('lookDown') - this.value('lookUp')) * p.lookSensitivity, -1, 1),
      ballCamHeld,
      ballCamPressed: this.pressed('ballCam'),
      scoreboardHeld: this.value('scoreboard') > 0.5,
      pausePressed: this.pressed('pause'),
      resetPressed: this.pressed('resetShot'),
      launchPressed: this.pressed('launchBall'),
      lastDevice: this.lastDevice,
    };
    this.keyboard.endSample();
    return out;
  }

  /** Consume flancos sin aplicar controles (en menús), para evitar saltos al volver. */
  syncEdges(): void {
    this.gamepad.poll();
    for (const id of Object.keys(this.profile.bindings) as ActionId[]) {
      this.prev.set(id, this.value(id) > 0.5);
    }
    this.keyboard.endSample();
  }

  menuPausePressed(): boolean {
    this.gamepad.poll();
    return this.pressed('pause');
  }
}
