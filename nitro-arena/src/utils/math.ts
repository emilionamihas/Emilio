import * as THREE from 'three';
import type { CurvePoints } from '../config/PhysicsConstants';

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);

/** Interpolación lineal por tramos sobre una curva (x, y) ordenada por x. */
export function evalCurve(curve: CurvePoints, x: number): number {
  const n = curve.length;
  if (x <= curve[0][0]) return curve[0][1];
  if (x >= curve[n - 1][0]) return curve[n - 1][1];
  for (let i = 1; i < n; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return curve[n - 1][1];
}

/** Suavizado exponencial independiente del framerate. */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));

export function dampVec3(out: THREE.Vector3, target: THREE.Vector3, rate: number, dt: number): THREE.Vector3 {
  return out.lerp(target, 1 - Math.exp(-rate * dt));
}

/** Mueve un valor hacia el objetivo con una velocidad máxima. */
export function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  return Math.max(value - maxDelta, target);
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Proyecta un vector sobre el plano definido por la normal (normalizada). */
export function projectOnPlane(out: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3): THREE.Vector3 {
  const d = v.dot(n);
  return out.copy(v).addScaledVector(n, -d);
}
