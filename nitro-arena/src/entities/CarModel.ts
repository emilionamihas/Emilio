import * as THREE from 'three';
import { CAR } from '../config/PhysicsConstants';
import type { CarPreset, CarStyle } from '../config/CarPresets';
import type { Materials } from '../render/Materials';

export interface BuiltCar {
  root: THREE.Group;
  wheelPivots: THREE.Object3D[];
  tires: THREE.Object3D[];
  flame: THREE.Group;
  flameMat: THREE.MeshBasicMaterial;
}

type P = [number, number];

interface BodySpec {
  /** Contorno superior de la carrocería, de atrás-abajo a delante-abajo (x adelante, y arriba). */
  body: P[];
  bodyWidth: number;
  /** Polígono de la cabina acristalada */
  cabin: P[];
  cabinWidth: number;
  /** Losa del techo pintada encima de la cabina */
  roof: P[];
  headlightX: number;
  headlightY: number;
  tailY: number;
  rearX: number;
}

/** Perfiles originales de cada estilo de carrocería. */
const SPECS: Record<CarStyle, BodySpec> = {
  sport: {
    body: [[-0.55, 0.05], [-0.57, 0.25], [-0.5, 0.31], [0.2, 0.3], [0.56, 0.22], [0.72, 0.16], [0.76, 0.08]],
    bodyWidth: 0.8,
    cabin: [[-0.44, 0.29], [-0.3, 0.42], [0.02, 0.44], [0.24, 0.3]],
    cabinWidth: 0.62,
    roof: [[-0.29, 0.415], [-0.27, 0.45], [0.02, 0.465], [0.04, 0.435]],
    headlightX: 0.73,
    headlightY: 0.15,
    tailY: 0.24,
    rearX: -0.56,
  },
  boxy: {
    body: [[-0.55, 0.05], [-0.57, 0.31], [0.56, 0.31], [0.72, 0.26], [0.76, 0.08]],
    bodyWidth: 0.84,
    cabin: [[-0.5, 0.3], [-0.48, 0.45], [0.1, 0.46], [0.3, 0.31]],
    cabinWidth: 0.72,
    roof: [[-0.5, 0.445], [-0.5, 0.48], [0.1, 0.49], [0.12, 0.455]],
    headlightX: 0.74,
    headlightY: 0.2,
    tailY: 0.26,
    rearX: -0.56,
  },
  van: {
    body: [[-0.54, 0.05], [-0.56, 0.32], [0.46, 0.33], [0.68, 0.25], [0.75, 0.08]],
    bodyWidth: 0.78,
    cabin: [[-0.52, 0.32], [-0.51, 0.46], [0.26, 0.47], [0.45, 0.33]],
    cabinWidth: 0.72,
    roof: [[-0.53, 0.455], [-0.53, 0.5], [0.26, 0.505], [0.28, 0.465]],
    headlightX: 0.73,
    headlightY: 0.2,
    tailY: 0.28,
    rearX: -0.55,
  },
};

const BOTTOM_Y = 0.04;

/** Contorno con los pasos de rueda recortados en el borde inferior. */
function bodyShape(top: P[], preset: CarPreset): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(top[0][0], top[0][1]);
  for (let i = 1; i < top.length; i++) shape.lineTo(top[i][0], top[i][1]);
  const front = preset.wheels.find((w) => w.front) ?? preset.wheels[0];
  const back = preset.wheels.find((w) => !w.front) ?? preset.wheels[2];
  const arches = [front, back].map((w) => {
    const cy = -(CAR.WHEEL_RAY_LENGTH - w.radius);
    const r = w.radius + 0.055;
    const dy = BOTTOM_Y - cy;
    const dx = Math.sqrt(Math.max(0.0001, r * r - dy * dy));
    return { cx: w.x, cy, r, start: Math.atan2(dy, dx), end: Math.PI - Math.atan2(dy, dx), x0: w.x + dx, x1: w.x - dx };
  });
  const last = top[top.length - 1];
  shape.lineTo(last[0] - 0.04, BOTTOM_Y);
  for (const a of arches) {
    shape.lineTo(a.x0, BOTTOM_Y);
    shape.absarc(a.cx, a.cy, a.r, a.start, a.end, false);
    shape.lineTo(a.x1, BOTTOM_Y);
  }
  shape.lineTo(top[0][0] + 0.02, BOTTOM_Y);
  shape.closePath();
  return shape;
}

/** Altura del contorno superior en una x dada (interpolación lineal). */
function topY(top: P[], x: number): number {
  for (let i = 1; i < top.length; i++) {
    const [ax, ay] = top[i - 1];
    const [bx, by] = top[i];
    if ((x >= ax && x <= bx) || (x <= ax && x >= bx)) {
      const t = bx === ax ? 0 : (x - ax) / (bx - ax);
      return ay + (by - ay) * t;
    }
  }
  return top[Math.floor(top.length / 2)][1];
}

function polygonShape(points: P[], closeY?: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  if (closeY !== undefined) {
    s.lineTo(points[points.length - 1][0], closeY);
    s.lineTo(points[0][0], closeY);
  }
  s.closePath();
  return s;
}

function extrude(shape: THREE.Shape, width: number, bevel: number, smooth: boolean): THREE.ExtrudeGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: smooth ? 4 : 1,
    curveSegments: smooth ? 14 : 5,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  return geo;
}

/**
 * Construye el modelo 3D de un coche (eje X = adelante) a partir de su preset.
 * La carrocería principal usa el color de equipo y los detalles el color de acento.
 */
