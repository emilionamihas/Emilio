import type { ControllerStyle, PadBinding } from './ControlMapper';

/**
 * Lectura de mandos con la HTML5 Gamepad API (Plug & Play). Detecta DualShock 4,
 * DualSense y mandos Xbox; usa el último mando que haya recibido input.
 */
export class GamepadHandler {
  private activeIndex: number | null = null;
  private pad: Gamepad | null = null;
  style: ControllerStyle = 'generic';
  name = '';
  onConnectionChange: ((connected: boolean, name: string, style: ControllerStyle) => void) | null = null;

  private captureBaseline: { buttons: number[]; axes: number[] } | null = null;

  constructor() {
    window.addEventListener('gamepadconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      if (this.activeIndex === null) this.setActive(gp);
      this.onConnectionChange?.(true, gp.id, GamepadHandler.detectStyle(gp.id));
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      const gp = (e as GamepadEvent).gamepad;
      if (gp.index === this.activeIndex) {
        this.activeIndex = null;
        this.pad = null;
      }
      this.onConnectionChange?.(false, gp.id, GamepadHandler.detectStyle(gp.id));
    });
  }

  static detectStyle(id: string): ControllerStyle {
    const s = id.toLowerCase();
    if (s.includes('054c') || s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation') || s.includes('wireless controller')) {
      return 'playstation';
    }
    if (s.includes('045e') || s.includes('xbox') || s.includes('xinput')) return 'xbox';
    return 'generic';
  }

  private setActive(gp: Gamepad): void {
    this.activeIndex = gp.index;
    this.pad = gp;
    this.name = gp.id;
    this.style = GamepadHandler.detectStyle(gp.id);
  }

  get connected(): boolean {
    return this.pad !== null;
  }

  /** Debe llamarse una vez por tick antes de leer valores. */
  poll(): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let active: Gamepad | null = null;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      if (gp.index === this.activeIndex) active = gp;
      // Cambia al mando que reciba input si hay varios conectados
      if (gp.index !== this.activeIndex && gp.buttons.some((b) => b.pressed)) {
        this.setActive(gp);
        active = gp;
        break;
      }
    }
    if (!active) {
      const first = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
      if (first) {
        this.setActive(first);
        active = first;
      }
    }
    this.pad = active;
  }

  button(index: number): number {
    const b = this.pad?.buttons[index];
    if (!b) return 0;
    return b.value > 0 ? b.value : b.pressed ? 1 : 0;
  }

  axis(index: number): number {
    return this.pad?.axes[index] ?? 0;
  }

  /** Valor 0..1 de un binding de mando con zonas muertas y sensibilidad. */
  value(b: PadBinding, stickDeadzone: number, triggerDeadzone: number, sensitivity: number): number {
    if (!this.pad) return 0;
    if (b.type === 'button') {
      const v = this.button(b.index);
      const isTrigger = b.index === 6 || b.index === 7;
      const dz = isTrigger ? triggerDeadzone : 0.35;
      if (v <= dz) return 0;
      return isTrigger ? Math.min(1, (v - dz) / (1 - dz)) : 1;
    }
    const raw = this.axis(b.index) * b.dir;
    if (raw <= stickDeadzone) return 0;
    const scaled = ((raw - stickDeadzone) / (1 - stickDeadzone)) * sensitivity;
    return Math.min(1, scaled);
  }

  private rumbleUnsupported = false;

  rumble(strong: number, weak: number, durationMs: number): void {
    if (this.rumbleUnsupported) return;
    const act = this.pad?.vibrationActuator;
    if (!act || typeof act.playEffect !== 'function') return;
    act
      .playEffect('dual-rumble', { duration: durationMs, strongMagnitude: strong, weakMagnitude: weak })
      .catch(() => {
        // El navegador o el mando no admiten vibración: se deja de intentar.
        this.rumbleUnsupported = true;
      });
  }

  beginCapture(): void {
    this.poll();
    this.captureBaseline = {
      buttons: this.pad ? this.pad.buttons.map((b) => b.value) : [],
      axes: this.pad ? Array.from(this.pad.axes) : [],
    };
  }

  endCapture(): void {
    this.captureBaseline = null;
  }

  /** Devuelve el primer botón o eje que se active respecto al estado inicial. */
  pollCapture(): PadBinding | null {
    if (!this.captureBaseline) return null;
    this.poll();
    if (!this.pad) return null;
    const base = this.captureBaseline;
    for (let i = 0; i < this.pad.buttons.length; i++) {
      const v = this.pad.buttons[i].value;
      if (v > 0.6 && (base.buttons[i] ?? 0) < 0.3) return { type: 'button', index: i };
    }
    for (let i = 0; i < this.pad.axes.length; i++) {
      const v = this.pad.axes[i];
      const b0 = base.axes[i] ?? 0;
      if (Math.abs(v) > 0.65 && Math.abs(v - b0) > 0.5) return { type: 'axis', index: i, dir: v > 0 ? 1 : -1 };
    }
    for (let i = 0; i < this.pad.buttons.length; i++) {
      if (this.pad.buttons[i].value < 0.2) base.buttons[i] = 0;
    }
    return null;
  }
}
