import * as THREE from 'three';
import { BALL, BALL_HIT, BUMP, PINCH } from '../config/PhysicsConstants';
import type { PhysicsEngine } from '../core/PhysicsEngine';
import type { Ball } from '../entities/Ball';
import type { Car } from '../entities/Car';
import { evalCurve, projectOnPlane } from '../utils/math';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface InteractionEvents {
  onBallTouch: (car: Car, relSpeed: number, ballVelBefore: THREE.Vector3) => void;
  onDemolish: (attacker: Car, victim: Car) => void;
  onBump: (attacker: Car, victim: Car) => void;
  onPinch: (car: Car, speed: number) => void;
}

/**
 * Reglas de contacto que el solver genérico no reproduce por sí solo:
 *  - Impulso extra coche-balón dependiente de la velocidad relativa.
 *  - Pinch: el balón comprimido entre el coche y una superficie libera la
 *    energía de cierre en la dirección tangente de menor resistencia.
 *  - Bumps y demoliciones en estado supersónico con el morro del atacante.
 */
export class Interactions {
  friendlyDemos = false;
  private readonly bumpCooldown = new Map<string, number>();
  private lastPinchTime = -10;

  constructor(
    private readonly physics: PhysicsEngine,
    private readonly ball: Ball,
    private readonly events: InteractionEvents,
  ) {}

  reset(): void {
    this.bumpCooldown.clear();
    this.lastPinchTime = -10;
  }

  process(cars: readonly Car[], time: number): void {
    this.processBall(cars, time);
    this.processCars(cars, time);
  }

  private processBall(cars: readonly Car[], time: number): void {
    if (!this.ball.visible) return;
    const ballPos = this.ball.position;
    for (const car of cars) {
      if (car.demolished) continue;
      if (!this.physics.touching(car.collider, this.ball.collider)) continue;
      const tick = this.physics.tick;
      // Toque nuevo (estadísticas y eventos) si no había contacto en el tick anterior
      const isNewTouch = tick - car.lastBallTouchTick > 1;
      car.lastBallTouchTick = tick;
      const t = car.body.translation();
      const carPos = new THREE.Vector3(t.x, t.y, t.z);

      // Como RocketSim: mientras dura el contacto, el impulso extra se reaplica
      // cada 2 ticks. Son los micro-empujones que sostienen dribbles y air dribbles.
      let relSpeed = 0;
      if (tick > car.lastExtraImpulseTick + 1 || car.lastExtraImpulseTick > tick) {
        car.lastExtraImpulseTick = tick;
        const rel = new THREE.Vector3().subVectors(this.ball.velPre, car.velPre);
        relSpeed = Math.min(rel.length(), BALL_HIT.MAX_REL_SPEED);
        if (relSpeed > 0) {
          const n = new THREE.Vector3().subVectors(ballPos, carPos);
          n.y *= BALL_HIT.VERTICAL_SCALE;
          if (n.lengthSq() > 1e-8) {
            n.normalize();
            n.addScaledVector(car.fwd, -BALL_HIT.FORWARD_ADJUST * n.dot(car.fwd)).normalize();
            const scale = evalCurve(BALL_HIT.SCALE_CURVE, relSpeed);
            const v = this.ball.body.linvel();
            this.ball.body.setLinvel(
              { x: v.x + n.x * relSpeed * scale, y: v.y + n.y * relSpeed * scale, z: v.z + n.z * relSpeed * scale },
              true,
            );
          }
        }
      }
      if (isNewTouch) {
        if (relSpeed === 0) relSpeed = Math.min(this.ball.velPre.distanceTo(car.velPre), BALL_HIT.MAX_REL_SPEED);
        this.events.onBallTouch(car, relSpeed, this.ball.velPre.clone());
      }
      this.processPinch(car, carPos, ballPos, time);
    }
  }

