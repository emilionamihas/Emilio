import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS } from './Environment.js';

/**
 * Parámetros de conducción por tipo de vehículo.
 * Las fuerzas de freno de cannon-es son IMPULSOS por paso de simulación y por rueda,
 * por eso escalan con la masa (≈ masa · deceleración / 60 / 4).
 */
const SPECS = {
  civil: {
    mass: 1100,
    engineForce: 2600,     // N por rueda motriz (tracción trasera)
    maxSpeed: 42,          // m/s (~150 km/h)
    maxReverse: 9,
    brakeImpulse: 45,
    handbrakeImpulse: 35,  // bloquea las traseras sin frenar en seco
    maxSteer: 0.55,        // rad
    gripFront: 1.9,
    gripRear: 1.8,
    driftRearFactor: 0.7,  // grip trasero con freno de mano (ajustado probando: 0.45 = trompo)
    suspensionStiffness: 32,
    damping: [2.4, 4.2],   // [relajación, compresión]
  },
  sport: {
    mass: 1000,
    engineForce: 3900,
    maxSpeed: 58,
    maxReverse: 10,
    brakeImpulse: 50,
    handbrakeImpulse: 32,
    maxSteer: 0.5,
    gripFront: 2.2,
    gripRear: 2.0,
    driftRearFactor: 0.65,
    suspensionStiffness: 40,
    damping: [2.8, 4.6],
  },
  police: {
    mass: 1250,
    engineForce: 3900,
    maxSpeed: 52,
    maxReverse: 11,
    brakeImpulse: 55,
    handbrakeImpulse: 40,
    maxSteer: 0.55,
    gripFront: 2.1,
    gripRear: 2.0,
    driftRearFactor: 0.7,
    suspensionStiffness: 36,
    damping: [2.6, 4.4],
  },
};

const CIVIL_COLORS = [0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32, 0xeeeeee, 0x212121, 0x6a1b9a, 0x546e7a, 0xef6c00];

const WHEEL_RADIUS = 0.38;
const WHEEL_POSITIONS = [
  // [x, z] en espacio local. +Z es adelante y +X es la IZQUIERDA del coche.
  [0.82, 1.32],   // 0 delantera izquierda
  [-0.82, 1.32],  // 1 delantera derecha
  [0.82, -1.3],   // 2 trasera izquierda
  [-0.82, -1.3],  // 3 trasera derecha
];

const _v = new CANNON.Vec3();
const _fwd = new CANNON.Vec3();
const _up = new CANNON.Vec3();
const _right = new CANNON.Vec3();

