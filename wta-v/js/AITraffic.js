import * as THREE from 'three';
import { VehicleController, TRAFFIC_MIX } from './VehicleController.js';

const _local = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Conduce un vehículo hacia un punto con un controlador sencillo:
 * dirección proporcional al ángulo hacia el objetivo y acelerador/freno según
 * el error de velocidad. Lo comparten el tráfico civil y la policía.
 */
export function driveTo(vehicle, target, targetSpeed, { aggressive = false } = {}) {
  const b = vehicle.chassisBody;
  _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w).invert();
  _local.set(target.x - b.position.x, 0, target.z - b.position.z).applyQuaternion(_q);
  // En espacio local +Z es adelante y +X la izquierda, por eso el ángulo sale con el signo de la dirección
  const angle = Math.atan2(_local.x, _local.z);
  const inp = vehicle.input;
  const speed = vehicle.getForwardSpeed();

  let steer = THREE.MathUtils.clamp(angle * (aggressive ? 2.2 : 1.8), -1, 1);
  let wanted = targetSpeed;

  // Objetivo detrás: marcha atrás girando al revés para dar la vuelta
  if (Math.abs(angle) > 2.2 && _local.length() < 25) {
    inp.throttle = 0;
    inp.reverse = 1;
    inp.steer = -Math.sign(angle);
    inp.handbrake = false;
    return angle;
  }

  // Frena antes de las curvas cerradas
  const turnSlow = 1 - Math.min(0.65, Math.abs(angle) * 0.7);
  wanted *= turnSlow;

  const err = wanted - speed;
  inp.steer = steer;
  inp.handbrake = aggressive && Math.abs(angle) > 0.9 && speed > 12;
  if (wanted < 0.3 && speed < 0.8) {
    inp.throttle = 0;
    inp.reverse = 0;
    inp.handbrake = true;
  } else if (err > 0) {
    inp.throttle = THREE.MathUtils.clamp(err * 0.35, 0.15, 1);
    inp.reverse = 0;
  } else {
    inp.throttle = 0;
    inp.reverse = speed > 1 ? THREE.MathUtils.clamp(-err * 0.3, 0, 1) : 0;
  }
  return angle;
}

/**
 * Tráfico civil con Object Pooling.
 * Los vehículos se reciclan: cuando uno se aleja demasiado del jugador,
 * se retira del mundo y vuelve al pool para reaparecer cerca de él.
 */
export class AITraffic {
  constructor(game, { maxActive = 12, spawnMin = 55, spawnMax = 150, despawn = 190 } = {}) {
    this.game = game;
    this.env = game.env;
    this.maxActive = maxActive;
    this.spawnMin = spawnMin;
    this.spawnMax = spawnMax;
    this.despawnDist = despawn;
    this.pool = [];
    this.agents = [];
    this.spawnTimer = 0;

    // Pre-crear el pool para evitar tirones durante el juego
    for (let i = 0; i < maxActive; i++) this.pool.push(this.createVehicle());
  }

  createVehicle() {
    // Modelo aleatorio según los pesos de TRAFFIC_MIX
    const entries = Object.entries(TRAFFIC_MIX);
    let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
    let type = entries[0][0];
    for (const [t, w] of entries) {
      r -= w;
      if (r <= 0) {
        type = t;
        break;
      }
    }
    return new VehicleController(this.game, { type });
  }

  /**
   * Vehículo de misión que circula como tráfico pero no se recicla al alejarse.
   * Aparece a 90-180 m del jugador.
   */
  spawnPersistent(type, color, tag) {
    const spot = this.findSpawn(90, 180, false);
    if (!spot) return null;
    const v = new VehicleController(this.game, { type, color });
    v.tag = tag;
    v.place(spot.pos.x, spot.pos.z, Math.atan2(spot.dir.x, spot.dir.z));
    v.addToWorld();
    v.driver = 'ai';
    this.agents.push(this.makeAgent(v, spot.from, spot.to, 11 + Math.random() * 3, true));
    return v;
  }

  acquire() {
    return this.pool.pop() || this.createVehicle();
  }

  /** El jugador ha robado este coche: deja de ser tráfico y no vuelve al pool. */
  release(vehicle) {
    const idx = this.agents.findIndex((a) => a.vehicle === vehicle);
    if (idx >= 0) this.agents.splice(idx, 1);
    vehicle.driver = null;
  }

  despawn(agent) {
    agent.vehicle.removeFromWorld();
    agent.vehicle.driver = null;
    this.pool.push(agent.vehicle);
    this.agents.splice(this.agents.indexOf(agent), 1);
  }