export function buildCarModel(preset: CarPreset, teamColor: number, accent: number, mats: Materials): BuiltCar {
  const smooth = mats.realistic;
  const spec = SPECS[preset.style];
  const root = new THREE.Group();
  const paint = mats.paint(teamColor);
  const accentPaint = mats.paint(accent);
  const trim = mats.plastic(0x16181d);
  const glass = mats.glass();

  const body = new THREE.Mesh(extrude(bodyShape(spec.body, preset), spec.bodyWidth, 0.05, smooth), paint);
  body.castShadow = true;
  root.add(body);

  const cabin = new THREE.Mesh(extrude(polygonShape(spec.cabin), spec.cabinWidth, 0.03, smooth), glass);
  cabin.castShadow = true;
  root.add(cabin);
  const roof = new THREE.Mesh(extrude(polygonShape(spec.roof), spec.cabinWidth - 0.06, 0.012, smooth), paint);
  root.add(roof);

  // Faldones laterales y franja de acento
  for (const zs of [1, -1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.035, 0.03), accentPaint);
    skirt.position.set(0.08, 0.07, zs * (spec.bodyWidth / 2 + 0.005));
    root.add(skirt);
  }
  // Franja sobre el capó, siguiendo la pendiente del contorno superior
  const x0 = 0.3;
  const x1 = 0.62;
  const y0 = topY(spec.body, x0) + 0.052;
  const y1 = topY(spec.body, x1) + 0.052;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(x1 - x0, y1 - y0), 0.01, 0.14), accentPaint);
  stripe.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
  stripe.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  root.add(stripe);

  // Parachoques, rejilla, faros y pilotos
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, spec.bodyWidth - 0.06), trim);
  bumper.position.set(Math.max(...spec.body.map((p) => p[0])) + 0.03, 0.07, 0);
  root.add(bumper);
  const headMat = mats.light(0xf4f7ff, 2.5);
  const tailMat = mats.light(0xff2a2a, 1.8);
  // Los faros sobresalen un poco del bisel de la carrocería para verse siempre
  const frontX = Math.max(...spec.body.map((p) => p[0])) + 0.025;
  const backX = Math.min(...spec.body.map((p) => p[0])) - 0.045;
  for (const zs of [1, -1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.14), headMat);
    head.position.set(frontX, spec.headlightY, zs * (spec.bodyWidth / 2 - 0.12));
    root.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.18), tailMat);
    tail.position.set(backX, spec.tailY, zs * (spec.bodyWidth / 2 - 0.12));
    root.add(tail);
  }

  if (preset.style === 'sport') {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, spec.bodyWidth + 0.02), accentPaint);
    wing.position.set(-0.5, 0.44, 0);
    wing.rotation.z = 0.08;
    root.add(wing);
    for (const zs of [1, -1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.025), trim);
      strut.position.set(-0.48, 0.37, zs * 0.27);
      root.add(strut);
    }
  } else if (preset.style === 'boxy') {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, spec.cabinWidth), accentPaint);
    lip.position.set(-0.52, 0.49, 0);
    root.add(lip);
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.4), mats.light(0xfff1c2, 2));
    lightBar.position.set(0.1, 0.505, 0);
    root.add(lightBar);
  } else {
    const rack = new THREE.Group();
    for (const zs of [1, -1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.02), mats.metal());
      rail.position.set(-0.12, 0.53, zs * 0.3);
      rack.add(rail);
    }
    for (const x of [-0.4, -0.12, 0.16]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.62), mats.metal());
      bar.position.set(x, 0.535, 0);
      rack.add(bar);
    }
    root.add(rack);
    const ram = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, spec.bodyWidth - 0.1), trim);
    ram.position.set(0.77, 0.12, 0);
    root.add(ram);
  }

  // Ruedas: neumático, llanta metálica con radios y tapacubos de acento
  const wheelPivots: THREE.Object3D[] = [];
  const tires: THREE.Object3D[] = [];
  const rubber = mats.rubber();
  const rimMat = mats.metal(0xc3c9d4);
  const segs = smooth ? 28 : 10;
  for (const def of preset.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(def.x, -(CAR.WHEEL_RAY_LENGTH - def.radius), def.z);
    const tire = new THREE.Group();
    const width = 0.13;
    const tireMesh = new THREE.Mesh(new THREE.CylinderGeometry(def.radius, def.radius, width, segs), rubber);
    tireMesh.rotation.x = Math.PI / 2;
    tireMesh.castShadow = true;
    tire.add(tireMesh);
    const side = Math.sign(def.z);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(def.radius * 0.68, def.radius * 0.68, 0.012, segs), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.z = side * (width / 2 + 0.002);
    tire.add(rim);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(def.radius * 1.2, 0.022, 0.014), rimMat);
      spoke.rotation.z = (k / 5) * Math.PI;
      spoke.position.z = side * (width / 2 + 0.008);
      tire.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(def.radius * 0.2, def.radius * 0.2, 0.02, 10), accentPaint);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = side * (width / 2 + 0.014);
    tire.add(hub);
    pivot.add(tire);
    root.add(pivot);
    wheelPivots.push(pivot);
    tires.push(tire);
  }

  // Tobera y llama de boost
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 12), mats.metal(0x5b616d));
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(spec.rearX - 0.02, 0.17, 0);
  root.add(nozzle);
  const flame = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({
    color: teamColor === 0x2f86ff ? 0x7fd0ff : 0xffb347,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 10), flameMat);
  outer.rotation.z = Math.PI / 2;
  outer.position.x = -0.35;
  const inner = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.4, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  inner.rotation.z = Math.PI / 2;
  inner.position.x = -0.22;
  flame.add(outer, inner);
  flame.position.set(spec.rearX - 0.02, 0.17, 0);
  flame.visible = false;
  root.add(flame);

  return { root, wheelPivots, tires, flame, flameMat };
}
