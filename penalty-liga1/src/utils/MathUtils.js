export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Punto sobre una curva de Bézier cuadrática (para la trayectoria del balón con efecto)
export function quadraticBezier(p0, p1, p2, t) {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
  return { x, y };
}

// Distribuye un valor [0,1] en 3 franjas (izquierda/centro/derecha o abajo/medio/arriba)
export function zoneIndex(value01, zones = 3) {
  return clamp(Math.floor(value01 * zones), 0, zones - 1);
}

// Ruido determinista simple para variar el margen de error del tiro
export function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

// Convierte una desviación gaussiana aproximada (suma de uniformes) centrada en 0
export function gaussianJitter(spread) {
  return ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2 * spread;
}
