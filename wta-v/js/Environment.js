import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadeTextures, storefrontTextures, addNoise, makeCanvas, toTexture } from './Textures.js';

// Grupos de colisión compartidos por todos los módulos.
export const GROUPS = {
  STATIC: 1,
  PLAYER: 2,
  VEHICLE: 4,
};

/**
 * Medidas generales. El centro conserva una cuadrícula de 6 × 6 manzanas (bloques de 64 m)
 * alrededor de una glorieta; fuera de ella la ciudad sigue con avenidas curvas, un polígono,
 * barrios residenciales, las colinas del norte (con túnel) y el puerto junto al mar.
 */
export const CITY = {
  BLOCKS: 6,          // manzanas por lado en el centro
  PERIOD: 64,         // distancia entre ejes de calles del centro (m)
  ROAD: 16,           // ancho de una avenida (m)
  SIDEWALK: 3,        // ancho de acera (m)
  LANE: 2.2,          // carril de circulación de una avenida (desde el eje)
  SIZE: 1120,         // lado del mapa (m), centrado en el origen
};
CITY.HALF = (CITY.BLOCKS * CITY.PERIOD) / 2;

const ROAD_TYPES = {
  avenue: { w: 16, lane: 2.2, park: 1.7 },
  street: { w: 11, lane: 2.4, park: 0.5 },
  roundabout: { w: 12, lane: 0, park: 1.7 },
};

/** Colina del norte: meseta atravesada por el túnel de la Avenida Norte (x = 0). */
export const RIDGE = { xc: -18, zc: -320, H: 34, px: 150, fx: 70, pz: 35, fz: 45, tunnelHalf: 45, corridor: 13 };

const WORLD = { minX: -530, maxX: 530, minZ: -545, maxZ: 560 };
const DAY_LENGTH = 480; // segundos reales por día de juego
const PHASE = 11; // segundos por fase de semáforo (9 verde + 2 ámbar)
const STREAM_IN = 170; // radio en el que los colisionadores estáticos están en el mundo físico
const STREAM_OUT = 215;

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Altura de la colina en (x, z). El corredor del túnel queda excavado fuera del túnel. */
export function hillHeight(x, z) {
  const R = RIDGE;
  const ax = 1 - smooth(R.px, R.px + R.fx, Math.abs(x - R.xc));
  const az = 1 - smooth(R.pz, R.pz + R.fz, Math.abs(z - R.zc));
  if (ax <= 0 || az <= 0) return 0;
  if (Math.abs(x) < R.corridor && Math.abs(z - R.zc) > R.tunnelHalf) return 0;
  const bumps = 1 + 0.12 * Math.sin(x * 0.045) * Math.cos(z * 0.06) + 0.08 * Math.sin(x * 0.11 + z * 0.07);
  return R.H * ax * az * bumps;
}

/** Línea de costa: al sur de ella está el mar. */
export function coastZ(x) {
  return 350 + 9 * Math.sin(x / 55) + 5 * Math.sin(x / 23 + 1.3);
}

/** Crea un número aleatorio determinista para que la ciudad sea siempre igual. */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------
// Trazado: cada calle es una polilínea ('line'), una curva suave ('curve') o la glorieta.
// Los cruces entre calles se detectan solos; los extremos se enganchan a la calle que tocan.
// ----------------------------------------------------------------------
const RING = [
  [-440, 0], [-430, -300], [-330, -470], [-160, -505], [0, -505], [160, -500], [340, -455], [445, -280],
  [440, 20], [410, 200], [300, 285], [150, 300], [0, 300], [-150, 300], [-330, 260], [-430, 150],
];

function layout() {
  const R = [];
  for (const c of [-192, -128, -64, 64, 128, 192]) {
    R.push({ name: `x${c}`, kind: 'line', pts: [[c, -192], [c, 192]], type: 'avenue' });
    R.push({ name: `z${c}`, kind: 'line', pts: [[-192, c], [192, c]], type: 'avenue' });
  }
  R.push(
    { name: 'glorieta', label: 'Glorieta Central', kind: 'circle', center: [0, 0], r: 18, n: 16, type: 'roundabout', oneWay: true, lots: false },
    { name: 'norte', label: 'Avenida Norte', kind: 'line', pts: [[0, -18], [0, -505]], type: 'avenue' },
    { name: 'sur', label: 'Avenida Sur', kind: 'line', pts: [[0, 18], [0, 300]], type: 'avenue' },
    { name: 'oeste', label: 'Avenida Oeste', kind: 'line', pts: [[-18, 0], [-440, 0]], type: 'avenue' },
    { name: 'este', kind: 'line', pts: [[18, 0], [192, 0]], type: 'avenue' },
    { name: 'diagonal', label: 'Diagonal', kind: 'line', pts: [[-12.728, -12.728], [-192, -192]], type: 'avenue' },
    { name: 'carreteraOeste', kind: 'curve', pts: [[-192, -192], [-300, -240], [-430, -300]], type: 'avenue', sidewalk: false, lots: false },
    { name: 'circunvalacion', label: 'Circunvalación', kind: 'curve', closed: true, pts: RING, type: 'avenue', sidewalk: false },
    { name: 'avEste', label: 'Avenida del Este', kind: 'curve', pts: [[192, 0], [270, -25], [360, 15], [440, 20]], type: 'avenue' },
    { name: 'nordeste', kind: 'curve', pts: [[192, -192], [250, -270], [300, -380], [340, -455]], type: 'avenue', sidewalk: false, lots: false },
    { name: 'jardines', label: 'Calle Jardines', kind: 'curve', pts: [[192, -128], [260, -150], [330, -120], [375, -50], [360, 15]], type: 'street' },
    { name: 'acacias', kind: 'curve', pts: [[330, -120], [300, -70], [270, -25]], type: 'street' },
    { name: 'lomas', label: 'Las Lomas', kind: 'curve', pts: [[192, 64], [250, 95], [320, 80], [370, 110], [410, 200]], type: 'street' },
    { name: 'paseo', label: 'Paseo de la Playa', kind: 'curve', pts: [[192, 192], [240, 245], [300, 285]], type: 'avenue' },
    { name: 'puertoOeste', kind: 'curve', pts: [[-128, 192], [-140, 245], [-150, 300]], type: 'street' },
    { name: 'puertoEste', kind: 'curve', pts: [[128, 192], [140, 245], [150, 300]], type: 'street' },
    { name: 'poligono', label: 'Polígono', kind: 'curve', pts: [[-192, 128], [-250, 170], [-320, 150], [-345, 70], [-340, 0]], type: 'avenue' },
    { name: 'industria', kind: 'curve', pts: [[-192, -64], [-260, -80], [-330, -60], [-340, 0]], type: 'avenue' },
    { name: 'mirador', label: 'Camino del Mirador', kind: 'curve', pts: [[0, -445], [80, -460], [170, -430], [250, -410], [300, -380]], type: 'street' },
    { name: 'viejo', label: 'Camino Viejo', kind: 'curve', pts: [[-330, -470], [-240, -440], [-120, -455], [0, -445]], type: 'street' }
  );
  return R;
}

/** Zonas verdes (rectángulos) y rótulos de barrio para el mapa. */
const PARKS = [
  { minX: -184, maxX: -136, minZ: 72, maxZ: 120 },
  { minX: 136, maxX: 184, minZ: 8, maxZ: 56 },
];
export const DISTRICT_LABELS = [
  ['CENTRO', 0, -100],
  ['COLINAS', 0, -470],
  ['POLÍGONO', -330, 90],
  ['EL PUERTO', -220, 330],
  ['LA PLAYA', 220, 330],
  ['JARDINES', 330, -80],
  ['LAS LOMAS', 330, 140],
  ['LA MESETA', -20, -320],
];

/** Parámetros de solar por barrio (medidas en metros). */
const LOTS = {
  downtown: { along: [14, 24], depth: [14, 22], setback: [0.3, 1], gap: 2 },
  midtown: { along: [12, 20], depth: [12, 18], setback: [0.5, 2], gap: 3 },
  industrial: { along: [24, 40], depth: [20, 30], setback: [4, 7], gap: 6 },
  port: { along: [20, 30], depth: [12, 18], setback: [2, 3], gap: 5 },
  suburb: { along: [9, 13], depth: [9, 12], setback: [5, 8], gap: 5 },
  hills: { along: [14, 20], depth: [12, 16], setback: [8, 12], gap: 10 },
};

export class Environment {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;

    this.timeOfDay = 9.5; // horas (0-24)
    this.timeSpeed = 1;
    this.lightTimer = 0;
    this.night = 0;

    this.allColliders = []; // colisionadores de cámara (cajas invisibles de los edificios)
    this.buildingMeshes = []; // los cercanos al jugador, que es lo que usa la cámara
    this.shootables = [];
    this.buildingRects = []; // huellas 2D para comprobar posiciones de salida
    this.reserved = []; // solares ocupados por lugares (sin edificio genérico)
    this.buildings = [];
    this.rand = mulberry32(1337);
    this.streamItems = [];
    this.streamActive = new Set();
    this.streamTimer = 0;
    this.finalized = false;

