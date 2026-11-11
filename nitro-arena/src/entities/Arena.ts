import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { ARENA, BALL, MATERIALS } from '../config/PhysicsConstants';
import type { PhysicsEngine } from '../core/PhysicsEngine';
import { TEAM_COLORS, type Team } from '../core/types';

interface RingSample {
  kx: number;
  kz: number;
  nx: number;
  nz: number;
  /** Muestra en la pared de fondo dentro del ancho de la portería */
  goalSide: 0 | 1 | -1;
}

interface ProfileSample {
  d: number;
  y: number;
  cy: number;
}

export interface ArenaMesh {
  positions: number[];
  physicsIndices: number[];
  floorIndices: number[];
  shellIndices: number[];
}

/**
 * Genera la superficie interior de la arena como el desplazamiento (offset) de un
 * octógono interno K: cada punto del anillo horizontal se extruye con un perfil
 * vertical suelo → rampa curva → pared → rampa curva → techo. Así las esquinas,
 * rampas y transiciones quedan suaves y la malla es continua para el trimesh.
 */
export function buildArenaMesh(): ArenaMesh {
  const R = ARENA.FILLET_RADIUS;
  const Rc = ARENA.CORNER_ROUND;
  const H = ARENA.HEIGHT;
  const gw = ARENA.GOAL_HALF_WIDTH;
  const gh = ARENA.GOAL_HEIGHT;
  const HL = ARENA.HALF_LENGTH;
  const off = R + Rc;
  const a = ARENA.HALF_WIDTH - off;
  const b = HL - off;
  const c = ARENA.CORNER_DIAGONAL - off * Math.SQRT2;
  const e = c - b;

  const K: Array<[number, number]> = [
    [a, c - a],
    [e, b],
    [-e, b],
    [-a, c - a],
    [-a, -(c - a)],
    [-e, -b],
    [e, -b],
    [a, -(c - a)],
  ];
  const edgeNormal = (i: number): [number, number] => {
    const p0 = K[i];
    const p1 = K[(i + 1) % 8];
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz);
    return [dz / len, -dx / len];
  };

  const endEdgeXs: number[] = [];
  for (let k = 1; k <= 2; k++) endEdgeXs.push(e + ((gw - e) * k) / 3);
  endEdgeXs.push(gw, gw / 2, 0, -gw / 2, -gw);
  for (let k = 1; k <= 2; k++) endEdgeXs.push(-gw + ((-e + gw) * k) / 3);

  const ring: RingSample[] = [];
  const ARC_STEPS = 4;
  for (let i = 0; i < 8; i++) {
    const nPrev = edgeNormal((i + 7) % 8);
    const nNext = edgeNormal(i);
    const a0 = Math.atan2(nPrev[1], nPrev[0]);
    let a1 = Math.atan2(nNext[1], nNext[0]);
    while (a1 < a0) a1 += Math.PI * 2;
    for (let j = 0; j <= ARC_STEPS; j++) {
      const ang = a0 + ((a1 - a0) * j) / ARC_STEPS;
      ring.push({ kx: K[i][0], kz: K[i][1], nx: Math.cos(ang), nz: Math.sin(ang), goalSide: 0 });
    }
    const p0 = K[i];
    const p1 = K[(i + 1) % 8];
    const [nx, nz] = nNext;
    const isEnd = Math.abs(nz) > 0.99;
    const ts: number[] = [];
    if (isEnd) {
      for (const x of endEdgeXs) ts.push((x - p0[0]) / (p1[0] - p0[0]));
      ts.sort((t0, t1) => t0 - t1);
    } else {
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const n = Math.max(2, Math.round(len / 6.5));
      for (let k = 1; k < n; k++) ts.push(k / n);
    }
    for (const t of ts) {
      const kx = p0[0] + (p1[0] - p0[0]) * t;
      const kz = p0[1] + (p1[1] - p0[1]) * t;
      const inGoal = isEnd && Math.abs(kx) <= gw + 1e-6;
      ring.push({ kx, kz, nx, nz, goalSide: inGoal ? (nz > 0 ? 1 : -1) : 0 });
    }
  }

  const FILLET_STEPS = 6;
  const profile: ProfileSample[] = [];
  for (let j = 0; j <= FILLET_STEPS; j++) {
    const phi = (j / FILLET_STEPS) * (Math.PI / 2);
    profile.push({ d: Rc + R * Math.sin(phi), y: R - R * Math.cos(phi), cy: R });
  }
  profile.push({ d: Rc + R, y: gh, cy: gh });
  profile.push({ d: Rc + R, y: (gh + H - R) / 2, cy: (gh + H - R) / 2 });
  for (let j = FILLET_STEPS; j >= 0; j--) {
    const phi = (j / FILLET_STEPS) * (Math.PI / 2);
    profile.push({ d: Rc + R * Math.sin(phi), y: H - R + R * Math.cos(phi), cy: H - R });
  }

  const positions: number[] = [];
  const physicsIndices: number[] = [];
  const floorIndices: number[] = [];
  const shellIndices: number[] = [];
  const addVertex = (x: number, y: number, z: number): number => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const addTri = (i0: number, i1: number, i2: number, expected: THREE.Vector3, target: number[]): void => {
    tmpA.fromArray(positions, i0 * 3);
    tmpB.fromArray(positions, i1 * 3).sub(tmpA);
    tmpC.fromArray(positions, i2 * 3).sub(tmpA);
    const n = tmpB.cross(tmpC);
    if (n.lengthSq() < 1e-10) return;
    const tri = n.dot(expected) >= 0 ? [i0, i1, i2] : [i0, i2, i1];
    target.push(...tri);
    physicsIndices.push(...tri);
  };

  const S = ring.length;
  const P = profile.length;
  const grid: number[] = new Array(S * P);
  for (let s = 0; s < S; s++) {
    const r = ring[s];
    for (let p = 0; p < P; p++) {
      const pr = profile[p];
      grid[s * P + p] = addVertex(r.kx + r.nx * pr.d, pr.y, r.kz + r.nz * pr.d);
    }
  }

  const expected = new THREE.Vector3();
  for (let s = 0; s < S; s++) {
    const s1 = (s + 1) % S;
    const r0 = ring[s];
    const r1 = ring[s1];
    const goalMouth = r0.goalSide !== 0 && r0.goalSide === r1.goalSide;
    for (let p = 0; p < P - 1; p++) {
      if (goalMouth && profile[p + 1].y <= gh + 1e-6) continue;
      const pm = profile[p];
      const pn = profile[p + 1];
      const nx = (r0.nx + r1.nx) * 0.5;
      const nz = (r0.nz + r1.nz) * 0.5;
      const dAvg = (pm.d + pn.d) * 0.5;
      const yAvg = (pm.y + pn.y) * 0.5;
      const cyAvg = (pm.cy + pn.cy) * 0.5;
      expected.set(-nx * (dAvg - Rc), cyAvg - yAvg, -nz * (dAvg - Rc));
      if (expected.lengthSq() < 1e-8) expected.set(-nx, 0, -nz);
      const v00 = grid[s * P + p];
      const v01 = grid[s * P + p + 1];
      const v10 = grid[s1 * P + p];
      const v11 = grid[s1 * P + p + 1];
      addTri(v00, v10, v11, expected, shellIndices);
      addTri(v00, v11, v01, expected, shellIndices);
    }
  }

  // Suelo y techo en abanico
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);
  const floorCenter = addVertex(0, 0, 0);
  const ceilCenter = addVertex(0, H, 0);
  for (let s = 0; s < S; s++) {
    const s1 = (s + 1) % S;
    addTri(floorCenter, grid[s * P], grid[s1 * P], up, floorIndices);
    addTri(ceilCenter, grid[s * P + P - 1], grid[s1 * P + P - 1], down, shellIndices);
  }

  // Suelo de porterías y "mejillas" laterales de la rampa junto a los postes
  for (const zs of [1, -1] as const) {
    const cols = ring
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => r.goalSide === zs)
      .sort((p0, p1) => p0.r.kx - p1.r.kx);
    const farZ = zs * (HL + ARENA.GOAL_DEPTH);
    const far = cols.map(({ r }) => addVertex(r.kx, 0, farZ));
    for (let i = 0; i < cols.length - 1; i++) {
      const n0 = grid[cols[i].idx * P];
      const n1 = grid[cols[i + 1].idx * P];
      addTri(n0, n1, far[i + 1], up, floorIndices);
      addTri(n0, far[i + 1], far[i], up, floorIndices);
    }
    for (const side of [cols[0], cols[cols.length - 1]]) {
      const x = side.r.kx;
      const corner = addVertex(x, 0, zs * HL);
      const toCenter = new THREE.Vector3(-Math.sign(x), 0, 0);
      for (let p = 0; p < FILLET_STEPS; p++) {
        addTri(corner, grid[side.idx * P + p], grid[side.idx * P + p + 1], toCenter, shellIndices);
      }
    }
  }

  return { positions, physicsIndices, floorIndices, shellIndices };
}

