import * as THREE from 'three';
import { BOOST_PAD } from '../config/PhysicsConstants';

/** Posiciones en metros (x, z). 6 grandes + 30 pequeños = 36 pads. */
const BIG_PADS: Array<[number, number]> = [
  [-30.72, -40.96],
  [30.72, -40.96],
  [-35.84, 0],
  [35.84, 0],
  [-30.72, 40.96],
  [30.72, 40.96],
];

const SMALL_PADS: Array<[number, number]> = [
  [0, -42.4],
  [-17.92, -41.84],
  [17.92, -41.84],
  [-9.4, -33.08],
  [9.4, -33.08],
  [0, -28.16],
  [-35.84, -24.84],
  [35.84, -24.84],
  [-17.88, -23.0],
  [17.88, -23.0],
  [-20.48, -10.36],
  [0, -10.24],
  [20.48, -10.36],
  [-10.24, 0],
  [10.24, 0],
  [-25.6, 0],
  [25.6, 0],
  [-20.48, 10.36],
  [0, 10.24],
  [20.48, 10.36],
  [-17.88, 23.0],
  [17.88, 23.0],
  [-35.84, 24.84],
  [35.84, 24.84],
  [0, 28.16],
  [-9.4, 33.08],
  [9.4, 33.08],
  [-17.92, 41.84],
  [17.92, 41.84],
  [0, 42.4],
];

export interface BoostConsumer {
  readonly id: number;
  boost: number;
  readonly active: boolean;
  readonly boostPosition: THREE.Vector3;
}

export class BoostPad {
  readonly position: THREE.Vector3;
  readonly group = new THREE.Group();
  timer = 0;
  private readonly orb: THREE.Mesh;
  private readonly halo: THREE.Mesh | null;
  private readonly baseMat: THREE.MeshLambertMaterial;
  private spin = Math.random() * Math.PI * 2;

  constructor(x: number, z: number, readonly big: boolean) {
    this.position = new THREE.Vector3(x, 0, z);
    this.group.position.copy(this.position);

    this.baseMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3a, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(big ? 1.5 : 0.9, big ? 1.7 : 1.0, 0.12, big ? 8 : 6), this.baseMat);
    base.position.y = 0.06;
    base.receiveShadow = true;
    this.group.add(base);

    const glowColor = 0xffc23d;
    const orbMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.9 });
    if (big) {
      this.orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), orbMat);
      this.orb.position.y = 1.4;
      this.halo = new THREE.Mesh(
        new THREE.CylinderGeometry(1.9, 1.9, 3.2, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      this.halo.position.y = 1.6;
      this.group.add(this.halo);
    } else {
      this.orb = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 6), orbMat);
      this.orb.position.y = 0.17;
      this.halo = null;
    }
    this.group.add(this.orb);
  }

  get available(): boolean {
    return this.timer <= 0;
  }

  get amount(): number {
    return this.big ? BOOST_PAD.BIG_AMOUNT : BOOST_PAD.SMALL_AMOUNT;
  }

  get radius(): number {
    return this.big ? BOOST_PAD.BIG_RADIUS : BOOST_PAD.SMALL_RADIUS;
  }

  consume(): void {
    this.timer = this.big ? BOOST_PAD.BIG_RESPAWN : BOOST_PAD.SMALL_RESPAWN;
  }

  update(dt: number): void {
    if (this.timer > 0) this.timer = Math.max(0, this.timer - dt);
  }

  render(frameDt: number): void {
    const on = this.available;
    this.orb.visible = on;
    if (this.halo) this.halo.visible = on;
    this.baseMat.emissive.setHex(on ? 0x3a2a00 : 0x000000);
    if (on) {
      this.spin += frameDt * (this.big ? 1.6 : 0.8);
      this.orb.rotation.y = this.spin;
      if (this.big) this.orb.position.y = 1.4 + Math.sin(this.spin * 1.7) * 0.15;
      if (this.halo) this.halo.rotation.y = -this.spin * 0.5;
    }
  }
}

export class BoostPadManager {
  readonly pads: BoostPad[] = [];
  readonly group = new THREE.Group();
  onPickup: ((consumerId: number, pad: BoostPad) => void) | null = null;

  constructor() {
    for (const [x, z] of BIG_PADS) this.pads.push(new BoostPad(x, z, true));
    for (const [x, z] of SMALL_PADS) this.pads.push(new BoostPad(x, z, false));
    for (const p of this.pads) this.group.add(p.group);
  }

  reset(): void {
    for (const p of this.pads) p.timer = 0;
  }

  update(dt: number, consumers: readonly BoostConsumer[]): void {
    for (const pad of this.pads) {
      pad.update(dt);
      if (!pad.available) continue;
      for (const c of consumers) {
        if (!c.active || c.boost >= 100) continue;
        const p = c.boostPosition;
        const dx = p.x - pad.position.x;
        const dz = p.z - pad.position.z;
        if (p.y > BOOST_PAD.PICKUP_HEIGHT || dx * dx + dz * dz > pad.radius * pad.radius) continue;
        c.boost = Math.min(100, c.boost + pad.amount);
        pad.consume();
        this.onPickup?.(c.id, pad);
        break;
      }
    }
  }

  render(frameDt: number): void {
    for (const p of this.pads) p.render(frameDt);
  }
}
