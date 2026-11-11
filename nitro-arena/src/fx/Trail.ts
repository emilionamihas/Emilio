import * as THREE from 'three';

/**
 * Estela supersónica: cinta (ribbon) de N segmentos que sigue al coche con
 * alfa por vértice. Se desvanece en cuanto el coche deja de ser supersónico.
 */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly points: Array<{ center: THREE.Vector3; side: THREE.Vector3 }> = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private intensity = 0;
  private emitTimer = 0;

  constructor(private readonly segments: number, color: THREE.ColorRepresentation, private readonly width = 0.35) {
    const vertCount = segments * 2;
    this.positions = new Float32Array(vertCount * 3);
    this.colors = new Float32Array(vertCount * 4);
    const indices: number[] = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(indices);
    const c = new THREE.Color(color);
    for (let i = 0; i < vertCount; i++) {
      this.colors[i * 4] = c.r;
      this.colors[i * 4 + 1] = c.g;
      this.colors[i * 4 + 2] = c.b;
      this.colors[i * 4 + 3] = 0;
    }
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  update(dt: number, active: boolean, origin: THREE.Vector3, side: THREE.Vector3): void {
    this.intensity = THREE.MathUtils.clamp(this.intensity + (active ? dt * 4 : -dt * 2.5), 0, 1);
    this.emitTimer -= dt;
    if (this.emitTimer <= 0) {
      this.emitTimer = 1 / 60;
      this.points.unshift({ center: origin.clone(), side: side.clone() });
      if (this.points.length > this.segments) this.points.pop();
    } else if (this.points.length) {
      this.points[0].center.copy(origin);
      this.points[0].side.copy(side);
    }
    this.mesh.visible = this.intensity > 0.01 && this.points.length > 1;
    if (!this.mesh.visible) return;
    const last = this.points[this.points.length - 1];
    for (let i = 0; i < this.segments; i++) {
      const p = this.points[Math.min(i, this.points.length - 1)] ?? last;
      const t = i / (this.segments - 1);
      const w = this.width * (1 - t * 0.7);
      this.positions[i * 6] = p.center.x + p.side.x * w;
      this.positions[i * 6 + 1] = p.center.y + p.side.y * w;
      this.positions[i * 6 + 2] = p.center.z + p.side.z * w;
      this.positions[i * 6 + 3] = p.center.x - p.side.x * w;
      this.positions[i * 6 + 4] = p.center.y - p.side.y * w;
      this.positions[i * 6 + 5] = p.center.z - p.side.z * w;
      const a = (1 - t) * 0.75 * this.intensity * (i < this.points.length ? 1 : 0);
      this.colors[i * 8 + 3] = a;
      this.colors[i * 8 + 7] = a;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    this.points.length = 0;
    this.intensity = 0;
    this.mesh.visible = false;
  }
}
