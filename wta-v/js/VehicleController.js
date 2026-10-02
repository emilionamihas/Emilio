import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS, SURFACE_GRIP } from './Environment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
  // Motos: física de cuatro ruedas muy juntas (dos por eje) con la inclinación solo visual
  scooter: {
    label: 'Vespino', kind: 'Scooter', price: 1500, mass: 170, drive: 'rwd', power: 1000, maxSpeed: 36,
    brakeDecel: 9, handbrakeDecel: 4, maxSteer: 0.5, gripFront: 2.0, gripRear: 1.9, drift: 0.8,
    stiffness: 34, damping: [2.4, 4.2], health: 70,
    body: { w: 0.24, l: 0.85, h: 0.5 }, cabin: null,
    wheel: { r: 0.26, x: 0.2, zf: 0.62, zr: -0.58, rest: 0.22 },
    style: 'scooter', bike: true, colors: [0xef5350, 0x26a69a, 0xfdd835, 0xf5f5f5, 0x5c6bc0],
  },
  moto: {
    label: 'Rayo', kind: 'Moto deportiva', price: 12000, mass: 240, drive: 'rwd', power: 2600, maxSpeed: 64,
    brakeDecel: 11, handbrakeDecel: 4, maxSteer: 0.42, gripFront: 2.3, gripRear: 2.2, drift: 0.8,
    stiffness: 40, damping: [2.6, 4.4], health: 85,
    body: { w: 0.24, l: 1.0, h: 0.5 }, cabin: null,
    wheel: { r: 0.32, x: 0.2, zf: 0.74, zr: -0.72, rest: 0.24 },
    style: 'sportbike', bike: true, colors: [0xd50000, 0x111111, 0x1e88e5, 0x76ff03, 0xff6d00],
  },
  // Motocross: ligera, suspensión larga y blanda, tacos que agarran en tierra; control en el aire
  cross: {
    label: 'Barro', kind: 'Motocross', price: 6500, mass: 150, drive: 'rwd', power: 1500, maxSpeed: 36,
    brakeDecel: 10, handbrakeDecel: 4, maxSteer: 0.5, gripFront: 2.1, gripRear: 2.0, drift: 0.8,
    stiffness: 24, damping: [2.2, 3.4], health: 80,
    body: { w: 0.22, l: 0.95, h: 0.55 }, cabin: null,
    wheel: { r: 0.36, x: 0.18, zf: 0.8, zr: -0.72, rest: 0.42 },
    style: 'cross', bike: true, offroad: true, colors: [0xff6d00, 0x1e88e5, 0xfdd835, 0x43a047, 0xd50000],
  },
  // Avioneta: solo con el código WTAFLY. En tierra rueda con su tren; en el aire, vuelo arcade
  avioneta: {
    label: 'Gaviota', kind: 'Avioneta', price: 0, mass: 900, drive: 'rwd', power: 0, maxSpeed: 62,
    brakeDecel: 6, handbrakeDecel: 4, maxSteer: 0.4, gripFront: 1.6, gripRear: 1.7, drift: 1,
    stiffness: 30, damping: [2.4, 4.2], health: 130,
    body: { w: 0.6, l: 3.0, h: 1.1 }, cabin: null,
    wheel: { r: 0.3, x: 1.25, xf: 0.12, zf: 2.1, zr: -0.25, rest: 0.4 },
    style: 'plane', plane: true, thrust: 9000, flyMax: 62, colors: [0xf2f2f2, 0xc62828, 0x1565c0, 0xf9c80e],
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
const _q = new THREE.Quaternion();
const _bodyQ = new THREE.Quaternion();
const _v3 = new THREE.Vector3();
const _zAxis = new THREE.Vector3(0, 0, 1);
// Límites del mundo para la avioneta (los mismos muros que el mapa)
const WORLD_FLY = { minX: -530, maxX: 530, minZ: -545, maxZ: 560 };
const _pv1 = new CANNON.Vec3();
const _pv2 = new CANNON.Vec3();
const _pf = new CANNON.Vec3();
const _pl = new CANNON.Vec3();
const _pu = new CANNON.Vec3();

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

/** Materiales con barniz (clearcoat) para poder quitarlo en calidad media/baja. */
const COATED = new Set();
function coat(mat) {
  mat.userData.cc = mat.clearcoat;
  if (!VehicleController.CLEARCOAT) mat.clearcoat = 0;
  COATED.add(mat);
  return mat;
}

export class VehicleController {
  static CLEARCOAT = true;

  static setClearcoat(on) {
    if (VehicleController.CLEARCOAT === on) return;
    VehicleController.CLEARCOAT = on;
    for (const m of COATED) {
      m.clearcoat = on ? m.userData.cc : 0;
      m.needsUpdate = true;
    }
  }

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
      collisionFilterMask: GROUPS.STATIC | GROUPS.PLAYER | GROUPS.VEHICLE | GROUPS.TERRAIN,
      angularDamping: 0.4,
      linearDamping: 0.01,
    });
    // El origen del cuerpo es el centro de masas. Las cajas de colisión se colocan por encima,
    // así el centro de masas queda bajo (a la altura de los ejes) y el coche es estable.
    const b = s.body;
    if (s.plane) {
      // Fuselaje más corto y elevado: la cola no roza la pista al rotar para despegar
      chassis.addShape(new CANNON.Box(new CANNON.Vec3(b.w, b.h / 2, 2.4)), new CANNON.Vec3(0, b.h / 2 + 0.3, 0.4));
    } else chassis.addShape(new CANNON.Box(new CANNON.Vec3(b.w, b.h / 2, b.l)), new CANNON.Vec3(0, b.h / 2, 0));
    if (s.cabin) {
      chassis.addShape(
        new CANNON.Box(new CANNON.Vec3(b.w * 0.85, s.cabin.h / 2, s.cabin.l / 2)),
        new CANNON.Vec3(0, b.h + s.cabin.h / 2, s.cabin.z)
      );
    }
    chassis.allowSleep = false;
    chassis.userData = { vehicle: this };
    if (s.bike) {
      // Moto + piloto: más inercia de giro de la que da su caja de colisión, tan estrecha
      chassis.inertia.y *= 2.5;
      chassis.invInertia.y = 1 / chassis.inertia.y;
      chassis.updateInertiaWorld(true);
    }

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
      rollInfluence: s.bike ? 0 : 0.02, // en las motos la fuerza lateral no vuelca el chasis
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };
    // Orden: 0 del. izq., 1 del. der., 2 tras. izq., 3 tras. der. (+X local es la IZQUIERDA)
    const xf = w.xf ?? w.x;
    const positions = [
      [xf, w.zf],
      [-xf, w.zf],
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
    if (s.plane) {
      this.createPlaneMeshes(color);
      VehicleController.mergeByMaterial(this.mesh);
      return;
    }
    if (s.bike) {
      this.createBikeMeshes(color);
      VehicleController.mergeByMaterial(this.mesh, new Set([this.roofMesh]));
      return;
    }
    const group = new THREE.Group();
    group.userData.vehicle = this;
    const style = s.style;
    const paint = color ?? s.colors[Math.floor(Math.random() * s.colors.length)];

    // Pintura con capa de barniz: refleja el cielo (scene.environment)
    this.paintMat = coat(new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12 }));
    const whiteMat = coat(new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, metalness: 0.3, roughness: 0.3, clearcoat: 0.8 }));
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
    // Menos llamadas de dibujo: las piezas que comparten material se fusionan en una sola malla
    VehicleController.mergeByMaterial(group, new Set([this.roofMesh]));
    this.stripes = new THREE.Group();
    group.add(this.stripes);
  }

  /**
   * Fusiona los hijos directos de `group` que comparten material (una llamada de dibujo por material
   * en vez de una por pieza). Las mallas de `keep` se dejan sueltas (p. ej. el techo, que cambia de material).
   */
  static mergeByMaterial(group, keep = new Set()) {
    const buckets = new Map();
    for (const m of [...group.children]) {
      if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) continue;
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!buckets.has(m.material)) buckets.set(m.material, []);
      buckets.get(m.material).push(g);
      group.remove(m);
    }
    for (const [mat, geos] of buckets) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  /** Avioneta de ala alta: fuselaje, cabina, alas, cola, hélice, tren triciclo y luces de navegación. */
  createPlaneMeshes(color) {
    const s = this.spec;
    const group = new THREE.Group();
    group.userData.vehicle = this;
    const paint = color ?? s.colors[0];
    this.paintMat = coat(new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.4, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
    const accent = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0e1419, metalness: 0.9, roughness: 0.05, envMapIntensity: 1.4 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 1 });
    this.reverseMat = this.tailMat;
    this.navGreen = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x2bff5a, emissiveIntensity: 1 });
    const add = (geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      group.add(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
    const y0 = 0.1; // base del fuselaje sobre el origen del chasis
    // Fuselaje: perfil lateral extruido
    add(
      extrudeProfile(
        [[3.0, y0 + 0.55], [2.75, y0 + 0.25], [1.2, y0 + 0.05], [-1.5, y0 + 0.35], [-3.1, y0 + 0.75], [-3.3, y0 + 1.0], [-1.6, y0 + 1.1], [0.3, y0 + 1.35], [1.6, y0 + 1.25], [2.75, y0 + 0.95]],
        1.1,
        0.12
      ),
      this.paintMat
    );
    // Cabina acristalada
    add(extrudeProfile([[1.55, y0 + 1.22], [0.45, y0 + 1.75], [-0.6, y0 + 1.75], [-0.9, y0 + 1.3]], 1.0, 0.06), glass);
    // Alas (ala alta) con franja y puntas con luces de navegación
    box(9, 0.14, 1.5, this.paintMat, 0, y0 + 1.82, 0.1);
    box(9.02, 0.15, 0.25, accent, 0, y0 + 1.83, -0.45);
    box(0.12, 0.18, 0.3, this.tailMat, -4.5, y0 + 1.82, 0.1); // derecha (+X es la izquierda)
    box(0.12, 0.18, 0.3, this.navGreen, 4.5, y0 + 1.82, 0.1);
    for (const sx of [-1, 1]) box(0.06, 1.0, 0.08, SHARED.trim, sx * 1.6, y0 + 1.3, 0.3); // montantes
    // Cola
    box(3.2, 0.1, 0.9, this.paintMat, 0, y0 + 1.0, -3.0);
    box(0.1, 1.2, 1.0, this.paintMat, 0, y0 + 1.55, -3.05);
    box(0.11, 0.4, 0.6, accent, 0, y0 + 1.95, -3.2);
    // Capó del motor y buje
    box(0.95, 0.75, 0.6, SHARED.trim, 0, y0 + 0.6, 2.85);
    box(0.2, 0.15, 0.06, this.headMat, 0, y0 + 0.35, 3.18);
    // Hélice (gira según la potencia)
    this.prop = new THREE.Group();
    this.prop.position.set(0, y0 + 0.6, 3.2);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 0.05), SHARED.trim);
    const hub = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 10), SHARED.chrome);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.12;
    this.prop.add(blade, hub);
    group.add(this.prop);
    // Tren de aterrizaje
    const w = s.wheel;
    for (const sx of [-1, 1]) box(0.08, 0.5, 0.08, SHARED.trim, sx * w.x, 0.0, w.zr);
    box(0.08, 0.5, 0.08, SHARED.trim, 0, 0.0, w.zf);
    const wheelGeo = new THREE.CylinderGeometry(w.r, w.r, 0.16, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    this.wheelMeshes = [0, 1, 2, 3].map(() => {
      const wm = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, SHARED.tire);
      tire.castShadow = true;
      wm.add(tire);
      wm.userData.vehicle = this;
      return wm;
    });
    this.mesh = group;
    this.dims = { W: 1.1, L: 6.3, H: 1.3 };
    this.stripes = new THREE.Group();
    group.add(this.stripes);
    this.thr = 0;
    this.airborne = false;
    this.airTime = 0;
    this.airSpeed = 0;
  }

  /**
   * Avioneta.
   *  En tierra: el motor empuja (no las ruedas), la rueda de morro gira y la sustentación crece con
   *  la velocidad; con Espacio por encima de ~80 km/h levanta el morro y despega.
   *  En el aire: vuelo arcade. W/S potencia, A/D alabeo (gira inclinándose), Espacio sube, Shift baja.
   *  Por debajo de ~70 km/h entra en pérdida y pica. Aterrizar suave conserva el avión.
   */
  updatePlane(dt) {
    const s = this.spec;
    const v = this.vehicle;
    const inp = this.input;
    const body = this.chassisBody;
    const q = body.quaternion;
    const f = q.vmult(_pv1.set(0, 0, 1), _pf);
    const left = q.vmult(_pv1.set(1, 0, 0), _pl);
    const up = q.vmult(_pv1.set(0, 1, 0), _pu);
    const speed = this.getForwardSpeed();
    const grounded = this.groundedWheels() >= 2;
    const piloted = !this.destroyed && !!this.driver;
    if (piloted && inp.throttle) this.thr = Math.min(1, this.thr + dt * 0.7);
    if (piloted && inp.reverse) this.thr = Math.max(0, this.thr - dt * 0.9);
    if (!piloted) this.thr = Math.max(0, this.thr - dt * 0.5);
    this.prop.rotation.z += dt * (4 + this.thr * 55) * (this.destroyed ? 0 : 1);
    const night = this.game.env ? this.game.env.night : 0;
    this.headMat.emissiveIntensity = 0.4 + night * 2.5;
    const blink = Math.floor(performance.now() / 600) % 2;
    this.tailMat.emissiveIntensity = 1 + blink * 2;
    const mass = body.mass;
    const vel = body.velocity;

    if (!this.airborne) {
      // ---- En tierra ----
      const thrust = this.thr * s.thrust;
      body.applyForce(_pv2.set(f.x * thrust, f.y * thrust, f.z * thrust), _zero);
      const vmag = vel.length();
      const k = s.thrust / (s.flyMax * s.flyMax);
      if (vmag > 0.1) body.applyForce(_pv2.set(-vel.x * vmag * k, -vel.y * vmag * k, -vel.z * vmag * k), _zero);
      const braking = piloted && inp.reverse && this.thr === 0 && speed > 0.5;
      const brake = braking ? s.brakeImpulse : this.thr === 0 && !piloted ? s.brakeImpulse * 0.7 : this.thr === 0 ? s.brakeImpulse * 0.04 : 0;
      for (let i = 0; i < 4; i++) {
        v.setBrake(brake, i);
        v.applyEngineForce(0, i);
      }
      // frenos de pista + aerofrenos: de 110 km/h a parado en ~120 m
      if (braking && vmag > 0.5 && grounded) {
        const d = (mass * 4) / vmag;
        body.applyForce(_pv2.set(-vel.x * d, 0, -vel.z * d), _zero);
      }
      // marcha atrás lenta para maniobrar (S parado y sin potencia)
      if (piloted && inp.reverse && this.thr === 0 && speed < 0.5 && speed > -2.2) {
        v.applyEngineForce(1500, 2);
        v.applyEngineForce(1500, 3);
      }
      const steer = (inp.steer * s.maxSteer) / (1 + Math.abs(speed) * 0.08);
      this.steerValue += (steer - this.steerValue) * Math.min(1, dt * 6);
      v.setSteeringValue(this.steerValue, 0);
      v.setSteeringValue(this.steerValue, 1);
      // sustentación: a ~100 km/h supera el peso (antes con Espacio)
      // sin Espacio no llega a levantarla: así no rebota al aterrizar ni despega sola
      const liftK = Math.min(1.3, Math.max(0, (speed - 18) / 10)) * (piloted && inp.up ? 1 : 0.6);
      const lift = liftK * mass * 9.82;
      body.applyForce(_pv2.set(up.x * lift, up.y * lift, up.z * lift), _zero);
      // rotación de despegue (hasta ~7° de morro)
      const pitchNow = Math.asin(Math.max(-1, Math.min(1, f.y)));
      if (piloted && inp.up && speed > 22 && pitchNow < 0.12) {
        const w = body.angularVelocity;
        const pc = w.dot(left);
        const target = -0.35;
        w.x += left.x * (target - pc);
        w.y += left.y * (target - pc);
        w.z += left.z * (target - pc);
      }
      if (!grounded && speed > 18) {
        this.airTime += dt;
        if (this.airTime > 0.25) {
          this.airborne = true;
          this.airSpeed = speed;
          this.steerValue = 0;
          v.setSteeringValue(0, 0);
          v.setSteeringValue(0, 1);
        }
      } else this.airTime = 0;
      this.stabilize(dt);
      return;
    }

    // ---- En el aire (vuelo arcade) ----
    for (let i = 0; i < 4; i++) {
      v.setBrake(0, i);
      v.applyEngineForce(0, i);
    }
    const pitch = Math.asin(Math.max(-1, Math.min(1, f.y))); // morro arriba > 0
    const roll = Math.asin(Math.max(-1, Math.min(1, left.y))); // ala derecha abajo > 0
    const stallSpeed = 19;
    // En el aire empuja menos que en la carrera de despegue: crucero ~170 km/h, subida ~14 m/s
    const airAcc = 6;
    // en picado gana menos velocidad (resistencia del morro) y nunca pasa de ~250 km/h
    const sinP = Math.sin(pitch);
    let a = this.thr * airAcc - airAcc * (this.airSpeed / s.flyMax) ** 2 - 9.82 * sinP * (sinP < 0 ? 0.55 : 1);
    if (this.destroyed) a -= 6;
    this.airSpeed = Math.max(0, Math.min(s.flyMax * 1.1, this.airSpeed + a * dt));
    const stall = this.airSpeed < stallSpeed;
    const pitchIn = piloted ? (inp.up ? 1 : 0) - (inp.down ? 1 : 0) : 0;
    // sin tocar Espacio/Shift el morro vuelve solo a horizontal (también al girar)
    let pitchRate = pitchIn ? pitchIn * 0.9 : piloted ? -pitch * 0.9 : -0.3;
    if (stall) pitchRate -= 0.7;
    // Techo de vuelo
    if (body.position.y > 200) pitchRate = Math.min(pitchRate, 0);
    if (body.position.y > 220) pitchRate = Math.min(pitchRate, -0.3);
    if (pitch > 0.5 && pitchRate > 0) pitchRate = 0;
    if (pitch < -0.7 && pitchRate < 0) pitchRate = 0;
    // Aterrizaje asistido: cerca del suelo endereza el morro y limita la caída
    const p0 = body.position;
    const agl = p0.y - (this.game.env && this.game.env.groundHeight ? this.game.env.groundHeight(p0.x, p0.z, p0.y) : 0);
    const sink = Math.max(0, -vel.y);
    const nearGround = agl < 7 + sink * 1.2 && !(piloted && inp.up);
    if (nearGround && pitch < 0.04) pitchRate = Math.max(pitchRate, (0.04 - pitch) * 2.5);
    // flaps: cerca del suelo y con poca potencia frena hasta ~110 km/h para tomar tierra
    if (agl < 25 && this.thr < 0.4 && this.airSpeed > stallSpeed + 12) this.airSpeed -= 5 * dt;
    let steerIn = piloted ? inp.steer : 0;
    // Límite del mapa: cerca del borde gira sola hacia el centro
    const M = 160;
    const out = p0.x < WORLD_FLY.minX + M || p0.x > WORLD_FLY.maxX - M || p0.z < WORLD_FLY.minZ + M || p0.z > WORLD_FLY.maxZ - M;
    if (out) {
      const dx = -p0.x, dz = 40 - p0.z;
      const cross = f.z * dx - f.x * dz;
      const dot = f.x * dx + f.z * dz;
      steerIn = dot > 0 && Math.abs(cross) < 0.15 * Math.hypot(dx, dz) ? steerIn * 0.3 : Math.sign(cross || 1);
      if (piloted && this.driver === 'player' && !this.edgeWarned) {
        this.edgeWarned = true;
        this.game.hud.notify('Límite del mapa: la avioneta vuelve hacia la ciudad.', 2.5);
      }
    } else this.edgeWarned = false;
    const rollTarget = -steerIn * 0.85;
    const rollRate = (rollTarget - roll) * 2.5;
    const yawRate = -Math.sin(roll) * 1.15 * Math.min(1.2, Math.max(0.4, this.airSpeed / 30));
    const w = body.angularVelocity;
    w.set(left.x * -pitchRate + f.x * rollRate, left.y * -pitchRate + f.y * rollRate + yawRate, left.z * -pitchRate + f.z * rollRate);
    // Velocidad: hacia donde apunta el morro; en pérdida, cae
    let tx = f.x * this.airSpeed;
    let ty = f.y * this.airSpeed;
    let tz = f.z * this.airSpeed;
    if (stall) ty -= (stallSpeed - this.airSpeed) * 0.9;
    if (nearGround) ty = Math.max(-2.5, Math.min(ty, agl > 3 ? -2 : -1.2)); // se posa sola, sin flotar (Espacio para seguir rasante)
    const kv = Math.min(1, dt * 6);
    vel.y += 9.82 * dt * (stall ? 0.3 : 1); // compensa la gravedad del mundo
    vel.x += (tx - vel.x) * kv;
    vel.y += (ty - vel.y) * kv;
    vel.z += (tz - vel.z) * kv;
    // muro invisible por si acaso (no debería llegar con el giro automático)
    if (p0.x < WORLD_FLY.minX + 4 || p0.x > WORLD_FLY.maxX - 4) { p0.x = Math.max(WORLD_FLY.minX + 4, Math.min(WORLD_FLY.maxX - 4, p0.x)); vel.x = 0; }
    if (p0.z < WORLD_FLY.minZ + 4 || p0.z > WORLD_FLY.maxZ - 4) { p0.z = Math.max(WORLD_FLY.minZ + 4, Math.min(WORLD_FLY.maxZ - 4, p0.z)); vel.z = 0; }
    // Toma de contacto
    if (grounded) {
      const soft = vel.y > -6 && Math.abs(roll) < 0.4 && pitch > -0.35;
      this.airborne = false;
      this.airTime = 0;
      if (vel.y > 0) vel.y = 0;
      if (!soft) this.damage(60);
      else if (this.driver === 'player') this.game.hud.notify('Aterrizaje correcto.', 1.5);
    }
  }

  /** Moto: depósito, carenado, asiento, motor, horquilla, manillar y dos ruedas finas. */
  createBikeMeshes(color) {
    const s = this.spec;
    const group = new THREE.Group();
    group.userData.vehicle = this;
    const paint = color ?? s.colors[Math.floor(Math.random() * s.colors.length)];
    this.paintMat = coat(new THREE.MeshPhysicalMaterial({ color: paint, metalness: 0.55, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 }));
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6, roughness: 0.1 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4, roughness: 0.2 });
    this.reverseMat = this.tailMat;
    const trim = SHARED.trim;
    const chrome = SHARED.chrome;
    const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      group.add(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z, rx = 0) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx);
    const cyl = (r, len, mat, x, y, z, rx) => add(new THREE.CylinderGeometry(r, r, len, 10), mat, x, y, z, rx);
    const w = s.wheel;
    const axleY = s.connY - w.rest * 0.55; // altura aproximada del eje en reposo (local del chasis)
    const fz = w.zf;
    const rz = w.zr;
    if (s.style === 'cross') {
      // Cross: guardabarros altos, placa portanúmeros, asiento largo y plano, cuadro fino y motor visto
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
      add(extrudeProfile([[fz + 0.38, axleY + 0.5], [fz + 0.1, axleY + 0.47], [fz - 0.15, axleY + 0.55], [fz - 0.1, axleY + 0.6], [fz + 0.4, axleY + 0.56]], 0.16, 0.02), this.paintMat); // guardabarros delantero
      add(extrudeProfile([[fz - 0.2, axleY + 0.95], [fz - 0.12, axleY + 0.55], [fz - 0.3, axleY + 0.52], [fz - 0.38, axleY + 0.92]], 0.3, 0.03), white); // placa delantera
      add(extrudeProfile([[fz - 0.35, axleY + 0.78], [fz - 0.42, axleY + 0.95], [-0.05, axleY + 0.92], [0.0, axleY + 0.72]], 0.32, 0.05), this.paintMat); // depósito y tapas
      add(extrudeProfile([[0.05, axleY + 0.93], [rz - 0.25, axleY + 1.0], [rz - 0.32, axleY + 0.92], [rz + 0.1, axleY + 0.8], [-0.05, axleY + 0.8]], 0.24, 0.04), white); // colín
      box(0.22, 0.07, 0.95, trim, 0, axleY + 0.99, (rz - 0.1) / 2 + 0.05); // asiento largo
      box(0.26, 0.3, 0.36, SHARED.grille, 0, axleY + 0.32, 0.08); // motor
      box(0.06, 0.06, 0.7, chrome, 0.13, axleY + 0.55, rz + 0.25, -0.35); // escape alto
      box(0.08, 0.08, 0.2, SHARED.trim, 0.13, axleY + 0.72, rz - 0.08, -0.35);
      box(0.06, 0.05, 0.85, trim, 0, axleY + 0.18, rz / 2); // basculante
      box(0.04, 0.5, 0.04, trim, 0, axleY + 0.55, -0.05); // tubo del cuadro
      box(0.78, 0.03, 0.03, trim, 0, axleY + 1.08, fz - 0.33); // manillar ancho
      for (const sx of [-0.36, 0.36]) box(0.05, 0.05, 0.12, SHARED.trim, sx, axleY + 1.08, fz - 0.33); // puños
      box(0.1, 0.06, 0.03, this.headMat, 0, axleY + 0.78, fz - 0.17);
      box(0.08, 0.04, 0.03, this.tailMat, 0, axleY + 0.92, rz - 0.3);
      this.seat = { y: axleY + 0.98, z: rz + 0.45 };
    } else if (s.style === 'scooter') {
      // Plataforma, escudo delantero y carrocería trasera redondeada
      box(0.34, 0.08, 0.7, trim, 0, axleY + 0.05, 0.02);
      add(extrudeProfile([[fz - 0.12, axleY + 0.05], [fz + 0.02, axleY + 0.1], [fz - 0.05, axleY + 0.85], [fz - 0.2, axleY + 0.85], [fz - 0.25, axleY + 0.1]], 0.36, 0.04), this.paintMat);
      add(extrudeProfile([[-0.15, axleY + 0.1], [rz - 0.12, axleY + 0.1], [rz - 0.2, axleY + 0.42], [rz + 0.05, axleY + 0.6], [-0.1, axleY + 0.55]], 0.38, 0.06), this.paintMat);
      box(0.28, 0.08, 0.55, trim, 0, axleY + 0.64, rz + 0.4); // asiento
      cyl(0.022, 0.62, chrome, 0, axleY + 0.95, fz - 0.14, 0).rotation.z = Math.PI / 2; // manillar
      cyl(0.03, 0.5, chrome, 0, axleY + 0.62, fz - 0.1, -0.25); // columna
      box(0.16, 0.1, 0.05, this.headMat, 0, axleY + 0.78, fz - 0.02);
      box(0.14, 0.05, 0.04, this.tailMat, 0, axleY + 0.5, rz - 0.19);
      box(0.08, 0.08, 0.35, chrome, 0.12, axleY - 0.05, rz + 0.15); // escape
      this.seat = { y: axleY + 0.7, z: rz + 0.45 };
    } else {
      // Deportiva: carenado, depósito, colín y motor visto
      add(extrudeProfile([[fz - 0.1, axleY + 0.2], [fz + 0.05, axleY + 0.35], [fz - 0.05, axleY + 0.8], [fz - 0.35, axleY + 0.95], [fz - 0.45, axleY + 0.55], [fz - 0.3, axleY + 0.2]], 0.42, 0.05), this.paintMat);
      add(extrudeProfile([[fz - 0.4, axleY + 0.6], [fz - 0.42, axleY + 0.85], [-0.05, axleY + 0.82], [0.05, axleY + 0.55]], 0.36, 0.06), this.paintMat); // depósito
      add(extrudeProfile([[-0.1, axleY + 0.62], [rz - 0.15, axleY + 0.9], [rz - 0.05, axleY + 0.78], [-0.2, axleY + 0.5]], 0.26, 0.04), this.paintMat); // colín
      box(0.26, 0.07, 0.42, trim, 0, axleY + 0.76, rz + 0.5); // asiento
      box(0.3, 0.32, 0.45, SHARED.grille, 0, axleY + 0.2, 0.05); // motor
      box(0.06, 0.06, 0.8, chrome, 0.15, axleY + 0.05, rz + 0.1); // escape
      box(0.1, 0.1, 0.18, chrome, 0.15, axleY + 0.12, rz - 0.3);
      box(0.08, 0.05, 0.9, trim, 0, axleY + 0.25, (rz + 0) / 2); // basculante
      box(0.62, 0.03, 0.03, chrome, 0, axleY + 0.9, fz - 0.42); // manillar
      box(0.2, 0.08, 0.04, this.headMat, 0, axleY + 0.62, fz + 0.06);
      box(0.12, 0.05, 0.04, this.tailMat, 0, axleY + 0.82, rz - 0.18);
      box(0.3, 0.18, 0.02, new THREE.MeshStandardMaterial({ color: 0x0e1419, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.7 }), 0, axleY + 0.98, fz - 0.33, -0.5); // cúpula
      this.seat = { y: axleY + 0.8, z: rz + 0.52 };
    }
    // Horquilla delantera (más larga en la de cross)
    const forkL = s.style === 'cross' ? 1.05 : 0.8;
    for (const x of [-0.09, 0.09]) cyl(s.style === 'cross' ? 0.032 : 0.025, forkL, chrome, x, axleY + forkL / 2 - 0.02, fz - 0.14, -0.3);

    // Ruedas: dos visibles (cada una representa a un par de ruedas físicas)
    let wheelGeo;
    if (s.style === 'cross') {
      // Tacos: radio alterno en el perímetro y rueda más estrecha
      wheelGeo = new THREE.CylinderGeometry(w.r, w.r, 0.11, 32, 1);
      const wp = wheelGeo.attributes.position;
      for (let i = 0; i < wp.count; i++) {
        const x = wp.getX(i);
        const z = wp.getZ(i);
        const r = Math.hypot(x, z);
        if (r < w.r * 0.9) continue;
        const a = Math.atan2(z, x);
        const k = Math.round((a / (Math.PI * 2)) * 32) % 2 ? 0.94 : 1;
        wp.setXYZ(i, (x / r) * w.r * k, wp.getY(i), (z / r) * w.r * k);
      }
      wheelGeo.computeVertexNormals();
    } else wheelGeo = new THREE.CylinderGeometry(w.r, w.r, 0.13, 22);
    wheelGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(w.r * 0.66, w.r * 0.66, 0.14, 18);
    rimGeo.rotateZ(Math.PI / 2);
    const rimCap = s.style === 'sportbike' ? SHARED.rimDark : SHARED.rim;
    this.wheelMeshes = [0, 1].map(() => {
      const wm = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, SHARED.tire);
      tire.castShadow = true;
      wm.add(tire, new THREE.Mesh(rimGeo, [SHARED.rimSide, rimCap, rimCap]));
      wm.userData.vehicle = this;
      return wm;
    });
    this.mesh = group;
    this.dims = { W: 0.4, L: s.body.l * 2, H: s.body.h };
    this.stripes = new THREE.Group();
    group.add(this.stripes);
    this.lean = 0;
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
    m.userData.cc = finish[2];
    m.clearcoat = VehicleController.CLEARCOAT ? finish[2] : 0;
    this.originalColor = m.color.getHex();

    // Dibujo: se reconstruye cada vez (las motos solo cambian pintura y acabado)
    for (const c of [...this.stripes.children]) this.stripes.remove(c);
    if (this.spec.bike || this.spec.plane) return;
    if (this.roofMesh) this.roofMesh.material = m;
    const second = coat(new THREE.MeshPhysicalMaterial({ color: car.color2 ?? 0x111111, metalness: finish[0], roughness: finish[1], clearcoat: finish[2] }));
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
    // apoyado sobre el terreno (montaña, isla) o el suelo plano
    const ground = this.game.env && this.game.env.groundHeight ? this.game.env.groundHeight(x, z, b.position.y) : 0;
    b.position.set(x, ground + w.r + w.rest - this.spec.connY + 0.05, z);
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
    // avioneta: Espacio sube, Shift baja
    out.up = input.isDown('Space');
    out.down = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
  }

  update(dt) {
    if (!this.inWorld) return;
    // Colisión de la carrocería con el terreno (cuestas, circuito): cara en cannon (prisma contra
    // cada celda). Los coches de la IA rodando con las 4 ruedas en el suelo solo necesitan los rayos
    // de las ruedas; en cuanto saltan, vuelcan, chocan o los lleva el jugador, se activa.
    const terrain = this.driver === 'player' || this.destroyed || !this.driver || this.groundedWheels() < 4 || this.health < this.maxHealth;
    const mask = GROUPS.STATIC | GROUPS.PLAYER | GROUPS.VEHICLE | (terrain ? GROUPS.TERRAIN : 0);
    if (this.chassisBody.collisionFilterMask !== mask) this.chassisBody.collisionFilterMask = mask;
    if (this.spec.plane) {
      this.updatePlane(dt);
      return;
    }
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

    // Superficie (solo para el coche del jugador): tierra, arena, grava o hierba agarran menos
    const wr = v.wheelInfos;
    let grip = 1;
    if (this.driver === 'player' && this.game.env && this.game.env.surfaceAt) {
      const p = this.chassisBody.position;
      this.surface = this.game.env.surfaceAt(p.x, p.z, p.y);
      grip = this.surface ? SURFACE_GRIP[this.surface] : 1;
      // La moto de cross apenas pierde agarre fuera del asfalto (neumáticos de tacos)
      if (s.offroad) grip = 1 - (1 - grip) * 0.2;
      if (this.surface && absSpeed > 6 && this.surface !== 'hierba' && Math.random() < 0.35) {
        const hp = wr[2 + Math.floor(Math.random() * 2)].raycastResult.hitPointWorld;
        this.game.effects.spawnSmoke(new THREE.Vector3(hp.x, hp.y + 0.3, hp.z), new THREE.Vector3(0, 0.8, 0), 0.8);
      }
    } else this.surface = null;
    wr[0].frictionSlip = wr[1].frictionSlip = s.gripFront * grip;
    // Freno de mano: bloquea las traseras y reduce su agarre -> sobreviraje / derrape
    const targetRearGrip = (inp.handbrake ? s.gripRear * s.drift : s.gripRear) * grip;
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
    const grounded = this.groundedWheels();
    if (grounded === 0) this.airT = (this.airT || 0) + dt;
    else this.airT = 0;
    if (grounded === 0 && this.airT > 0.12 && up.y > 0.2 && !this.spec.plane) {
      this.airControl(dt);
      return;
    }
    if (up.y < 0.55 || grounded < 2) return;

    const fwd = q.vmult(_v2.set(0, 0, 1), _fwd);
    const right = q.vmult(_v.set(1, 0, 0), _right);
    const w = body.angularVelocity;
    const roll = w.dot(fwd);
    const pitch = w.dot(right);
    const bike = this.spec.bike ? 3 : 1;
    const kr = Math.min(1, 6 * bike * dt);
    const kp = this.spec.plane ? 0 : Math.min(1, 3 * dt);
    w.x -= fwd.x * roll * kr + right.x * pitch * kp;
    w.y -= fwd.y * roll * kr + right.y * pitch * kp;
    w.z -= fwd.z * roll * kr + right.z * pitch * kp;

    // Par corrector: eje = up × vertical, solo la componente de balanceo (alrededor del eje
    // longitudinal). Así no lucha contra el cabeceo en las cuestas de la montaña.
    const k = this.spec.mass * 30 * bike;
    const along = -up.z * k * fwd.x + up.x * k * fwd.z;
    body.torque.x += fwd.x * along;
    body.torque.y += fwd.y * along;
    body.torque.z += fwd.z * along;

    const inp = this.input;
    if (Math.abs(inp.steer) < 0.1 && !inp.handbrake) {
      const yaw = w.dot(up);
      const ky = Math.min(1, 1.6 * dt);
      w.x -= up.x * yaw * ky;
      w.y -= up.y * yaw * ky;
      w.z -= up.z * yaw * ky;
    }
  }

  /**
   * En el aire (saltos): las motos se mantienen derechas y orientan el morro hacia la trayectoria
   * para caer sobre las ruedas; W baja el morro y S lo sube. Los coches solo amortiguan el giro
   * para no dar vueltas de campana en un cambio de rasante.
   */
  airControl(dt) {
    const body = this.chassisBody;
    const q = body.quaternion;
    const w = body.angularVelocity;
    const fwd = q.vmult(_v2.set(0, 0, 1), _fwd);
    const left = q.vmult(_v.set(1, 0, 0), _right);
    if (!this.spec.bike) {
      const k = Math.min(1, 1.5 * dt);
      const roll = w.dot(fwd);
      w.x -= fwd.x * roll * k;
      w.y -= fwd.y * roll * k;
      w.z -= fwd.z * roll * k;
      return;
    }
    const vel = body.velocity;
    const hs = Math.hypot(vel.x, vel.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    const roll = Math.asin(Math.max(-1, Math.min(1, left.y)));
    // Morro según la trayectoria (un poco arriba), limitado; el piloto lo corrige con W/S
    const path = hs > 2 ? Math.atan2(vel.y, hs) : 0;
    const inp = this.input;
    const lean = this.driver === 'player' ? (inp.reverse ? 0.35 : 0) - (inp.throttle ? 0.35 : 0) : 0;
    const target = Math.max(-0.6, Math.min(0.5, path * 0.85 + 0.05 + lean));
    const pitchRate = Math.max(-2.5, Math.min(2.5, (target - pitch) * 4));
    const rollRate = -roll * 5;
    const yaw = w.dot(_v.set(0, 1, 0));
    // velocidad angular = cabeceo (eje izquierdo) + balanceo (eje longitudinal) + guiñada que ya tenía (amortiguada)
    w.set(left.x * -pitchRate + fwd.x * rollRate, left.y * -pitchRate + fwd.y * rollRate + yaw * (1 - Math.min(1, dt * 2)), left.z * -pitchRate + fwd.z * rollRate);
  }

  onCollide(e) {
    const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const other = e.body;
    // Caer de un salto contra el suelo (contacto casi vertical con algo estático) duele menos que
    // chocar contra una pared; las motos de cross están hechas para eso
    const ground = other.mass === 0 && Math.abs(e.contact.ni.y) > 0.7;
    const limit = ground ? (this.spec.offroad ? 13 : 9) : 5;
    if (impact < limit) return;
    this.damage((impact - limit) * 3);
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

  /**
   * Moto: se inclina hacia el lado del giro según la velocidad (solo visual), las dos ruedas
   * se colocan en el centro de cada par físico y el piloto va sentado encima.
   */
  syncBike() {
    const speed = Math.abs(this.getForwardSpeed());
    const target = -(this.steerValue / this.spec.maxSteer) * Math.min(1, speed / 12) * 0.55;
    this.lean += (target - this.lean) * 0.15;
    _q.setFromAxisAngle(_zAxis, this.lean);
    this.mesh.quaternion.multiply(_q);
    for (let k = 0; k < 2; k++) {
      const a = k * 2;
      this.vehicle.updateWheelTransform(a);
      this.vehicle.updateWheelTransform(a + 1);
      const t0 = this.vehicle.wheelInfos[a].worldTransform;
      const t1 = this.vehicle.wheelInfos[a + 1].worldTransform;
      const wm = this.wheelMeshes[k];
      wm.position.set((t0.position.x + t1.position.x) / 2, (t0.position.y + t1.position.y) / 2, (t0.position.z + t1.position.z) / 2);
      wm.quaternion.set(t0.quaternion.x, t0.quaternion.y, t0.quaternion.z, t0.quaternion.w);
      // la rueda se inclina con la moto alrededor del eje longitudinal
      _q.setFromAxisAngle(_v3.set(0, 0, 1).applyQuaternion(_bodyQ.set(this.chassisBody.quaternion.x, this.chassisBody.quaternion.y, this.chassisBody.quaternion.z, this.chassisBody.quaternion.w)), this.lean);
      wm.quaternion.premultiply(_q);
      // bajar la rueda lo que se inclina para que siga tocando el suelo
      wm.position.y -= (1 - Math.cos(this.lean)) * this.spec.wheel.r;
    }
    if (this.rider) {
      const seat = this.seat;
      const m = this.rider.mesh;
      _v3.set(0, seat.y - 0.95, seat.z - 0.08).applyQuaternion(this.mesh.quaternion);
      m.position.set(this.mesh.position.x + _v3.x, this.mesh.position.y + _v3.y, this.mesh.position.z + _v3.z);
      m.quaternion.copy(this.mesh.quaternion);
      this.rider.model.animate(1 / 60, { pose: 'ride' });
    }
  }

  /** Copia el estado físico a las mallas de Three.js. */
  sync() {
    const b = this.chassisBody;
    this.mesh.position.set(b.position.x, b.position.y, b.position.z);
    this.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    if (this.spec.bike) {
      this.syncBike();
      return;
    }
    for (let i = 0; i < this.wheelMeshes.length; i++) {
      this.vehicle.updateWheelTransform(i);
      const t = this.vehicle.wheelInfos[i].worldTransform;
      this.wheelMeshes[i].position.set(t.position.x, t.position.y, t.position.z);
      this.wheelMeshes[i].quaternion.set(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w);
    }
  }
}