/**
 * Arena octogonal estándar: collider trimesh + porterías con postes sólidos,
 * y su representación Low-Poly / Flat-Shaded.
 */
export class Arena {
  readonly group = new THREE.Group();
  readonly colliders: RAPIER.Collider[] = [];
  private readonly goalGlow: THREE.MeshBasicMaterial[] = [];

  constructor(private readonly physics: PhysicsEngine) {
    const mesh = buildArenaMesh();
    this.buildPhysics(mesh);
    this.buildVisuals(mesh);
  }

  private buildPhysics(mesh: ArenaMesh): void {
    const R = this.physics.R;
    const world = this.physics.world;
    const body = world.createRigidBody(R.RigidBodyDesc.fixed());
    const material = (desc: RAPIER.ColliderDesc): RAPIER.ColliderDesc =>
      desc
        .setFriction(MATERIALS.ARENA_FRICTION)
        .setRestitution(MATERIALS.ARENA_RESTITUTION)
        .setFrictionCombineRule(R.CoefficientCombineRule.Multiply)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Multiply);

    const trimesh = material(
      R.ColliderDesc.trimesh(
        new Float32Array(mesh.positions),
        new Uint32Array(mesh.physicsIndices),
        R.TriMeshFlags.FIX_INTERNAL_EDGES,
      ),
    );
    this.addCollider(world.createCollider(trimesh, body));

