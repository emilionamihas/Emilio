import * as THREE from 'three';
import { ARENA, BALL } from '../config/PhysicsConstants';
import { emptyControls, type BotDifficulty, type CarControls } from '../core/types';
import type { Ball } from '../entities/Ball';
import type { Car } from '../entities/Car';
import { clamp } from '../utils/math';

interface Sequence {
  kind: 'dodge' | 'jumpShot';
  t: number;
  yaw: number;
  pitch: number;
}

interface DifficultyProfile {
  maxThrottle: number;
  boostMinDist: number;
  dodgeChance: number;
  aimNoise: number;
  jumpShots: boolean;
  reaction: number;
}

const PROFILES: Record<BotDifficulty, DifficultyProfile> = {
  novato: { maxThrottle: 0.85, boostMinDist: 1e9, dodgeChance: 0.25, aimNoise: 3.5, jumpShots: false, reaction: 0.35 },
  pro: { maxThrottle: 1, boostMinDist: 18, dodgeChance: 0.6, aimNoise: 1.5, jumpShots: true, reaction: 0.15 },
  allstar: { maxThrottle: 1, boostMinDist: 9, dodgeChance: 0.95, aimNoise: 0.4, jumpShots: true, reaction: 0.05 },
};

export interface BotContext {
  ball: Ball;
  cars: readonly Car[];
  kickoff: boolean;
  frozen: boolean;
}

/**
 * IA sencilla pero competente: ataca colocándose detrás del balón respecto a la
 * portería rival, rota hacia su portería cuando queda mal posicionada, usa
 * dodges y tiros elevados y se reorienta en el aire para aterrizar sobre ruedas.
 */
export class BotController {
  private seq: Sequence | null = null;
  private stuckTime = 0;
  private reverseTime = 0;
  private decisionTimer = 0;
  private readonly aimOffset = new THREE.Vector3();
  private readonly profile: DifficultyProfile;

  constructor(readonly car: Car, difficulty: BotDifficulty) {
    this.profile = PROFILES[difficulty];
  }

  update(dt: number, ctx: BotContext): CarControls {
    const c = emptyControls();
    const car = this.car;
    if (car.demolished || ctx.frozen) {
      this.seq = null;
      return c;
    }
    const ballPos = ctx.ball.currPos;
    const ballVel = ctx.ball.velocity;
    const pos = car.currPos;
    const enemyZ = car.team === 0 ? ARENA.HALF_LENGTH : -ARENA.HALF_LENGTH;
    const ownZ = -enemyZ;
    const attackSign = Math.sign(enemyZ);

    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = this.profile.reaction + Math.random() * 0.2;
      this.aimOffset.set((Math.random() - 0.5) * this.profile.aimNoise, 0, 0);
    }

    if (this.seq) return this.runSequence(dt, c, ballPos);

    if (!car.onGround) {
      this.airRecovery(c, ballPos);
      if (car.groundWheels === 0 && car.up.y < -0.2 && car.speed < 2) c.jump = Math.random() < 0.5;
      return c;
    }

    const toBall = new THREE.Vector3().subVectors(ballPos, pos);
    const distBall = Math.hypot(toBall.x, toBall.z);
    const speed = car.speed;

    // Predicción lineal de la posición del balón
    const tPred = clamp(distBall / Math.max(speed, 10), 0, 1.2);
    const pb = new THREE.Vector3().copy(ballPos).addScaledVector(ballVel, tPred);
    pb.x = clamp(pb.x, -ARENA.HALF_WIDTH + 2, ARENA.HALF_WIDTH - 2);
    pb.z = clamp(pb.z, -ARENA.HALF_LENGTH + 2, ARENA.HALF_LENGTH - 2);

    const teammates = ctx.cars.filter((o) => o.team === car.team && !o.demolished);
    const myScore = this.approachScore(car, pb, attackSign);
    const isAttacker = ctx.kickoff
      ? teammates.every((o) => o === car || o.currPos.distanceTo(ballPos) > pos.distanceTo(ballPos) - 0.01)
      : teammates.every((o) => o === car || this.approachScore(o, pb, attackSign) >= myScore);

    let target: THREE.Vector3;
    let wantBoost = false;
    let arriveSlow = false;
    const enemyGoal = new THREE.Vector3(this.aimOffset.x, 0, enemyZ);

    if (ctx.kickoff && isAttacker) {
      target = new THREE.Vector3(0, 0, 0);
      wantBoost = true;
      if (distBall < 4.5 + speed * 0.12) this.startDodge(0, -1);
    } else if (isAttacker) {
      const wrongSide = (pos.z - pb.z) * attackSign > 1.5;
      if (wrongSide) {
        target = new THREE.Vector3(pb.x + (pos.x > pb.x ? 7 : -7), 0, ownZ * 0.6 + pb.z * 0.4);
        wantBoost = distBall > 20;
      } else {
        const shotDir = new THREE.Vector3().subVectors(enemyGoal, pb).setY(0).normalize();
        const offset = distBall > 8 ? BALL.RADIUS + 2.6 : BALL.RADIUS + 0.6;
        target = pb.clone().addScaledVector(shotDir, -offset);
        if (distBall < 3.5) target = pb.clone();
        wantBoost = distBall > this.profile.boostMinDist;
      }
    } else {
      const ownGoal = new THREE.Vector3(0, 0, ownZ);
      target = new THREE.Vector3().lerpVectors(ownGoal, pb, 0.38);
      target.x *= 0.6;
      arriveSlow = true;
      const threat = ballVel.z * -attackSign > 8 && Math.abs(ballPos.z - ownZ) < 35;
      if (threat) {
        target = pb.clone();
        arriveSlow = false;
        wantBoost = true;
      }
    }
    target.y = 0;