  /** Busca un tramo de calle a distancia adecuada y fuera de la vista si es posible. */
  findSpawn(minDist, maxDist, avoidView = true) {
    const focus = this.game.getFocusPosition();
    const camera = this.game.camera;
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const nodes = this.env.nodesNear(focus, Math.max(0, minDist - 20), maxDist + 20).filter((n) => n.out.length);
    if (!nodes.length) return null;

    for (let attempt = 0; attempt < 24; attempt++) {
      const from = nodes[Math.floor(Math.random() * nodes.length)];
      const to = this.env.nodes[from.out[Math.floor(Math.random() * from.out.length)]];
      const edge = this.env.edgeBetween(from.id, to.id);
      if (edge.tunnel && Math.random() < 0.5) continue;
      const t = 0.3 + Math.random() * 0.4;
      const dir = new THREE.Vector3().subVectors(to.pos, from.pos).normalize();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const pos = new THREE.Vector3().lerpVectors(from.pos, to.pos, t).addScaledVector(right, edge.lane);
      const dist = Math.hypot(pos.x - focus.x, pos.z - focus.z);
      if (dist < minDist || dist > maxDist) continue;
      // Evitar aparecer delante de la cámara a poca distancia
      const toPos = new THREE.Vector3(pos.x - camera.position.x, 0, pos.z - camera.position.z).normalize();
      if (avoidView && dist < 100 && toPos.dot(camDir) > 0.5) continue;
      if (this.isOccupied(pos, 9)) continue;
      return { from, to, pos, dir };
    }
    return null;
  }

  trySpawn() {
    const spot = this.findSpawn(this.spawnMin, this.spawnMax);
    if (!spot) return false;
    const { from, to, pos, dir } = spot;
    const v = this.acquire();
    v.repair();
    v.place(pos.x, pos.z, Math.atan2(dir.x, dir.z));
    v.addToWorld();
    v.driver = 'ai';
    this.agents.push(this.makeAgent(v, from, to, 9 + Math.random() * 4));
    return true;
  }

  makeAgent(vehicle, from, to, cruise, persistent = false) {
    const agent = { vehicle, from, to, next: null, cruise, stuck: 0, persistent };
    agent.next = this.pickNext(from, to);
    return agent;
  }

  isOccupied(pos, radius) {
    for (const v of this.game.vehicles) {
      if (Math.hypot(v.position.x - pos.x, v.position.z - pos.z) < radius) return true;
    }
    const p = this.game.player.mesh.position;
    return Math.hypot(p.x - pos.x, p.z - pos.z) < radius;
  }

  /** Elige el nodo que sigue a `to` viniendo de `from` (prefiere seguir recto). */
  pickNext(from, to) {
    const nodes = this.env.nodes;
    const options = to.out.filter((id) => id !== from.id);
    const list = options.length ? options : to.out;
    if (list.length === 1) return nodes[list[0]];
    const dx = to.pos.x - from.pos.x;
    const dz = to.pos.z - from.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    let straight = null;
    let bestDot = -2;
    for (const id of list) {
      const n = nodes[id];
      const ex = n.pos.x - to.pos.x;
      const ez = n.pos.z - to.pos.z;
      const dot = (dx * ex + dz * ez) / (len * (Math.hypot(ex, ez) || 1));
      if (dot > bestDot) {
        bestDot = dot;
        straight = n;
      }
    }
    if (bestDot > 0.8 && Math.random() < 0.55) return straight;
    return nodes[list[Math.floor(Math.random() * list.length)]];
  }

  chooseNext(agent) {
    agent.from = agent.to;
    agent.to = agent.next || this.pickNext(agent.from, agent.to);
    agent.next = this.pickNext(agent.from, agent.to);
  }

  update(dt) {
    this.spawnTimer -= dt;
    const civilians = this.agents.filter((a) => !a.persistent).length;
    if (this.spawnTimer <= 0 && civilians < this.maxActive) {
      this.trySpawn();
      this.spawnTimer = 0.4;
    }

    const focus = this.game.getFocusPosition();
    for (let i = this.agents.length - 1; i >= 0; i--) {
      const agent = this.agents[i];
      const v = agent.vehicle;
      const pos = v.position;
      const dist = Math.hypot(pos.x - focus.x, pos.z - focus.z);

      if (agent.persistent) {
        // Vehículos de misión: nunca se reciclan; si se destruyen, quedan como chatarra
        if (v.destroyed) {
          this.agents.splice(i, 1);
          v.driver = null;
          continue;
        }
        if (v.isFlipped()) {
          agent.stuck += dt;
          if (agent.stuck > 4) v.resetUpright();
          continue;
        }
        this.driveAgent(agent, dt);
        continue;
      }
      if (dist > this.despawnDist || v.destroyed) {
        if (!v.destroyed || dist > 60) this.despawn(agent);
        else v.input.throttle = 0;
        continue;
      }
      if (v.isFlipped()) {
        agent.stuck += dt;
        if (agent.stuck > 4 && dist > 35) this.despawn(agent);
        continue;
      }
      this.driveAgent(agent, dt);
    }
  }