    const gw = ARENA.GOAL_HALF_WIDTH;
    const gh = ARENA.GOAL_HEIGHT;
    const gd = ARENA.GOAL_DEPTH;
    const HL = ARENA.HALF_LENGTH;
    const t = 0.5;
    for (const zs of [1, -1]) {
      const zMid = zs * (HL + gd / 2);
      const boxes: Array<[number, number, number, number, number, number]> = [
        [gw + t, gh / 2, zMid, t, gh / 2, gd / 2],
        [-(gw + t), gh / 2, zMid, t, gh / 2, gd / 2],
        [0, gh + t, zMid, gw + 2 * t, t, gd / 2 + t],
        [0, gh / 2, zs * (HL + gd + t), gw + 2 * t, gh / 2 + t, t],
      ];
      for (const [x, y, z, hx, hy, hz] of boxes) {
        this.addCollider(world.createCollider(material(R.ColliderDesc.cuboid(hx, hy, hz)).setTranslation(x, y, z), body));
      }
      for (const xs of [1, -1]) {
        const post = material(R.ColliderDesc.cylinder(gh / 2, ARENA.POST_RADIUS)).setTranslation(xs * gw, gh / 2, zs * HL);
        this.addCollider(world.createCollider(post, body));
      }
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
      const bar = material(R.ColliderDesc.cylinder(gw, ARENA.POST_RADIUS))
        .setTranslation(0, gh, zs * HL)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      this.addCollider(world.createCollider(bar, body));
    }
  }

  private addCollider(c: RAPIER.Collider): void {
    this.physics.tag(c, { kind: 'arena' });
    this.colliders.push(c);
  }

  private buildVisuals(mesh: ArenaMesh): void {
    const floorGeo = this.makeGeometry(mesh, mesh.floorIndices, (_cx, _cy, cz, out) => {
      const HL = ARENA.HALF_LENGTH;
      if (Math.abs(cz) > HL) {
        out.setHex(cz > 0 ? 0x5a3418 : 0x1b3a66);
        return;
      }
      const stripe = Math.floor((cz + HL) / 6.4) % 2 === 0;
      out.setHex(stripe ? 0x3f8f4a : 0x37803f);
      const tint = new THREE.Color(cz > 0 ? TEAM_COLORS[1] : TEAM_COLORS[0]);
      out.lerp(tint, Math.min(0.22, (Math.abs(cz) / HL) * 0.22));
    });
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    );
    floor.receiveShadow = true;
    this.group.add(floor);

    // Parte baja opaca (rampas y zócalo) y parte alta de "cristal" para ver el estadio
    const GLASS_FROM = ARENA.GOAL_HEIGHT + 0.5;
    const lower: number[] = [];
    const upper: number[] = [];
    for (let t = 0; t < mesh.shellIndices.length; t += 3) {
      let cy = 0;
      for (let k = 0; k < 3; k++) cy += mesh.positions[mesh.shellIndices[t + k] * 3 + 1] / 3;
      (cy < GLASS_FROM ? lower : upper).push(mesh.shellIndices[t], mesh.shellIndices[t + 1], mesh.shellIndices[t + 2]);
    }
    const shellColor = (cy: number, cz: number, out: THREE.Color): void => {
      const team = new THREE.Color(cz > 0 ? TEAM_COLORS[1] : TEAM_COLORS[0]);
      out.setHex(0x3a4766).lerp(team, 0.25 + 0.35 * Math.min(1, Math.abs(cz) / ARENA.HALF_LENGTH));
      if (cy < ARENA.FILLET_RADIUS) out.lerp(new THREE.Color(0x3f8f4a), 0.45 * (1 - cy / ARENA.FILLET_RADIUS));
    };
    const lowerGeo = this.makeGeometry(mesh, lower, (_cx, cy, cz, out) => shellColor(cy, cz, out));
    const shell = new THREE.Mesh(lowerGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    shell.receiveShadow = true;
    this.group.add(shell);

    const upperGeo = this.makeGeometry(mesh, upper, (_cx, cy, cz, out) => {
      shellColor(cy, cz, out);
      if (cy > ARENA.HEIGHT - 0.05) out.setHex(0x6d86b8);
    });
    const glass = new THREE.Mesh(
      upperGeo,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      }),
    );
    glass.renderOrder = 2;
    this.group.add(glass);

    const edgeMat = new THREE.LineBasicMaterial({ color: 0xb8d0ff, transparent: true, opacity: 0.28 });
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(lowerGeo, 20), edgeMat));
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(upperGeo, 20), edgeMat));

    this.buildFieldLines();
    this.buildGoals();
    this.buildStadium();
  }

  /** Gradas Low-Poly con público instanciado y cielo en degradado (solo decorado). */
  private buildStadium(): void {
    const stadium = new THREE.Group();
    const skyGeo = new THREE.SphereGeometry(320, 16, 10);
    const skyColors: number[] = [];
    const top = new THREE.Color(0x0d1a3a);
    const horizon = new THREE.Color(0x5b4a8a);
    const bottom = new THREE.Color(0x120f1f);
    const sp = skyGeo.getAttribute('position');
    const c = new THREE.Color();
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i) / 320;
      if (y > 0) c.copy(horizon).lerp(top, Math.min(1, y * 1.6));
      else c.copy(horizon).lerp(bottom, Math.min(1, -y * 4));
      skyColors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    stadium.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));

    const tiers = [
      { r0: 58, r1: 74, y0: -1, y1: 14 },
      { r0: 76, r1: 92, y0: 16, y1: 32 },
    ];
    const standMat = new THREE.MeshLambertMaterial({ color: 0x2b3147, flatShading: true, side: THREE.DoubleSide });
    const crowdPositions: THREE.Vector3[] = [];
    for (const t of tiers) {
      const geo = new THREE.CylinderGeometry(t.r1, t.r0, t.y1 - t.y0, 8, 1, true);
      const m = new THREE.Mesh(geo, standMat);
      m.scale.set(1, 1, 1.22);
      m.rotation.y = Math.PI / 8;
      m.position.y = (t.y0 + t.y1) / 2;
      stadium.add(m);
      for (let i = 0; i < 700; i++) {
        const a = Math.random() * Math.PI * 2;
        const k = Math.random();
        const r = THREE.MathUtils.lerp(t.r0, t.r1, k) - 0.8;
        const inscribed = r * Math.cos(Math.PI / 8);
        crowdPositions.push(
          new THREE.Vector3(Math.cos(a) * inscribed, THREE.MathUtils.lerp(t.y0, t.y1, k) + 0.6, Math.sin(a) * inscribed * 1.22),
        );
      }
    }
    const crowd = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 1.3, 0.9),
      new THREE.MeshLambertMaterial({ flatShading: true }),
      crowdPositions.length,
    );
    const dummy = new THREE.Object3D();
    const palette = [TEAM_COLORS[0], TEAM_COLORS[1], 0xdfe6f5, 0x8a93a8, 0xffd27a];
    crowdPositions.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.updateMatrix();
      crowd.setMatrixAt(i, dummy.matrix);
      const team = p.z > 0 ? TEAM_COLORS[1] : TEAM_COLORS[0];
      crowd.setColorAt(i, new THREE.Color(Math.random() < 0.55 ? team : palette[i % palette.length]));
    });
    stadium.add(crowd);

    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 1), lightMat);
      tower.position.set(Math.cos(a) * 84, 44, Math.sin(a) * 84 * 1.22);
      tower.lookAt(0, 0, 0);
      stadium.add(tower);
    }
    this.group.add(stadium);
  }

  private makeGeometry(
    mesh: ArenaMesh,
    indices: number[],
    colorFn: (cx: number, cy: number, cz: number, out: THREE.Color) => void,
  ): THREE.BufferGeometry {
    const pos = new Float32Array(indices.length * 3);
    const col = new Float32Array(indices.length * 3);
    const color = new THREE.Color();
    for (let t = 0; t < indices.length; t += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let k = 0; k < 3; k++) {
        const vi = indices[t + k] * 3;
        pos[(t + k) * 3] = mesh.positions[vi];
        pos[(t + k) * 3 + 1] = mesh.positions[vi + 1];
        pos[(t + k) * 3 + 2] = mesh.positions[vi + 2];
        cx += mesh.positions[vi] / 3;
        cy += mesh.positions[vi + 1] / 3;
        cz += mesh.positions[vi + 2] / 3;
      }
      colorFn(cx, cy, cz, color);
      for (let k = 0; k < 3; k++) color.toArray(col, (t + k) * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  private buildFieldLines(): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      depthWrite: false,
    });
    const y = 0.015;
    const lines = new THREE.Group();
    const strip = (w: number, l: number, x: number, z: number, rotY = 0): void => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
      m.rotation.set(-Math.PI / 2, 0, rotY);
      m.position.set(x, y, z);
      lines.add(m);
    };
    strip(ARENA.HALF_WIDTH * 2 - 8, 0.3, 0, 0);
    const circle = new THREE.Mesh(new THREE.RingGeometry(9.2, 9.5, 40), mat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = y;
    lines.add(circle);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), mat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = y;
    lines.add(spot);
    for (const zs of [1, -1]) {
      const boxDepth = 12;
      const boxHalfW = ARENA.GOAL_HALF_WIDTH + 6;
      const zEdge = zs * (ARENA.HALF_LENGTH - ARENA.FILLET_RADIUS - boxDepth);
      strip(boxHalfW * 2, 0.3, 0, zEdge);
      strip(0.3, boxDepth, boxHalfW, zEdge + (zs * boxDepth) / 2);
      strip(0.3, boxDepth, -boxHalfW, zEdge + (zs * boxDepth) / 2);
    }
    this.group.add(lines);
  }

  private buildGoals(): void {
    const gw = ARENA.GOAL_HALF_WIDTH;
    const gh = ARENA.GOAL_HEIGHT;
    const gd = ARENA.GOAL_DEPTH;
    const HL = ARENA.HALF_LENGTH;
    ([0, 1] as Team[]).forEach((team) => {
      const zs = team === 1 ? 1 : -1;
      const color = TEAM_COLORS[team];
      const postMat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.6, flatShading: true });
      const g = new THREE.Group();
      for (const xs of [1, -1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.POST_RADIUS, ARENA.POST_RADIUS, gh, 6), postMat);
        post.position.set(xs * gw, gh / 2, zs * HL);
        g.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(ARENA.POST_RADIUS, ARENA.POST_RADIUS, gw * 2, 6), postMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, gh, zs * HL);
      g.add(bar);

      const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
      this.goalGlow.push(glow);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gh), glow);
      back.position.set(0, gh / 2, zs * (HL + gd));
      g.add(back);
      const sideGeo = new THREE.PlaneGeometry(gd, gh);
      for (const xs of [1, -1]) {
        const side = new THREE.Mesh(sideGeo, glow);
        side.rotation.y = Math.PI / 2;
        side.position.set(xs * gw, gh / 2, zs * (HL + gd / 2));
        g.add(side);
      }
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gd), glow);
      roof.rotation.x = Math.PI / 2;
      roof.position.set(0, gh, zs * (HL + gd / 2));
      g.add(roof);

      const net = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(gw * 2, gh, gd, 8, 4, 4)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
      );
      net.position.set(0, gh / 2, zs * (HL + gd / 2));
      g.add(net);

      const goalLine = new THREE.Mesh(
        new THREE.PlaneGeometry(gw * 2, 0.35),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }),
      );
      goalLine.rotation.x = -Math.PI / 2;
      goalLine.position.set(0, 0.02, zs * (HL + BALL.RADIUS));
      g.add(goalLine);
      this.group.add(g);
    });
  }

  /** Pulso visual de la portería al marcar. */
  flashGoal(team: Team, intensity: number): void {
    this.goalGlow[team].opacity = 0.18 + intensity * 0.6;
  }

  /** Equipo que anota si el balón ha cruzado por completo una línea de gol, o null. */
  static scoringTeam(ballPos: THREE.Vector3): Team | null {
    const lineZ = ARENA.HALF_LENGTH + BALL.RADIUS;
    if (Math.abs(ballPos.x) > ARENA.GOAL_HALF_WIDTH + 0.5 || ballPos.y > ARENA.GOAL_HEIGHT + 0.5) return null;
    if (ballPos.z > lineZ) return 0;
    if (ballPos.z < -lineZ) return 1;
    return null;
  }
}
