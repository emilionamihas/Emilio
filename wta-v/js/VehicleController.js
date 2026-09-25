import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS } from './Environment.js';

/**
 * Catálogo de vehículos.
 *  - power: fuerza total del motor (N), repartida entre las ruedas motrices
 *  - drive: 'fwd' delantera, 'rwd' trasera, 'awd' total
 *  - brakeDecel / handbrakeDecel: deceleración objetivo (m/s²). cannon-es aplica los frenos como
 *    IMPULSO por paso y por rueda, así que se convierten con la masa en `derive()`.
 *  - drift: fracción del agarre trasero que queda con el freno de mano.
 *    Todos los valores se ajustaron con la prueba de física (tools/vehicle-test.mjs).
 *  - body/cabin/wheel: dimensiones visuales y de colisión (metros).
 */
export const CATALOG = {
  compact: {
    label: 'Brío', kind: 'Compacto', price: 3000, mass: 950, drive: 'fwd', power: 4200, maxSpeed: 40,
    brakeDecel: 9, handbrakeDecel: 6, maxSteer: 0.6, gripFront: 1.9, gripRear: 1.9, drift: 0.66,
    stiffness: 34, damping: [2.4, 4.2], health: 90,
    body: { w: 0.82, l: 1.95, h: 0.62 }, cabin: { h: 0.6, l: 1.9, z: -0.15 },
    wheel: { r: 0.33, x: 0.74, zf: 1.22, zr: -1.18, rest: 0.3 },
    style: 'hatch', colors: [0xe53935, 0x43a047, 0xfdd835, 0x29b6f6, 0xf5f5f5],
  },
  sedan: {
    label: 'Estela', kind: 'Sedán', price: 6000, mass: 1150, drive: 'rwd', power: 5600, maxSpeed: 44,
    brakeDecel: 9, handbrakeDecel: 6, maxSteer: 0.55, gripFront: 1.9, gripRear: 1.85, drift: 0.7,
    stiffness: 32, damping: [2.4, 4.2], health: 100,
    body: { w: 0.9, l: 2.2, h: 0.62 }, cabin: { h: 0.58, l: 2.1, z: -0.2 },
    wheel: { r: 0.37, x: 0.82, zf: 1.35, zr: -1.3, rest: 0.32 },
    style: 'sedan', colors: [0x1565c0, 0x212121, 0xeeeeee, 0x546e7a, 0x6d4c41, 0x8e24aa],
  },
  taxi: {
    label: 'Taxi', kind: 'Sedán', price: 0, mass: 1150, drive: 'rwd', power: 5600, maxSpeed: 44,
    brakeDecel: 9, handbrakeDecel: 6, maxSteer: 0.55, gripFront: 1.9, gripRear: 1.85, drift: 0.7,
    stiffness: 32, damping: [2.4, 4.2], health: 100,
    body: { w: 0.9, l: 2.2, h: 0.62 }, cabin: { h: 0.58, l: 2.1, z: -0.2 },
    wheel: { r: 0.37, x: 0.82, zf: 1.35, zr: -1.3, rest: 0.32 },
    style: 'taxi', colors: [0xf9c80e],
  },
  muscle: {
    label: 'Toro', kind: 'Muscle', price: 22000, mass: 1400, drive: 'rwd', power: 9800, maxSpeed: 54,
    brakeDecel: 9.5, handbrakeDecel: 5, maxSteer: 0.55, gripFront: 2.0, gripRear: 1.75, drift: 0.66,
    stiffness: 34, damping: [2.5, 4.3], health: 120,
    body: { w: 0.95, l: 2.35, h: 0.6 }, cabin: { h: 0.5, l: 1.7, z: -0.4 },
    wheel: { r: 0.4, x: 0.86, zf: 1.45, zr: -1.35, rest: 0.3 },
    style: 'muscle', colors: [0xff6f00, 0x111111, 0xb71c1c, 0x1b5e20],
  },
  sport: {
    label: 'Vento GT', kind: 'Deportivo', price: 38000, mass: 1150, drive: 'rwd', power: 9400, maxSpeed: 62,
    brakeDecel: 11, handbrakeDecel: 5.5, maxSteer: 0.5, gripFront: 2.3, gripRear: 2.2, drift: 0.64,
    stiffness: 42, damping: [2.8, 4.6], health: 95,
    body: { w: 0.92, l: 2.2, h: 0.5 }, cabin: { h: 0.44, l: 1.7, z: -0.3 },
    wheel: { r: 0.36, x: 0.84, zf: 1.35, zr: -1.3, rest: 0.26 },
    style: 'sport', colors: [0xffc107, 0xd50000, 0x00b0ff, 0xffffff],
  },
  super: {
    label: 'Furia R', kind: 'Superdeportivo', price: 95000, mass: 1250, drive: 'awd', power: 14500, maxSpeed: 76,
    brakeDecel: 12, handbrakeDecel: 5, maxSteer: 0.48, gripFront: 2.6, gripRear: 2.5, drift: 0.62,
    stiffness: 48, damping: [3.0, 4.8], health: 90,
    body: { w: 0.98, l: 2.25, h: 0.44 }, cabin: { h: 0.38, l: 1.5, z: -0.2 },
    wheel: { r: 0.37, x: 0.88, zf: 1.38, zr: -1.35, rest: 0.24 },
    style: 'super', colors: [0x76ff03, 0xff1744, 0xaa00ff, 0xff9100],
  },
  suv: {
    label: 'Cumbre', kind: 'Todoterreno', price: 14000, mass: 2000, drive: 'awd', power: 10500, maxSpeed: 46,
    brakeDecel: 8.5, handbrakeDecel: 5.5, maxSteer: 0.55, gripFront: 1.9, gripRear: 1.85, drift: 0.72,
    stiffness: 30, damping: [2.3, 4.0], health: 150,
    body: { w: 0.98, l: 2.3, h: 0.85 }, cabin: { h: 0.7, l: 2.4, z: -0.3 },
    wheel: { r: 0.45, x: 0.88, zf: 1.45, zr: -1.4, rest: 0.36 },
    style: 'suv', colors: [0x263238, 0x3e2723, 0xfafafa, 0x33691e],
  },
  pickup: {
    label: 'Mula', kind: 'Pickup', price: 9000, mass: 1900, drive: 'rwd', power: 8400, maxSpeed: 44,
    brakeDecel: 8.5, handbrakeDecel: 5.5, maxSteer: 0.55, gripFront: 1.9, gripRear: 1.8, drift: 0.7,
    stiffness: 30, damping: [2.3, 4.0], health: 150,
    body: { w: 0.98, l: 2.5, h: 0.75 }, cabin: { h: 0.72, l: 1.5, z: 0.55 },
    wheel: { r: 0.44, x: 0.88, zf: 1.6, zr: -1.45, rest: 0.36 },
    style: 'pickup', colors: [0xc62828, 0x0d47a1, 0x9e9e9e, 0xf5f5f5],
  },
  van: {
    label: 'Carga', kind: 'Furgoneta', price: 7000, mass: 2200, drive: 'rwd', power: 8400, maxSpeed: 38,
    brakeDecel: 8, handbrakeDecel: 5, maxSteer: 0.55, gripFront: 1.85, gripRear: 1.8, drift: 0.74,
    stiffness: 30, damping: [2.3, 4.0], health: 170,
    body: { w: 1.0, l: 2.5, h: 1.6 }, cabin: null,
    wheel: { r: 0.4, x: 0.88, zf: 1.65, zr: -1.5, rest: 0.34 },
    style: 'van', colors: [0xf5f5f5, 0x1e88e5, 0x795548],
  },
  police: {
    label: 'Patrulla', kind: 'Policía', price: 0, mass: 1300, drive: 'rwd', power: 8600, maxSpeed: 56,
    brakeDecel: 10, handbrakeDecel: 6, maxSteer: 0.55, gripFront: 2.1, gripRear: 2.0, drift: 0.7,
    stiffness: 36, damping: [2.6, 4.4], health: 130,
    body: { w: 0.92, l: 2.25, h: 0.62 }, cabin: { h: 0.56, l: 2.1, z: -0.2 },
    wheel: { r: 0.38, x: 0.83, zf: 1.38, zr: -1.32, rest: 0.32 },
    style: 'police', colors: [0x111111],
  },
};

