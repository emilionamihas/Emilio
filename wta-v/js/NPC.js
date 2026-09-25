import * as THREE from 'three';
import { HumanModel, randomCivilianOutfit } from './HumanModel.js';
import { CITY } from './Environment.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * Personaje no jugador sin cuerpo físico (cinemático).
 * Roles: 'guard' y 'police' (hostiles cuando salta la alarma), 'teller'/'cashier' (se rinden),
 * 'civilian' (se agachan o huyen), 'pedestrian' (caminan por la acera).
 */
export class NPC {
  constructor(game, { role = 'civilian', outfit, position, facing = 0, health, bounds = null, armed = false }) {
    this.game = game;
    this.role = role;
    this.model = new HumanModel(outfit || randomCivilianOutfit());
    this.root = this.model.root;
    this.pos = position.clone();
    this.facing = facing;
    this.health = health ?? (role === 'guard' || role === 'police' ? 80 : 40);
    this.state = 'idle';
    this.bounds = bounds; // {minX, maxX, minZ, maxZ} para no atravesar paredes del interior
    this.hostile = false;
    this.fireTimer = 1 + Math.random();
    this.stateTimer = 0;
    this.speed = 0;
    this.dead = false;
    for (const m of this.model.meshes) m.userData.npc = this;

    if (armed) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.22), new THREE.MeshStandardMaterial({ color: 0x1e1e1e, metalness: 0.7, roughness: 0.4 }));
      gun.rotation.x = Math.PI / 2;
      gun.position.set(0, -0.12, 0.03);
      this.model.rightHand.add(gun);
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, -0.25, 0.03);
      this.model.rightHand.add(this.muzzle);
    }
    this.sync();
    game.scene.add(this.root);
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
  }

  remove() {
    this.game.scene.remove(this.root);
  }

  faceTowards(target, dt, rate = 8) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = want - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * rate);
  }

  moveTowards(target, speed, dt) {
    _v.set(target.x - this.pos.x, 0, target.z - this.pos.z);
    const dist = _v.length();
    if (dist < 0.05) return 0;
    _v.multiplyScalar(Math.min(dist, speed * dt) / dist);
    this.pos.add(_v);
    if (this.bounds) {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, this.bounds.minX, this.bounds.maxX);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, this.bounds.minZ, this.bounds.maxZ);
    }
    this.faceTowards(target, dt);
    return dist;
  }

  /** Impacto de bala. part: 'head' multiplica el daño. */
  hit(damage, part, fromPos) {
    if (this.dead) return;
    const dmg = part === 'head' ? damage * 3 : damage;
    this.health -= dmg;
    this.game.effects.spawnSparks(this.pos.clone().setY(1.3), new THREE.Vector3(0, 1, 0), 4, 0x8b0000);
    if (this.health <= 0) {
      this.die(fromPos);
      return;
    }
    if (this.role === 'guard' || this.role === 'police') this.hostile = true;
    else if (this.role === 'pedestrian') this.panic(fromPos);
    else this.state = 'cower';
  }

  die(fromPos) {
    this.dead = true;
    this.state = 'dead';
    if (fromPos) this.faceTowards(fromPos, 1, 100);
    if (this.game.onNpcKilled) this.game.onNpcKilled(this);
  }

  panic(fromPos) {
    if (this.dead) return;
    if (this.role === 'pedestrian') {
      this.state = 'flee';
      this.stateTimer = 8 + Math.random() * 4;
      this.fleeFrom = (fromPos || this.game.player.mesh.position).clone();
    } else if (this.role === 'guard' || this.role === 'police') {
      this.hostile = true;
    } else if (this.state !== 'handsUp') {
      this.state = Math.random() < 0.5 ? 'cower' : 'handsUp';
    }
  }

  update(dt) {
    const game = this.game;
    let pose = 'idle';
    let aim = false;
    this.speed = 0;

    if (this.dead) {
      this.model.animate(dt, { pose: 'dead' });
      this.sync();
      return;
    }

    const player = game.player.mesh.position;
    if ((this.role === 'guard' || this.role === 'police') && this.hostile && game.interaction.state === 'foot' && game.player.health > 0) {
      // Combate: acercarse hasta media distancia, apuntar y disparar
      const d = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
      if (d > 9) {
        this.moveTowards(player, 3.2, dt);
        this.speed = 3.2;
      } else {
        this.faceTowards(player, dt, 10);
        aim = true;
      }
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && d < 28) {
        this.fireTimer = this.role === 'police' ? 0.8 : 1.0;
        this.shoot(d);
      }
    } else if (this.state === 'handsUp' || this.state === 'cower') {
      this.faceTowards(player, dt, 3);
      pose = this.state;
    } else if (this.state === 'flee') {
      this.stateTimer -= dt;
      _v2.set(this.pos.x - this.fleeFrom.x, 0, this.pos.z - this.fleeFrom.z).normalize().multiplyScalar(10).add(this.pos);
      this.moveTowards(_v2, 5.5, dt);
      this.speed = 5.5;
      if (this.stateTimer <= 0) this.state = 'walk';
    } else if (this.state === 'walk' && this.path) {
      const target = this.path[this.pathIndex];
      const d = this.moveTowards(target, this.walkSpeed, dt);
      this.speed = this.walkSpeed;
      if (d < 0.4) this.pathIndex = (this.pathIndex + 1) % this.path.length;
    }

    this.model.animate(dt, { speed: this.speed, aim, pitch: 0, pose });
    this.sync();
  }

  shoot(dist) {
    const game = this.game;
    this.root.updateMatrixWorld(true);
    const from = this.muzzle ? this.muzzle.getWorldPosition(new THREE.Vector3()) : this.pos.clone().setY(1.4);
    const p = game.player.mesh.position;
    const moving = Math.hypot(game.player.body.velocity.x, game.player.body.velocity.z);
    const chance = THREE.MathUtils.clamp(0.55 - dist * 0.015 - moving * 0.035, 0.12, 0.6);
    const hit = Math.random() < chance;
    const to = new THREE.Vector3(p.x, p.y + 1.2, p.z);
    if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.2 - 0.4, (Math.random() - 0.5) * 2.5));
    game.effects.spawnTracer(from, to);
    game.effects.muzzleFlash(from);
    if (hit) game.player.takeDamage(this.role === 'police' ? 6 : 5);
  }
}

