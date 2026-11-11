import { el } from './dom';
import { formatClock } from '../utils/math';

const BOOST_ARC = 0.75;

/** HUD en partida: marcador, reloj, boost, velocidad, flip, mensajes e indicador de balón. */
export class HUD {
  readonly root: HTMLDivElement;
  private readonly blueScore: HTMLDivElement;
  private readonly orangeScore: HTMLDivElement;
  private readonly clock: HTMLDivElement;
  private readonly center: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly boostFill: SVGCircleElement;
  private readonly boostValue: HTMLDivElement;
  private readonly kmh: HTMLSpanElement;
  private readonly ss: HTMLDivElement;
  private readonly flip: HTMLDivElement;
  private readonly arrow: HTMLDivElement;
  private readonly feedBox: HTMLDivElement;
  private readonly toastBox: HTMLDivElement;
  private readonly mech: HTMLDivElement;
  private readonly fps: HTMLDivElement;
  private readonly circumference: number;
  private centerTimer = 0;
  private subTimer = 0;
  private mechTimer = 0;
  private readonly scorebug: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.scorebug = el('div', 'scorebug', this.root);
    this.blueScore = el('div', 'team blue', this.scorebug, '0');
    this.clock = el('div', 'clock', this.scorebug, '5:00');
    this.orangeScore = el('div', 'team orange', this.scorebug, '0');
    this.center = el('div', 'center-msg', this.root);
    this.sub = el('div', 'sub-msg', this.root);
    this.mech = el('div', 'mech-toast', this.root);

    const meter = el('div', 'boost-meter', this.root);
    const r = 62;
    this.circumference = 2 * Math.PI * r;
    meter.innerHTML = `<svg viewBox="0 0 150 150">
      <circle class="track" cx="75" cy="75" r="${r}" stroke-dasharray="${this.circumference * BOOST_ARC} ${this.circumference}"></circle>
      <circle class="fill" cx="75" cy="75" r="${r}" stroke-dasharray="0 ${this.circumference}"></circle>
    </svg>`;
    this.boostFill = meter.querySelector('.fill') as SVGCircleElement;
    this.boostValue = el('div', 'value', meter, '33');
    el('div', 'label', meter, 'BOOST');

    const speedo = el('div', 'speedo', this.root);
    const line = el('div', '', speedo);
    this.kmh = el('span', 'kmh', line, '0');
    el('span', 'unit', line, 'km/h');
    this.ss = el('div', 'ss', speedo, 'SUPERSÓNICO');

    this.flip = el('div', 'flip-indicator', this.root, 'FLIP');
    this.arrow = el('div', 'ball-arrow', this.root);
    el('div', 'tip', this.arrow);
    el('div', 'dot', this.arrow);
    this.feedBox = el('div', 'feed', this.root);
    this.toastBox = el('div', 'toasts', this.root);
    this.fps = el('div', 'fps', this.root);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  setMatchUiVisible(v: boolean): void {
    this.scorebug.style.display = v ? '' : 'none';
  }

  setScores(blue: number, orange: number): void {
    this.blueScore.textContent = String(blue);
    this.orangeScore.textContent = String(orange);
  }

  setClock(seconds: number, overtime: boolean): void {
    this.clock.textContent = overtime ? `+${formatClock(seconds)}` : formatClock(seconds);
    this.clock.classList.toggle('overtime', overtime);
  }

  setClockText(text: string): void {
    this.clock.textContent = text;
    this.clock.classList.remove('overtime');
  }

  showCenter(text: string, duration: number, variant: '' | 'blue' | 'orange' = ''): void {
    this.center.textContent = text;
    this.center.className = `center-msg show ${variant}`;
    this.centerTimer = duration;
  }

  showSub(text: string, duration: number): void {
    this.sub.textContent = text;
    this.sub.classList.add('show');
    this.subTimer = duration;
  }

  showMechanic(text: string): void {
    this.mech.textContent = text;
    this.mech.classList.add('show');
    this.mechTimer = 1.1;
  }

  setBoost(value: number): void {
    const v = Math.round(value);
    this.boostValue.textContent = String(v);
    const len = (value / 100) * this.circumference * BOOST_ARC;
    this.boostFill.setAttribute('stroke-dasharray', `${len} ${this.circumference}`);
    this.boostFill.style.stroke = value >= 100 ? '#ffd76a' : value < 12 ? '#ff6b5a' : '';
  }

  setSpeed(metersPerSecond: number, supersonic: boolean): void {
    this.kmh.textContent = String(Math.round(metersPerSecond * 3.6));
    this.ss.classList.toggle('on', supersonic);
  }

  setFlip(available: boolean): void {
    this.flip.classList.toggle('on', available);
  }

  setBallArrow(pos: { x: number; y: number; angle: number } | null): void {
    if (!pos) {
      this.arrow.style.display = 'none';
      return;
    }
    this.arrow.style.display = 'block';
    this.arrow.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${pos.angle}rad)`;
  }

  setFps(fps: number | null): void {
    this.fps.textContent = fps === null ? '' : `${fps} FPS`;
  }

  feed(text: string, team: 0 | 1 | null = null): void {
    const row = el('div', team === 0 ? 'b' : team === 1 ? 'o' : '', this.feedBox, text);
    setTimeout(() => row.remove(), 5000);
    while (this.feedBox.children.length > 5) this.feedBox.firstElementChild?.remove();
  }

  toast(text: string, ms = 2600): void {
    const t = el('div', '', this.toastBox, text);
    setTimeout(() => t.remove(), ms);
  }

  update(dt: number): void {
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.center.classList.remove('show');
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.sub.classList.remove('show');
    }
    if (this.mechTimer > 0) {
      this.mechTimer -= dt;
      if (this.mechTimer <= 0) this.mech.classList.remove('show');
    }
  }

  clearMessages(): void {
    this.centerTimer = 0;
    this.subTimer = 0;
    this.center.classList.remove('show');
    this.sub.classList.remove('show');
  }
}