    this.buildNetwork();
    this.createMaterials();
    this.createGround();
    this.createMarkings();
    this.createHillAndTunnel();
    this.createSea();
    this.createBoundaries();
    this.createSkyAndLights();
    this.update(0, new THREE.Vector3());
  }

  /**
   * Segunda fase: edificios, árboles, farolas y semáforos. Se llama cuando los lugares
   * (bancos, tiendas, casa) ya han reservado su solar.
   */
  finalize(focus = new THREE.Vector3()) {
    this.createBuildings();
    this.createTrees();
    this.createStreetLamps();
    this.createTrafficLights();
    this.createContainers();
    this.finalized = true;
    this.updateStreaming(focus);
  }

  // ------------------------------------------------------------------
  // Red de calles
  // ------------------------------------------------------------------
  sampleRoad(def) {
    const out = [];
    if (def.kind === 'circle') {
      const [cx, cz] = def.center;
      for (let k = 0; k <= def.n; k++) {
        const a = -(k % def.n) * ((Math.PI * 2) / def.n); // sentido antihorario visto desde arriba
        out.push(new THREE.Vector2(cx + Math.cos(a) * def.r, cz + Math.sin(a) * def.r));
      }
      return out;
    }
    const pts = def.pts.map(([x, z]) => new THREE.Vector2(x, z));
    if (def.kind === 'line') {
      for (let i = 0; i < pts.length - 1; i++) {
        const n = Math.max(1, Math.ceil(pts[i].distanceTo(pts[i + 1]) / 32));
        for (let k = 0; k < n; k++) out.push(new THREE.Vector2().lerpVectors(pts[i], pts[i + 1], k / n));
      }
      out.push(pts[pts.length - 1].clone());
      return out;
    }
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)), !!def.closed, 'centripetal');
    const n = pts.length;
    const spans = def.closed ? n : n - 1;
    for (let i = 0; i < spans; i++) {
      const d = Math.max(2, Math.ceil((pts[i].distanceTo(pts[(i + 1) % n]) * 1.15) / 8));
      for (let k = 0; k < d; k++) {
        const p = curve.getPoint((i + k / d) / spans);
        out.push(new THREE.Vector2(p.x, p.z));
      }
    }
    out.push(def.closed ? out[0].clone() : pts[n - 1].clone());
    return out;
  }

  buildNetwork() {
    const roads = layout().map((def) => {
      const t = ROAD_TYPES[def.type];
      return {
        ...def,
        closed: def.closed || def.kind === 'circle',
        w: t.w,
        lane: t.lane,
        parkInset: t.park,
        sidewalk: def.sidewalk !== false,
        lots: def.lots !== false,
        pts: this.sampleRoad(def),
      };
    });
    this.roads = roads;
    this.roadByName = Object.fromEntries(roads.map((r) => [r.name, r]));
    this.snapEndpoints(roads);
    this.splitCrossings(roads);

    // Nodos: puntos que coinciden (< 1,2 m) se funden en uno
    const nodes = [];
    const grid = new Map();
    const key = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
    const getNode = (x, z) => {
      const cx = Math.floor(x / 4);
      const cz = Math.floor(z / 4);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const id of grid.get(`${cx + i},${cz + j}`) || []) {
            if (Math.hypot(nodes[id].pos.x - x, nodes[id].pos.z - z) < 1.2) return id;
          }
        }
      }
      const id = nodes.length;
      nodes.push({ id, pos: new THREE.Vector3(x, 0, z), out: [], links: [], roads: new Set(), radius: 0 });
      const k = key(x, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(id);
      return id;
    };
    for (const r of roads) {
      r.nodeIds = [];
      for (const p of r.pts) {
        const id = getNode(p.x, p.y);
        if (r.nodeIds[r.nodeIds.length - 1] !== id) r.nodeIds.push(id);
        nodes[id].roads.add(r);
      }
    }
    this.nodes = nodes;

    // Tramos
    this.edges = [];
    this.edgeMap = new Map();
    for (const r of roads) {
      r.cum = [0];
      for (let i = 0; i < r.nodeIds.length - 1; i++) {
        const a = nodes[r.nodeIds[i]];
        const b = nodes[r.nodeIds[i + 1]];
        const len = a.pos.distanceTo(b.pos);
        r.cum.push(r.cum[i] + len);
        const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (this.edgeMap.has(k)) continue;
        const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
        const edge = {
          id: this.edges.length,
          a: a.id,
          b: b.id,
          road: r,
          idx: i,
          w: r.w,
          lane: r.lane,
          oneWay: !!r.oneWay,
          len,
          tunnel: this.inTunnelZone(mid.x, mid.z),
        };
        edge.sidewalk = r.sidewalk && !edge.tunnel;
        this.edges.push(edge);
        this.edgeMap.set(k, edge);
        a.links.push(b.id);
        b.links.push(a.id);
        a.out.push(b.id);
        if (!edge.oneWay) b.out.push(a.id);
        a.radius = Math.max(a.radius, r.w / 2);
        b.radius = Math.max(b.radius, r.w / 2);
      }
      r.length = r.cum[r.cum.length - 1];
    }

    // Cruces, glorieta y semáforos
    for (const n of nodes) {
      n.degree = n.links.length;
      n.roundabout = [...n.roads].some((r) => r.kind === 'circle');
      n.junction = n.degree >= 3;
      const avenues = [...n.roads].filter((r) => r.type === 'avenue').length;
      n.signal = n.junction && !n.roundabout && avenues >= 2;
      if (n.signal) {
        // Fases: accesos agrupados por dirección (los opuestos comparten verde)
        const clusters = [];
        n.phaseOf = new Map();
        for (const id of n.links) {
          const p = nodes[id].pos;
          let ang = Math.atan2(n.pos.z - p.z, n.pos.x - p.x);
          ang = ((ang % Math.PI) + Math.PI) % Math.PI;
          let k = clusters.findIndex((c) => {
            const d = Math.abs(c - ang);
            return Math.min(d, Math.PI - d) < 0.45;
          });
          if (k < 0) {
            clusters.push(ang);
            k = clusters.length - 1;
          }
          n.phaseOf.set(id, k);
        }
        n.phases = clusters.length;
        n.offset = this.rand() * 40;
        if (n.phases < 2) n.signal = false;
      }
    }

    // Índices espaciales
    this.nodeGrid = new Map();
    for (const n of nodes) this.gridAdd(this.nodeGrid, 64, n.pos.x, n.pos.z, n);
    this.edgeGrid = new Map();
    for (const e of this.edges) {
      const a = nodes[e.a].pos;
      const b = nodes[e.b].pos;
      const pad = e.w / 2 + 16;
      const x0 = Math.floor((Math.min(a.x, b.x) - pad) / 32);
      const x1 = Math.floor((Math.max(a.x, b.x) + pad) / 32);
      const z0 = Math.floor((Math.min(a.z, b.z) - pad) / 32);
      const z1 = Math.floor((Math.max(a.z, b.z) + pad) / 32);
      for (let i = x0; i <= x1; i++) {
        for (let j = z0; j <= z1; j++) {
          const k = `${i},${j}`;
          if (!this.edgeGrid.has(k)) this.edgeGrid.set(k, []);
          this.edgeGrid.get(k).push(e);
        }
      }
    }
    const ring = this.roadByName.circunvalacion;
    this.ringPolygon = ring.nodeIds.map((id) => nodes[id].pos);
  }

  gridAdd(grid, size, x, z, item) {
    const k = `${Math.floor(x / size)},${Math.floor(z / size)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(item);
  }

  /** Engancha el extremo suelto de una calle a la calle que toca (T). */
  snapEndpoints(roads) {
    for (const r of roads) {
      if (r.closed) continue;
      for (const end of [0, r.pts.length - 1]) {
        const p = r.pts[end];
        let best = null;
        for (const q of roads) {
          if (q === r) continue;
          for (let i = 0; i < q.pts.length - 1; i++) {
            const a = q.pts[i];
            const b = q.pts[i + 1];
            const ab = new THREE.Vector2().subVectors(b, a);
            const t = THREE.MathUtils.clamp(new THREE.Vector2().subVectors(p, a).dot(ab) / ab.lengthSq(), 0, 1);
            const c = a.clone().addScaledVector(ab, t);
            const d = c.distanceTo(p);
            if (d < 3 && (!best || d < best.d)) best = { q, i, c, d, a, b };
          }
        }
        if (!best) continue;
        if (best.c.distanceTo(best.a) < 1.2) p.copy(best.a);
        else if (best.c.distanceTo(best.b) < 1.2) p.copy(best.b);
        else {
          best.q.pts.splice(best.i + 1, 0, best.c.clone());
          p.copy(best.c);
        }
      }
    }
  }

  /** Inserta un vértice allí donde dos calles se cruzan. */
  splitCrossings(roads) {
    const segs = [];
    for (const r of roads) for (let i = 0; i < r.pts.length - 1; i++) segs.push({ r, i, a: r.pts[i], b: r.pts[i + 1], id: segs.length });
    const grid = new Map();
    for (const s of segs) {
      const x0 = Math.floor(Math.min(s.a.x, s.b.x) / 40);
      const x1 = Math.floor(Math.max(s.a.x, s.b.x) / 40);
      const z0 = Math.floor(Math.min(s.a.y, s.b.y) / 40);
      const z1 = Math.floor(Math.max(s.a.y, s.b.y) / 40);
      for (let i = x0; i <= x1; i++) {
        for (let j = z0; j <= z1; j++) {
          const k = `${i},${j}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(s);
        }
      }
    }
    const inserts = new Map(); // "road|i" -> [{t, p}]
    const push = (s, t, p) => {
      const k = `${s.r.name}|${s.i}`;
      if (!inserts.has(k)) inserts.set(k, []);
      inserts.get(k).push({ t, p });
    };
    const seen = new Set();
    const eps = 1e-6;
    const cross = (ax, ay, bx, by) => ax * by - ay * bx;
    for (const list of grid.values()) {
      for (let m = 0; m < list.length; m++) {
        for (let n = m + 1; n < list.length; n++) {
          const s1 = list[m];
          const s2 = list[n];
          if (s1.r === s2.r && Math.abs(s1.i - s2.i) <= 1) continue;
          const pk = s1.id < s2.id ? `${s1.id}:${s2.id}` : `${s2.id}:${s1.id}`;
          if (seen.has(pk)) continue;
          seen.add(pk);
          const d1x = s1.b.x - s1.a.x;
          const d1y = s1.b.y - s1.a.y;
          const d2x = s2.b.x - s2.a.x;
          const d2y = s2.b.y - s2.a.y;
          const den = cross(d1x, d1y, d2x, d2y);
          if (Math.abs(den) < 1e-9) continue;
          const ex = s2.a.x - s1.a.x;
          const ey = s2.a.y - s1.a.y;
          const t = cross(ex, ey, d2x, d2y) / den;
          const u = cross(ex, ey, d1x, d1y) / den;
          if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) continue;
          const p = new THREE.Vector2(s1.a.x + d1x * t, s1.a.y + d1y * t);
          if (t > eps && t < 1 - eps) push(s1, t, p);
          if (u > eps && u < 1 - eps) push(s2, u, p);
        }
      }
    }
    for (const r of roads) {
      const out = [];
      for (let i = 0; i < r.pts.length; i++) {
        out.push(r.pts[i]);
        const ins = inserts.get(`${r.name}|${i}`);
        if (ins) for (const { p } of ins.sort((x, y) => x.t - y.t)) out.push(p);
      }
      r.pts = out;
    }
  }

  inTunnelZone(x, z) {
    return Math.abs(x) < RIDGE.corridor + 2 && Math.abs(z - RIDGE.zc) < RIDGE.tunnelHalf + 38;
  }

  insideRing(x, z) {
    const poly = this.ringPolygon;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }

  /** Barrio de un punto: decide qué se construye allí. */
  districtAt(x, z) {
    if (x < WORLD.minX + 8 || x > WORLD.maxX - 8 || z < WORLD.minZ + 8) return null;
    if (z > coastZ(x) - 4) return null;
    if (!this.insideRing(x, z)) {
      if (z > 150) return x < -20 ? 'port' : 'beach';
      return 'rural';
    }
    if (z < -405) return 'hills';
    if (hillHeight(x, z) > 0 || this.inHillFootprint(x, z)) return 'none';
    if (Math.abs(x) <= 205 && Math.abs(z) <= 205) return 'downtown';
    if (x < -205) return 'industrial';
    if (x > 205) return 'suburb';
    return 'midtown';
  }

  inHillFootprint(x, z, pad = 0) {
    const R = RIDGE;
    return Math.abs(x - R.xc) < R.px + R.fx + pad && Math.abs(z - R.zc) < R.pz + R.fz + pad;
  }

  // ------------------------------------------------------------------
  // Consultas sobre la red (tráfico, policía, GPS, peatones)
  // ------------------------------------------------------------------
  /** Distancia desde (x, z) al borde de la calzada más cercana (negativa = sobre la calzada). */
  roadQuery(x, z) {
    const list = this.edgeGrid.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`);
    let best = { clear: 99, edge: null, t: 0 };
    if (!list) return best;
    for (const e of list) {
      const a = this.nodes[e.a].pos;
      const b = this.nodes[e.b].pos;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z) - e.w / 2;
      if (d < best.clear) best = { clear: d, edge: e, t };
    }
    return best;
  }

  clearance(x, z) {
    return this.roadQuery(x, z).clear;
  }

  /** ¿Está el punto (x, z) sobre la calzada? */
  isOnRoad(x, z) {
    return this.clearance(x, z) < 0;
  }

  /** Línea de visión "por calles": muestrea el segmento cada 2 m. */
  segmentOnRoad(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (!this.isOnRoad(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  isInsideBuilding(x, z, margin = 0.6) {
    for (const r of this.buildingRects) {
      if (x > r.minX - margin && x < r.maxX + margin && z > r.minZ - margin && z < r.maxZ + margin) return true;
    }
    return false;
  }

  edgeBetween(a, b) {
    return this.edgeMap.get(a < b ? `${a}|${b}` : `${b}|${a}`);
  }

  laneOffset(a, b) {
    const e = this.edgeBetween(a, b);
    return e ? e.lane : CITY.LANE;
  }

  nearestNode(pos) {
    const cx = Math.floor(pos.x / 64);
    const cz = Math.floor(pos.z / 64);
    let best = null;
    let bestD = Infinity;
    for (let r = 0; r < 12; r++) {
      for (let i = -r; i <= r; i++) {
        for (let j = -r; j <= r; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
          for (const n of this.nodeGrid.get(`${cx + i},${cz + j}`) || []) {
            const d = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2;
            if (d < bestD) {
              bestD = d;
              best = n;
            }
          }
        }
      }
      if (best && Math.sqrt(bestD) < r * 64) return best;
    }
    return best || this.nodes[0];
  }

  /** Nodos a una distancia entre rMin y rMax del punto. */
  nodesNear(pos, rMin, rMax) {
    const out = [];
    const c0 = Math.floor((pos.x - rMax) / 64);
    const c1 = Math.floor((pos.x + rMax) / 64);
    const d0 = Math.floor((pos.z - rMax) / 64);
    const d1 = Math.floor((pos.z + rMax) / 64);
    for (let i = c0; i <= c1; i++) {
      for (let j = d0; j <= d1; j++) {
        for (const n of this.nodeGrid.get(`${i},${j}`) || []) {
          const d = Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z);
          if (d >= rMin && d <= rMax) out.push(n);
        }
      }
    }
    return out;
  }

  /** Punto de calzada más cercano, con la dirección del tramo. */
  nearestRoadPoint(p) {
    let q = this.roadQuery(p.x, p.z);
    if (!q.edge) {
      const n = this.nearestNode(p);
      q = this.roadQuery(n.pos.x, n.pos.z);
    }
    const e = q.edge;
    const a = this.nodes[e.a].pos;
    const b = this.nodes[e.b].pos;
    return { point: new THREE.Vector3().lerpVectors(a, b, q.t), dir: new THREE.Vector3().subVectors(b, a).normalize(), edge: e };
  }

  /**
   * Plaza de aparcamiento en el carril derecho más cercano a p (para traer coches).
   * Devuelve { pos, heading }.
   */
  parkingNear(p) {
    const { point, dir, edge } = this.nearestRoadPoint(p);
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    let d = dir;
    if (!edge.oneWay && right.dot(new THREE.Vector3().subVectors(p, point)) < 0) {
      d = dir.clone().negate();
      right.negate();
    }
    const pos = point.clone().addScaledVector(right, edge.w / 2 - (edge.road.parkInset ?? 1.7));
    return { pos, heading: Math.atan2(d.x, d.z) };
  }

  /** Posición a s metros del inicio de una calle y su tangente. */
  pointOnRoad(road, s) {
    const ids = road.nodeIds;
    s = THREE.MathUtils.clamp(s, 0, road.length);
    let i = 0;
    while (i < road.cum.length - 2 && road.cum[i + 1] < s) i++;
    const a = this.nodes[ids[i]].pos;
    const b = this.nodes[ids[i + 1]].pos;
    const t = (s - road.cum[i]) / Math.max(1e-6, road.cum[i + 1] - road.cum[i]);
    return { pos: new THREE.Vector3().lerpVectors(a, b, t), dir: new THREE.Vector3().subVectors(b, a).normalize() };
  }

  /**
   * Punto de acera para un lugar, en el lado de la calle más cercana a (x, z).
   * Devuelve { pos, normal (hacia la calzada), park, heading } como sidewalkSpot.
   */
  spotAt(x, z, roadName) {
    let edge;
    let t;
    if (roadName) {
      const road = this.roadByName[roadName];
      let best = Infinity;
      for (const e of this.edges) {
        if (e.road !== road) continue;
        const a = this.nodes[e.a].pos;
        const b = this.nodes[e.b].pos;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const tt = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(a.x + dx * tt - x, a.z + dz * tt - z);
        if (d < best) {
          best = d;
          edge = e;
          t = tt;
        }
      }
    } else {
      const q = this.roadQuery(x, z);
      edge = q.edge;
      t = q.t;
    }
    const a = this.nodes[edge.a].pos;
    const b = this.nodes[edge.b].pos;
    const P = new THREE.Vector3().lerpVectors(a, b, t);
    const T = new THREE.Vector3().subVectors(b, a).normalize();
    const R = new THREE.Vector3(-T.z, 0, T.x);
    const side = R.dot(new THREE.Vector3(x - P.x, 0, z - P.z)) >= 0 ? 1 : -1;
    const n = R.clone().multiplyScalar(side);
    const w = edge.w;
    const dirPark = T.clone().multiplyScalar(side);
    return {
      pos: P.clone().addScaledVector(n, w / 2 + CITY.SIDEWALK / 2),
      normal: n.clone().negate(),
      park: P.clone().addScaledVector(n, w / 2 - (edge.road.parkInset ?? 1.7)).addScaledVector(dirPark, 8),
      heading: Math.atan2(dirPark.x, dirPark.z),
    };
  }

  /** A* sobre la red dirigida (respeta el sentido de la glorieta). Devuelve nodos. */
  findPath(from, to) {
    const start = this.nearestNode(from);
    const goal = this.nearestNode(to);
    const nodes = this.nodes;
    const g = new Map([[start.id, 0]]);
    const came = new Map();
    const heap = [[Math.hypot(start.pos.x - goal.pos.x, start.pos.z - goal.pos.z), start.id]];
    const closed = new Set();
    const pushHeap = (item) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const popHeap = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [, cur] = popHeap();
      if (cur === goal.id) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const node = nodes[cur];
      for (const nid of node.out) {
        const nb = nodes[nid];
        const tentative = g.get(cur) + node.pos.distanceTo(nb.pos);
        if (tentative < (g.get(nid) ?? Infinity)) {
          came.set(nid, cur);
          g.set(nid, tentative);
          pushHeap([tentative + Math.hypot(nb.pos.x - goal.pos.x, nb.pos.z - goal.pos.z), nid]);
        }
      }
    }
    const path = [];
    let id = goal.id;
    if (id !== start.id && !came.has(id)) return [start, goal];
    while (id !== undefined) {
      path.unshift(nodes[id]);
      id = came.get(id);
    }
    return path;
  }

  /** Semáforo para quien llega al cruce `node` desde `fromNode`. */
  signalState(node, fromNode) {
    if (!node.signal) return 'green';
    const k = node.phaseOf.get(fromNode.id) ?? 0;
    const cycle = PHASE * node.phases;
    const t = (((this.lightTimer + node.offset) % cycle) + cycle) % cycle;
    const phase = Math.floor(t / PHASE);
    if (phase !== k) return 'red';
    return t - phase * PHASE < PHASE - 2 ? 'green' : 'yellow';
  }

  /** Recorrido de acera para un peatón cerca de `pos` (ida y vuelta por el mismo lado). */
  sidewalkPath(pos, minD, maxD) {
    const list = [];
    for (let i = Math.floor((pos.x - maxD) / 32); i <= Math.floor((pos.x + maxD) / 32); i += 2) {
      for (let j = Math.floor((pos.z - maxD) / 32); j <= Math.floor((pos.z + maxD) / 32); j += 2) {
        for (const e of this.edgeGrid.get(`${i},${j}`) || []) {
          if (!e.sidewalk || e.road.kind === 'circle') continue;
          const a = this.nodes[e.a].pos;
          const d = Math.hypot(a.x - pos.x, a.z - pos.z);
          if (d >= minD && d <= maxD) list.push(e);
        }
      }
    }
    if (!list.length) return null;
    const e = list[Math.floor(Math.random() * list.length)];
    const r = e.road;
    const ids = r.nodeIds;
    const nodes = this.nodes;
    // El tramo de acera entre dos cruces (sin cruzar la calzada de las bocacalles)
    let i0 = e.idx;
    while (i0 > 0 && !nodes[ids[i0]].junction && e.idx - i0 < 10) i0--;
    let i1 = e.idx + 1;
    while (i1 < ids.length - 1 && !nodes[ids[i1]].junction && i1 - e.idx < 10) i1++;
    const side = Math.random() < 0.5 ? 1 : -1;
    const off = r.w / 2 + CITY.SIDEWALK / 2;
    const center = [];
    for (let i = i0; i <= i1; i++) {
      const n = nodes[ids[i]];
      if (n.junction) {
        // punto retrasado hasta antes del paso de cebra
        const inner = nodes[ids[i === i0 ? i + 1 : i - 1]].pos;
        const d = new THREE.Vector3().subVectors(inner, n.pos);
        const len = d.length();
        const back = Math.min(len * 0.8, n.radius + CITY.SIDEWALK + 1.5);
        center.push(n.pos.clone().addScaledVector(d.normalize(), back));
      } else center.push(n.pos.clone());
    }
    const pts = [];
    for (let i = 0; i < center.length; i++) {
      const prev = center[Math.max(0, i - 1)];
      const next = center[Math.min(center.length - 1, i + 1)];
      const T = new THREE.Vector3().subVectors(next, prev).normalize();
      const p = center[i];
      pts.push(new THREE.Vector3(p.x - T.z * off * side, 0, p.z + T.x * off * side));
    }
    if (pts.length < 2) return null;
    const path = pts.concat(pts.slice(1, -1).reverse());
    return { path };
  }

  // ------------------------------------------------------------------
  // Materiales y texturas procedurales
  // ------------------------------------------------------------------
  createMaterials() {
    // Estilos de fachada, dos tonos cada uno. El mapa emisivo enciende ventanas de noche.
    this.facadeStyles = {};
    this.buildingMaterials = [];
    const variants = {
      office: [0xffffff, 0xe0d6c8],
      brick: [0xffffff, 0xd9c2b0],
      glass: [0xffffff, 0xc8e0e8],
      modern: [0xffffff, 0xf0e8dc],
      warehouse: [0xffffff, 0xd9e0dc, 0xe8dccb],
      house: [0xffffff, 0xf2e6da, 0xe6eef0],
    };
    for (const style of Object.keys(variants)) {
      const tex = facadeTextures(style, this.rand);
      this.facadeStyles[style] = variants[style].map((tint) => {
        const glass = style === 'glass';
        const m = new THREE.MeshStandardMaterial({
          color: tint,
          map: tex.map,
          emissive: 0xffffff,
          emissiveMap: tex.emissive,
          emissiveIntensity: 0,
          roughness: glass ? 0.12 : style === 'modern' ? 0.55 : style === 'warehouse' ? 0.6 : 0.85,
          metalness: glass ? 0.85 : style === 'warehouse' ? 0.35 : 0.05,
          envMapIntensity: glass ? 1.3 : 0.5,
        });
        m.userData.tile = [tex.tileW, tex.tileH];
        this.buildingMaterials.push(m);
        return m;
      });
    }
    const shop = storefrontTextures(this.rand);
    this.storefrontMat = new THREE.MeshStandardMaterial({ map: shop.map, emissive: 0xffffff, emissiveMap: shop.emissive, emissiveIntensity: 0.25, roughness: 0.3, metalness: 0.3 });
    this.buildingMaterials.push(this.storefrontMat);
    this.corniceMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.8 });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x5b5a57, roughness: 0.95 });
    this.tileRoofMats = [
      new THREE.MeshStandardMaterial({ color: 0x8d3b2b, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ color: 0x6d4c3d, roughness: 0.85 }),
    ];
    this.concreteMat = new THREE.MeshStandardMaterial({
      map: toTexture(
        makeCanvas(256, 256, (ctx, W, H) => {
          ctx.fillStyle = '#a7a39a';
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          for (let y = 0; y < H; y += 64) ctx.fillRect(0, y, W, 2);
          for (let x = 0; x < W; x += 128) ctx.fillRect(x, 0, 2, H);
          addNoise(ctx, W, H, 14, this.rand);
        })
      ),
      roughness: 0.9,
    });
    this.concreteMat.map.repeat.set(4, 2);

    this.poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 });
  }

  /** Suelo: una textura de canvas con parcelas, parques, playa, aceras y asfalto. También es el mapa. */
  createGround() {
    const size = CITY.SIZE;
    const px = 4096;
    const s = px / size; // píxeles por metro
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    const toPx = (v) => (v + size / 2) * s;
    const nodes = this.nodes;

    // Césped con manchas
    ctx.fillStyle = '#4d6b3c';
    ctx.fillRect(0, 0, px, px);
    for (let k = 0; k < 500; k++) {
      const x = this.rand() * px;
      const y = this.rand() * px;
      const r = (6 + this.rand() * 30) * s;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = this.rand() < 0.5 ? '70,98,52' : '88,112,62';
      g.addColorStop(0, `rgba(${c},0.5)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Trazos agrupados: un Path2D por (ancho, color) y un único stroke por grupo
    const batches = new Map();
    const strokeEdge = (e, width, color) => {
      const k = `${width}|${color}`;
      if (!batches.has(k)) batches.set(k, { width, color, path: new Path2D() });
      const a = nodes[e.a].pos;
      const b = nodes[e.b].pos;
      const path = batches.get(k).path;
      path.moveTo(toPx(a.x), toPx(a.z));
      path.lineTo(toPx(b.x), toPx(b.z));
    };
    const flush = () => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const { width, color, path } of batches.values()) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width * s;
        ctx.stroke(path);
      }
      batches.clear();
    };

    // Suelo urbano (hormigón) por zonas, recortado por la circunvalación
    ctx.save();
    const ringPath = new Path2D();
    this.ringPolygon.forEach((p, i) => (i ? ringPath.lineTo(toPx(p.x), toPx(p.z)) : ringPath.moveTo(toPx(p.x), toPx(p.z))));
    ringPath.closePath();
    ctx.clip(ringPath);
    const rect = (x0, z0, x1, z1, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(toPx(x0), toPx(z0), (x1 - x0) * s, (z1 - z0) * s);
    };
    rect(-225, -240, 225, 300, '#8a8a84'); // centro y ensanche
    rect(-560, -260, -205, 260, '#7d7c76'); // polígono
    ctx.restore();
    rect(-560, 240, -20, 380, '#7d7c76'); // puerto (el mar se pinta encima)

    // Mar, playa y muelles
    ctx.beginPath();
    ctx.moveTo(toPx(-size / 2), toPx(size / 2));
    for (let x = -size / 2; x <= size / 2; x += 8) ctx.lineTo(toPx(x), toPx(coastZ(x)));
    ctx.lineTo(toPx(size / 2), toPx(size / 2));
    ctx.closePath();
    ctx.fillStyle = '#1f4a63';
    ctx.fill();
    for (let x = -size / 2; x < size / 2; x += 4) {
      const z = coastZ(x);
      ctx.fillStyle = x < -20 ? '#8d8c86' : '#d9c79b';
      const depth = x < -20 ? 34 : 30;
      ctx.fillRect(toPx(x), toPx(z - depth), 4.5 * s, depth * s);
    }

    // Parques y la isleta de la glorieta
    ctx.fillStyle = '#5b8a3f';
    for (const p of PARKS) ctx.fillRect(toPx(p.minX), toPx(p.minZ), (p.maxX - p.minX) * s, (p.maxZ - p.minZ) * s);
    ctx.strokeStyle = '#c9bfa4';
    ctx.lineWidth = 1.6 * s;
    for (const p of PARKS) {
      ctx.beginPath();
      ctx.moveTo(toPx(p.minX), toPx(p.minZ));
      ctx.lineTo(toPx(p.maxX), toPx(p.maxZ));
      ctx.moveTo(toPx(p.maxX), toPx(p.minZ));
      ctx.lineTo(toPx(p.minX), toPx(p.maxZ));
      ctx.stroke();
    }

    // Colina: sombreado por altura y el suelo de hormigón de la trinchera y el túnel
    for (let z = RIDGE.zc - 90; z < RIDGE.zc + 90; z += 5) {
      for (let x = RIDGE.xc - 230; x < RIDGE.xc + 230; x += 5) {
        const h = hillHeight(x, z);
        if (h < 0.5) continue;
        const k = Math.min(1, h / RIDGE.H);
        ctx.fillStyle = `rgba(${60 + k * 50},${88 + k * 30},${48 + k * 20},0.9)`;
        ctx.fillRect(toPx(x), toPx(z), 5.2 * s, 5.2 * s);
      }
    }
    ctx.fillStyle = '#8d8b85';
    ctx.fillRect(toPx(-RIDGE.corridor), toPx(RIDGE.zc - RIDGE.pz - RIDGE.fz), RIDGE.corridor * 2 * s, (RIDGE.pz + RIDGE.fz) * 2 * s);

    // Aceras (o arcén) y asfalto, tramo a tramo
    for (const e of this.edges) strokeEdge(e, e.sidewalk ? e.w + CITY.SIDEWALK * 2 : e.w + 2, e.sidewalk ? '#a3a39c' : '#6b6b63');
    flush();
    for (const e of this.edges) strokeEdge(e, e.w, '#4a4c52');
    flush();

    ctx.fillStyle = '#5b8a3f';
    ctx.beginPath();
    ctx.arc(toPx(0), toPx(0), 12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8b2a4';
    ctx.beginPath();
    ctx.arc(toPx(0), toPx(0), 5 * s, 0, Math.PI * 2);
    ctx.fill();

    // Parches de asfalto y manchas de aceite
    for (let k = 0; k < 1600; k++) {
      const e = this.edges[Math.floor(this.rand() * this.edges.length)];
      const a = nodes[e.a].pos;
      const b = nodes[e.b].pos;
      const t = this.rand();
      const side = this.rand() < 0.5 ? -1 : 1;
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const off = side * (e.lane + (this.rand() - 0.5));
      const x = a.x + (b.x - a.x) * t - dir.z * off;
      const z = a.z + (b.z - a.z) * t + dir.x * off;
      const r = (0.4 + this.rand() * 1.4) * s;
      const g = ctx.createRadialGradient(toPx(x), toPx(z), 0, toPx(x), toPx(z), r);
      g.addColorStop(0, `rgba(20,20,22,${0.2 + this.rand() * 0.2})`);
      g.addColorStop(1, 'rgba(20,20,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(toPx(x) - r, toPx(z) - r, r * 2, r * 2);
    }
    // Grano: un mosaico de ruido de 256 px repetido (recorrer 4096² píxeles en JS tardaba segundos)
    const grain = makeCanvas(256, 256, (g, W, H) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, W, H);
      addNoise(g, W, H, 60, this.rand);
    });
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = ctx.createPattern(grain, 'repeat');
    ctx.fillRect(0, 0, px, px);
    ctx.restore();

    this.mapCanvas = canvas;
    this.mapSize = size;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.game.renderer.capabilities.getMaxAnisotropy();
    const cityGround = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, envMapIntensity: 0.4 }));
    cityGround.rotation.x = -Math.PI / 2;
    cityGround.receiveShadow = true;
    this.scene.add(cityGround);
    this.shootables.push(cityGround);

    const outer = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x3f5a31, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    // Bien por debajo del suelo de la ciudad: a -0.02 m había z-fighting con buffers de profundidad
    // de 16 bits (el césped "atravesaba" el asfalto). Los muros del borde tapan el escalón.
    outer.position.y = -0.5;
    outer.receiveShadow = true;
    this.scene.add(outer);

    // Suelo físico infinito
    this.groundMaterial = new CANNON.Material('ground');
    const ground = new CANNON.Body({ mass: 0, material: this.groundMaterial, collisionFilterGroup: GROUPS.STATIC });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.groundBody = ground;
  }

  /** ¿Está (x, z) dentro de la zona de un cruce? (sin marcas viales) */
  nearJunction(x, z, pad = 1.5) {
    for (const n of this.nodeGrid.get(`${Math.floor(x / 64)},${Math.floor(z / 64)}`) || []) {
      if (n.junction && Math.hypot(n.pos.x - x, n.pos.z - z) < n.radius + pad) return true;
    }
    // vecinos por si el cruce cae en otra celda
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (!i && !j) continue;
        for (const n of this.nodeGrid.get(`${Math.floor(x / 64) + i},${Math.floor(z / 64) + j}`) || []) {
          if (n.junction && Math.hypot(n.pos.x - x, n.pos.z - z) < n.radius + pad) return true;
        }
      }
    }
    return false;
  }

  /** Marcas viales como geometría (nítidas a cualquier distancia): líneas, discontinuas y pasos de cebra. */
  createMarkings() {
    const white = [];
    const yellow = [];
    const nodes = this.nodes;
    const strip = (list, x1, z1, x2, z2, width) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.05) return;
      list.push([(x1 + x2) / 2, (z1 + z2) / 2, Math.atan2(x2 - x1, z2 - z1), width, len]);
    };
    // Recorre una línea desplazada `off` del eje de la calle; dash = [trazo, hueco] o null (continua)
    const line = (road, list, off, width, dash) => {
      const ids = road.nodeIds;
      let sGlobal = 0;
      for (let i = 0; i < ids.length - 1; i++) {
        const a = nodes[ids[i]].pos;
        const b = nodes[ids[i + 1]].pos;
        const L = a.distanceTo(b);
        const dx = (b.x - a.x) / L;
        const dz = (b.z - a.z) / L;
        const ox = -dz * off;
        const oz = dx * off;
        // Tramos "encendidos" muestreados cada 0,5 m: fuera de los cruces y, si es discontinua, en fase de trazo
        const emit = (s0, s1) => strip(list, a.x + dx * s0 + ox, a.z + dz * s0 + oz, a.x + dx * s1 + ox, a.z + dz * s1 + oz, width);
        let runStart = null;
        const steps = Math.ceil(L / 0.5);
        for (let k = 0; k <= steps; k++) {
          const s = Math.min(L, k * 0.5);
          let on = !this.nearJunction(a.x + dx * s, a.z + dz * s);
          if (on && dash) on = (sGlobal + s) % (dash[0] + dash[1]) < dash[0];
          if (on && runStart === null) runStart = s;
          if (!on && runStart !== null) {
            emit(runStart, s);
            runStart = null;
          }
        }
        if (runStart !== null) emit(runStart, L);
        sGlobal += L;
      }
    };
    for (const r of this.roads) {
      const edgeOff = r.w / 2 - 0.4;
      line(r, white, edgeOff, 0.15, null);
      line(r, white, -edgeOff, 0.15, null);
      if (r.type === 'avenue') {
        line(r, yellow, 0.18, 0.13, null);
        line(r, yellow, -0.18, 0.13, null);
        line(r, white, 4, 0.13, [3, 4]);
        line(r, white, -4, 0.13, [3, 4]);
      } else {
        line(r, r.type === 'street' ? yellow : white, 0, 0.13, [3, 5]);
      }
    }
    // Pasos de cebra en los cruces con semáforo
    for (const n of nodes) {
      if (!n.signal) continue;
      for (const id of n.links) {
        const e = this.edgeBetween(n.id, id);
        const p = nodes[id].pos;
        const d = new THREE.Vector3().subVectors(p, n.pos).normalize();
        const c = n.pos.clone().addScaledVector(d, n.radius + 2);
        const r = new THREE.Vector3(-d.z, 0, d.x);
        for (let k = -e.w / 2 + 0.8; k < e.w / 2 - 0.5; k += 1.3) {
          const q = c.clone().addScaledVector(r, k);
          strip(white, q.x - d.x * 1.4, q.z - d.z * 1.4, q.x + d.x * 1.4, q.z + d.z * 1.4, 0.6);
        }
      }
    }

    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const make = (list, color) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const sc = new THREE.Vector3();
      const p = new THREE.Vector3();
      list.forEach(([x, z, ang, w, len], i) => {
        q.setFromAxisAngle(up, ang);
        m.compose(p.set(x, 0.025, z), q, sc.set(w, 1, len));
        im.setMatrixAt(i, m);
      });
      im.receiveShadow = true;
      this.scene.add(im);
    };
    make(white, 0xe2e2de);
    make(yellow, 0xdcae2e);
  }

  // ------------------------------------------------------------------
  // Colina con túnel, mar y bordes
  // ------------------------------------------------------------------
  createHillAndTunnel() {
    const R = RIDGE;
    const x0 = -248;
    const x1 = 212;
    const z0 = R.zc - 90;
    const z1 = R.zc + 90;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, (x1 - x0) / 4, (z1 - z0) / 4);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (x0 + x1) / 2;
      const z = pos.getZ(i) + (z0 + z1) / 2;
      const h = hillHeight(x, z);
      pos.setXYZ(i, x, h - 0.3, z);
      const slope = Math.hypot(hillHeight(x + 2, z) - hillHeight(x - 2, z), hillHeight(x, z + 2) - hillHeight(x, z - 2)) / 4;
      const n = this.rand();
      if (slope > 1.1 && h > 1) col.setRGB(0.42 + n * 0.08, 0.39 + n * 0.06, 0.34 + n * 0.05);
      else col.setHSL(0.24 + n * 0.05, 0.42, 0.16 + n * 0.06 + Math.min(h, 30) * 0.002);
      col.toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Hueco en el corredor: fuera del túnel (y en la boca) no hay ladera sobre la calzada
    const idx = geo.index.array;
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      const cx = (pos.getX(tri[0]) + pos.getX(tri[1]) + pos.getX(tri[2])) / 3;
      const outside = tri.some((v) => Math.abs(pos.getZ(v) - R.zc) > R.tunnelHalf);
      if (Math.abs(cx) < R.corridor && outside) continue;
      keep.push(...tri);
    }
    geo.setIndex(keep);
    geo.computeVertexNormals();
    const hill = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    hill.castShadow = hill.receiveShadow = true;
    this.scene.add(hill);
    this.shootables.push(hill);

    // Cuerpo físico: dos bloques a ambos lados del corredor (las laderas no se escalan en coche)
    const hillBody = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    const hz = R.pz + R.fz * 0.8;
    const west = [R.xc - (R.px + R.fx * 0.8), -R.corridor];
    const east = [R.corridor, R.xc + R.px + R.fx * 0.8];
    for (const [a, b] of [west, east]) {
      hillBody.addShape(new CANNON.Box(new CANNON.Vec3((b - a) / 2, 20, hz)), new CANNON.Vec3((a + b) / 2, 20, R.zc));
    }
    this.world.addBody(hillBody);

    // Túnel: muros, techo, luces y bocas
    const len = R.tunnelHalf * 2;
    const wallX = R.corridor - 0.5;
    const tunnelMat = new THREE.MeshStandardMaterial({
      map: toTexture(
        makeCanvas(256, 256, (ctx, W, H) => {
          ctx.fillStyle = '#d8d6ce';
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(0,0,0,0.12)';
          for (let y = 0; y < H; y += 32) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
          }
          for (let x = 0; x < W; x += 32) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
          }
          ctx.fillStyle = '#3a4a5a';
          ctx.fillRect(0, H - 60, W, 18);
          addNoise(ctx, W, H, 10, this.rand);
        })
      ),
      roughness: 0.5,
    });
    tunnelMat.map.repeat.set(len / 4, 2);
    const structure = [];
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    const addBox = (w, h, d, x, y, z, mat, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
      structure.push(m);
      if (collide) body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)), new CANNON.Vec3(x, y, z));
      return m;
    };
    const H = 8;
    for (const sx of [-1, 1]) addBox(1, H, len, sx * wallX, H / 2, R.zc, tunnelMat);
    addBox(wallX * 2 + 2, 1.2, len, 0, H + 0.6, R.zc, this.concreteMat);

    // Tramos de trinchera: muros de contención a la altura de la ladera
    const trenchEnd = R.pz + R.fz - 2;
    for (const dirZ of [-1, 1]) {
      for (let dz = R.tunnelHalf; dz < trenchEnd; dz += 5) {
        const zc = R.zc + dirZ * (dz + 2.5);
        const hh = Math.max(1.2, hillHeight(R.corridor + 3, zc) + 0.6);
        for (const sx of [-1, 1]) addBox(1, hh, 5.05, sx * wallX, hh / 2, zc, this.concreteMat);
      }
      // Boca del túnel
      const zp = R.zc + dirZ * (R.tunnelHalf + 0.9);
      const top = hillHeight(R.corridor + 4, R.zc + dirZ * R.tunnelHalf) + 2;
      addBox(wallX * 2 + 16, top - H, 1.8, 0, H + (top - H) / 2, zp, this.concreteMat);
      addBox(wallX * 2 + 3, 1.4, 2.2, 0, H + 0.7, zp + dirZ * 0.2, this.poleMaterial, false);
    }
    this.world.addBody(body);
    for (const m of structure) {
      this.allColliders.push(m);
      this.shootables.push(m);
    }
    this.fixedColliders = structure.slice();

    // Luces del techo
    const lightGeo = new THREE.BoxGeometry(0.5, 0.12, 2.4);
    this.tunnelLightMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a8, emissiveIntensity: 2.2 });
    const count = Math.floor(len / 7) * 2;
    const lights = new THREE.InstancedMesh(lightGeo, this.tunnelLightMat, count);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let z = R.zc - R.tunnelHalf + 3; z < R.zc + R.tunnelHalf - 2 && k < count; z += 7) {
      for (const x of [-5, 5]) {
        if (k >= count) break;
        m.makeTranslation(x, H - 0.08, z);
        lights.setMatrixAt(k++, m);
      }
    }
    lights.count = k;
    this.scene.add(lights);
    // Sin luces puntuales: cada una se calcula en TODOS los píxeles de la pantalla, no solo en el túnel
  }

  createSea() {
    const size = CITY.SIZE;
    const shape = new THREE.Shape();
    shape.moveTo(-size, -size);
    for (let x = -size; x <= size; x += 10) shape.lineTo(x, -coastZ(Math.max(-size / 2, Math.min(size / 2, x))));
    shape.lineTo(size, -size);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x1b4d66, roughness: 0.1, metalness: 0.25, envMapIntensity: 1.3, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
    const water = new THREE.Mesh(geo, this.waterMat);
    water.position.y = 0.06;
    water.receiveShadow = true;
    this.scene.add(water);

    // Malecón: muro bajo y sólido a lo largo de la costa (un solo cuerpo con muchas piezas)
    const wall = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    const pieces = [];
    for (let x = -size / 2; x < size / 2; x += 20) {
      const a = new THREE.Vector3(x, 0, coastZ(x) - 1);
      const b = new THREE.Vector3(x + 20, 0, coastZ(x + 20) - 1);
      const len = a.distanceTo(b);
      const ang = Math.atan2(b.x - a.x, b.z - a.z);
      const c = a.clone().add(b).multiplyScalar(0.5);
      pieces.push([c, ang, len]);
      const q = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), ang);
      wall.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 2, len / 2 + 0.2)), new CANNON.Vec3(c.x, 2, c.z), q);
    }
    this.world.addBody(wall);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.9, 1), this.concreteMat, pieces.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    pieces.forEach(([c, ang, len], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      m.compose(new THREE.Vector3(c.x, 0.45, c.z), q, new THREE.Vector3(1, 1, len + 0.4));
      im.setMatrixAt(i, m);
    });
    im.castShadow = im.receiveShadow = true;
    this.scene.add(im);

    // Barcos fondeados
    this.boats = [];
    const hullMat = [0xf2f2f2, 0x1e3a5f, 0xb71c1c, 0x2e7d32].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.6 });
    for (const [x, dz, ang, sc] of [[-260, 40, 0.3, 1.6], [-120, 60, -0.2, 2.2], [60, 45, 1.2, 1], [180, 70, 0.6, 1.3], [320, 50, -0.9, 1], [-380, 55, 1.4, 1.8]]) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 9), hullMat[Math.floor(this.rand() * hullMat.length)]);
      hull.position.y = 0.3;
      const bow = new THREE.Mesh(new THREE.CylinderGeometry(0, 1.6, 3, 4, 1), hull.material);
      bow.rotation.x = Math.PI / 2;
      bow.rotation.y = Math.PI / 4;
      bow.scale.set(1, 1, 0.62);
      bow.position.set(0, 0.3, 5.9);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 3.4), cabinMat);
      cabin.position.set(0, 1.8, -0.8);
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.6, 3), glass);
      win.position.set(0, 2.1, -0.8);
      g.add(hull, bow, cabin, win);
      g.scale.setScalar(sc);
      g.position.set(x, 0, coastZ(x) + dz);
      g.rotation.y = ang;
      g.traverse((o) => (o.castShadow = true));
      this.scene.add(g);
      this.boats.push({ g, phase: this.rand() * 6 });
    }
  }

  createBoundaries() {
    const W = WORLD;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6d6d6d });
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    const sides = [
      [0, W.minZ, W.maxX - W.minX + 2, 1],
      [W.minX, (W.minZ + W.maxZ) / 2, 1, W.maxZ - W.minZ],
      [W.maxX, (W.minZ + W.maxZ) / 2, 1, W.maxZ - W.minZ],
    ];
    for (const [x, z, w, d] of sides) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat);
      mesh.position.set(x, 0.6, z);
      mesh.receiveShadow = mesh.castShadow = true;
      this.scene.add(mesh);
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 3, d / 2)), new CANNON.Vec3(x, 3, z));
    }
    this.world.addBody(body);
  }

  // ------------------------------------------------------------------
  // Edificios
  // ------------------------------------------------------------------
  /** Reserva un rectángulo (x/z mín-máx) para un lugar: ahí no se levanta ningún edificio genérico. */
  removeBuildingsIn(r) {
    this.reserved.push(r);
  }

  /** Registra un edificio construido fuera (fachadas de Locations) como colisionador de cámara y disparos. */
  registerStructure(meshes, rect, body) {
    for (const m of meshes) {
      this.allColliders.push(m);
      this.shootables.push(m);
      (this.fixedColliders ||= []).push(m);
    }
    if (rect) this.buildingRects.push(rect);
    if (body) this.world.addBody(body);
  }

  /** Solapamiento de rectángulos orientados (SAT) con margen. */
  static obbOverlap(A, B, margin) {
    const axes = [
      [Math.cos(A.yaw), -Math.sin(A.yaw)],
      [Math.sin(A.yaw), Math.cos(A.yaw)],
      [Math.cos(B.yaw), -Math.sin(B.yaw)],
      [Math.sin(B.yaw), Math.cos(B.yaw)],
    ];
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const proj = (o, ax) => Math.abs(o.hx * (Math.cos(o.yaw) * ax[0] - Math.sin(o.yaw) * ax[1])) + Math.abs(o.hz * (Math.sin(o.yaw) * ax[0] + Math.cos(o.yaw) * ax[1]));
    for (const ax of axes) {
      const d = Math.abs(dx * ax[0] + dz * ax[1]);
      if (d > proj(A, ax) + proj(B, ax) + margin) return false;
    }
    return true;
  }

  /** Puntos del contorno de un rectángulo orientado, cada ~5 m, y el centro. */
  static obbSamples(o) {
    const pts = [[o.x, o.z]];
    const ux = [Math.cos(o.yaw), -Math.sin(o.yaw)];
    const uz = [Math.sin(o.yaw), Math.cos(o.yaw)];
    const nx = Math.max(1, Math.ceil((o.hx * 2) / 5));
    const nz = Math.max(1, Math.ceil((o.hz * 2) / 5));
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        if (i > 0 && i < nx && j > 0 && j < nz) continue;
        const a = -o.hx + (2 * o.hx * i) / nx;
        const b = -o.hz + (2 * o.hz * j) / nz;
        pts.push([o.x + ux[0] * a + uz[0] * b, o.z + ux[1] * a + uz[1] * b]);
      }
    }
    return pts;
  }

  static obbAABB(o) {
    const c = Math.abs(Math.cos(o.yaw));
    const s = Math.abs(Math.sin(o.yaw));
    const ex = o.hx * c + o.hz * s;
    const ez = o.hx * s + o.hz * c;
    return { minX: o.x - ex, maxX: o.x + ex, minZ: o.z - ez, maxZ: o.z + ez };
  }

  lotFree(o, minClear) {
    const box = Environment.obbAABB(o);
    for (const r of this.reserved) {
      if (box.maxX > r.minX && box.minX < r.maxX && box.maxZ > r.minZ && box.minZ < r.maxZ) return false;
    }
    for (const p of PARKS) {
      if (box.maxX > p.minX && box.minX < p.maxX && box.maxZ > p.minZ && box.minZ < p.maxZ) return false;
    }
    if (this.inHillFootprint(o.x, o.z, Math.max(o.hx, o.hz))) return false;
    for (const [x, z] of Environment.obbSamples(o)) {
      if (this.clearance(x, z) < minClear) return false;
      if (x < WORLD.minX + 6 || x > WORLD.maxX - 6 || z < WORLD.minZ + 6 || z > coastZ(x) - 4) return false;
      if (Math.hypot(x, z) < 30) return false; // glorieta
    }
    const cx = Math.floor(o.x / 64);
    const cz = Math.floor(o.z / 64);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const b of this.lotGrid.get(`${cx + i},${cz + j}`) || []) {
          if (Environment.obbOverlap(o, b, 1.2)) return false;
        }
      }
    }
    return true;
  }

  /** Recorre cada calle por ambos lados levantando edificios según el barrio. */
  createBuildings() {
    this.lotGrid = new Map();
    this.chunks = new Map();
    const rnd = (a, b) => a + this.rand() * (b - a);
    for (const road of this.roads) {
      if (!road.lots || road.length < 20) continue;
      for (const side of [1, -1]) {
        let s = 3;
        while (s < road.length - 3) {
          const { pos: P, dir: T } = this.pointOnRoad(road, s);
          const R = new THREE.Vector3(-T.z * side, 0, T.x * side);
          const probe = P.clone().addScaledVector(R, road.w / 2 + 14);
          const district = this.districtAt(probe.x, probe.z);
          const cfg = LOTS[district];
          if (!cfg) {
            s += 8;
            continue;
          }
          const along = rnd(...cfg.along);
          const depth = rnd(...cfg.depth);
          const setback = rnd(...cfg.setback);
          const front = road.w / 2 + (road.sidewalk ? CITY.SIDEWALK : 2) + setback;
          const c = P.clone().addScaledVector(R, front + depth / 2).addScaledVector(T, along / 2);
          const o = { x: c.x, z: c.z, hx: depth / 2, hz: along / 2, yaw: Math.atan2(T.x, T.z) };
          if (!this.lotFree(o, (road.sidewalk ? CITY.SIDEWALK : 2) + 0.2)) {
            s += 3;
            continue;
          }
          this.gridAdd(this.lotGrid, 64, o.x, o.z, o);
          this.placeBuilding(o, district);
          s += along + cfg.gap * (0.6 + this.rand() * 0.8);
        }
      }
    }
    this.flushChunks();
  }

  placeBuilding(o, district) {
    const w = o.hx * 2;
    const d = o.hz * 2;
    if (district === 'downtown' || district === 'midtown') {
      const centrality = 1 - Math.min(1, Math.hypot(o.x, o.z) / 260);
      const h = district === 'downtown' ? 10 + this.rand() * (16 + centrality * 75) : 8 + this.rand() * 22;
      const style = h > 55 ? (this.rand() < 0.6 ? 'glass' : 'modern') : h < 22 ? (this.rand() < 0.6 ? 'brick' : 'office') : ['office', 'brick', 'modern', 'glass'][Math.floor(this.rand() * 4)];
      this.addBuilding(o.x, o.z, w, h, d, style, { yaw: o.yaw });
    } else if (district === 'industrial' || district === 'port') {
      this.addBuilding(o.x, o.z, w, 7 + this.rand() * 6, d, 'warehouse', { yaw: o.yaw, storefront: false });
    } else if (district === 'suburb') {
      this.addBuilding(o.x, o.z, w, 5.5 + this.rand() * 2, d, 'house', { yaw: o.yaw, storefront: false, gable: true });
    } else if (district === 'hills') {
      this.addBuilding(o.x, o.z, w, 6 + this.rand() * 3.5, d, this.rand() < 0.5 ? 'house' : 'modern', { yaw: o.yaw, storefront: false, gable: this.rand() < 0.6 });
    }
  }

  /** Aplica UV en metros a una caja para que la textura no se estire. */
  static meterUV(geo, w, h, d, tileW, tileH, vOffset = 0) {
    const uv = geo.attributes.uv;
    for (let face = 0; face < 6; face++) {
      const along = face < 2 ? d : w; // caras ±X usan la profundidad, ±Z el ancho
      for (let v = 0; v < 4; v++) {
        const idx = face * 4 + v;
        if (face === 2 || face === 3) uv.setXY(idx, 0.01, 0.01);
        else uv.setXY(idx, (uv.getX(idx) * along) / tileW, (uv.getY(idx) * h + vOffset) / tileH);
      }
    }
  }

  /** Añade una geometría al lote de su zona (se fusionan por material al final). */
  chunkAdd(geo, mat, x, y, z, yaw, cx, cz) {
    const m = new THREE.Matrix4().makeRotationY(yaw);
    const off = new THREE.Vector3(x, 0, z).applyMatrix4(m);
    m.setPosition(cx + off.x, y, cz + off.z);
    geo.applyMatrix4(m);
    if (!geo.index) geo = mergeVertices(geo);
    const key = `${Math.floor(cx / 256)},${Math.floor(cz / 256)}|${mat.uuid}`;
    if (!this.chunks.has(key)) this.chunks.set(key, { mat, geos: [] });
    this.chunks.get(key).geos.push(geo);
  }

  flushChunks() {
    for (const { mat, geos } of this.chunks.values()) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    this.chunks.clear();
  }

  /**
   * Edificio: planta baja (comercial o no) + cuerpo con fachada del estilo elegido + cornisa,
   * con retranqueo en los rascacielos, tejado a dos aguas en las casas y equipos en las azoteas.
   * La geometría va a los lotes fusionados; la colisión es una caja (cámara, disparos y física).
   */
  addBuilding(x, z, w, h, d, style = 'office', { yaw = 0, storefront = true, gable = false } = {}) {
    const add = (geo, mat, lx, y, lz) => this.chunkAdd(geo, mat, lx, y, lz, yaw, x, z);
    const mats = this.facadeStyles[style];
    const mat = mats[Math.floor(this.rand() * mats.length)];
    const [tileW, tileH] = mat.userData.tile;

    let base = 0;
    if (storefront) {
      const gh = 4.5;
      const gGeo = new THREE.BoxGeometry(w, gh, d);
      Environment.meterUV(gGeo, w, gh, d, 12, gh);
      add(gGeo, this.storefrontMat, 0, gh / 2, 0);
      add(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), this.corniceMat, 0, gh + 0.17, 0);
      base = gh;
    }
    const tiered = h > 50 && this.rand() < 0.6;
    const h1 = tiered ? h * 0.62 : h;
    const bodyH = h1 - base;
    const bGeo = new THREE.BoxGeometry(w, bodyH, d);
    Environment.meterUV(bGeo, w, bodyH, d, tileW, tileH);
    add(bGeo, mat, 0, base + bodyH / 2, 0);
    let top = h1;
    if (gable) {
      const r = (w / 1.732) * 1.08;
      const roof = new THREE.CylinderGeometry(r, r, d + 0.8, 3);
      roof.rotateX(-Math.PI / 2);
      roof.scale(1, 0.42, 1); // pendiente de unos 25°
      add(roof, this.tileRoofMats[Math.floor(this.rand() * this.tileRoofMats.length)], 0, h1 + r * 0.5 * 0.42, 0);
    } else {
      add(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), this.corniceMat, 0, h1 + 0.3, 0);
      if (tiered) {
        const w2 = w * 0.7;
        const d2 = d * 0.7;
        const h2 = h - h1;
        const tGeo = new THREE.BoxGeometry(w2, h2, d2);
        Environment.meterUV(tGeo, w2, h2, d2, tileW, tileH);
        add(tGeo, mat, 0, h1 + 0.6 + h2 / 2, 0);
        add(new THREE.BoxGeometry(w2 + 0.4, 0.5, d2 + 0.4), this.corniceMat, 0, h + 0.85, 0);
        top = h + 0.6;
      }
      const units = Math.floor(this.rand() * 4);
      for (let k = 0; k < units; k++) {
        const sx = (this.rand() - 0.5) * w * 0.5;
        const sz = (this.rand() - 0.5) * d * 0.5;
        if (this.rand() < 0.3) add(new THREE.CylinderGeometry(1, 1, 2.2, 10), this.roofMat, sx, top + 1.7, sz);
        else add(new THREE.BoxGeometry(1.6 + this.rand() * 2, 1.2, 1.4 + this.rand() * 2), this.roofMat, sx, top + 1.2, sz);
      }
    }
    return this.addCollider(x, z, w, h, d, yaw);
  }

  /** Caja invisible para cámara y disparos + cuerpo físico en streaming. */
  addCollider(x, z, w, h, d, yaw = 0) {
    if (!this.proxyGeo) {
      this.proxyGeo = new THREE.BoxGeometry(1, 1, 1);
      this.proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    }
    const proxy = new THREE.Mesh(this.proxyGeo, this.proxyMat);
    proxy.scale.set(w, h, d);
    proxy.rotation.y = yaw;
    proxy.position.set(x, h / 2, z);
    proxy.visible = false;
    proxy.updateMatrixWorld(true);
    this.allColliders.push(proxy);
    this.shootables.push(proxy);
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, h / 2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    this.addStreamed(body, x, z, proxy);
    const rect = Environment.obbAABB({ x, z, hx: w / 2, hz: d / 2, yaw });
    this.buildingRects.push(rect);
    const rec = { rect, body, proxy };
    this.buildings.push(rec);
    return rec;
  }

  /** Contenedores apilados en el puerto. */
  createContainers() {
    const list = [];
    const colors = [0xb71c1c, 0x1565c0, 0x2e7d32, 0xef6c00, 0x6d4c41, 0x546e7a, 0xf9a825];
    for (let attempt = 0; attempt < 400 && list.length < 70; attempt++) {
      const x = -420 + this.rand() * 390;
      const z = coastZ(x) - 6 - this.rand() * 24;
      const yaw = this.rand() < 0.7 ? 0 : Math.PI / 2;
      const o = { x, z, hx: 1.3, hz: 3.2, yaw };
      if (this.districtAt(x, z) !== 'port' || !this.lotFree(o, 2)) continue;
      this.gridAdd(this.lotGrid, 64, x, z, o);
      const stack = 1 + Math.floor(this.rand() * 3);
      for (let k = 0; k < stack; k++) list.push([x, z, yaw, k, colors[Math.floor(this.rand() * colors.length)]]);
      this.addCollider(x, z, 2.5, 2.6 * stack, 6.2, yaw);
    }
    const geo = new THREE.BoxGeometry(2.5, 2.6, 6.2);
    const tex = toTexture(
      makeCanvas(64, 64, (ctx, W, H) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (let x = 0; x < W; x += 6) ctx.fillRect(x, 0, 2, H);
        addNoise(ctx, W, H, 12, this.rand);
      })
    );
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3 }), list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    list.forEach(([x, z, yaw, k, color], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      m.compose(new THREE.Vector3(x, 1.3 + k * 2.6, z), q, one);
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.setHex(color));
    });
    im.castShadow = im.receiveShadow = true;
    this.scene.add(im);
  }

  // ------------------------------------------------------------------
  // Streaming de colisionadores estáticos
  // (el broadphase SAP de cannon es cuadrático con muchos cuerpos estáticos)
  // ------------------------------------------------------------------
  addStreamed(body, x, z, proxy = null) {
    const item = { body, x, z, proxy, active: false };
    this.streamItems.push(item);
    this.gridAdd((this.streamGrid ||= new Map()), 64, x, z, item);
  }

  updateStreaming(focus) {
    if (!this.streamGrid) return;
    const cx = Math.floor(focus.x / 64);
    const cz = Math.floor(focus.z / 64);
    const r = Math.ceil(STREAM_IN / 64);
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (const it of this.streamGrid.get(`${cx + i},${cz + j}`) || []) {
          if (it.active) continue;
          if (Math.hypot(it.x - focus.x, it.z - focus.z) > STREAM_IN) continue;
          this.world.addBody(it.body);
          it.active = true;
          this.streamActive.add(it);
        }
      }
    }
    for (const it of this.streamActive) {
      if (Math.hypot(it.x - focus.x, it.z - focus.z) > STREAM_OUT) {
        this.world.removeBody(it.body);
        it.active = false;
        this.streamActive.delete(it);
      }
    }
    // Colisionadores de cámara: solo los cercanos
    const near = (this.fixedColliders || []).slice();
    for (const it of this.streamActive) if (it.proxy && Math.hypot(it.x - focus.x, it.z - focus.z) < 90) near.push(it.proxy);
    this.buildingMeshes = near;
  }

  // ------------------------------------------------------------------
  // Vegetación, farolas y semáforos
  // ------------------------------------------------------------------
  createTrees() {
    const trees = []; // [x, y, z, conCuerpo]
    const reservedNear = (x, z, pad) => this.reserved.some((r) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad);
    const markerNear = (x, z) => (this.poiSpots || []).some((p) => Math.hypot(p.x - x, p.z - z) < 7);
    // Alineados en las aceras
    for (const road of this.roads) {
      if (!road.sidewalk || road.kind === 'circle') continue;
      for (const side of [1, -1]) {
        for (let s = 6; s < road.length - 6; s += 12) {
          if (this.rand() < 0.3) continue;
          const { pos: P, dir: T } = this.pointOnRoad(road, s);
          const x = P.x - T.z * side * (road.w / 2 + 0.9);
          const z = P.z + T.x * side * (road.w / 2 + 0.9);
          const d = this.districtAt(x, z);
          if (!d || d === 'none' || d === 'rural' || this.inTunnelZone(x, z)) continue;
          if (this.nearJunction(x, z, 6) || this.clearance(x, z) < 0.4 || reservedNear(x, z, 3) || markerNear(x, z)) continue;
          trees.push([x, 0, z, true]);
        }
      }
    }
    // Parques
    for (const p of PARKS) {
      for (let k = 0; k < 18; k++) trees.push([p.minX + 3 + this.rand() * (p.maxX - p.minX - 6), 0, p.minZ + 3 + this.rand() * (p.maxZ - p.minZ - 6), true]);
    }
    // Jardines, campo y playa
    for (let k = 0; k < 2600; k++) {
      const x = WORLD.minX + 10 + this.rand() * (WORLD.maxX - WORLD.minX - 20);
      const z = WORLD.minZ + 10 + this.rand() * (WORLD.maxZ - WORLD.minZ - 20);
      const d = this.districtAt(x, z);
      const want = { suburb: 0.5, hills: 0.7, rural: 0.45, beach: 0.08 }[d];
      if (!want || this.rand() > want) continue;
      if (this.clearance(x, z) < 3 || this.isInsideBuilding(x, z, 2.5) || reservedNear(x, z, 3)) continue;
      trees.push([x, 0, z, true]);
    }
    // Bosque de la colina (sin cuerpo: la ladera ya es sólida)
    for (let k = 0; k < 900; k++) {
      const x = RIDGE.xc - 215 + this.rand() * 430;
      const z = RIDGE.zc - 85 + this.rand() * 170;
      const h = hillHeight(x, z);
      if (h < 2 || Math.abs(x) < RIDGE.corridor + 4) continue;
      trees.push([x, h - 0.4, z, false]);
    }

    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 3, 6);
    // Copa orgánica: icosaedro con vértices desplazados
    const crownGeo = new THREE.IcosahedronGeometry(1.6, 1); // 80 triángulos por copa (con detalle 2 eran 320 y los árboles eran la mitad de la escena)
    crownGeo.deleteAttribute('normal');
    const merged = mergeVertices(crownGeo);
    const pos = merged.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.88 + this.rand() * 0.2;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
    }
    merged.computeVertexNormals();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4e3b2a, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

    // Un InstancedMesh por zona de 160 m para que el recorte por cámara (y el de sombras) funcione
    const groups = new Map();
    for (const t of trees) {
      const k = `${Math.floor(t[0] / 160)},${Math.floor(t[2] / 160)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    this.treeCount = trees.length;
    for (const list of groups.values()) {
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const crowns = new THREE.InstancedMesh(merged, crownMat, list.length * 2);
      list.forEach(([x, y, z, solid], k) => {
        const sc = 0.85 + this.rand() * 0.5;
        q.identity();
        m.compose(new THREE.Vector3(x, y + 1.5 * sc, z), q, new THREE.Vector3(sc, sc, sc));
        trunks.setMatrixAt(k, m);
        for (let c = 0; c < 2; c++) {
          q.setFromEuler(new THREE.Euler(0, this.rand() * 6, 0));
          const s2 = sc * (c === 0 ? 1.15 : 0.85);
          m.compose(new THREE.Vector3(x + (c ? 0.5 : -0.2), y + (3.6 + c * 1.1) * sc, z + (c ? -0.3 : 0.2)), q, new THREE.Vector3(s2, s2, s2));
          crowns.setMatrixAt(k * 2 + c, m);
          crowns.setColorAt(k * 2 + c, col.setHSL(0.26 + this.rand() * 0.06, 0.45, 0.24 + this.rand() * 0.1));
        }
        if (solid) {
          const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
          body.addShape(new CANNON.Cylinder(0.25, 0.25, 3, 6));
          body.position.set(x, 1.5, z);
          this.addStreamed(body, x, z);
        }
      });
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
      trunks.castShadow = crowns.castShadow = true;
      crowns.receiveShadow = true;
      this.scene.add(trunks, crowns);
      (this.treeMeshes ||= []).push(trunks, crowns);
    }
  }

  /** Farolas con brazo sobre la calzada: solo emisivas (sin luces reales) para no disparar el coste por luz. */
  createStreetLamps() {
    const lamps = [];
    for (const road of this.roads) {
      if (road.kind === 'circle') continue;
      const spacing = road.sidewalk ? 30 : 42;
      let k = 0;
      for (let s = 10; s < road.length - 5; s += spacing, k++) {
        const side = road.sidewalk ? (k % 2 ? 1 : -1) : 1;
        const { pos: P, dir: T } = this.pointOnRoad(road, s);
        const off = road.w / 2 + (road.sidewalk ? 0.5 : 1.5);
        const x = P.x - T.z * side * off;
        const z = P.z + T.x * side * off;
        if (this.inTunnelZone(x, z) || this.nearJunction(x, z, 3) || this.clearance(x, z) < 0.2 || this.isInsideBuilding(x, z, 0.3)) continue;
        const d = this.districtAt(x, z);
        if (d === 'none') continue;
        // el brazo apunta hacia la calzada
        lamps.push([x, z, Math.atan2(T.z * side, -T.x * side)]);
      }
    }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.11, 7, 8), this.poleMaterial, lamps.length);
    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 2.2);
    armGeo.translate(0, 0, 1.1);
    const arm = new THREE.InstancedMesh(armGeo, this.poleMaterial, lamps.length);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const headGeo = new THREE.BoxGeometry(0.35, 0.12, 0.7);
    headGeo.translate(0, 0, 2.1);
    const heads = new THREE.InstancedMesh(headGeo, this.lampHeadMat, lamps.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    lamps.forEach(([x, z, ang], k) => {
      m.makeTranslation(x, 3.5, z);
      pole.setMatrixAt(k, m);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      m.compose(new THREE.Vector3(x, 6.9, z), q, one);
      arm.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(x, 6.82, z), q, one);
      heads.setMatrixAt(k, m);
    });
    pole.castShadow = arm.castShadow = true;
    this.scene.add(pole, arm, heads);
  }

  /** Semáforos: un poste por acceso, a la derecha antes del cruce. Las lámparas cambian de color por instancia. */
  createTrafficLights() {
    const list = [];
    for (const n of this.nodes) {
      if (!n.signal) continue;
      for (const id of n.links) {
        const e = this.edgeBetween(n.id, id);
        const from = this.nodes[id];
        const d = new THREE.Vector3().subVectors(n.pos, from.pos).normalize(); // sentido de llegada
        const r = new THREE.Vector3(-d.z, 0, d.x);
        const p = n.pos.clone().addScaledVector(d, -(n.radius + 1.2)).addScaledVector(r, e.w / 2 + 0.9);
        list.push({ node: n, from, p, yaw: Math.atan2(-d.x, -d.z), state: null });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 5, 6);
    const boxGeo = new THREE.BoxGeometry(0.5, 1.5, 0.5);
    const lampGeo = new THREE.BoxGeometry(0.34, 0.34, 0.12);
    const poles = new THREE.InstancedMesh(poleGeo, this.poleMaterial, list.length);
    const boxes = new THREE.InstancedMesh(boxGeo, this.poleMaterial, list.length);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), list.length * 3);
    poles.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const dark = new THREE.Color(0x1a1a1a);
    list.forEach((s, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      m.compose(new THREE.Vector3(s.p.x, 2.5, s.p.z), q, one);
      poles.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(s.p.x, 5.2, s.p.z), q, one);
      boxes.setMatrixAt(k, m);
      const fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      for (let c = 0; c < 3; c++) {
        m.compose(new THREE.Vector3(s.p.x + fwd.x * 0.27, 5.7 - c * 0.48, s.p.z + fwd.z * 0.27), q, one);
        lamps.setMatrixAt(k * 3 + c, m);
        lamps.setColorAt(k * 3 + c, dark);
      }
    });
    this.scene.add(poles, boxes, lamps);
    this.signals = list;
    this.signalLamps = lamps;
    this.signalColors = { red: new THREE.Color(3, 0.15, 0.08), yellow: new THREE.Color(3, 1.6, 0), green: new THREE.Color(0.15, 3, 0.5), off: dark };
  }

  updateSignals() {
    if (!this.signals) return;
    let dirty = false;
    const C = this.signalColors;
    this.signals.forEach((s, k) => {
      const st = this.signalState(s.node, s.from);
      if (st === s.state) return;
      s.state = st;
      this.signalLamps.setColorAt(k * 3, st === 'red' ? C.red : C.off);
      this.signalLamps.setColorAt(k * 3 + 1, st === 'yellow' ? C.yellow : C.off);
      this.signalLamps.setColorAt(k * 3 + 2, st === 'green' ? C.green : C.off);
      dirty = true;
    });
    if (dirty) this.signalLamps.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // Cielo, sol, luna y ciclo día/noche
  // ------------------------------------------------------------------
  createSkyAndLights() {
    this.sky = new Sky();
    this.sky.scale.setScalar(600); // dentro del plano lejano de la cámara (650 m)
    const u = this.sky.material.uniforms;
    u.turbidity.value = 8;
    u.rayleigh.value = 2;
    u.mieCoefficient.value = 0.005;
    u.mieDirectionalG.value = 0.8;
    this.scene.add(this.sky);

    // Estrellas
    const starCount = 1500;
    const starPos = new Float32Array(starCount * 3);
    for (let k = 0; k < starCount; k++) {
      const theta = this.rand() * Math.PI * 2;
      const phi = Math.acos(this.rand() * 0.95);
      starPos[k * 3] = Math.sin(phi) * Math.cos(theta) * 500;
      starPos[k * 3 + 1] = Math.cos(phi) * 500;
      starPos[k * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 500;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.scene.add(this.stars);

    this.moon = new THREE.Mesh(new THREE.SphereGeometry(13, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf1f1e6, fog: false, transparent: true }));
    this.scene.add(this.moon);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4032, 0.8);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 10;
    sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    this.scene.fog = new THREE.Fog(0xb8c8d8, 140, 560);

    // Mapa de entorno: un segundo cielo se "fotografía" con PMREM para reflejos en coches y cristales
    this.pmrem = new THREE.PMREMGenerator(this.game.renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(900);
    this.envScene.add(this.envSky);
    // Suelo oscuro en el cubemap para que los reflejos no tengan cielo por debajo
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(800, 16), new THREE.MeshBasicMaterial({ color: 0x3a3c40 }));
    envGround.rotation.x = -Math.PI / 2;
    envGround.position.y = -5;
    this.envScene.add(envGround);
    this.envGroundMat = envGround.material;
    this.envHour = -99;
    this.sunDir = new THREE.Vector3();
  }

  /** Distancia de visión (calidad): plano lejano de la cámara, niebla y cielo dentro de ese plano. */
  setViewDistance(far, fogFar) {
    const cam = this.game.camera;
    cam.far = far;
    cam.updateProjectionMatrix();
    this.scene.fog.far = fogFar;
    this.scene.fog.near = Math.min(140, fogFar * 0.3);
    this.sky.scale.setScalar(far * 0.92);
    this.stars.scale.setScalar((far * 0.75) / 500);
    this.moonDist = far * 0.75;
  }

  /** Regenera el mapa de entorno si la hora ha cambiado más de 20 minutos. */
  updateEnvironmentMap(force = false) {
    const diff = Math.abs(this.timeOfDay - this.envHour);
    if (!force && diff < 0.33 && diff < 23.6) return;
    // Como mucho una vez cada 4 s reales (con el reloj acelerado se regeneraba casi cada fotograma)
    const now = performance.now();
    if (!force && now - (this.envAt || -1e9) < 4000) return;
    this.envAt = now;
    this.envHour = this.timeOfDay;
    const src = this.sky.material.uniforms;
    const dst = this.envSky.material.uniforms;
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) dst[k].value = src[k].value;
    dst.sunPosition.value.copy(src.sunPosition.value);
    this.envGroundMat.color.setRGB(0.23, 0.235, 0.25).multiplyScalar(0.15 + (1 - this.night) * 0.85);
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 1000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }

  getClockString() {
    const h = Math.floor(this.timeOfDay);
    const m = Math.floor((this.timeOfDay - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt, focus) {
    this.timeOfDay = (this.timeOfDay + (dt * 24 * this.timeSpeed) / DAY_LENGTH) % 24;
    this.lightTimer += dt;

    // Elevación del sol: 06:00 amanece, 12:00 cenit, 18:00 atardece
    const angle = ((this.timeOfDay - 6) / 12) * Math.PI;
    const elevation = Math.sin(angle);
    this.sunDir.set(Math.cos(angle) * 0.8, elevation, 0.45).normalize();

    const day = THREE.MathUtils.smoothstep(elevation, -0.12, 0.25);
    this.night = 1 - day;

    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    u.rayleigh.value = THREE.MathUtils.lerp(0.6, 2.2, day) + (1 - Math.abs(elevation)) * 1.2 * day;
    this.sky.position.copy(this.game.camera.position);
    this.stars.position.copy(this.game.camera.position);
    this.stars.material.opacity = THREE.MathUtils.smoothstep(this.night, 0.5, 1);
    this.moon.position.copy(this.game.camera.position).addScaledVector(this.sunDir, -(this.moonDist || 500));
    this.moon.material.opacity = this.night;

    // La luz direccional hace de sol de día y de luna de noche
    const lightDir = elevation > -0.05 ? this.sunDir : this.sunDir.clone().negate();
    const sunset = THREE.MathUtils.smoothstep(1 - Math.abs(elevation), 0.7, 1) * day;
    this.sun.color.setRGB(1, 1 - sunset * 0.35, 1 - sunset * 0.6);
    if (elevation <= -0.05) this.sun.color.setRGB(0.6, 0.7, 1);
    this.sun.intensity = elevation > -0.05 ? 0.2 + 2.6 * day : 0.45;
    this.sun.position.copy(focus).addScaledVector(lightDir, 180);
    this.sun.target.position.copy(focus);

    this.hemi.intensity = 0.35 + 0.8 * day;
    this.game.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.35, 0.7, day);

    const fogDay = new THREE.Color(0xb8c8d8).lerp(new THREE.Color(0xf0b890), sunset * 0.6);
    this.scene.fog.color.copy(fogDay).lerp(new THREE.Color(0x0a0f1a), this.night);

    const glow = THREE.MathUtils.smoothstep(this.night, 0.3, 0.9);
    for (const mat of this.buildingMaterials) mat.emissiveIntensity = glow * 0.9;
    this.storefrontMat.emissiveIntensity = 0.2 + glow * 1.1;
    this.updateEnvironmentMap();
    if (this.lampHeadMat) this.lampHeadMat.emissiveIntensity = glow * 2.5;

    this.updateSignals();
    if (this.boats) {
      for (const b of this.boats) {
        b.g.position.y = Math.sin(this.lightTimer * 0.9 + b.phase) * 0.12;
        b.g.rotation.z = Math.sin(this.lightTimer * 0.7 + b.phase) * 0.03;
      }
    }
    this.streamTimer -= dt;
    if (this.finalized && this.streamTimer <= 0) {
      this.streamTimer = 0.4;
      this.updateStreaming(focus);
    }
  }
}
