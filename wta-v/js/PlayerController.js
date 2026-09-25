import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS } from './Environment.js';
import { formatMoney } from './GameState.js';
import { HumanModel, OUTFITS, SKIN_TONES } from './HumanModel.js';

const WALK_SPEED = 3.4;
const RUN_SPEED = 7.2;
const JUMP_VELOCITY = 6.2;
const BODY_RADIUS = 0.42;
const MOUSE_SENS = 0.0022;

/**
 * Arsenal. price = coste del arma en la Armería; ammoPack/ammoPrice = caja de munición.
 * El orden define la posición en la rueda de armas (0 arriba, en sentido horario).
 */
export const WEAPONS = [
  { name: 'PUÑOS', melee: true, fireRate: 0.45, range: 1.8, force: 250, damage: 2, price: 0 },
  { name: 'PISTOLA', fireRate: 0.22, auto: false, mag: 12, reload: 1.2, range: 150, spread: 0.004, force: 900, damage: 9, price: 400, ammoPack: 36, ammoPrice: 60 },
  { name: 'SUBFUSIL', fireRate: 0.075, auto: true, mag: 30, reload: 1.8, range: 120, spread: 0.018, force: 600, damage: 5, price: 2200, ammoPack: 90, ammoPrice: 150 },
  { name: 'ESCOPETA', fireRate: 0.85, auto: false, mag: 6, reload: 2.4, range: 45, spread: 0.06, pellets: 8, force: 450, damage: 5, price: 3200, ammoPack: 24, ammoPrice: 120 },
  { name: 'RIFLE', fireRate: 0.1, auto: true, mag: 30, reload: 2.0, range: 220, spread: 0.008, force: 1100, damage: 11, price: 6500, ammoPack: 90, ammoPrice: 250 },
  { name: 'LANZACOHETES', fireRate: 1.2, auto: false, mag: 1, reload: 2.2, range: 250, spread: 0, force: 0, damage: 200, explosive: 7, price: 25000, ammoPack: 5, ammoPrice: 1000 },
];

const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _center = new THREE.Vector2(0, 0);

/** Ángulo interpolado por el camino más corto. */
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ======================================================================
// Personaje a pie
// ======================================================================
export class PlayerController {
  constructor(game, spawn) {
    this.game = game;
    this.spawnPoint = spawn.clone();
    this.enabled = true;
    this.health = 100;
    this.facing = 0;        // yaw del modelo (rad)
    this.onGround = false;
    this.animPhase = 0;
    this.aiming = false;
    this.lastShot = -10;
    this.fireCooldown = 0;
    this.reloadTimer = 0;
    this.weaponIndex = 0;
    this.wheelOpen = false;
    this.wheelSelection = 0;
    this.lastHurt = -10;
    this.wheelVec = new THREE.Vector2();
    this.hitTimer = 0;

    this.createBody(spawn);
    this.createMesh();
    this.updateWeaponVisual();
  }

  createBody(spawn) {
    this.body = new CANNON.Body({
      mass: 75,
      material: this.game.materials.player,
      fixedRotation: true,
      linearDamping: 0,
      collisionFilterGroup: GROUPS.PLAYER,
      collisionFilterMask: GROUPS.STATIC | GROUPS.VEHICLE,
    });
    this.body.addShape(new CANNON.Sphere(BODY_RADIUS));
    this.body.position.set(spawn.x, spawn.y + BODY_RADIUS + 0.05, spawn.z);
    this.body.allowSleep = false;
    this.body.userData = { player: this };
    this.body.addEventListener('collide', (e) => {
      // Atropellos: daño según la velocidad relativa del impacto
      const impact = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (e.body.userData && e.body.userData.vehicle && impact > 5) this.takeDamage((impact - 5) * 6);
    });
    this.game.world.addBody(this.body);
  }

