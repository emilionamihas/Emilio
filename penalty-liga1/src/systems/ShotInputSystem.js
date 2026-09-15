import { GOAL_RECT, PENALTY_SPOT } from '../config/gameConfig.js';
import { clamp, gaussianJitter } from '../utils/MathUtils.js';

const MIN_DRAG_PX = 24;
const SPEED_FOR_MAX_POWER = 1.6; // px/ms aprox para llegar a potencia máxima
const HORIZONTAL_RANGE_PX = 220; // cuánto hay que mover el dedo/ratón en X para cubrir todo el ancho
const VERTICAL_RANGE_PX = 260; // cuánto hay que arrastrar en Y para cubrir todo el alto + overshoot
const OVERSHOOT_X = 40; // permite tiros "a la tribuna" a los costados
const OVERSHOOT_Y_TOP = 60; // permite tiros por encima del travesaño
const MAX_JITTER = 0.42; // margen de error máximo (a potencia 100%)
const MAX_CURVE_PX = 90;

// Captura el gesto de swipe/drag y produce los datos de un disparo:
// { power01, curveSigned01, targetWorld, accuracyPenalty01, missOverBar, missWide }
export default class ShotInputSystem {
  constructor(scene, { onShoot, accuracyStat = 75, powerStat = 75 } = {}) {
    this.scene = scene;
    this.onShoot = onShoot;
    this.accuracyStat = accuracyStat; // 0-100, mejora precisión del equipo/jugador
    this.powerStat = powerStat; // 0-100, mejora potencia base
    this.points = [];
    this.dragging = false;
    this.enabled = false;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.scene.input.on('pointerdown', this._onDown);
    this.scene.input.on('pointermove', this._onMove);
    this.scene.input.on('pointerup', this._onUp);
  }

  disable() {
    this.enabled = false;
    this.scene.input.off('pointerdown', this._onDown);
    this.scene.input.off('pointermove', this._onMove);
    this.scene.input.off('pointerup', this._onUp);
    this.points = [];
    this.dragging = false;
  }

  _onDown(pointer) {
    this.dragging = true;
    this.points = [{ x: pointer.x, y: pointer.y, t: pointer.downTime }];
  }

  _onMove(pointer) {
    if (!this.dragging) return;
    this.points.push({ x: pointer.x, y: pointer.y, t: this.scene.time.now });
  }

  _onUp(pointer) {
    if (!this.dragging) return;
    this.dragging = false;
    this.points.push({ x: pointer.x, y: pointer.y, t: this.scene.time.now });
    const shot = this._computeShot();
    if (shot) this.onShoot?.(shot);
  }

  _computeShot() {
    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    const dx = last.x - first.x;
    const dy = first.y - last.y; // positivo = arrastre hacia arriba (correcto)
    const dist = Math.hypot(dx, dy);
    const duration = Math.max(1, last.t - first.t);

    if (dist < MIN_DRAG_PX || dy <= 0) return null; // gesto inválido, no dispara

    const speed = dist / duration; // px/ms
    let power01 = clamp(speed / SPEED_FOR_MAX_POWER, 0.15, 1);
    // El poder del equipo sube ligeramente el piso de potencia (tiros más secos)
    power01 = clamp(power01 * (0.85 + this.powerStat / 500), 0.15, 1);

    // Curvatura: máxima desviación perpendicular del trazo respecto a la línea recta
    const curveSigned01 = this._computeCurvature(first, last);

    let horizontal01 = 0.5 + dx / HORIZONTAL_RANGE_PX;
    let vertical01 = dy / VERTICAL_RANGE_PX;

    // Precisión: cuanto más fuerte el tiro y menor la precisión del jugador, más error
    const skillFactor = clamp(this.accuracyStat / 100, 0.3, 1);
    const spread = MAX_JITTER * power01 * (1.35 - skillFactor);
    horizontal01 = clamp(horizontal01 + gaussianJitter(spread), -0.35, 1.35);
    vertical01 = clamp(vertical01 + gaussianJitter(spread * 0.7), -0.1, 1.35);

    const targetWorld = this._toWorld(horizontal01, vertical01);
    const missWide = horizontal01 < 0 || horizontal01 > 1;
    const missOverBar = vertical01 > 1;

    return {
      power01,
      curveSigned01,
      horizontal01,
      vertical01,
      targetWorld,
      missWide,
      missOverBar,
      origin: { x: PENALTY_SPOT.x, y: PENALTY_SPOT.y }
    };
  }

  _computeCurvature(first, last) {
    if (this.points.length < 3) return 0;
    const lineLen = Math.hypot(last.x - first.x, last.y - first.y) || 1;
    const nx = -(last.y - first.y) / lineLen;
    const ny = (last.x - first.x) / lineLen;
    let maxDev = 0;
    for (const p of this.points) {
      const vx = p.x - first.x;
      const vy = p.y - first.y;
      const dev = vx * nx + vy * ny;
      if (Math.abs(dev) > Math.abs(maxDev)) maxDev = dev;
    }
    return clamp(maxDev / MAX_CURVE_PX, -1, 1);
  }

  _toWorld(horizontal01, vertical01) {
    const xMin = GOAL_RECT.x - OVERSHOOT_X;
    const xMax = GOAL_RECT.x + GOAL_RECT.width + OVERSHOOT_X;
    const yMax = GOAL_RECT.y + GOAL_RECT.height; // vertical01 = 0
    const yMin = GOAL_RECT.y - OVERSHOOT_Y_TOP; // vertical01 = 1 (+ overshoot)
    return {
      x: clamp(xMin + (xMax - xMin) * horizontal01, xMin, xMax),
      y: clamp(yMax - (yMax - yMin) * vertical01, yMin, yMax + 20)
    };
  }
}
