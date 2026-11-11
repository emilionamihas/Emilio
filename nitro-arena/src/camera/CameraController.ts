import * as THREE from 'three';
import type { PhysicsEngine } from '../core/PhysicsEngine';
import type { CameraSettings } from './CameraSettings';
import { clamp, damp, dampVec3, lerp } from '../utils/math';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface CameraTarget {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  onSurface: boolean;
}

/**
 * Cámara de tercera persona con dos modos (Ball Cam y cámara de coche) que se
 * mezclan con la velocidad de transición. La Ball Cam mantiene el horizonte
 * estable (sin alabeo) y la cámara de coche sigue la orientación del coche en
 * paredes y techo con la rigidez configurada.
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  ballCam = true;
  private blend = 1;
  private readonly pos = new THREE.Vector3(0, 5, -20);
  private readonly quat = new THREE.Quaternion();
  private readonly carHeading = new THREE.Vector3(0, 0, 1);
  private readonly ballHeading = new THREE.Vector3(0, 0, 1);
  private readonly camUp = new THREE.Vector3(0, 1, 0);
  private swivelYaw = 0;
  private swivelPitch = 0;
  private shakeTime = 0;
  private shakeAmount = 0;
  private initialized = false;

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly mat = new THREE.Matrix4();
  private readonly carPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  private readonly ballPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

  constructor(private readonly physics: PhysicsEngine, public settings: CameraSettings) {
    this.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 400);
    this.ballCam = settings.ballCamDefault;
    this.blend = this.ballCam ? 1 : 0;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.applyFov();
  }

  /** El FOV del juego es horizontal: se convierte a vertical según el aspecto. */
  applyFov(): void {
    const h = THREE.MathUtils.degToRad(this.settings.fov);
    const v = 2 * Math.atan(Math.tan(h / 2) / Math.max(0.5, this.camera.aspect));
    this.camera.fov = clamp(THREE.MathUtils.radToDeg(v), 30, 120);
    this.camera.updateProjectionMatrix();
  }

  shake(amount: number): void {
    if (!this.settings.shake) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
    this.shakeTime = 0.5;
  }

  snap(): void {
    this.initialized = false;
  }

  update(dt: number, target: CameraTarget, ballPos: THREE.Vector3, lookX: number, lookY: number): void {
    const s = this.settings;
    const carPos = target.position;
    const carFwd = this.tmp.set(1, 0, 0).applyQuaternion(target.quaternion);
    const carUp = this.tmp2.set(0, 1, 0).applyQuaternion(target.quaternion);

    if (!this.initialized) {
      this.carHeading.set(carFwd.x, 0, carFwd.z).normalize();
      this.ballHeading.copy(this.carHeading);
      this.camUp.copy(WORLD_UP);
      this.blend = this.ballCam ? 1 : 0;
    }

    // Swivel manual con el stick derecho
    const swivelRate = s.swivelSpeed * 1.8;
    this.swivelYaw = damp(this.swivelYaw, -lookX * Math.PI, swivelRate, dt);
    this.swivelPitch = damp(this.swivelPitch, lookY * 0.6, swivelRate, dt);

    const followRate = lerp(3, 28, s.stiffness);
    this.blend = damp(this.blend, this.ballCam ? 1 : 0, s.transitionSpeed * 3.2, dt);

    // ---- Cámara de coche
    const desiredUp = target.onSurface ? carUp : WORLD_UP;
    dampVec3(this.camUp, desiredUp, target.onSurface ? 4 : 2, dt).normalize();
    const flatFwd = carFwd.clone().addScaledVector(this.camUp, -carFwd.dot(this.camUp));
    if (flatFwd.lengthSq() > 0.04) {
      flatFwd.normalize();
      dampVec3(this.carHeading, flatFwd, followRate, dt);
      this.carHeading.addScaledVector(this.camUp, -this.carHeading.dot(this.camUp)).normalize();
    }
    this.buildPose(this.carPose, carPos, this.carHeading, this.camUp, s.angle, null);

    // ---- Ball Cam (horizonte estabilizado)
    const toBall = new THREE.Vector3().subVectors(ballPos, carPos);
    const flatToBall = new THREE.Vector3(toBall.x, 0, toBall.z);
    const flatDist = flatToBall.length();
    if (flatDist > 0.5) {
      flatToBall.divideScalar(flatDist);
      const rate = flatDist < 4 ? 3 : 10;
      dampVec3(this.ballHeading, flatToBall, rate, dt).normalize();
    }
    this.buildPose(this.ballPose, carPos, this.ballHeading, WORLD_UP, s.angle, ballPos);

    // ---- Mezcla y suavizado
    const goalPos = this.tmp.lerpVectors(this.carPose.pos, this.ballPose.pos, this.blend);
    const goalQuat = new THREE.Quaternion().slerpQuaternions(this.carPose.quat, this.ballPose.quat, this.blend);

    if (!this.initialized) {
      this.pos.copy(goalPos);
      this.quat.copy(goalQuat);
      this.initialized = true;
    } else {
      dampVec3(this.pos, goalPos, followRate * 1.6, dt);
      this.quat.slerp(goalQuat, 1 - Math.exp(-followRate * 1.4 * dt));
    }

    // Evitar que la cámara atraviese paredes, suelo o techo
    const anchor = new THREE.Vector3().copy(carPos).addScaledVector(this.camUp, 0.6);
    const dir = new THREE.Vector3().subVectors(this.pos, anchor);
    const len = dir.length();
    const finalPos = this.pos.clone();
    if (len > 0.01) {
      dir.divideScalar(len);
      const hit = this.physics.raycast(anchor, dir, len + 0.3, undefined, (c) => this.physics.isArena(c));
      if (hit) finalPos.copy(anchor).addScaledVector(dir, Math.max(0.2, hit.distance - 0.3));
    }

    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = this.shakeAmount * Math.max(0, this.shakeTime / 0.5);
      finalPos.x += (Math.random() - 0.5) * k;
      finalPos.y += (Math.random() - 0.5) * k;
      finalPos.z += (Math.random() - 0.5) * k;
      if (this.shakeTime <= 0) this.shakeAmount = 0;
    }

    this.camera.position.copy(finalPos);
    this.camera.quaternion.copy(this.quat);
  }

  private buildPose(
    out: { pos: THREE.Vector3; quat: THREE.Quaternion },
    carPos: THREE.Vector3,
    heading: THREE.Vector3,
    up: THREE.Vector3,
    angleDeg: number,
    lookAt: THREE.Vector3 | null,
  ): void {
    const s = this.settings;
    const right = new THREE.Vector3().crossVectors(heading, up).normalize();
    const h = heading.clone().applyAxisAngle(up, this.swivelYaw);
    let elevation = 0;
    if (lookAt) {
      const d = new THREE.Vector3().subVectors(lookAt, carPos);
      const horiz = Math.max(0.5, Math.hypot(d.x, d.z));
      elevation = clamp(Math.atan2(d.y - s.height * 0.5, horiz), -0.25, 0.9);
    }
    const orbitDir = h.clone().applyAxisAngle(right.clone().applyAxisAngle(up, this.swivelYaw), elevation + this.swivelPitch);
    out.pos.copy(carPos).addScaledVector(orbitDir, -s.distance).addScaledVector(up, s.height);

    let look: THREE.Vector3;
    if (lookAt && this.swivelYaw * this.swivelYaw < 0.01) {
      look = new THREE.Vector3().subVectors(lookAt, out.pos).normalize();
      const pitch = Math.asin(clamp(look.dot(up), -1, 1));
      const maxPitch = 0.75;
      if (Math.abs(pitch) > maxPitch) {
        const flat = look.clone().addScaledVector(up, -look.dot(up)).normalize();
        look = flat.multiplyScalar(Math.cos(maxPitch)).addScaledVector(up, Math.sign(pitch) * Math.sin(maxPitch));
      }
      look.applyAxisAngle(new THREE.Vector3().crossVectors(look, up).normalize(), THREE.MathUtils.degToRad(angleDeg) * 0.5);
    } else {
      const r = right.clone().applyAxisAngle(up, this.swivelYaw);
      look = orbitDir.clone().applyAxisAngle(r, THREE.MathUtils.degToRad(angleDeg));
    }
    const z = look.clone().negate();
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    this.mat.makeBasis(x, y, z);
    out.quat.setFromRotationMatrix(this.mat);
  }

  /**
   * Posición del indicador de balón fuera de pantalla. Devuelve null si el
   * balón está visible; si no, la posición en el borde (px) y el ángulo.
   */
  offscreenIndicator(ballPos: THREE.Vector3, width: number, height: number): { x: number; y: number; angle: number } | null {
    const p = ballPos.clone().project(this.camera);
    const behind = p.z > 1;
    const inside = !behind && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95;
    if (inside) return null;
    let nx = p.x;
    let ny = p.y;
    if (behind) {
      nx = -nx;
      ny = -ny;
    }
    if (Math.abs(nx) < 1e-4 && Math.abs(ny) < 1e-4) ny = -1;
    const m = Math.max(Math.abs(nx), Math.abs(ny));
    nx /= m;
    ny /= m;
    const margin = 46;
    const x = clamp(((nx + 1) / 2) * width, margin, width - margin);
    const y = clamp(((1 - ny) / 2) * height, margin, height - margin);
    const angle = Math.atan2(-ny, nx);
    return { x, y, angle };
  }
}