  driveAgent(agent, dt) {
    const v = agent.vehicle;
    const pos = v.position;
    const env = this.env;
    const from = agent.from.pos;
    const to = agent.to.pos;
    const L = from.distanceTo(to);
    const dir = new THREE.Vector3().subVectors(to, from).divideScalar(L || 1);
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const lane = env.laneOffset(agent.from.id, agent.to.id);

    // ¿Hemos llegado al final del tramo? En los cruces se cambia antes, al entrar en el cruce
    const along = (to.x - pos.x) * dir.x + (to.z - pos.z) * dir.z;
    const switchAt = agent.to.junction ? agent.to.radius - 2 : 1.5;
    if (along < switchAt) {
      this.chooseNext(agent);
      if ((agent.hops = (agent.hops || 0) + 1) < 4) return this.driveAgent(agent, dt);
    }
    agent.hops = 0;

    // Persecución pura: punto 9 m por delante sobre el carril, que continúa en el tramo siguiente
    const proj = (pos.x - from.x) * dir.x + (pos.z - from.z) * dir.z;
    const ahead = proj + 9;
    let target;
    if (ahead <= L || !agent.next) {
      target = from.clone().addScaledVector(dir, ahead).addScaledVector(right, lane);
    } else {
      const n = agent.next.pos;
      const d2 = new THREE.Vector3().subVectors(n, to).normalize();
      const lane2 = env.laneOffset(agent.to.id, agent.next.id);
      target = to.clone().addScaledVector(d2, ahead - L).addScaledVector(new THREE.Vector3(-d2.z, 0, d2.x), lane2);
    }

    let speed = agent.cruise;
    // Curvas: aflojar según el giro que viene
    if (agent.next) {
      const d2 = new THREE.Vector3().subVectors(agent.next.pos, to).normalize();
      const turn = 1 - dir.dot(d2);
      if (along < 25) speed = Math.min(speed, THREE.MathUtils.lerp(agent.cruise, 5, Math.min(1, turn * 1.5)));
    }

    // Semáforo: parar antes de la línea si no está en verde
    if (agent.to.signal) {
      const light = env.signalState(agent.to, agent.from);
      const stopDist = along - (agent.to.radius + 2.5);
      if (light !== 'green' && stopDist > -0.5 && stopDist < 22) {
        const currentSpeed = v.getForwardSpeed();
        // En ámbar, si ya no da tiempo a frenar, pasa
        const canStop = currentSpeed * currentSpeed < 2 * 6 * Math.max(stopDist, 0.1) + 4;
        if (light === 'red' || canStop) speed = Math.min(speed, Math.max(0, stopDist - 1) * 0.7);
      }
    }

    // Obstáculos delante: otros vehículos y el jugador
    const fwd = v.getForward();
    const obstacles = this.game.vehicles;
    for (const o of obstacles) {
      if (o === v) continue;
      const dx = o.position.x - pos.x;
      const dz = o.position.z - pos.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      const lateral = Math.abs(-dx * fwd.z + dz * fwd.x);
      if (ahead > 0 && ahead < 16 && lateral < 2.2) speed = Math.min(speed, Math.max(0, (ahead - 6) * 0.8));
    }
    const pp = this.game.player.mesh.position;
    if (!this.game.interaction.isDriving) {
      const dx = pp.x - pos.x;
      const dz = pp.z - pos.z;
      const ahead = dx * fwd.x + dz * fwd.z;
      const lateral = Math.abs(-dx * fwd.z + dz * fwd.x);
      if (ahead > 0 && ahead < 12 && lateral < 2) speed = 0;
    }

    driveTo(v, target, speed);

    // Atascado demasiado tiempo (sin semáforo ni obstáculo): reciclar si no se ve
    if (speed > 3 && Math.abs(v.getForwardSpeed()) < 0.5) agent.stuck += dt;
    else agent.stuck = Math.max(0, agent.stuck - dt);
    if (agent.stuck > 8) {
      const focus = this.game.getFocusPosition();
      if (!agent.persistent && Math.hypot(pos.x - focus.x, pos.z - focus.z) > 40) this.despawn(agent);
      else agent.stuck = 0;
    }
  }
}
