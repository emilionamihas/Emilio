import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { BALL, MATERIALS } from '../config/PhysicsConstants';
import type { PhysicsEngine } from '../core/PhysicsEngine';
import type { Materials } from '../render/Materials';
import { ballTexture } from '../render/Textures';

/**
 * Balón: esfera dinámica con CCD, arrastre lineal y límites de velocidad lineal y
 * angular. Incluye el indicador de suelo (Ball Indicator) que proyecta posición
 * y altura del balón sobre la superficie que tiene debajo.
 */
export class Ball {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly mesh: THREE.Mesh;
  readonly indicator = new THREE.Group();
  private readonly indicatorRing: THREE.Mesh;
  private readonly indicatorDot: THREE.Mesh;
  private readonly heightLine: THREE.Line;
  private readonly heightLineAttr: THREE.BufferAttribute;

  readonly prevPos = new THREE.Vector3();
  readonly currPos = new THREE.Vector3();
  readonly prevQuat = new THREE.Quaternion();
  readonly currQuat = new THREE.Quaternion();
  readonly renderPos = new THREE.Vector3();
  /** Velocidades antes del último paso (para el impulso de contacto coche-balón). */
  readonly velPre = new THREE.Vector3();
  readonly angVelPre = new THREE.Vector3();

  lastTouchCarId = -1;
  lastTouchTime = -1;
  visible = true;

  constructor(
    private readonly physics: PhysicsEngine,
    mats: Materials,
  ) {
    const R = physics.R;
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL.RADIUS, 0)
        .setLinearDamping(BALL.DRAG)
        .setAngularDamping(0)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.ball(BALL.RADIUS)
        .setMass(BALL.MASS)
        .setFriction(MATERIALS.BALL_FRICTION)
        .setRestitution(MATERIALS.BALL_RESTITUTION)
        .setFrictionCombineRule(R.CoefficientCombineRule.Multiply)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Multiply),
      this.body,
    );
    physics.tag(this.collider, { kind: 'ball' });

    this.mesh = mats.realistic ? Ball.realisticMesh() : Ball.lowPolyMesh();
    this.mesh.castShadow = true;

    this.indicatorRing = new THREE.Mesh(
      new THREE.RingGeometry(BALL.RADIUS * 0.85, BALL.RADIUS, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.indicatorDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.indicator.add(this.indicatorRing, this.indicatorDot);
    this.heightLineAttr = new THREE.BufferAttribute(new Float32Array(6), 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', this.heightLineAttr);
    this.heightLine = new THREE.Line(
      lineGeo,
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.35 }),
    );
    this.heightLine.frustumCulled = false;

    this.snapshot();
    this.snapshot();
  }

  /** Esfera suave con paneles de icosaedro truncado y acabado satinado. */
  private static realisticMesh(): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({
      map: ballTexture(),
      roughness: 0.38,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveIntensity: 0.06,
    });
    return new THREE.Mesh(new THREE.SphereGeometry(BALL.RADIUS, 48, 32), mat);
  }

  /** Icosaedro Low-Poly con caras claras y oscuras. */
  private static lowPolyMesh(): THREE.Mesh {
    const geo = new THREE.IcosahedronGeometry(BALL.RADIUS, 1);
    const colors: number[] = [];
    const light = new THREE.Color(0xf2f2f2);
    const dark = new THREE.Color(0x8d96a8);
    const posAttr = geo.getAttribute('position');
    const centroid = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i += 3) {
      centroid.set(0, 0, 0);
      for (let k = 0; k < 3; k++) centroid.add(new THREE.Vector3().fromBufferAttribute(posAttr, i + k));
      centroid.normalize();
      const isDark = Math.abs(centroid.y) > 0.9 || Math.abs(centroid.x) > 0.93 || Math.abs(centroid.z) > 0.93;
      const c = isDark ? dark : light;
      for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x3a3a3a }));
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh, this.indicator, this.heightLine);
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get velocity(): THREE.Vector3 {
    const v = this.body.linvel();
    return new THREE.Vector3(v.x, v.y, v.z);
  }

  reset(x = 0, y = BALL.RADIUS, z = 0): void {
    this.body.setTranslation({ x, y, z }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.lastTouchCarId = -1;
    this.snapshot();
    this.snapshot();
  }

  launch(pos: THREE.Vector3, vel: THREE.Vector3): void {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.snapshot();
    this.snapshot();
  }

  setFrozen(frozen: boolean): void {
    this.body.setEnabled(!frozen);
  }

  /** Guarda el estado previo al paso físico. */
  beginStep(): void {
    const v = this.body.linvel();
    const w = this.body.angvel();
    this.velPre.set(v.x, v.y, v.z);
    this.angVelPre.set(w.x, w.y, w.z);
  }

  /** Aplica límites tras el paso y actualiza la interpolación. */
  endStep(): void {
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed > BALL.MAX_SPEED) {
      const k = BALL.MAX_SPEED / speed;
      this.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
    }
    const w = this.body.angvel();
    const ang = Math.hypot(w.x, w.y, w.z);
    if (ang > BALL.MAX_ANG_SPEED) {
      const k = BALL.MAX_ANG_SPEED / ang;
      this.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
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

  private readonly tmpDown = new THREE.Vector3(0, -1, 0);
  private readonly tmpQuat = new THREE.Quaternion();

  render(alpha: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.position.copy(this.renderPos);
    this.mesh.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.mesh.visible = this.visible;

    const hit = this.visible
      ? this.physics.raycast(this.renderPos, this.tmpDown, 40, undefined, (c) => this.physics.isArena(c))
      : null;
    if (!hit) {
      this.indicator.visible = false;
      this.heightLine.visible = false;
      return;
    }
    const height = hit.distance - 0.9125;
    this.indicator.visible = true;
    this.indicator.position.copy(hit.point).addScaledVector(hit.normal, 0.03);
    this.tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal);
    this.indicator.quaternion.copy(this.tmpQuat);
    const s = THREE.MathUtils.clamp(1 + height * 0.05, 1, 2.2);
    this.indicatorRing.scale.setScalar(s);
    const ringMat = this.indicatorRing.material as THREE.MeshBasicMaterial;
    ringMat.opacity = THREE.MathUtils.clamp(0.75 - height * 0.03, 0.25, 0.75);

    this.heightLine.visible = height > 1.2;
    if (this.heightLine.visible) {
      this.heightLineAttr.setXYZ(0, this.renderPos.x, this.renderPos.y - 0.9125, this.renderPos.z);
      this.heightLineAttr.setXYZ(1, hit.point.x, hit.point.y, hit.point.z);
      this.heightLineAttr.needsUpdate = true;
      this.heightLine.computeLineDistances();
    }
  }
}
