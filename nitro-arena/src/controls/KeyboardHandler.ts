/**
 * Estado de teclado y botones de ratón, identificados por KeyboardEvent.code
 * ("KeyW", "Space"…) o "Mouse0..4". Incluye modo captura para el remapeo.
 */
export class KeyboardHandler {
  private readonly down = new Set<string>();
  /** Pulsaciones ocurridas desde la última lectura: un toque corto entre dos ticks no se pierde. */
  private readonly latched = new Set<string>();
  private captureCb: ((code: string) => void) | null = null;
  /** Elementos sobre los que los clics cuentan como input de juego. */
  private readonly gameSurface: HTMLElement;

  constructor(gameSurface: HTMLElement) {
    this.gameSurface = gameSurface;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.clear);
    gameSurface.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.down.has(code) || this.latched.has(code);
  }

  /** Se llama tras cada muestreo del InputManager. */
  endSample(): void {
    this.latched.clear();
  }

  /** Captura la siguiente tecla o botón de ratón (para el menú de remapeo). */
  capture(cb: (code: string) => void): void {
    this.captureCb = cb;
  }

  cancelCapture(): void {
    this.captureCb = null;
  }

  get capturing(): boolean {
    return this.captureCb !== null;
  }

  clear = (): void => {
    this.down.clear();
    this.latched.clear();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.captureCb) {
      e.preventDefault();
      const cb = this.captureCb;
      this.captureCb = null;
      cb(e.code);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) this.latched.add(e.code);
    this.down.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    const code = `Mouse${e.button}`;
    if (this.captureCb) {
      e.preventDefault();
      e.stopPropagation();
      const cb = this.captureCb;
      this.captureCb = null;
      cb(code);
      return;
    }
    if (e.target === this.gameSurface) {
      this.down.add(code);
      this.latched.add(code);
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.down.delete(`Mouse${e.button}`);
  };
}