  private processPinch(car: Car, carPos: THREE.Vector3, ballPos: THREE.Vector3, time: number): void {
    if (time - this.lastPinchTime < PINCH.COOLDOWN) return;
    const probe = this.physics.probeArena(ballPos, BALL.RADIUS + PINCH.SURFACE_MARGIN);
    if (!probe) return;
    const nW = probe.normal;
    const carToBall = new THREE.Vector3().subVectors(ballPos, carPos).normalize();
    if (carToBall.dot(nW) > -0.2) return;

    const contact = ballPos.clone().addScaledVector(carToBall, -BALL.RADIUS);
    const arm = new THREE.Vector3().subVectors(contact, carPos);
    const vPoint = new THREE.Vector3().crossVectors(car.angVelPre, arm).add(car.velPre);
    const closing = new THREE.Vector3().subVectors(vPoint, this.ball.velPre).dot(nW) * -1;
    if (closing < PINCH.MIN_CLOSING_SPEED) return;

    const offset = projectOnPlane(new THREE.Vector3(), new THREE.Vector3().subVectors(ballPos, carPos), nW);
    const tanVel = projectOnPlane(new THREE.Vector3(), vPoint, nW);
    const escape = new THREE.Vector3();
    if (offset.lengthSq() > 1e-4) escape.add(offset.normalize());
    escape.addScaledVector(tanVel, 1 / Math.max(1, vPoint.length()));
    if (escape.lengthSq() < 1e-4) escape.copy(carToBall).negate();
    escape.normalize().addScaledVector(nW, PINCH.NORMAL_LIFT).normalize();

    const current = this.ball.body.linvel();
    const speed = Math.min(BALL.MAX_SPEED, Math.hypot(current.x, current.y, current.z) + closing * PINCH.GAIN);
    this.ball.body.setLinvel({ x: escape.x * speed, y: escape.y * speed, z: escape.z * speed }, true);
    this.lastPinchTime = time;
    this.events.onPinch(car, speed);
  }

  private processCars(cars: readonly Car[], time: number): void {
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.demolished) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.demolished) continue;
        const key = `${a.id}-${b.id}`;
        if ((this.bumpCooldown.get(key) ?? -1) > time) continue;
        if (!this.physics.touching(a.collider, b.collider)) continue;
        const hitAB = this.tryHit(a, b);
        const hitBA = !b.demolished && !a.demolished ? this.tryHit(b, a) : false;
        if (hitAB || hitBA) this.bumpCooldown.set(key, time + BUMP.COOLDOWN);
      }
    }
  }

  private tryHit(attacker: Car, victim: Car): boolean {
    const ta = attacker.body.translation();
    const tv = victim.body.translation();
    const dir = new THREE.Vector3(tv.x - ta.x, tv.y - ta.y, tv.z - ta.z).normalize();
    if (dir.dot(attacker.fwd) < BUMP.FRONT_DOT) return false;
    const closing = new THREE.Vector3().subVectors(attacker.velPre, victim.velPre).dot(dir);
    if (closing < 1) return false;

    if (attacker.supersonicPre.value && (attacker.team !== victim.team || this.friendlyDemos)) {
      victim.demolish();
      this.events.onDemolish(attacker, victim);
      return true;
    }
    const fwdSpeed = Math.max(0, attacker.velPre.dot(attacker.fwd));
    const amount = evalCurve(victim.onGround ? BUMP.GROUND_CURVE : BUMP.AIR_CURVE, fwdSpeed);
    const lift = evalCurve(BUMP.UP_CURVE, fwdSpeed);
    const pushDir = attacker.velPre.lengthSq() > 0.01 ? attacker.velPre.clone().normalize() : dir;
    const v = victim.body.linvel();
    victim.body.setLinvel(
      {
        x: v.x + pushDir.x * amount + WORLD_UP.x * lift,
        y: v.y + pushDir.y * amount + WORLD_UP.y * lift,
        z: v.z + pushDir.z * amount + WORLD_UP.z * lift,
      },
      true,
    );
    this.events.onBump(attacker, victim);
    return true;
  }
}
