import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { CAR, GRAVITY, MATERIALS, RULES, type WheelDef } from '../config/PhysicsConstants';
import type { PhysicsEngine } from '../core/PhysicsEngine';
import { emptyControls, TEAM_COLORS, type CarControls, type Team } from '../core/types';
import type { BoostConsumer } from './BoostPad';
import { buildCarModel } from './CarModel';
import { presetInertia, type CarPreset } from '../config/CarPresets';
import type { Materials } from '../render/Materials';
import { approach, clamp, damp, evalCurve, lerp, projectOnPlane, sign } from '../utils/math';

const LOCAL_FWD = new THREE.Vector3(1, 0, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LOCAL_RIGHT = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const G = Math.abs(GRAVITY);
const FLIP_ROLLLOCK_TIME = 0.92;

interface Wheel {
  def: WheelDef;
  local: THREE.Vector3;
  world: THREE.Vector3;
  contact: boolean;
  onBall: boolean;
  hitDist: number;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  pivot: THREE.Object3D;
  tire: THREE.Object3D;
  spin: number;
  renderDrop: number;
}

export interface CarStats {
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  touches: number;
}

export type CarEvent = 'flipReset' | 'jump' | 'dodge' | 'land';

/**
 * Coche con hitbox Octane. El modelo de conducción es un raycast vehicle propio:
 * 4 rayos de suspensión (que también detectan el balón para flip resets), fricción
 * lateral dependiente del deslizamiento, fuerza adhesiva a superficies, giro por
 * curvatura medida y toda la máquina de estados de salto/dodge/control aéreo.
 */
export class Car implements BoostConsumer {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly group = new THREE.Group();
  readonly wheels: Wheel[] = [];
  private readonly flame: THREE.Group;
  private readonly flameMat: THREE.MeshBasicMaterial;

  controls: CarControls = emptyControls();
  boost: number = CAR.BOOST_SPAWN;
  infiniteBoost = false;
  stats: CarStats = { score: 0, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, touches: 0 };
  onEvent: ((car: Car, e: CarEvent) => void) | null = null;

  // Estado físico
  onGround = false;
  groundWheels = 0;
  numWheelContacts = 0;
  readonly contactNormal = new THREE.Vector3(0, 1, 0);
  isJumping = false;
  jumpTime = 0;
  hasJumped = false;
  hasDoubleJumped = false;
  hasFlipped = false;
  airTimeSinceJump = 0;
  timeSinceJumpStart = 10;
  isFlipping = false;
  flipTime = 0;
  flipCanceled = false;
  readonly flipDir = new THREE.Vector2();
  handbrakeVal = 0;
  isBoosting = false;
  boostingTime = 0;
  supersonic = false;
  supersonicTime = 0;
  demolished = false;
  respawnTimer = 0;
  lastBallTouchTick = -100;
  lastExtraImpulseTick = -100;
  private prevJump = false;
  private wasOnGround = false;

  // Caché de orientación del tick actual
  readonly pos = new THREE.Vector3();
  readonly quat = new THREE.Quaternion();
  readonly fwd = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly right = new THREE.Vector3(0, 0, 1);
  readonly velPre = new THREE.Vector3();
  readonly angVelPre = new THREE.Vector3();
  readonly supersonicPre = { value: false };

  // Interpolación
  readonly prevPos = new THREE.Vector3();
  readonly currPos = new THREE.Vector3();
  readonly prevQuat = new THREE.Quaternion();
  readonly currQuat = new THREE.Quaternion();
  readonly renderPos = new THREE.Vector3();
  readonly renderQuat = new THREE.Quaternion();

  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly fwdP = new THREE.Vector3();
  private readonly rightP = new THREE.Vector3();
  private readonly downDir = new THREE.Vector3();
  private readonly sRel = new THREE.Vector3();
  private readonly sPv = new THREE.Vector3();
  private readonly sImpulse = new THREE.Vector3();
  private readonly sOrel = new THREE.Vector3();
  private readonly sOv = new THREE.Vector3();

  constructor(
    private readonly physics: PhysicsEngine,
    readonly id: number,
    readonly team: Team,
    public name: string,
    readonly isBot: boolean,
    readonly preset: CarPreset,
    accent: number,
    mats: Materials,
  ) {
    const R = physics.R;
    const [ix, iy, iz] = presetInertia(preset);
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(0, CAR.SPAWN_HEIGHT, 0)
        .setAdditionalMassProperties(CAR.MASS, { x: 0, y: 0, z: 0 }, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 })
        .setCcdEnabled(true)
        .setCanSleep(false)
        .setLinearDamping(0)
        .setAngularDamping(0),
    );
    const [hx, hy, hz] = preset.hitboxHalf;
    const [ox, oy, oz] = preset.hitboxOffset;
    this.collider = physics.world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(ox, oy, oz)
        .setDensity(0)
        .setFriction(MATERIALS.CAR_FRICTION)
        .setRestitution(MATERIALS.CAR_RESTITUTION)
        .setFrictionCombineRule(R.CoefficientCombineRule.Multiply)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Multiply),
      this.body,
    );
    physics.tag(this.collider, { kind: 'car', carId: id });

    const built = buildCarModel(preset, TEAM_COLORS[team], accent, mats);
    this.group.add(built.root);
    this.flame = built.flame;
    this.flameMat = built.flameMat;
    preset.wheels.forEach((def, i) => {
      this.wheels.push({
        def,
        local: new THREE.Vector3(def.x, 0, def.z),
        world: new THREE.Vector3(),
        contact: false,
        onBall: false,
        hitDist: CAR.WHEEL_RAY_LENGTH,
        normal: new THREE.Vector3(0, 1, 0),
        point: new THREE.Vector3(),
        pivot: built.wheelPivots[i],
        tire: built.tires[i],
        spin: 0,
        renderDrop: CAR.WHEEL_RAY_LENGTH - def.radius,
      });
    });
    this.snapshot();
    this.snapshot();
  }

  get active(): boolean {
    return !this.demolished;
  }

  get boostPosition(): THREE.Vector3 {
    return this.currPos;
  }

  get speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** true si el coche aún puede hacer doble salto o dodge. */
  get hasFlipAvailable(): boolean {
    if (this.onGround) return true;
    return !this.hasDoubleJumped && !this.hasFlipped && (!this.hasJumped || this.airTimeSinceJump < CAR.DOUBLE_JUMP_WINDOW);
  }

  // ---------------------------------------------------------------- simulación

  preStep(dt: number): void {
    if (this.demolished) return;
    const c = this.controls;
    const t = this.body.translation();
    const r = this.body.rotation();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(r.x, r.y, r.z, r.w);
    this.fwd.copy(LOCAL_FWD).applyQuaternion(this.quat);
    this.up.copy(LOCAL_UP).applyQuaternion(this.quat);
    this.right.copy(LOCAL_RIGHT).applyQuaternion(this.quat);
    const lv0 = this.body.linvel();
    const av0 = this.body.angvel();
    this.velPre.set(lv0.x, lv0.y, lv0.z);
    this.angVelPre.set(av0.x, av0.y, av0.z);
    this.supersonicPre.value = this.supersonic;

    this.updateSuspension(dt);

    const lv = this.body.linvel();
    const av = this.body.angvel();
    const v = this.v.set(lv.x, lv.y, lv.z);
    const w = this.w.set(av.x, av.y, av.z);

    const onGround = this.groundWheels >= 3;
    const contactFrac = this.groundWheels / 4;
    this.onGround = onGround;
    if (onGround && !this.wasOnGround) this.onEvent?.(this, 'land');
    this.wasOnGround = onGround;

    // ---- Estado de salto
    const jumpPressed = c.jump && !this.prevJump;
    this.prevJump = c.jump;
    this.timeSinceJumpStart += dt;

    if (onGround && !this.isJumping && this.timeSinceJumpStart > CAR.JUMP_GROUND_RESET_PAD) {
      this.hasJumped = false;
      this.hasDoubleJumped = false;
      this.hasFlipped = false;
      this.airTimeSinceJump = 0;
      if (this.isFlipping && this.flipTime > dt * 2) {
        // Aterrizar durante un dodge (wavedash) termina el flip: el suelo absorbe
        // la rotación de pitch/roll y se conserva el impulso horizontal.
        this.isFlipping = false;
        const wr = w.dot(this.fwd);
        const wp = w.dot(this.right);
        w.addScaledVector(this.fwd, -wr * 0.85).addScaledVector(this.right, -wp * 0.85);
      }
    }

    // Flip reset: las 4 ruedas tocan cualquier superficie (balón incluido) en el aire
    if (!onGround && this.numWheelContacts === 4 && !this.isJumping) {
      const hadUsed = this.hasFlipped || this.hasDoubleJumped || (this.hasJumped && this.airTimeSinceJump >= CAR.DOUBLE_JUMP_WINDOW);
      this.hasJumped = false;
      this.hasDoubleJumped = false;
      this.hasFlipped = false;
      this.airTimeSinceJump = 0;
      if (hadUsed) this.onEvent?.(this, 'flipReset');
    }

    if (this.isJumping) {
      this.jumpTime += dt;
      if ((!c.jump && this.jumpTime >= CAR.JUMP_MIN_TIME) || this.jumpTime >= CAR.JUMP_MAX_TIME) {
        this.isJumping = false;
        this.hasJumped = true;
      }
    }

    if (jumpPressed) {
      if (onGround && !this.isJumping) {
        this.isJumping = true;
        this.jumpTime = 0;
        this.timeSinceJumpStart = 0;
        v.addScaledVector(this.up, CAR.JUMP_IMPULSE);
        this.onEvent?.(this, 'jump');
      } else if (!onGround && this.groundWheels === 0 && this.tryTurtleRecovery(v, w)) {
        // recuperación tras quedar volcado
      } else if (
        !onGround &&
        !this.isJumping &&
        !this.hasDoubleJumped &&
        !this.hasFlipped &&
        (!this.hasJumped || this.airTimeSinceJump < CAR.DOUBLE_JUMP_WINDOW)
      ) {
        this.doubleJumpOrDodge(c, v);
      }
    }

    if (this.isJumping) v.addScaledVector(this.up, CAR.JUMP_HOLD_ACCEL * dt);
    if (!onGround && this.hasJumped && !this.isJumping) this.airTimeSinceJump += dt;

    // ---- Dodge: torque, cancelación (half-flip / speedflip), pitch-lock y z-damping
    let doAir = !onGround;
    let pitchLocked = false;
    let rollLocked = false;
    if (this.isFlipping) {
      this.flipTime += dt;
      if (this.flipTime >= FLIP_ROLLLOCK_TIME) {
        this.isFlipping = false;
      } else {
        const hasDir = this.flipDir.lengthSq() > 0;
        let pitchComp = -this.flipDir.x;
        const rollComp = this.flipDir.y;
        if (this.flipTime < CAR.FLIP_TORQUE_TIME && hasDir) {
          doAir = false;
          if (pitchComp !== 0 && c.pitch !== 0 && sign(pitchComp) !== sign(c.pitch)) {
            pitchComp *= 1 - Math.min(Math.abs(c.pitch), 1);
            doAir = !onGround;
            this.flipCanceled = true;
          }
          w.addScaledVector(this.fwd, rollComp * CAR.FLIP_TORQUE_ROLL * dt);
          w.addScaledVector(this.right, pitchComp * CAR.FLIP_TORQUE_PITCH * dt);
        }
        if (hasDir && !this.flipCanceled) {
          pitchLocked = this.flipDir.x !== 0 && this.flipTime < CAR.FLIP_PITCHLOCK_TIME;
          rollLocked = this.flipDir.y !== 0;
        }
        if (
          this.flipTime >= CAR.FLIP_Z_DAMP_START &&
          this.flipTime < CAR.FLIP_TORQUE_TIME &&
          (v.y < 0 || this.flipTime < CAR.FLIP_Z_DAMP_END)
        ) {
          v.y *= Math.pow(1 - CAR.FLIP_Z_DAMP_PER_TICK, dt * 120);
        }
      }
    }

    // ---- Control aéreo (pitch, yaw, air roll)
    if (doAir) {
      const [tR, tP, tY] = CAR.AIR_TORQUE;
      const [dR, dP, dY] = CAR.AIR_DAMPING;
      const wr = w.dot(this.fwd);
      const wp = w.dot(this.right);
      const wy = -w.dot(this.up);
      const uP = pitchLocked ? 0 : c.pitch;
      const aR = tR * c.roll - (rollLocked ? 0 : dR * wr);
      const aP = pitchLocked ? 0 : tP * uP - dP * (1 - Math.abs(uP)) * wp;
      const aY = tY * c.yaw - dY * (1 - Math.abs(c.yaw)) * wy;
      w.addScaledVector(this.fwd, aR * dt);
      w.addScaledVector(this.right, aP * dt);
      w.addScaledVector(this.up, -aY * dt);
    }

    // ---- Conducción
    this.handbrakeVal = approach(
      this.handbrakeVal,
      c.handbrake ? 1 : 0,
      (c.handbrake ? CAR.HANDBRAKE_RISE : CAR.HANDBRAKE_FALL) * dt,
    );
    const boosting = this.updateBoost(c.boost, dt);
    const throttle = boosting ? 1 : c.throttle;

    if (this.groundWheels > 0) {
      const n = this.contactNormal;
      projectOnPlane(this.fwdP, this.fwd, n).normalize();
      projectOnPlane(this.rightP, this.right, n).normalize();
      const vf = v.dot(this.fwdP);
      const vl = v.dot(this.rightP);
      const absF = Math.abs(vf);

      let dvF: number;
      if (Math.abs(throttle) > 0.01) {
        if (throttle * vf < 0 && absF > 0.1) dvF = -sign(vf) * Math.min(CAR.BRAKE_ACCEL * dt, absF);
        else dvF = throttle * evalCurve(CAR.THROTTLE_CURVE, absF) * dt;
      } else {
        dvF = -sign(vf) * Math.min(CAR.COAST_ACCEL * dt, absF);
      }
      v.addScaledVector(this.fwdP, dvF * contactFrac);

      const slip = Math.abs(vl) / Math.max(Math.abs(vl) + absF, 0.05);
      let friction = evalCurve(CAR.LAT_FRICTION_CURVE, slip) * lerp(1, CAR.HANDBRAKE_LAT_FACTOR, this.handbrakeVal);
      if (Math.abs(throttle) < 0.01) friction *= evalCurve(CAR.NON_STICKY_FRICTION_CURVE, Math.abs(n.y));
      v.addScaledVector(this.rightP, -vl * clamp(friction, 0, 1) * contactFrac);

      let yawRate = c.steer * evalCurve(CAR.STEER_CURVATURE, absF) * vf;
      yawRate *= lerp(1, CAR.POWERSLIDE_YAW_SCALE, this.handbrakeVal);
      const wyCur = w.dot(this.up);
      w.addScaledVector(this.up, (-yawRate - wyCur) * Math.min(1, CAR.YAW_RESPONSE * dt) * contactFrac);

      if (!this.isJumping) {
        const sticky = CAR.STICKY_BASE + (1 - Math.abs(n.y));
        v.addScaledVector(n, -G * sticky * dt * contactFrac);
      }
    } else {
      v.addScaledVector(this.fwd, throttle * CAR.AIR_THROTTLE_ACCEL * dt);
    }

    if (boosting) v.addScaledVector(this.fwd, (onGround ? CAR.BOOST_ACCEL_GROUND : CAR.BOOST_ACCEL_AIR) * dt);

    this.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
    this.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
  }

  private updateSuspension(dt: number): void {
    this.downDir.copy(this.up).negate();
    this.groundWheels = 0;
    this.numWheelContacts = 0;
    this.contactNormal.set(0, 0, 0);
    const lv = this.body.linvel();
    const av = this.body.angvel();
    const linV = this.tmp.set(lv.x, lv.y, lv.z);
    const angV = this.tmp2.set(av.x, av.y, av.z);
    const rel = this.sRel;
    const pv = this.sPv;
    const impulse = this.sImpulse;

    for (const wheel of this.wheels) {
      wheel.world.copy(wheel.local).applyQuaternion(this.quat).add(this.pos);
      wheel.contact = false;
      wheel.onBall = false;
      wheel.hitDist = CAR.WHEEL_RAY_LENGTH;
      const hit = this.physics.raycast(wheel.world, this.downDir, CAR.WHEEL_RAY_LENGTH, this.body);
      if (!hit || hit.normal.dot(this.up) < 0.25) continue;
      wheel.contact = true;
      wheel.hitDist = hit.distance;
      wheel.normal.copy(hit.normal);
      wheel.point.copy(hit.point);
      this.numWheelContacts++;
      const isBall = hit.tag?.kind === 'ball';
      wheel.onBall = isBall;
      if (!isBall) {
        this.groundWheels++;
        this.contactNormal.add(hit.normal);
      }

      rel.subVectors(hit.point, this.pos);
      pv.crossVectors(angV, rel).add(linV);
      const other = hit.collider.parent();
      const otherDynamic = other !== null && other.isDynamic() && other.handle !== this.body.handle;
      if (other && otherDynamic) {
        const ot = other.translation();
        const ol = other.linvel();
        const oa = other.angvel();
        this.sOrel.set(hit.point.x - ot.x, hit.point.y - ot.y, hit.point.z - ot.z);
        this.sOv.set(oa.x, oa.y, oa.z).cross(this.sOrel);
        pv.x -= this.sOv.x + ol.x;
        pv.y -= this.sOv.y + ol.y;
        pv.z -= this.sOv.z + ol.z;
      }
      const compression = CAR.WHEEL_RAY_LENGTH - hit.distance;
      const compRate = -pv.dot(this.up);
      let accel =
        CAR.SUSPENSION_STIFFNESS * compression +
        (compRate > 0 ? CAR.SUSPENSION_DAMP_COMPRESS : CAR.SUSPENSION_DAMP_RELAX) * compRate;
      if (compression > CAR.BUMP_STOP_START) accel += CAR.BUMP_STOP_STIFFNESS * (compression - CAR.BUMP_STOP_START);
      if (accel <= 0) continue;
      const j = accel * (CAR.MASS / 4) * dt;
      impulse.copy(this.up).multiplyScalar(j);
      this.body.applyImpulseAtPoint({ x: impulse.x, y: impulse.y, z: impulse.z }, { x: hit.point.x, y: hit.point.y, z: hit.point.z }, true);
      if (other && otherDynamic) {
        other.applyImpulseAtPoint({ x: -impulse.x, y: -impulse.y, z: -impulse.z }, { x: hit.point.x, y: hit.point.y, z: hit.point.z }, true);
      }
    }
    if (this.groundWheels > 0) this.contactNormal.normalize();
    else this.contactNormal.copy(this.up);
  }

  private doubleJumpOrDodge(c: CarControls, v: THREE.Vector3): void {
    const inputMag = Math.abs(c.pitch) + Math.abs(c.yaw) + Math.abs(c.roll);
    if (inputMag < c.dodgeDeadzone) {
      v.addScaledVector(this.up, CAR.JUMP_IMPULSE);
      this.hasDoubleJumped = true;
      this.onEvent?.(this, 'jump');
      return;
    }
    this.hasFlipped = true;
    this.isFlipping = true;
    this.flipCanceled = false;
    this.flipTime = 0;
    let dx = -c.pitch;
    let dy = c.yaw + c.roll;
    if (Math.abs(dx) < CAR.FLIP_INPUT_THRESHOLD) dx = 0;
    if (Math.abs(dy) < CAR.FLIP_INPUT_THRESHOLD) dy = 0;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    this.flipDir.set(dx, dy);
    this.onEvent?.(this, 'dodge');
    if (len === 0) return;

    const vf = v.dot(this.fwd);
    const ratio = Math.abs(vf) / CAR.MAX_SPEED;
    const backwards = Math.abs(vf) < 1 ? dx < 0 : dx >= 0 !== vf > 0;
    let ix = dx * CAR.FLIP_INITIAL_VEL;
    let iy = dy * CAR.FLIP_INITIAL_VEL;
    const maxScaleX = backwards ? CAR.FLIP_BACKWARD_SCALE : CAR.FLIP_FORWARD_SCALE;
    ix *= (maxScaleX - 1) * ratio + 1;
    iy *= (CAR.FLIP_SIDE_SCALE - 1) * ratio + 1;
    if (backwards) ix *= CAR.FLIP_BACKWARD_X_SCALE;

    const fwd2 = new THREE.Vector3(this.fwd.x, 0, this.fwd.z);
    if (fwd2.lengthSq() < 0.01) fwd2.set(-this.up.x, 0, -this.up.z);
    if (fwd2.lengthSq() < 0.01) fwd2.set(1, 0, 0);
    fwd2.normalize();
    const right2 = new THREE.Vector3().crossVectors(fwd2, WORLD_UP);
    v.addScaledVector(fwd2, ix).addScaledVector(right2, iy);
  }

  /** Volcado sobre el techo o el lateral: el salto devuelve el coche sobre sus ruedas. */
  private tryTurtleRecovery(v: THREE.Vector3, w: THREE.Vector3): boolean {
    if (this.up.y > 0.35) return false;
    const touching = this.physics.contactsOf(this.collider).some((col) => this.physics.isArena(col));
    if (!touching) return false;
    const axis = new THREE.Vector3().crossVectors(this.up, WORLD_UP);
    let s = sign(axis.dot(this.fwd));
    if (s === 0) s = 1;
    v.addScaledVector(WORLD_UP, CAR.TURTLE_FLIP_IMPULSE);
    w.copy(this.fwd).multiplyScalar(s * CAR.TURTLE_FLIP_SPIN);
    return true;
  }

  private updateBoost(wants: boolean, dt: number): boolean {
    if (wants && this.boost > 0) {
      if (!this.isBoosting) this.boostingTime = 0;
      this.isBoosting = true;
    } else if (!(this.isBoosting && this.boostingTime < CAR.BOOST_MIN_TIME && this.boost > 0)) {
      this.isBoosting = false;
    }
    if (this.isBoosting) {
      this.boostingTime += dt;
      if (!this.infiniteBoost) this.boost = Math.max(0, this.boost - CAR.BOOST_PER_SECOND * dt);
    }
    return this.isBoosting;
  }

  postStep(dt: number): void {
    if (this.demolished) {
      this.snapshot();
      return;
    }
    const lv = this.body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    if (speed > CAR.MAX_SPEED) {
      const k = CAR.MAX_SPEED / speed;
      this.body.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true);
    }
    const av = this.body.angvel();
    const ang = Math.hypot(av.x, av.y, av.z);
    if (ang > CAR.MAX_ANG_SPEED) {
      const k = CAR.MAX_ANG_SPEED / ang;
      this.body.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true);
    }
    const s = Math.min(speed, CAR.MAX_SPEED);
    if (s >= CAR.SUPERSONIC_START) {
      this.supersonic = true;
      this.supersonicTime = 0;
    } else if (this.supersonic && s >= CAR.SUPERSONIC_MAINTAIN_MIN && this.supersonicTime < CAR.SUPERSONIC_MAINTAIN_TIME) {
      this.supersonicTime += dt;
    } else {
      this.supersonic = false;
    }
    this.snapshot();
  }

  private snapshot(): void {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }

  // ---------------------------------------------------------------- ciclo de vida

  /** Coloca el coche mirando hacia (dirX, dirZ). */
  placeAt(x: number, z: number, dirX: number, dirZ: number, boost: number = CAR.BOOST_SPAWN): void {
    const yaw = Math.atan2(-dirZ, dirX);
    const q = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, yaw);
    this.body.setEnabled(true);
    this.body.setTranslation({ x, y: CAR.SPAWN_HEIGHT, z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.boost = boost;
    this.demolished = false;
    this.respawnTimer = 0;
    this.resetState();
    this.snapshot();
    this.snapshot();
  }

  resetState(): void {
    this.isJumping = false;
    this.jumpTime = 0;
    this.hasJumped = false;
    this.hasDoubleJumped = false;
    this.hasFlipped = false;
    this.airTimeSinceJump = 0;
    this.timeSinceJumpStart = 10;
    this.isFlipping = false;
    this.flipTime = 0;
    this.flipCanceled = false;
    this.handbrakeVal = 0;
    this.isBoosting = false;
    this.boostingTime = 0;
    this.supersonic = false;
    this.supersonicTime = 0;
    this.controls = emptyControls();
    this.prevJump = false;
  }

  demolish(): void {
    if (this.demolished) return;
    this.demolished = true;
    this.respawnTimer = RULES.DEMO_RESPAWN;
    this.isBoosting = false;
    this.supersonic = false;
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    this.body.setEnabled(false);
  }

  /** Mantiene el coche quieto en su sitio (cuenta atrás del saque). */
  hold(): void {
    this.body.setLinvel({ x: 0, y: Math.min(0, this.body.linvel().y), z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.physics.world.removeRigidBody(this.body);
  }

  // ---------------------------------------------------------------- render

  render(alpha: number, frameDt: number): void {
    this.group.visible = !this.demolished;
    if (this.demolished) return;
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.renderQuat.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.group.position.copy(this.renderPos);
    this.group.quaternion.copy(this.renderQuat);

    const lv = this.body.linvel();
    const fwd = this.tmp.copy(LOCAL_FWD).applyQuaternion(this.renderQuat);
    const forwardSpeed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z;
    for (const wheel of this.wheels) {
      const targetDrop = (wheel.contact ? wheel.hitDist : CAR.WHEEL_RAY_LENGTH) - wheel.def.radius;
      wheel.renderDrop = damp(wheel.renderDrop, targetDrop, 30, frameDt);
      wheel.pivot.position.y = -wheel.renderDrop;
      if (wheel.contact || Math.abs(forwardSpeed) > 0.1) wheel.spin -= (forwardSpeed / wheel.def.radius) * frameDt;
      wheel.tire.rotation.z = wheel.spin;
      if (wheel.def.front) wheel.pivot.rotation.y = -this.controls.steer * 0.42;
    }

    this.flame.visible = this.isBoosting;
    if (this.isBoosting) {
      const f = 0.85 + Math.random() * 0.35;
      this.flame.scale.set(f * (this.supersonic ? 1.35 : 1), 1, 1);
      this.flameMat.opacity = 0.75 + Math.random() * 0.25;
    }
  }
}