  /** Figura humana articulada (HumanModel) con el arma en la mano derecha. */
  createMesh() {
    this.model = new HumanModel(OUTFITS.calle, { skin: SKIN_TONES[2], hairStyle: 'short' });
    const root = this.model.root;

    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, metalness: 0.75, roughness: 0.35 });
    this.gun = new THREE.Group();
    this.gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.24), gunMat);
    this.gunBarrel.position.z = 0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.045), gunMat);
    grip.position.set(0, -0.055, 0.01);
    grip.rotation.x = 0.25;
    this.gun.add(this.gunBarrel, grip);
    // En el marco de la muñeca el brazo apunta a -Y: giramos el arma para que el cañón siga al brazo
    this.gun.rotation.x = Math.PI / 2;
    this.gun.position.set(0, -0.04, 0.03);
    this.model.rightHand.add(this.gun);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, 0.24);
    this.gun.add(this.muzzle);

    this.mesh = root;
    this.game.scene.add(root);
  }

  /** Aspecto personalizado del vestidor. */
  applyLook(look) {
    this.outfitId = 'custom';
    this.model.setLook(look);
  }

  /** Cambia la ropa (armario de casa). */
  setOutfit(id) {
    if (!OUTFITS[id]) return;
    this.outfitId = id;
    this.model.setOutfit(OUTFITS[id]);
  }

  get weapon() {
    return WEAPONS[this.weaponIndex];
  }

  get state() {
    return this.game.state;
  }

  /** Balas en el cargador del arma i. */
  clip(i = this.weaponIndex) {
    return this.state.clip[i] ?? 0;
  }

  reserve(i = this.weaponIndex) {
    return this.state.reserve[i] ?? 0;
  }

  /** Da un arma (compra) con dos cargadores de reserva. */
  giveWeapon(i) {
    const w = WEAPONS[i];
    this.state.ownedWeapons.add(i);
    if (w.mag) {
      this.state.clip[i] = w.mag;
      this.state.reserve[i] = (this.state.reserve[i] ?? 0) + w.mag * 2;
    }
  }

  addAmmo(i, amount) {
    this.state.reserve[i] = (this.state.reserve[i] ?? 0) + amount;
  }

  // ------------------------------------------------------------------
  // Activación (al entrar/salir de vehículos)
  // ------------------------------------------------------------------
  setEnabled(enabled) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.game.world.addBody(this.body);
    } else {
      this.game.world.removeBody(this.body);
      this.body.velocity.setZero();
    }
  }

  teleport(pos, velocity) {
    this.body.position.set(pos.x, Math.max(pos.y, 0) + BODY_RADIUS + 0.05, pos.z);
    this.body.velocity.set(velocity ? velocity.x : 0, velocity ? velocity.y : 0, velocity ? velocity.z : 0);
    this.syncMesh();
  }

  get feetPosition() {
    return _v3.set(this.body.position.x, this.body.position.y - BODY_RADIUS, this.body.position.z);
  }

  takeDamage(amount) {
    if (this.health <= 0) return;
    // El chaleco absorbe el 70 % del daño mientras le quede aguante
    const st = this.game.state;
    if (st && st.armor > 0) {
      const absorbed = Math.min(st.armor, amount * 0.7);
      st.armor -= absorbed;
      amount -= absorbed;
    }
    this.lastHurt = this.game.time;
    this.health = Math.max(0, this.health - amount);
    this.hitTimer = 0.3;
    if (this.health <= 0 && this.game.onPlayerDeath) this.game.onPlayerDeath();
  }

  // ------------------------------------------------------------------
  // Actualización por frame (antes del paso de física)
  // ------------------------------------------------------------------
  update(dt, cameraRig) {
    const input = this.game.input;
    this.updateWeaponWheel(dt);
    if (!this.enabled) return;

    this.checkGround();

    // Movimiento relativo a la cámara
    const yaw = cameraRig.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW')) {
      mx += fwdX;
      mz += fwdZ;
    }
    if (input.isDown('KeyS')) {
      mx -= fwdX;
      mz -= fwdZ;
    }
    if (input.isDown('KeyD')) {
      mx += rightX;
      mz += rightZ;
    }
    if (input.isDown('KeyA')) {
      mx -= rightX;
      mz -= rightZ;
    }
    const len = Math.hypot(mx, mz);
    const moving = len > 0.01;
    if (moving) {
      mx /= len;
      mz /= len;
    }

    this.aiming = !this.wheelOpen && (input.mouse.right || this.game.time - this.lastShot < 0.6) && !this.weapon.melee;
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = moving ? (running && !this.aiming ? RUN_SPEED : this.aiming ? WALK_SPEED * 0.8 : WALK_SPEED) : 0;

    // Aceleración horizontal (más control en el suelo que en el aire)
    const v = this.body.velocity;
    const accel = this.onGround ? 14 : 3;
    const k = 1 - Math.exp(-accel * dt);
    v.x += (mx * speed - v.x) * k;
    v.z += (mz * speed - v.z) * k;

    if (input.wasPressed('Space') && this.onGround) {
      v.y = JUMP_VELOCITY;
      this.onGround = false;
    }

    // Orientación del modelo: hacia la cámara al apuntar, hacia el movimiento si no
    if (this.aiming) {
      this.facing = lerpAngle(this.facing, yaw + Math.PI, 1 - Math.exp(-25 * dt));
    } else if (moving) {
      this.facing = lerpAngle(this.facing, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    }

    this.handleWeapons(dt);
    if (this.hitTimer > 0) this.hitTimer -= dt;

    // Regeneración lenta hasta la mitad de la vida si llevas un rato sin recibir daño
    if (this.health > 0 && this.health < 50 && this.game.time - this.lastHurt > 6) this.health = Math.min(50, this.health + dt * 2);

    // Evita caer al vacío si algo sale mal
    if (this.body.position.y < -10) this.teleport(this.spawnPoint);
  }

  checkGround() {
    const from = this.body.position;
    const to = new CANNON.Vec3(from.x, from.y - BODY_RADIUS - 0.2, from.z);
    const result = new CANNON.RaycastResult();
    this.game.world.raycastClosest(
      from,
      to,
      { skipBackfaces: true, collisionFilterMask: GROUPS.STATIC | GROUPS.VEHICLE },
      result
    );
    this.onGround = result.hasHit && this.body.velocity.y < 3;
  }

  // ------------------------------------------------------------------
  // Armas: raycast desde el centro de la cámara
  // ------------------------------------------------------------------
  handleWeapons(dt) {
    const input = this.game.input;
    const w = this.weapon;
    this.fireCooldown -= dt;

    const i = this.weaponIndex;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const moved = Math.min(w.mag - this.clip(i), this.reserve(i));
        this.state.clip[i] = this.clip(i) + moved;
        this.state.reserve[i] = this.reserve(i) - moved;
      }
      return;
    }
    const canReload = w.mag && this.clip(i) < w.mag && this.reserve(i) > 0;
    if (input.wasPressed('KeyR') && canReload) {
      this.reloadTimer = w.reload;
      return;
    }
    if (this.wheelOpen) return;

    const wantsFire = w.auto ? input.mouse.left : input.mouse.leftPressed;
    if (!wantsFire || this.fireCooldown > 0) return;

    if (w.mag) {
      if (this.clip(i) <= 0) {
        if (canReload) this.reloadTimer = w.reload;
        else if (input.mouse.leftPressed) this.game.hud.notify(`Sin munición para ${w.name}. Compra más en la Armería.`, 2.5);
        return;
      }
      this.state.clip[i] = this.clip(i) - 1;
    }
    this.fireCooldown = w.fireRate;
    this.lastShot = this.game.time;
    if (w.melee) this.punch();
    else this.fire(w);
  }

  fire(w) {
    const game = this.game;
    const camera = game.camera;
    // El modelo debe mirar al frente antes de calcular la boca del cañón
    this.facing = game.cameraRig.yaw + Math.PI;
    this.mesh.rotation.y = this.facing;
    this.poseAim();
    this.mesh.updateMatrixWorld(true);
    const muzzlePos = this.muzzle.getWorldPosition(new THREE.Vector3());
    game.effects.muzzleFlash(muzzlePos);

    if (w.explosive) {
      this.fireRocket(w, muzzlePos);
      return;
    }

    const targets = game.getShootables();
    const pellets = w.pellets || 1;
    let hitSomething = false;
    for (let p = 0; p < pellets; p++) {
      _ray.setFromCamera(_center, camera);
      _ray.ray.direction.x += (Math.random() - 0.5) * w.spread * 2;
      _ray.ray.direction.y += (Math.random() - 0.5) * w.spread * 2;
      _ray.ray.direction.z += (Math.random() - 0.5) * w.spread * 2;
      _ray.ray.direction.normalize();
      _ray.far = w.range;
      // Empieza el rayo delante del jugador para no dispararle a su propia espalda
      const camToPlayer = _v3b.copy(this.mesh.position).sub(camera.position).dot(_ray.ray.direction);
      _ray.near = Math.max(0, camToPlayer);

      const hits = _ray.intersectObjects(targets, true);
      const hit = hits[0];
      const end = hit ? hit.point : _ray.ray.at(w.range, new THREE.Vector3());
      game.effects.spawnTracer(muzzlePos, end);
      if (!hit) continue;

      const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : _ray.ray.direction.clone().negate();
      game.effects.spawnSparks(hit.point, normal, 6);

      const npc = hit.object.userData.npc;
      if (npc) {
        if (!npc.dead) {
          hitSomething = true;
          npc.hit(w.damage / (pellets > 1 ? 1.5 : 1), hit.object.userData.part, this.mesh.position);
        }
        continue;
      }
      const vehicle = this.findVehicle(hit.object);
      if (vehicle) {
        hitSomething = true;
        game.effects.spawnDecal(hit.point, normal, vehicle.mesh);
        const b = vehicle.chassisBody;
        const impulse = new CANNON.Vec3(_ray.ray.direction.x, _ray.ray.direction.y, _ray.ray.direction.z).scale(w.force / pellets);
        b.applyImpulse(impulse, new CANNON.Vec3(hit.point.x - b.position.x, hit.point.y - b.position.y, hit.point.z - b.position.z));
        vehicle.damage(w.damage);
        game.wanted.reportCrime(vehicle.type === 'police' ? 'attack_police' : 'hit_vehicle');
      } else {
        game.effects.spawnDecal(hit.point, normal);
      }
    }
    if (hitSomething) game.hud.flashHitmarker();
    if (game.interior) {
      for (const n of game.interior.inst.npcs) n.panic(this.mesh.position);
    } else {
      game.wanted.reportCrime('gunshot');
      game.pedestrians.panicAround(this.mesh.position, 40);
    }
  }

  /** Cohete: impacto instantáneo por raycast con explosión en el punto de impacto. */
  fireRocket(w, muzzlePos) {
    const game = this.game;
    _ray.setFromCamera(_center, game.camera);
    _ray.far = w.range;
    _ray.near = Math.max(0, _v3b.copy(this.mesh.position).sub(game.camera.position).dot(_ray.ray.direction));
    const hit = _ray.intersectObjects(game.getShootables(), true)[0];
    const end = hit ? hit.point.clone() : _ray.ray.at(w.range, new THREE.Vector3());
    game.effects.spawnTracer(muzzlePos, end);
    game.effects.spawnSmoke(muzzlePos.clone(), new THREE.Vector3(0, 0.5, 0), 0.8);
    if (hit) {
      game.explosion(end, w.explosive, w.damage);
      game.wanted.reportCrime('explosion');
    }
  }

  punch() {
    const game = this.game;
    const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const origin = this.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    _ray.set(origin, dir);
    _ray.near = 0;
    _ray.far = this.weapon.range;
    const hit = _ray.intersectObjects(game.getShootables(), true)[0];
    this.punchTime = 0.25;
    if (!hit) return;
    if (hit.object.userData.npc) {
      hit.object.userData.npc.hit(12, hit.object.userData.part, this.mesh.position);
      game.hud.flashHitmarker();
      return;
    }
    const vehicle = this.findVehicle(hit.object);
    game.effects.spawnSparks(hit.point, dir.clone().negate(), 3, 0xffffff);
    if (vehicle) {
      const b = vehicle.chassisBody;
      b.applyImpulse(new CANNON.Vec3(dir.x * 250, 40, dir.z * 250), new CANNON.Vec3(hit.point.x - b.position.x, 0, hit.point.z - b.position.z));
      vehicle.damage(this.weapon.damage);
      game.hud.flashHitmarker();
    }
  }

  findVehicle(obj) {
    while (obj) {
      if (obj.userData && obj.userData.vehicle) return obj.userData.vehicle;
      obj = obj.parent;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Rueda de armas (mantener TAB, se ralentiza el tiempo)
  // ------------------------------------------------------------------
  updateWeaponWheel() {
    const input = this.game.input;
    for (let i = 0; i < WEAPONS.length; i++) {
      if (input.wasPressed(`Digit${i + 1}`)) this.selectWeapon(i);
    }
    if (input.wasPressed('Tab')) {
      this.wheelOpen = true;
      this.wheelVec.set(0, 0);
      this.wheelSelection = this.weaponIndex;
      this.game.timeScale = 0.25;
    }
    if (this.wheelOpen) {
      const m = input.consumeMouse();
      this.wheelVec.x += m.dx;
      this.wheelVec.y += m.dy;
      if (this.wheelVec.length() > 30) {
        this.wheelVec.clampLength(0, 80);
        // Ángulo medido desde arriba en sentido horario (la Y de pantalla crece hacia abajo)
        const a = Math.atan2(this.wheelVec.y, this.wheelVec.x) + Math.PI / 2;
        const sector = (Math.PI * 2) / WEAPONS.length;
        this.wheelSelection = ((Math.round(a / sector) % WEAPONS.length) + WEAPONS.length) % WEAPONS.length;
      }
      this.game.hud.setWeaponWheel(true, this.wheelSelection);
      if (!input.isDown('Tab')) {
        this.wheelOpen = false;
        this.game.timeScale = 1;
        this.selectWeapon(this.wheelSelection);
        this.game.hud.setWeaponWheel(false);
      }
    }
  }

  selectWeapon(i) {
    if (i === this.weaponIndex) return;
    if (!this.state.ownedWeapons.has(i)) {
      this.game.hud.notify(`No tienes ${WEAPONS[i].name}. Cómprala en la Armería (${formatMoney(WEAPONS[i].price)}).`, 3);
      return;
    }
    this.weaponIndex = i;
    this.reloadTimer = 0;
    this.fireCooldown = 0.2;
    this.updateWeaponVisual();
  }

  updateWeaponVisual() {
    const w = this.weapon;
    this.gun.visible = !w.melee;
    const length = { SUBFUSIL: 2, ESCOPETA: 2.2, RIFLE: 2.6, LANZACOHETES: 3.2 }[w.name] || 1;
    const thick = w.name === 'LANZACOHETES' ? 2.2 : 1;
    this.gunBarrel.scale.set(thick, thick, length);
    this.gunBarrel.position.z = 0.12 * length;
    this.muzzle.position.z = 0.3 * length;
  }

  // ------------------------------------------------------------------
  // Animación procedural
  // ------------------------------------------------------------------
  poseAim() {
    this.model.animate(0.016, { aim: true, pitch: this.game.cameraRig.pitch });
  }

  syncMesh() {
    const p = this.body.position;
    this.mesh.position.set(p.x, p.y - BODY_RADIUS, p.z);
    this.mesh.rotation.y = this.facing;
  }

  animate(dt) {
    if (!this.enabled) return;
    this.syncMesh();
    const v = this.body.velocity;
    let pose = 'idle';
    if (this.punchTime > 0) {
      this.punchTime -= dt;
      pose = 'punch';
    } else if (this.reloadTimer > 0) {
      pose = 'reload';
    }
    this.model.animate(dt, {
      speed: Math.hypot(v.x, v.z),
      grounded: this.onGround,
      aim: this.aiming && pose === 'idle',
      pitch: this.game.cameraRig.pitch,
      pose,
    });
  }
}

// ======================================================================
// Cámara flexible: orbital a pie / persecución en vehículo
// ======================================================================
export class ThirdPersonCamera {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.mode = 'foot';
    this.yaw = Math.PI;
    this.pitch = -0.15;
    this.freeLookTimer = 0;
    this.freeLookOffset = 0;
    this.blend = 1; // 0 justo tras cambiar de modo -> 1 asentado
    this.position = new THREE.Vector3(0, 5, 10);
    this.lookAt = new THREE.Vector3();
    this.target = null;
    this.raycaster = new THREE.Raycaster();
  }

  setMode(mode, target) {
    this.mode = mode;
    this.target = target;
    this.blend = 0;
    if (mode === 'vehicle') {
      this.pitch = -0.18;
      this.freeLookOffset = 0;
    }
  }

  update(dt) {
    const game = this.game;
    const input = game.input;
    const player = game.player;

    // Ratón (bloqueado mientras la rueda de armas está abierta)
    if (!player.wheelOpen) {
      const m = input.consumeMouse();
      if (this.mode === 'foot') {
        this.yaw -= m.dx * MOUSE_SENS;
        this.pitch -= m.dy * MOUSE_SENS;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 0.85);
      } else {
        if (m.dx !== 0 || m.dy !== 0) this.freeLookTimer = 1.2;
        this.freeLookOffset -= m.dx * MOUSE_SENS;
        this.pitch = THREE.MathUtils.clamp(this.pitch - m.dy * MOUSE_SENS, -0.8, 0.3);
      }
    }

    this.blend = Math.min(1, this.blend + dt / 0.9);
    const settle = THREE.MathUtils.smoothstep(this.blend, 0, 1);
    let pivot;
    let distance;
    let shoulder = 0;
    let fov;
    let stiffness;

    if (this.mode === 'foot') {
      const p = player.mesh.position;
      pivot = _v3.set(p.x, p.y + 1.55, p.z);
      distance = player.aiming ? 2.3 : game.interior ? 3.0 : 4.3;
      shoulder = player.aiming ? 0.6 : 0.35;
      fov = player.aiming ? 50 : 65;
      stiffness = THREE.MathUtils.lerp(4, 30, settle);
    } else {
      const v = this.target;
      const bp = v.chassisBody.position;
      pivot = _v3.set(bp.x, bp.y + 1.5, bp.z);
      const speed = Math.abs(v.getForwardSpeed());
      // Yaw detrás del coche; con marcha atrás rápida mira hacia delante del movimiento
      const heading = v.getHeading();
      const carYaw = heading + Math.PI;
      this.freeLookTimer -= dt;
      if (this.freeLookTimer <= 0) this.freeLookOffset *= Math.exp(-3 * dt);
      const follow = 1 - Math.exp(-(speed > 2 ? 5 : 2) * dt);
      this.yaw = lerpAngle(this.yaw, carYaw + this.freeLookOffset, this.freeLookTimer > 0 ? 1 : follow);
      if (this.freeLookTimer <= 0) this.pitch += (-0.18 - this.pitch) * (1 - Math.exp(-2 * dt));
      distance = 7 + Math.min(speed, 45) * 0.06;
      fov = 68 + Math.min(speed, 50) * 0.3;
      stiffness = THREE.MathUtils.lerp(3, 14, settle);
    }

    const cp = Math.cos(this.pitch);
    const dir = _v3b.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const shoulderPivot = pivot.clone().addScaledVector(right, shoulder);

    // Colisión de cámara con edificios: acerca la cámara si algo la tapa
    this.raycaster.set(shoulderPivot, dir.clone().negate());
    this.raycaster.far = distance;
    const colliders = game.interior ? game.interiors.cameraColliders() : game.env.buildingMeshes;
    const hit = this.raycaster.intersectObjects(colliders, false)[0];
    const d = hit ? Math.max(0.6, hit.distance - 0.35) : distance;

    const desired = shoulderPivot.clone().addScaledVector(dir, -d);
    desired.y = Math.max(desired.y, 0.35);
    // Dentro de un edificio la cámara no atraviesa el techo
    if (game.interior) desired.y = Math.min(desired.y, game.interior.inst.ceiling - 0.3);
    const desiredLook = shoulderPivot.clone().addScaledVector(dir, 10);

    const k = 1 - Math.exp(-stiffness * dt);
    // Tras la colisión se aplica al instante para no atravesar paredes
    if (hit) this.position.copy(desired);
    else this.position.lerp(desired, k);
    this.lookAt.lerp(desiredLook, Math.max(k, this.mode === 'foot' ? 0.6 : k));

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-6 * dt));
    this.camera.updateProjectionMatrix();
  }
}
