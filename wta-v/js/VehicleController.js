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

    this.paintMat = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.55, roughness: 0.35 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.4, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.9, roughness: 0.1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.2 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
    this.reverseMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffffff, emissiveIntensity: 0 });

    const add = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };

    const b = s.body;
    const W = b.w * 2;
    const L = b.l * 2;
    // Carrocería principal: de y = 0 (origen) hasta b.h
    add(W, b.h, L, this.paintMat, 0, b.h / 2, 0);

    if (s.cabin) {
      const c = s.cabin;
      const cabinW = W * (style === 'super' ? 0.8 : 0.84);
      add(cabinW, c.h, c.l, glassMat, 0, b.h + c.h / 2, c.z);
      // Techo pintado
      const roofMat = style === 'police' ? whiteMat : this.paintMat;
      add(cabinW - 0.06, 0.06, c.l - 0.25, roofMat, 0, b.h + c.h + 0.03, c.z - 0.05);
    }

    const front = L / 2 + 0.01;
    const lightY = b.h * 0.72;
    add(0.4, 0.13, 0.06, this.headMat, b.w - 0.28, lightY, front);
    add(0.4, 0.13, 0.06, this.headMat, -b.w + 0.28, lightY, front);
    add(0.4, 0.13, 0.06, this.tailMat, b.w - 0.28, lightY, -front);
    add(0.4, 0.13, 0.06, this.tailMat, -b.w + 0.28, lightY, -front);
    add(0.2, 0.09, 0.05, this.reverseMat, 0.25, lightY, -front - 0.01);
    add(W + 0.04, 0.16, 0.18, trimMat, 0, 0.12, L / 2);
    add(W + 0.04, 0.16, 0.18, trimMat, 0, 0.12, -L / 2);

    // Detalles por estilo
    switch (style) {
      case 'police':
        add(W + 0.02, 0.36, 1.9, whiteMat, 0, b.h * 0.55, -0.1);
        this.sirenRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff0000, emissiveIntensity: 0 });
        this.sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x0044ff, emissiveIntensity: 0 });
        add(0.55, 0.16, 0.3, this.sirenRed, 0.3, b.h + s.cabin.h + 0.14, -0.25);
        add(0.55, 0.16, 0.3, this.sirenBlue, -0.3, b.h + s.cabin.h + 0.14, -0.25);
        break;
      case 'taxi': {
        const signMat = new THREE.MeshStandardMaterial({ color: 0xfff59d, emissive: 0xffeb3b, emissiveIntensity: 0.4 });
        add(0.7, 0.2, 0.3, signMat, 0, b.h + s.cabin.h + 0.16, -0.25);
        add(W + 0.02, 0.1, L * 0.6, trimMat, 0, b.h * 0.5, 0); // franja a cuadros (simplificada)
        break;
      }
      case 'muscle':
        add(0.7, 0.14, 0.9, trimMat, 0, b.h + 0.07, 1.2); // toma de aire del capó
        add(0.28, 0.01, L + 0.01, whiteMat, 0.22, b.h + 0.005, 0); // franjas
        add(0.28, 0.01, L + 0.01, whiteMat, -0.22, b.h + 0.005, 0);
        add(0.12, 0.08, 0.5, chromeMat, 0.5, 0.12, -L / 2 - 0.1); // escapes
        break;
      case 'sport':
        add(W - 0.2, 0.06, 0.4, trimMat, 0, b.h + 0.35, -L / 2 + 0.25);
        add(0.08, 0.3, 0.08, trimMat, 0.6, b.h + 0.17, -L / 2 + 0.25);
        add(0.08, 0.3, 0.08, trimMat, -0.6, b.h + 0.17, -L / 2 + 0.25);
        break;
      case 'super':
        add(W + 0.1, 0.05, 0.5, trimMat, 0, b.h + 0.42, -L / 2 + 0.3);
        add(0.1, 0.4, 0.1, trimMat, 0.55, b.h + 0.2, -L / 2 + 0.3);
        add(0.1, 0.4, 0.1, trimMat, -0.55, b.h + 0.2, -L / 2 + 0.3);
        add(W + 0.06, 0.1, 0.5, trimMat, 0, 0.05, L / 2 - 0.1); // difusor/splitter
        break;
      case 'suv':
        add(W - 0.2, 0.06, s.cabin.l - 0.4, trimMat, 0, b.h + s.cabin.h + 0.1, s.cabin.z); // baca
        add(W + 0.1, 0.25, 0.25, chromeMat, 0, 0.35, L / 2 + 0.08); // defensa
        break;
      case 'pickup': {
        // Caja de carga abierta detrás de la cabina
        const bedZ = (s.cabin.z - s.cabin.l / 2 - L / 2) / 2;
        const bedL = s.cabin.z - s.cabin.l / 2 + L / 2;
        add(0.08, 0.35, bedL, this.paintMat, b.w - 0.04, b.h + 0.17, bedZ);
        add(0.08, 0.35, bedL, this.paintMat, -b.w + 0.04, b.h + 0.17, bedZ);
        add(W, 0.35, 0.08, this.paintMat, 0, b.h + 0.17, -L / 2 + 0.04);
        add(W + 0.1, 0.22, 0.25, chromeMat, 0, 0.3, L / 2 + 0.08);
        break;
      }
      case 'van':
        add(W - 0.1, 0.5, 0.05, glassMat, 0, b.h * 0.72, L / 2 + 0.01); // parabrisas
        add(0.05, 0.4, 0.8, glassMat, b.w + 0.01, b.h * 0.72, L / 2 - 0.55);
        add(0.05, 0.4, 0.8, glassMat, -b.w - 0.01, b.h * 0.72, L / 2 - 0.55);
        break;
      case 'hatch':
        break;
      default:
        break;
    }

    // Ruedas: mallas independientes posicionadas con worldTransform
    const w = s.wheel;
    const wheelGeo = new THREE.CylinderGeometry(w.r, w.r, w.r * 0.8, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const rimGeo = new THREE.CylinderGeometry(w.r * 0.58, w.r * 0.58, w.r * 0.84, 8);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = style === 'super' || style === 'sport' ? new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 }) : chromeMat;
    this.wheelMeshes = [0, 1, 2, 3].map(() => {
      const wm = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      wm.add(tire, new THREE.Mesh(rimGeo, rimMat));
      wm.userData.vehicle = this;
      return wm;
    });

    this.mesh = group;
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