// Compatibilidad con los nombres de la primera versión
CATALOG.civil = CATALOG.sedan;

/** Vehículos que se pueden comprar en el concesionario, del más barato al más caro. */
export const DEALER_MODELS = Object.keys(CATALOG).filter((k) => CATALOG[k].price > 0 && k !== 'civil').sort((a, b) => CATALOG[a].price - CATALOG[b].price);

/** Mezcla del tráfico civil (pesos relativos). */
export const TRAFFIC_MIX = { compact: 5, sedan: 6, taxi: 2, suv: 3, pickup: 3, van: 2, muscle: 1.5, sport: 1, super: 0.3 };


/** Extruye un perfil lateral [z, y] a lo ancho (eje X) con bordes redondeados, centrado en X. */
function extrudeProfile(points, width, bevel = 0.05) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const depth = Math.max(0.01, width - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 4 });
  // Forma en el plano XY (x = largo). Rotamos para que x -> +Z (adelante) y la extrusión -> X
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

const HAS_DOM = typeof document !== 'undefined'; // el banco de pruebas corre en Node, sin canvas

function rimTexture(dark) {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 128, 128);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, dark ? '#555' : '#e8e8e8');
  g.addColorStop(1, dark ? '#222' : '#9a9a9a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  // huecos entre radios
  ctx.fillStyle = '#0c0c0c';
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI * 2 + 0.25;
    ctx.beginPath();
    ctx.moveTo(64 + Math.cos(a0) * 18, 64 + Math.sin(a0) * 18);
    ctx.arc(64, 64, 52, a0, a0 + 0.8);
    ctx.lineTo(64 + Math.cos(a0 + 0.8) * 18, 64 + Math.sin(a0 + 0.8) * 18);
    ctx.fill();
  }
  ctx.fillStyle = dark ? '#888' : '#c9c9c9';
  ctx.beginPath();
  ctx.arc(64, 64, 12, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function checkerTexture() {
  if (!HAS_DOM) return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const ctx = c.getContext('2d');
  for (let x = 0; x < 64; x += 4) {
    for (let y = 0; y < 8; y += 4) {
      ctx.fillStyle = (x + y) % 8 === 0 ? '#111' : '#fff';
      ctx.fillRect(x, y, 4, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  return t;
}

/** Materiales compartidos entre todos los vehículos (se crean una vez). */
const SHARED = {};
function initShared() {
  if (SHARED.trim) return;
  SHARED.trim = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  SHARED.chrome = new THREE.MeshStandardMaterial({ color: 0xdfe4e8, metalness: 1, roughness: 0.15 });
  SHARED.grille = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, metalness: 0.5, roughness: 0.4 });
  SHARED.plate = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.5 });
  SHARED.tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
  SHARED.rimSide = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  SHARED.rim = new THREE.MeshStandardMaterial({ map: rimTexture(false), metalness: 0.9, roughness: 0.25 });
  SHARED.rimDark = new THREE.MeshStandardMaterial({ map: rimTexture(true), metalness: 0.8, roughness: 0.3 });
  SHARED.checker = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.5 });
}