    // Dirección hacia el objetivo en el marco local del coche
    const toTarget = new THREE.Vector3().subVectors(target, pos);
    const dist = toTarget.length();
    const angle = Math.atan2(toTarget.dot(car.right), toTarget.dot(car.fwd));
    c.steer = clamp(angle * 3.2, -1, 1);
    c.yaw = c.steer;
    c.throttle = this.profile.maxThrottle;
    c.handbrake = Math.abs(angle) > 1.5 && speed > 7;
    if (arriveSlow && dist < 6) c.throttle = clamp(dist / 6, 0, 1) * (Math.abs(angle) < 1.5 ? 1 : -0.3);
    c.boost = wantBoost && Math.abs(angle) < 0.3 && speed < 22.6 && car.boost > 0 && car.up.y > 0.8;

    // Atasco: marcha atrás un momento
    if (speed < 1.2 && Math.abs(c.throttle) > 0.5) this.stuckTime += dt;
    else this.stuckTime = 0;
    if (this.stuckTime > 1.2) {
      this.reverseTime = 0.7;
      this.stuckTime = 0;
    }
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      c.throttle = -1;
      c.steer = -c.steer;
      c.boost = false;
    }

    // Toques: dodge al balón bajo, salto al balón elevado
    if (isAttacker && !ctx.kickoff) {
      const angBall = Math.atan2(toBall.dot(car.right), toBall.dot(car.fwd));
      const ballH = ballPos.y;
      if (distBall < 3.4 && Math.abs(angBall) < 0.4 && ballH < 2.0 && speed > 6 && Math.random() < this.profile.dodgeChance * 0.25) {
        const aimLocal = new THREE.Vector3().subVectors(enemyGoal, pos);
        const side = clamp(Math.atan2(aimLocal.dot(car.right), aimLocal.dot(car.fwd)) * 0.8, -0.6, 0.6);
        this.startDodge(side, -1);
      } else if (
        this.profile.jumpShots &&
        ballH > 2.4 &&
        ballH < 5.5 &&
        distBall < 3 + ballH * 1.2 &&
        Math.abs(angBall) < 0.3 &&
        Math.abs(ballVel.y) < 6
      ) {
        this.seq = { kind: 'jumpShot', t: 0, yaw: 0, pitch: -1 };
      }
    }
    return c;
  }

  /** Cuanto menor, mejor posicionado está el coche para atacar el balón. */
  private approachScore(car: Car, pb: THREE.Vector3, attackSign: number): number {
    const d = car.currPos.distanceTo(pb);
    const wrongSide = (car.currPos.z - pb.z) * attackSign > 1.5 ? 18 : 0;
    return d + wrongSide;
  }

  private startDodge(yaw: number, pitch: number): void {
    if (Math.random() > this.profile.dodgeChance && pitch !== -1) return;
    this.seq = { kind: 'dodge', t: 0, yaw, pitch };
  }

  private runSequence(dt: number, c: CarControls, ballPos: THREE.Vector3): CarControls {
    const s = this.seq as Sequence;
    s.t += dt;
    c.throttle = 1;
    if (s.kind === 'dodge') {
      if (s.t < 0.07) c.jump = true;
      else if (s.t < 0.12) c.jump = false;
      else if (s.t < 0.16) {
        c.jump = true;
        c.pitch = s.pitch;
        c.yaw = s.yaw;
      } else {
        c.pitch = s.pitch;
        c.yaw = s.yaw;
      }
      if (s.t > 0.95) this.seq = null;
      return c;
    }
    // jumpShot: salto completo, orientación al balón y dodge al llegar
    const car = this.car;
    const toBall = new THREE.Vector3().subVectors(ballPos, car.currPos);
    const ang = Math.atan2(toBall.dot(car.right), toBall.dot(car.fwd));
    c.yaw = clamp(ang * 2, -1, 1);
    if (s.t < 0.2) {
      c.jump = true;
      c.pitch = 0.3;
    } else if (toBall.length() < 2.6 || s.t > 0.85) {
      if (!car.hasFlipped) {
        c.jump = !(car.controls.jump);
        c.pitch = -1;
      }
    } else {
      c.pitch = clamp(Math.atan2(toBall.dot(car.up), toBall.dot(car.fwd)) * 1.5, -1, 1);
    }
    if (s.t > 1.8 || (s.t > 0.3 && car.onGround)) this.seq = null;
    return c;
  }

  private airRecovery(c: CarControls, ballPos: THREE.Vector3): void {
    const car = this.car;
    const flatToBall = new THREE.Vector3(ballPos.x - car.currPos.x, 0, ballPos.z - car.currPos.z);
    if (flatToBall.lengthSq() < 0.01) flatToBall.copy(car.fwd).setY(0);
    flatToBall.normalize();
    const pitchErr = -Math.asin(clamp(car.fwd.y, -1, 1));
    const rollErr = Math.atan2(car.right.y, car.up.y);
    const yawErr = Math.atan2(flatToBall.dot(car.right), flatToBall.dot(car.fwd));
    c.pitch = clamp(pitchErr * 2.8, -1, 1);
    c.roll = clamp(rollErr * 2.5, -1, 1);
    c.yaw = clamp(yawErr * 2.0, -1, 1);
    c.throttle = 1;
  }
}