export class VehicleController {
  constructor(game, { type = 'civil', color, position = new THREE.Vector3(), heading = 0 } = {}) {
    this.game = game;
    this.type = type;
    this.spec = SPECS[type];
    this.driver = null;        // null | 'player' | 'ai' | 'police'
    this.playerOwned = false;  // tras robarlo ya no vuelve a contar como delito
    this.health = 100;
    this.destroyed = false;
    this.inWorld = false;
    this.drifting = false;
    this.sirenOn = false;
    this.sirenTime = 0;

    // Entrada abstracta: la escriben el jugador, el tráfico o la policía.
    this.input = { throttle: 0, reverse: 0, steer: 0, handbrake: false };
    this.steerValue = 0;

    this.createPhysics();
    this.createMeshes(color);
    this.place(position.x, position.z, heading);
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
      angularDamping: 0.45,
      linearDamping: 0.01,
    });
    // La caja se desplaza hacia arriba respecto al origen del cuerpo:
    // así el centro de masas queda bajo y el coche vuelca menos.
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.9, 0.35, 2.15)), new CANNON.Vec3(0, 0.38, 0));
    chassis.addShape(new CANNON.Box(new CANNON.Vec3(0.75, 0.28, 1.05)), new CANNON.Vec3(0, 1.0, -0.2));
    chassis.allowSleep = false;
    chassis.userData = { vehicle: this };

    const vehicle = new CANNON.RaycastVehicle({
      chassisBody: chassis,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const base = {
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      suspensionStiffness: s.suspensionStiffness,
      suspensionRestLength: 0.35,
      maxSuspensionTravel: 0.3,
      maxSuspensionForce: 1e6,
      dampingRelaxation: s.damping[0],
      dampingCompression: s.damping[1],
      rollInfluence: 0.02,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };
    WHEEL_POSITIONS.forEach(([x, z], i) => {
      vehicle.addWheel({
        ...base,
        frictionSlip: i < 2 ? s.gripFront : s.gripRear,
        chassisConnectionPointLocal: new CANNON.Vec3(x, 0.08, z),
      });
    });

    chassis.addEventListener('collide', (e) => this.onCollide(e));

    this.chassisBody = chassis;
    this.vehicle = vehicle;
  }

  createMeshes(color) {
    const group = new THREE.Group();
    group.userData.vehicle = this;
    const isPolice = this.type === 'police';
    const paint = isPolice ? 0x111111 : color ?? CIVIL_COLORS[Math.floor(Math.random() * CIVIL_COLORS.length)];

    this.paintMat = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.55, roughness: 0.35 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 0.4, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.9, roughness: 0.1 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
    this.reverseMat = new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffffff, emissiveIntensity: 0 });

    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };

    const sport = this.type === 'sport';
    const bodyH = sport ? 0.55 : 0.62;
    add(new THREE.BoxGeometry(1.84, bodyH, 4.35), this.paintMat, 0, 0.38 + bodyH / 2 - 0.08, 0);
    if (isPolice) {
      // Puertas blancas estilo patrulla
      add(new THREE.BoxGeometry(1.86, 0.4, 1.9), whiteMat, 0, 0.6, -0.1);
    }
    const cabinH = sport ? 0.42 : 0.55;
    add(new THREE.BoxGeometry(1.52, cabinH, sport ? 1.8 : 2.1), glassMat, 0, 0.38 + bodyH - 0.08 + cabinH / 2, -0.25);
    add(new THREE.BoxGeometry(1.46, 0.06, sport ? 1.6 : 1.9), isPolice ? whiteMat : this.paintMat, 0, 0.38 + bodyH - 0.08 + cabinH + 0.03, -0.25);
    add(new THREE.BoxGeometry(1.9, 0.18, 0.2), trimMat, 0, 0.42, 2.18);
    add(new THREE.BoxGeometry(1.9, 0.18, 0.2), trimMat, 0, 0.42, -2.18);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.06), this.headMat, 0.62, 0.72, 2.18);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.06), this.headMat, -0.62, 0.72, 2.18);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.06), this.tailMat, 0.62, 0.72, -2.18);
    add(new THREE.BoxGeometry(0.42, 0.14, 0.06), this.tailMat, -0.62, 0.72, -2.18);
    add(new THREE.BoxGeometry(0.2, 0.1, 0.05), this.reverseMat, 0.25, 0.72, -2.19);
    if (sport) add(new THREE.BoxGeometry(1.7, 0.06, 0.35), trimMat, 0, 1.12, -2.0); // alerón

    if (isPolice) {
      this.sirenRed = new THREE.MeshStandardMaterial({ color: 0x440000, emissive: 0xff0000, emissiveIntensity: 0 });
      this.sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000044, emissive: 0x0044ff, emissiveIntensity: 0 });
      const roofY = 0.38 + bodyH - 0.08 + cabinH + 0.14;
      add(new THREE.BoxGeometry(0.55, 0.16, 0.3), this.sirenRed, 0.3, roofY, -0.2);
      add(new THREE.BoxGeometry(0.55, 0.16, 0.3), this.sirenBlue, -0.3, roofY, -0.2);
    }

    // Ruedas: mallas independientes posicionadas con worldTransform
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.32, 8);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, metalness: 0.8, roughness: 0.3 });
    this.wheelMeshes = WHEEL_POSITIONS.map(() => {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      w.add(tire, new THREE.Mesh(rimGeo, rimMat));
      w.userData.vehicle = this;
      return w;
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
    b.position.set(x, 0.75, z);
    b.quaternion.setFromEuler(0, heading, 0);
    b.velocity.setZero();
    b.angularVelocity.setZero();
    b.force.setZero();
    b.torque.setZero();
    this.steerValue = 0;
    this.input.throttle = this.input.reverse = this.input.steer = 0;
    this.input.handbrake = false;
    for (const w of this.vehicle.wheelInfos) {
      w.deltaRotation = 0;
      w.rotation = 0;
    }
    this.sync();
  }

  /** Recupera salud y pintura al reciclar el vehículo desde el pool. */
  repair() {
    this.health = 100;
    this.destroyed = false;
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

    let engine = 0;
    let brake = 0;

    if (!this.destroyed && this.driver) {
      // W: acelera (o frena si vamos marcha atrás). S: frena (o marcha atrás si estamos casi parados).
      if (inp.throttle > 0) {
        if (speed < -1) brake = s.brakeImpulse * inp.throttle;
        else engine = s.engineForce * inp.throttle;
      }
      if (inp.reverse > 0) {
        if (speed > 1) brake = Math.max(brake, s.brakeImpulse * inp.reverse);
        else engine = -s.engineForce * 0.6 * inp.reverse;
      }
      // Curva de par: menos empuje cerca de la velocidad máxima
      if (engine > 0) {
        const r = Math.min(1, Math.max(0, speed) / s.maxSpeed);
        engine *= 1 - r * r * 0.7;
        if (speed > s.maxSpeed) engine = 0;
      }
      if (engine < 0 && speed < -s.maxReverse) engine = 0;
    }

    // Freno motor / resistencia a la rodadura cuando no se acelera
    const coast = engine === 0 ? (this.driver ? 2.5 : 30) : 0;

    // Fuerza de motor negativa = hacia +Z (verificado con cannon-es 0.20)
    v.applyEngineForce(-engine, 2);
    v.applyEngineForce(-engine, 3);
    v.applyEngineForce(0, 0);
    v.applyEngineForce(0, 1);

    const frontBrake = Math.max(brake, coast);
    v.setBrake(frontBrake, 0);
    v.setBrake(frontBrake, 1);

    // Freno de mano: bloquea las traseras y reduce su agarre -> sobreviraje / derrape
    const wr = v.wheelInfos;
    const targetRearGrip = inp.handbrake ? s.gripRear * s.driftRearFactor : s.gripRear;
    const gripLerp = 1 - Math.exp(-dt * (inp.handbrake ? 12 : 2.5));
    wr[2].frictionSlip += (targetRearGrip - wr[2].frictionSlip) * gripLerp;
    wr[3].frictionSlip = wr[2].frictionSlip;
    const rearBrake = inp.handbrake ? s.handbrakeImpulse : Math.max(brake, coast);
    v.setBrake(rearBrake, 2);
    v.setBrake(rearBrake, 3);

    // Dirección sensible a la velocidad y suavizada
    const speedFactor = 1 / (1 + absSpeed * 0.045);
    const targetSteer = inp.steer * s.maxSteer * speedFactor;
    const steerRate = inp.steer === 0 ? 5 : 3.2;
    this.steerValue += THREE.MathUtils.clamp(targetSteer - this.steerValue, -steerRate * dt, steerRate * dt);
    v.setSteeringValue(this.steerValue, 0);
    v.setSteeringValue(this.steerValue, 1);

    // Resistencia aerodinámica (F = -c·v·|v|) y carga aerodinámica
    const body = this.chassisBody;
    const vel = body.velocity;
    const vmag = vel.length();
    if (vmag > 0.1) {
      const c = (s.engineForce * 2 * 0.3) / (s.maxSpeed * s.maxSpeed);
      body.applyForce(_v.set(-vel.x * vmag * c, 0, -vel.z * vmag * c), body.position);
    }
    body.applyForce(_v.set(0, -vmag * vmag * 0.6, 0), body.position);

    // Detección de derrape: ruedas traseras deslizando con velocidad lateral notable
    this.getForward(_fwd);
    _right.set(-_fwd.z, 0, _fwd.x);
    const lateral = Math.abs(vel.dot(_right));
    this.drifting = (wr[2].sliding || wr[3].sliding) && lateral > 3 && absSpeed > 5;

    // Humo de neumáticos
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
    const night = this.game.env.night;
    this.headMat.emissiveIntensity = 0.4 + night * 2.5;

    if (this.type === 'police') {
      this.sirenTime += dt;
      const phase = Math.floor(this.sirenTime * 6) % 2;
      this.sirenRed.emissiveIntensity = this.sirenOn && phase === 0 ? 4 : 0;
      this.sirenBlue.emissiveIntensity = this.sirenOn && phase === 1 ? 4 : 0;
    }

    if (this.destroyed && Math.random() < 0.25) {
      const p = this.chassisBody.position;
      this.game.effects.spawnSmoke(new THREE.Vector3(p.x, p.y + 1.2, p.z), new THREE.Vector3(0, 1.5, 0), 1.3, true);
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
    this.game.effects.muzzleFlash(p);
    this.game.effects.spawnSparks(p, new THREE.Vector3(0, 1, 0), 40, 0xff8a3d);
    for (let i = 0; i < 12; i++) {
      this.game.effects.spawnSmoke(p, new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 1.8, true);
    }
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