const _v = new CANNON.Vec3();
const _v2 = new CANNON.Vec3();
const _fwd = new CANNON.Vec3();
const _up = new CANNON.Vec3();
const _right = new CANNON.Vec3();
const _zero = new CANNON.Vec3();

function derive(spec) {
  if (spec._derived) return spec;
  const drivenWheels = spec.drive === 'awd' ? 4 : 2;
  spec.drivenWheels = drivenWheels;
  spec.brakeImpulse = (spec.mass * spec.brakeDecel) / 60 / 4;
  spec.handbrakeImpulse = (spec.mass * spec.handbrakeDecel) / 60 / 2;
  // Arrastre tal que a velocidad máxima el 30 % del motor se lo coma el aire
  spec.dragCoef = (spec.power * 0.3) / (spec.maxSpeed * spec.maxSpeed);
  spec.connY = spec.wheel.r - 0.03; // anclaje de la suspensión (origen del cuerpo ≈ centro de masas bajo)
  spec._derived = true;
  return spec;
}

export class VehicleController {
  constructor(game, { type = 'sedan', color, position = new THREE.Vector3(), heading = 0 } = {}) {
    this.game = game;
    this.type = type === 'civil' ? 'sedan' : type;
    this.spec = derive(CATALOG[this.type]);
    this.driver = null;        // null | 'player' | 'ai' | 'police'
    this.playerOwned = false;  // tras robarlo ya no vuelve a contar como delito
    this.maxHealth = this.spec.health;
    this.health = this.maxHealth;
    this.destroyed = false;
    this.inWorld = false;
    this.drifting = false;
    this.sirenOn = false;
    this.sirenTime = 0;
    this.tag = null;           // marcas de misión: 'target', 'delivery'...

    this.input = { throttle: 0, reverse: 0, steer: 0, handbrake: false };
    this.steerValue = 0;

    this.createPhysics();
    initShared();
    this.createMeshes(color);
    this.place(position.x, position.z, heading);
  }

  get label() {
    return `${this.spec.label} (${this.spec.kind})`;
  }

