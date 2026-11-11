import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  drag: number;
  color: THREE.Color;
}

/**
 * Sistema de partículas Low-Poly con un único InstancedMesh (1 draw call),
 * usado para explosiones de demolición, explosiones de gol, boost y chispas.
 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pool: Particle[] = [];
  private readonly active: Particle[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly max: number;

  constructor(max = 900) {
    this.max = max;
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    for (let i = 0; i < max; i++) {
      this.pool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 1,
        gravity: 0,
        drag: 0,
        color: new THREE.Color(),
      });
    }
  }

  emit(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: THREE.ColorRepresentation,
    size: number,
    life: number,
    gravity = -6.5,
    drag = 1,
  ): void {
    const p = this.pool.pop();
    if (!p) return;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = gravity;
    p.drag = drag;
    p.color.set(color);
    this.active.push(p);
  }

  burst(center: THREE.Vector3, count: number, speed: number, colors: THREE.ColorRepresentation[], size = 0.35, life = 1.4): void {
    const dir = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      dir.set(Math.random() * 2 - 1, Math.random() * 2 - 0.6, Math.random() * 2 - 1).normalize();
      const v = dir.multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      this.emit(center, v, colors[i % colors.length], size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.6), -6.5, 1.2);
    }
  }

  update(dt: number): void {
    const color = new THREE.Color();
    let n = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.05) {
        p.pos.y = 0.05;
        p.vel.y *= -0.4;
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
    }
    for (const p of this.active) {
      if (n >= this.max) break;
      const t = p.life / p.maxLife;
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.setScalar(p.size * Math.min(1, t * 2.5));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      color.copy(p.color).multiplyScalar(0.4 + 0.6 * t);
      this.mesh.setColorAt(n, color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    while (this.active.length) this.pool.push(this.active.pop() as Particle);
    this.mesh.count = 0;
  }
}
