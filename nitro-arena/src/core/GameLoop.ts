/**
 * Bucle de paso fijo (120 Hz, igual que el servidor de RL) con render desacoplado.
 * El render recibe alpha (0..1) para interpolar entre los dos últimos estados
 * físicos y mantener el movimiento suave a 60, 144 o 240 Hz.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafId = 0;
  private running = false;
  private readonly maxSubSteps = 8;

  fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(
    private readonly fixedDt: number,
    private readonly fixedUpdate: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameDt > 0.25) frameDt = 0.25;

    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
      this.fixedUpdate(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps++;
    }
    if (steps >= this.maxSubSteps) this.accumulator = 0;

    this.render(this.accumulator / this.fixedDt, frameDt);

    this.fpsFrames++;
    this.fpsTime += frameDt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    this.rafId = requestAnimationFrame(this.frame);
  };
}