  // ------------------------------------------------------------------
  // Física: chasis rígido + RaycastVehicle con 4 ruedas y suspensión
  // ------------------------------------------------------------------
  createPhysics() {
    const s = this.spec;
    const chassis = new CANNON.Body({
      mass: s.mass,
      material: this.game.materials.vehicle,
      collisionFilterGroup: GROUPS.VEHICLE,
      collisionFilterMask: GROUPS.STATIC | GROUPS.PLAYER | GROUPS.VEHICLE,
      angularDamping: 0.4,
      linearDamping: 0.01,
    });
    // El origen del cuerpo es el centro de masas. Las cajas de colisión se colocan por encima,
    // así el centro de masas queda bajo (a la altura de los ejes) y el coche es estable.
    const b = s.body;
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(b.w, b.h / 2, b.l)), new CANNON.Vec3(0, b.h / 2, 0));
    if (s.cabin) {
      chassis.addShape(
        new CANNON.Box(new CANNON.Vec3(b.w * 0.85, s.cabin.h / 2, s.cabin.l / 2)),
        new CANNON.Vec3(0, b.h + s.cabin.h / 2, s.cabin.z)
      );
    }
    chassis.allowSleep = false;
    chassis.userData = { vehicle: this };

    const vehicle = new CANNON.RaycastVehicle({
      chassisBody: chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const w = s.wheel;
    const base = {
      radius: w.r,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: s.stiffness,
      suspensionRestLength: w.rest,
      maxSuspensionTravel: w.rest * 0.9,
      maxSuspensionForce: 1e6,
      dampingRelaxation: s.damping[0],
      dampingCompression: s.damping[1],
      rollInfluence: 0.02,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };
    // Orden: 0 del. izq., 1 del. der., 2 tras. izq., 3 tras. der. (+X local es la IZQUIERDA)
    const positions = [
      [w.x, w.zf],
      [-w.x, w.zf],
      [w.x, w.zr],
      [-w.x, w.zr],
    ];
    positions.forEach(([x, z], i) => {
      vehicle.addWheel({
        ...base,
        frictionSlip: i < 2 ? s.gripFront : s.gripRear,
        chassisConnectionPointLocal: new CANNON.Vec3(x, s.connY, z),
      });
    });

    chassis.addEventListener('collide', (e) => this.onCollide(e));

    this.chassisBody = chassis;
    this.vehicle = vehicle;
  }

  createMeshes(color) {
    const s = this.spec;
    const group = new THREE.Group();
    group.userData.vehicle = this;
    const style = s.style;
    const paint = color ?? s.colors[Math.floor(Math.random() * s.colors.length)];

    // Pintura con capa de barniz: refleja el cielo (scene.environment)
    this.paintMat = new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12 });
    const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.3, clearcoat: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0e1419, metalness: 0.9, roughness: 0.05, envMapIntensity: 1.4 });
    const trimMat = SHARED.trim;
    const chromeMat = SHARED.chrome;
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6, roughness: 0.1 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4, roughness: 0.2 });
    this.reverseMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffffff, emissiveIntensity: 0 });

    const add = (geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

    const b = s.body;
    const W = b.w * 2;
    const L = b.l * 2;
    const H = b.h;
    const c = s.cabin;

    // --- Carrocería inferior: perfil lateral extruido a lo ancho con bordes redondeados
    const lower = [];
    const front = L / 2;
    const rear = -L / 2;
    if (style === 'van') {
      lower.push([rear, 0.12], [front - 0.1, 0.12], [front, 0.45], [front, H * 0.42], [front - 0.55, H * 0.62], [front - 0.9, H], [rear, H]);
    } else {
      const hoodEnd = c ? c.z + c.l / 2 + 0.35 : front - 1.2;
      lower.push(
        [rear + 0.05, 0.1],
        [front - 0.05, 0.1],
        [front, H * 0.45],
        [front - 0.12, H * 0.82],
        [front - 0.45, H * 0.95],
        [hoodEnd, H],
        [rear + 0.35, H],
        [rear + 0.08, H * 0.9],
        [rear, H * 0.5]
      );
    }
    add(extrudeProfile(lower, W - 0.12, 0.06), this.paintMat);

    // --- Habitáculo acristalado + techo pintado
    if (c) {
      const slopeF = style === 'super' ? 0.95 : style === 'sport' ? 0.75 : style === 'muscle' ? 0.6 : style === 'suv' || style === 'pickup' ? 0.35 : 0.55;
      const slopeR = style === 'hatch' || style === 'suv' ? 0.15 : style === 'pickup' ? 0.05 : style === 'super' ? 0.7 : 0.45;
      const zf = c.z + c.l / 2 + 0.3;
      const zr = c.z - c.l / 2 - 0.05;
      const top = H + c.h;
      const glass = [
        [zr, H - 0.02],
        [zf, H - 0.02],
        [zf - slopeF, top],
        [zr + slopeR, top],
      ];
      const gw = W * (style === 'super' ? 0.78 : 0.84);
      add(extrudeProfile(glass, gw - 0.08, 0.04), glassMat);
      const roof = [
        [zr + slopeR - 0.03, top - 0.02],
        [zf - slopeF + 0.03, top - 0.02],
        [zf - slopeF - 0.05, top + 0.05],
        [zr + slopeR + 0.05, top + 0.05],
      ];
      this.roofMesh = add(extrudeProfile(roof, gw - 0.02, 0.03), style === 'police' || style === 'taxi' ? (style === 'police' ? whiteMat : this.paintMat) : this.paintMat);
      this.roofInfo = { y: top + 0.05, zf: zf - slopeF, zr: zr + slopeR, w: gw };
      // Pilares B (color carrocería) y retrovisores
      const bz = (zf - slopeF + zr + slopeR) / 2;
      for (const side of [-1, 1]) {
        box(0.05, c.h, 0.12, this.paintMat, side * (gw / 2 + 0.005), H + c.h / 2, bz);
        box(0.18, 0.1, 0.08, this.paintMat, side * (W / 2 + 0.06), H + 0.12, zf - 0.1);
      }
    }

    // --- Frontal y trasera
    const lightY = H * 0.7;
    const hl = style === 'super' || style === 'sport' ? [0.42, 0.07] : [0.36, 0.12];
    box(hl[0], hl[1], 0.05, this.headMat, b.w - 0.3, lightY, front - 0.02);
    box(hl[0], hl[1], 0.05, this.headMat, -b.w + 0.3, lightY, front - 0.02);
    box(W * 0.42, H * 0.22, 0.04, SHARED.grille, 0, H * 0.45, front + 0.005); // rejilla
    box(0.38, 0.1, 0.05, this.tailMat, b.w - 0.28, lightY, rear + 0.02);
    box(0.38, 0.1, 0.05, this.tailMat, -b.w + 0.28, lightY, rear + 0.02);
    box(0.16, 0.07, 0.04, this.reverseMat, 0.3, lightY - 0.12, rear + 0.01);
    box(W + 0.02, 0.14, 0.14, trimMat, 0, 0.2, front - 0.02); // paragolpes
    box(W + 0.02, 0.14, 0.14, trimMat, 0, 0.2, rear + 0.02);
    box(0.34, 0.1, 0.02, SHARED.plate, 0, 0.36, front + 0.03); // matrículas
    box(0.34, 0.1, 0.02, SHARED.plate, 0, 0.42, rear - 0.03);
    // Faldones laterales
    box(0.04, 0.1, L * 0.55, trimMat, W / 2 - 0.02, 0.16, 0);
    box(0.04, 0.1, L * 0.55, trimMat, -W / 2 + 0.02, 0.16, 0);

    // --- Detalles por estilo
    switch (style) {
      case 'police': {
        box(W - 0.06, 0.34, 1.9, whiteMat, 0, H * 0.55, -0.1);
        this.sirenRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff0000, emissiveIntensity: 0 });
        this.sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x0044ff, emissiveIntensity: 0 });
        const roofY = H + c.h + 0.13;
        box(1.1, 0.06, 0.28, trimMat, 0, roofY - 0.05, c.z - 0.1);
        box(0.5, 0.12, 0.26, this.sirenRed, 0.28, roofY + 0.03, c.z - 0.1);
        box(0.5, 0.12, 0.26, this.sirenBlue, -0.28, roofY + 0.03, c.z - 0.1);
        break;
      }
      case 'taxi': {
        const signMat = new THREE.MeshStandardMaterial({ color: 0xfff59d, emissive: 0xffeb3b, emissiveIntensity: 0.5 });
        box(0.6, 0.18, 0.28, signMat, 0, H + c.h + 0.14, c.z - 0.2);
        box(0.02, 0.12, L * 0.5, SHARED.checker, W / 2 - 0.03, H * 0.62, 0);
        box(0.02, 0.12, L * 0.5, SHARED.checker, -W / 2 + 0.03, H * 0.62, 0);
        break;
      }
      case 'muscle':
        box(0.7, 0.1, 0.9, trimMat, 0, H + 0.05, 1.3); // toma de aire
        box(0.26, 0.012, L * 0.95, whiteMat, 0.2, H + 0.006, 0); // franjas
        box(0.26, 0.012, L * 0.95, whiteMat, -0.2, H + 0.006, 0);
        box(0.1, 0.08, 0.3, chromeMat, 0.5, 0.18, rear - 0.1); // escapes
        box(0.1, 0.08, 0.3, chromeMat, -0.5, 0.18, rear - 0.1);
        break;
      case 'sport':
        box(W - 0.3, 0.05, 0.32, trimMat, 0, H + 0.3, rear + 0.3);
        box(0.06, 0.28, 0.08, trimMat, 0.55, H + 0.15, rear + 0.3);
        box(0.06, 0.28, 0.08, trimMat, -0.55, H + 0.15, rear + 0.3);
        break;
      case 'super':
        box(W + 0.1, 0.05, 0.45, trimMat, 0, H + 0.42, rear + 0.3);
        box(0.08, 0.4, 0.1, trimMat, 0.55, H + 0.2, rear + 0.3);
        box(0.08, 0.4, 0.1, trimMat, -0.55, H + 0.2, rear + 0.3);
        box(W + 0.04, 0.06, 0.4, trimMat, 0, 0.1, front - 0.15); // splitter
        box(0.04, 0.22, 0.9, trimMat, W / 2 + 0.01, H * 0.5, -0.6); // tomas laterales
        box(0.04, 0.22, 0.9, trimMat, -W / 2 - 0.01, H * 0.5, -0.6);
        break;
      case 'suv':
        box(W - 0.3, 0.05, c.l - 0.5, chromeMat, 0, H + c.h + 0.1, c.z); // baca
        box(W + 0.06, 0.26, 0.22, chromeMat, 0, 0.36, front + 0.06); // defensa
        break;
      case 'pickup': {
        const bedZ = (c.z - c.l / 2 + rear) / 2;
        const bedL = c.z - c.l / 2 - rear;
        box(0.07, 0.38, bedL, this.paintMat, b.w - 0.06, H + 0.19, bedZ);
        box(0.07, 0.38, bedL, this.paintMat, -b.w + 0.06, H + 0.19, bedZ);
        box(W - 0.12, 0.38, 0.07, this.paintMat, 0, H + 0.19, rear + 0.04);
        box(W - 0.2, 0.02, bedL, trimMat, 0, H + 0.01, bedZ);
        box(W + 0.06, 0.24, 0.22, chromeMat, 0, 0.34, front + 0.06);
        break;
      }
      case 'van':
        box(W - 0.2, 0.55, 0.04, glassMat, 0, H * 0.78, front - 0.72); // parabrisas
        box(0.04, 0.45, 0.7, glassMat, W / 2 - 0.05, H * 0.75, front - 1.25);
        box(0.04, 0.45, 0.7, glassMat, -W / 2 + 0.05, H * 0.75, front - 1.25);
        box(0.02, H * 0.55, 0.02, trimMat, W / 2 - 0.05, H * 0.5, -0.3); // puerta corredera
        break;
      default:
        break;
    }

    // Ruedas: neumático con llanta de radios (textura en la tapa del cilindro)
    const w = s.wheel;
    const wheelGeo = new THREE.CylinderGeometry(w.r, w.r, w.r * 0.75, 20);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(w.r * 0.66, w.r * 0.66, w.r * 0.78, 20);
    rimGeo.rotateZ(Math.PI / 2);
    const rimCap = style === 'super' || style === 'sport' ? SHARED.rimDark : SHARED.rim;
    this.wheelMeshes = [0, 1, 2, 3].map(() => {
      const wm = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, SHARED.tire);
      tire.castShadow = true;
      wm.add(tire, new THREE.Mesh(rimGeo, [SHARED.rimSide, rimCap, rimCap]));
      wm.userData.vehicle = this;
      return wm;
    });

    this.mesh = group;
    this.dims = { W, L, H };
    this.stripes = new THREE.Group();
    group.add(this.stripes);
  }

  /**
   * Personalización de un coche propio.
   * car: { color, color2, design: 'liso'|'franjas'|'bicolor'|'racing', finish: 'brillo'|'metalizado'|'mate' }
   */
  applyStyle(car) {
    const m = this.paintMat;
    if (car.color != null) m.color.setHex(car.color);
    const finish = { brillo: [0.45, 0.32, 0.9], metalizado: [0.9, 0.22, 1], mate: [0.1, 0.85, 0] }[car.finish || 'brillo'];
    m.metalness = finish[0];
    m.roughness = finish[1];
    m.clearcoat = finish[2];
    this.originalColor = m.color.getHex();

    // Dibujo: se reconstruye cada vez
    for (const c of [...this.stripes.children]) this.stripes.remove(c);
    if (this.roofMesh) this.roofMesh.material = m;
    const second = new THREE.MeshPhysicalMaterial({ color: car.color2 ?? 0x111111, metalness: finish[0], roughness: finish[1], clearcoat: finish[2] });
    const { W, L, H } = this.dims;
    const strip = (w, h, d, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), second);
      b.position.set(x, y, z);
      this.stripes.add(b);
    };
    const r = this.roofInfo;
    switch (car.design) {
      case 'franjas':
        for (const x of [-0.2, 0.2]) {
          strip(0.22, 0.012, L * 0.98, x, H + 0.008, 0);
          if (r) strip(0.22, 0.012, r.zf - r.zr, x, r.y + 0.004, (r.zf + r.zr) / 2);
        }
        break;
      case 'racing':
        strip(0.5, 0.012, L * 0.98, 0, H + 0.008, 0);
        if (r) strip(0.5, 0.012, r.zf - r.zr, 0, r.y + 0.004, (r.zf + r.zr) / 2);
        for (const side of [-1, 1]) strip(0.012, 0.12, L * 0.7, side * (W / 2 + 0.005), H * 0.55, 0);
        break;
      case 'bicolor':
        if (this.roofMesh) this.roofMesh.material = second;
        for (const side of [-1, 1]) strip(0.012, H * 0.35, L * 0.92, side * (W / 2 + 0.004), H * 0.3, 0);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Ciclo de vida (usado por el object pooling del tráfico)
  // ------------------------------------------------------------------
  addToWorld() {
    if (this.inWorld) return;
    this.vehicle.addToWorld(this.game.world);
    this.game.scene.add(this.mesh, ...this.wheelMeshes);
    this.inWorld = true;
    if (!this.game.vehicles.includes(this)) this.game.vehicles.push(this);
  }

  removeFromWorld() {
    if (!this.inWorld) return;
    this.vehicle.removeFromWorld(this.game.world);
    this.game.scene.remove(this.mesh, ...this.wheelMeshes);
    this.inWorld = false;
    const idx = this.game.vehicles.indexOf(this);
    if (idx >= 0) this.game.vehicles.splice(idx, 1);
  }

  /** Coloca el vehículo en reposo sobre el suelo, orientado según `heading` (rad). */
  place(x, z, heading) {
    const b = this.chassisBody;
    const w = this.spec.wheel;
    b.position.set(x, w.r + w.rest - this.spec.connY + 0.05, z);
    b.quaternion.setFromEuler(0, heading, 0);
    b.velocity.setZero();
    b.angularVelocity.setZero();
    b.force.setZero();
    b.torque.setZero();
    this.steerValue = 0;
    this.input.throttle = this.input.reverse = this.input.steer = 0;
    this.input.handbrake = false;
    for (const wi of this.vehicle.wheelInfos) {
      wi.deltaRotation = 0;
      wi.rotation = 0;
    }
    this.sync();
  }

  /** Recupera salud y pintura al reciclar el vehículo desde el pool. */
  repair() {
    this.health = this.maxHealth;
    this.destroyed = false;
    this.tag = null;
    this.paintMat.emissive.setHex(0x000000);
    if (this.originalColor !== undefined) this.paintMat.color.setHex(this.originalColor);
  }

  resetUpright() {
    const heading = this.getHeading();
    const p = this.chassisBody.position;
    this.place(p.x, p.z, heading);
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  get position() {
    return this.chassisBody.position;
  }

  getForward(out = _fwd) {
    return this.chassisBody.quaternion.vmult(_v.set(0, 0, 1), out);
  }

  getHeading() {
    const f = this.getForward();
    return Math.atan2(f.x, f.z);
  }

  /** Velocidad con signo a lo largo del eje delantero (m/s). */
  getForwardSpeed() {
    return this.chassisBody.velocity.dot(this.getForward());
  }

  getSpeedKmh() {
    return Math.abs(this.getForwardSpeed()) * 3.6;
  }

  isFlipped() {
    return this.chassisBody.quaternion.vmult(_v.set(0, 1, 0), _up).y < 0.3;
  }

  /** Ruedas apoyadas: la suspensión está comprimida respecto a su longitud de reposo. */
  groundedWheels() {
    let n = 0;
    for (const w of this.vehicle.wheelInfos) if (w.suspensionLength < w.suspensionRestLength - 0.004) n++;
    return n;
  }

  // ------------------------------------------------------------------
  // Control
  // ------------------------------------------------------------------
  static readPlayerInput(input, out) {
    out.throttle = input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0;
    out.reverse = input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0;
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0;
    const right = input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0;
    out.steer = left - right; // positivo = izquierda
    out.handbrake = input.isDown('Space');
  }

  update(dt) {
    if (!this.inWorld) return;
    const s = this.spec;
    const v = this.vehicle;
    const inp = this.input;
    const speed = this.getForwardSpeed();
    const absSpeed = Math.abs(speed);

    let engine = 0; // fuerza total
    let brake = 0;

    if (!this.destroyed && this.driver) {
      // W: acelera (o frena si vamos marcha atrás). S: frena (o marcha atrás si estamos casi parados).
      if (inp.throttle > 0) {
        if (speed < -1) brake = s.brakeImpulse * inp.throttle;
        else engine = s.power * inp.throttle;
      }
      if (inp.reverse > 0) {
        if (speed > 1) brake = Math.max(brake, s.brakeImpulse * inp.reverse);
        else engine = -s.power * 0.5 * inp.reverse;
      }
      // Curva de par: menos empuje cerca de la velocidad máxima
      if (engine > 0) {
        const r = Math.min(1, Math.max(0, speed) / s.maxSpeed);
        engine *= 1 - r * r * 0.7;
        if (speed > s.maxSpeed) engine = 0;
      }
      if (engine < 0 && speed < -12) engine = 0;
    }

    // Freno motor cuando no se acelera; aparcado sin conductor queda frenado
    const coast = engine === 0 ? (this.driver ? s.brakeImpulse * 0.06 : s.brakeImpulse * 0.7) : 0;

    // Reparto del motor (fuerza negativa = hacia +Z, verificado con cannon-es 0.20)
    const per = -engine / s.drivenWheels;
    const frontDriven = s.drive !== 'rwd';
    const rearDriven = s.drive !== 'fwd';
    v.applyEngineForce(frontDriven ? per : 0, 0);
    v.applyEngineForce(frontDriven ? per : 0, 1);
    v.applyEngineForce(rearDriven ? per : 0, 2);
    v.applyEngineForce(rearDriven ? per : 0, 3);

    const frontBrake = Math.max(brake, coast);
    v.setBrake(frontBrake, 0);
    v.setBrake(frontBrake, 1);

    // Freno de mano: bloquea las traseras y reduce su agarre -> sobreviraje / derrape
    const wr = v.wheelInfos;
    const targetRearGrip = inp.handbrake ? s.gripRear * s.drift : s.gripRear;
    const gripLerp = 1 - Math.exp(-dt * (inp.handbrake ? 12 : 2.5));
    wr[2].frictionSlip += (targetRearGrip - wr[2].frictionSlip) * gripLerp;
    wr[3].frictionSlip = wr[2].frictionSlip;
    const rearBrake = inp.handbrake ? s.handbrakeImpulse : Math.max(brake, coast);
    v.setBrake(rearBrake, 2);
    v.setBrake(rearBrake, 3);
    // Con el freno de mano la tracción trasera no empuja (en los 4x4 empuja el eje delantero)
    if (inp.handbrake) {
      v.applyEngineForce(0, 2);
      v.applyEngineForce(0, 3);
    }

    // Dirección sensible a la velocidad y suavizada
    const speedFactor = 1 / (1 + absSpeed * 0.045);
    const targetSteer = inp.steer * s.maxSteer * speedFactor;
    const steerRate = inp.steer === 0 ? 5 : 3.2;
    this.steerValue += THREE.MathUtils.clamp(targetSteer - this.steerValue, -steerRate * dt, steerRate * dt);
    v.setSteeringValue(this.steerValue, 0);
    v.setSteeringValue(this.steerValue, 1);

    const body = this.chassisBody;
    const vel = body.velocity;
    const vmag = vel.length();

    // Resistencia aerodinámica (F = -c·v·|v|) y carga aerodinámica
    // OJO: el 2.º argumento de applyForce es un punto RELATIVO al centro de masas.
    // Pasar body.position (coordenadas de mundo) creaba un par enorme que clavaba el morro.
    if (vmag > 0.1) body.applyForce(_v.set(-vel.x * vmag * s.dragCoef, 0, -vel.z * vmag * s.dragCoef), _zero);
    body.applyForce(_v.set(0, -vmag * vmag * s.mass * 0.0005, 0), _zero);

    this.stabilize(dt);

    // Detección de derrape: ruedas traseras deslizando con velocidad lateral notable
    this.getForward(_fwd);
    _right.set(-_fwd.z, 0, _fwd.x);
    const lateral = Math.abs(vel.dot(_right));
    this.drifting = (wr[2].sliding || wr[3].sliding) && lateral > 3 && absSpeed > 5;

    if (this.drifting && Math.random() < 0.6) {
      for (const i of [2, 3]) {
        const hp = wr[i].raycastResult.hitPointWorld;
        this.game.effects.spawnSmoke(new THREE.Vector3(hp.x, hp.y + 0.3, hp.z), new THREE.Vector3(0, 0.6, 0), 0.9);
      }
    }

    // Luces
    const braking = brake > 0 || inp.handbrake;
    this.tailMat.emissiveIntensity = braking ? 2.5 : 0.4;
    this.reverseMat.emissiveIntensity = engine < 0 ? 2 : 0;
    this.headMat.emissiveIntensity = 0.4 + this.game.env.night * 2.5;

    if (this.sirenRed) {
      this.sirenTime += dt;
      const phase = Math.floor(this.sirenTime * 6) % 2;
      this.sirenRed.emissiveIntensity = this.sirenOn && phase === 0 ? 4 : 0;
      this.sirenBlue.emissiveIntensity = this.sirenOn && phase === 1 ? 4 : 0;
    }

    if (this.destroyed && Math.random() < 0.25) {
      const p = body.position;
      this.game.effects.spawnSmoke(new THREE.Vector3(p.x, p.y + 1.2, p.z), new THREE.Vector3(0, 1.5, 0), 1.3, true);
    } else if (!this.destroyed && this.health < this.maxHealth * 0.3 && Math.random() < 0.15) {
      const p = body.position;
      const f = this.getForward();
      this.game.effects.spawnSmoke(new THREE.Vector3(p.x + f.x * this.spec.body.l, p.y + 1, p.z + f.z * this.spec.body.l), new THREE.Vector3(0, 1.2, 0), 0.7);
    }
  }

  /**
   * Ayudas "arcade" (sólo con las ruedas en el suelo):
   *  - amortigua el balanceo y el cabeceo para que no vuelque en curvas
   *  - par que endereza el coche si se inclina
   *  - sin dirección ni freno de mano, frena el giro sobre sí mismo para salir limpio de un derrape
   * Si el coche está en el aire o muy inclinado (choque fuerte), no actúa: la física manda.
   */
  stabilize(dt) {
    const body = this.chassisBody;
    const q = body.quaternion;
    const up = q.vmult(_v.set(0, 1, 0), _up);
    if (up.y < 0.55 || this.groundedWheels() < 2) return;

    const fwd = q.vmult(_v2.set(0, 0, 1), _fwd);
    const right = q.vmult(_v.set(1, 0, 0), _right);
    const w = body.angularVelocity;
    const roll = w.dot(fwd);
    const pitch = w.dot(right);
    const kr = Math.min(1, 6 * dt);
    const kp = Math.min(1, 3 * dt);
    w.x -= fwd.x * roll * kr + right.x * pitch * kp;
    w.y -= fwd.y * roll * kr + right.y * pitch * kp;
    w.z -= fwd.z * roll * kr + right.z * pitch * kp;

    // Par corrector: eje = up × vertical
    const k = this.spec.mass * 30;
    body.torque.x += -up.z * k;
    body.torque.z += up.x * k;

    const inp = this.input;
    if (Math.abs(inp.steer) < 0.1 && !inp.handbrake) {
      const yaw = w.dot(up);
      const ky = Math.min(1, 1.6 * dt);
      w.x -= up.x * yaw * ky;
      w.y -= up.y * yaw * ky;
      w.z -= up.z * yaw * ky;
    }
  }

  onCollide(e) {
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (impact < 5) return;
    const other = e.body;
    this.damage((impact - 5) * 3);
    const otherVehicle = other.userData && other.userData.vehicle;
    if (this.driver === 'player' && otherVehicle && otherVehicle.type === 'police' && impact > 6) {
      this.game.wanted.reportCrime('attack_police');
    }
  }

  damage(amount) {
    if (this.destroyed) return;
    this.health -= amount;
    if (this.health <= 0) this.explode();
  }

  explode() {
    this.health = 0;
    this.destroyed = true;
    if (this.originalColor === undefined) this.originalColor = this.paintMat.color.getHex();
    this.paintMat.color.setHex(0x1b1b1b);
    const b = this.chassisBody;
    b.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 2000, b.mass * 6, (Math.random() - 0.5) * 2000), new CANNON.Vec3(0.3, 0, 0.5));
    const p = new THREE.Vector3(b.position.x, b.position.y + 1, b.position.z);
    if (this.game.explosion) this.game.explosion(p, 5, 45, this);
    else this.game.effects.muzzleFlash(p);
    if (this.game.onVehicleDestroyed) this.game.onVehicleDestroyed(this);
  }

  /** Copia el estado físico a las mallas de Three.js. */
  sync() {
    const b = this.chassisBody;
    this.mesh.position.set(b.position.x, b.position.y, b.position.z);
    this.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    for (let i = 0; i < this.wheelMeshes.length; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      this.wheelMeshes[i].position.set(t.position.x, t.position.y, t.position.z);
      this.wheelMeshes[i].quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    }
  }
}