// ======================================================================
// Peatones: caminan en círculo por la acera de las manzanas cercanas
// ======================================================================
const rc = (i) => -CITY.HALF + i * CITY.PERIOD;
const SIDEWALK_OFFSET = CITY.ROAD / 2 + CITY.SIDEWALK / 2;

export class Pedestrians {
  constructor(game, { count = 14 } = {}) {
    this.game = game;
    this.count = count;
    this.active = [];
    this.spawnTimer = 0;
  }

  /** Recorrido rectangular por la acera de la manzana (bi, bj), en sentido aleatorio. */
  blockPath(bi, bj) {
    const x0 = rc(bi) + SIDEWALK_OFFSET;
    const x1 = rc(bi + 1) - SIDEWALK_OFFSET;
    const z0 = rc(bj) + SIDEWALK_OFFSET;
    const z1 = rc(bj + 1) - SIDEWALK_OFFSET;
    const pts = [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, 0, z1)];
    if (Math.random() < 0.5) pts.reverse();
    return pts;
  }

  spawn() {
    const game = this.game;
    if (game.interior) return;
    const focus = game.getFocusPosition();
    for (let attempt = 0; attempt < 10; attempt++) {
      const bi = Math.floor(Math.random() * CITY.BLOCKS);
      const bj = Math.floor(Math.random() * CITY.BLOCKS);
      const path = this.blockPath(bi, bj);
      const k = Math.floor(Math.random() * 4);
      const t = Math.random();
      const pos = new THREE.Vector3().lerpVectors(path[k], path[(k + 1) % 4], t);
      const d = Math.hypot(pos.x - focus.x, pos.z - focus.z);
      if (d < 35 || d > 95) continue;
      const npc = new NPC(game, { role: 'pedestrian', position: pos });
      npc.state = 'walk';
      npc.path = path;
      npc.pathIndex = (k + 1) % 4;
      npc.walkSpeed = 1.2 + Math.random() * 0.5;
      this.active.push(npc);
      return;
    }
  }

  /** Disparos o explosiones cerca: los peatones huyen. */
  panicAround(point, radius = 35) {
    for (const p of this.active) {
      if (Math.hypot(p.pos.x - point.x, p.pos.z - point.z) < radius) p.panic(point);
    }
  }

  update(dt) {
    const game = this.game;
    const focus = game.getFocusPosition();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.active.length < this.count) {
      this.spawn();
      this.spawnTimer = 0.5;
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const d = Math.hypot(p.pos.x - focus.x, p.pos.z - focus.z);
      if (d > 120 || (p.dead && d > 60) || game.interior) {
        p.remove();
        this.active.splice(i, 1);
        continue;
      }
      p.root.visible = d < 65; // lejos no se dibujan (cada figura son ~25 piezas)
      if (d > 70) {
        // Lejos: solo avanzan sin animar
        if (p.state === 'walk') p.moveTowards(p.path[p.pathIndex], p.walkSpeed, dt);
        p.sync();
        continue;
      }
      this.checkRunOver(p);
      p.update(dt);
    }
  }

  /** Atropellos: un coche a más de 15 km/h que pasa por encima tumba al peatón. */
  checkRunOver(p) {
    if (p.dead) return;
    for (const v of this.game.vehicles) {
      const speed = v.chassisBody.velocity.length();
      if (speed < 4) continue;
      const vp = v.position;
      if (Math.hypot(vp.x - p.pos.x, vp.z - p.pos.z) < v.spec.body.w + 0.5) {
        p.health = 0;
        p.die(new THREE.Vector3(vp.x, 0, vp.z));
        const vel = v.chassisBody.velocity;
        p.pos.add(new THREE.Vector3(vel.x * 0.15, 0, vel.z * 0.15));
        if (v.driver === 'player') this.game.wanted.reportCrime('murder');
        this.panicAround(p.pos, 25);
        return;
      }
    }
  }

  meshes() {
    const list = [];
    for (const p of this.active) if (!p.dead) list.push(p.root);
    return list;
  }
}
