/**
 * Entrada unificada: teclado + ratón con Pointer Lock API.
 * - isDown(code): tecla mantenida
 * - wasPressed(code): flanco de bajada en este frame
 * - consumeMouse(): delta del ratón acumulado desde la última llamada
 */
export class Input {
  constructor(element) {
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false };
    this.locked = false;
    this.onLockChange = null;

    const blocked = ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

    window.addEventListener('keydown', (e) => {
      if (blocked.includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      }
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) {
        this.keys.clear();
        this.mouse.left = this.mouse.right = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    const p = this.element.requestPointerLock();
    // En algunos navegadores devuelve una promesa que puede rechazarse
    if (p && p.catch) p.catch(() => {});
  }

  isDown(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasReleased(code) {
    return this.released.has(code);
  }

  consumeMouse() {
    const d = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = this.mouse.dy = 0;
    return d;
  }

  /** Se llama al final de cada frame. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.leftPressed = false;
  }
}
