import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadeTextures, storefrontTextures, addNoise } from './Textures.js';

// Grupos de colisión compartidos por todos los módulos.
export const GROUPS = {
  STATIC: 1,
  PLAYER: 2,
  VEHICLE: 4,
};

// Trazado de la ciudad: una cuadrícula de N x N manzanas separadas por calles.
export const CITY = {
  BLOCKS: 6,          // manzanas por lado
  PERIOD: 64,         // distancia entre ejes de calles (m)
  ROAD: 16,           // ancho de calzada (m)
  SIDEWALK: 3,        // ancho de acera (m)
  LANE: 4,            // desplazamiento del carril respecto al eje de la calle
};
CITY.HALF = (CITY.BLOCKS * CITY.PERIOD) / 2;

const DAY_LENGTH = 480; // segundos reales por día de juego
const LIGHT_CYCLE = 22; // ciclo completo de semáforos (s)

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

export class Environment {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = game.world;

    this.timeOfDay = 9.5; // horas (0-24)
    this.timeSpeed = 1;
    this.lightTimer = 0;
    this.night = 0;

    this.buildingMeshes = []; // colisionadores de cámara y blancos de disparo
    this.shootables = [];
    this.buildingRects = []; // huellas 2D para comprobar posiciones de salida
    this.rand = mulberry32(1337);

    this.roadCenters = [];
    for (let i = 0; i <= CITY.BLOCKS; i++) this.roadCenters.push(-CITY.HALF + i * CITY.PERIOD);

    this.buildRoadGraph();
    this.createMaterials();
    this.createGround();
    this.createBuildings();
    this.createTrafficLights();
    this.createStreetLamps();
    this.createBoundaries();
    this.createSkyAndLights();
    this.update(0, new THREE.Vector3());
  }

  // ------------------------------------------------------------------
  // Red de calles (nodos = intersecciones) usada por el tráfico y la policía
  // ------------------------------------------------------------------
  buildRoadGraph() {
    const n = CITY.BLOCKS + 1;
    this.nodes = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        this.nodes.push({
          id: i * n + j,
          i,
          j,
          pos: new THREE.Vector3(this.roadCenters[i], 0, this.roadCenters[j]),
          neighbors: [],
        });
      }
    }
    for (const node of this.nodes) {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [di, dj] of dirs) {
        const ni = node.i + di;
        const nj = node.j + dj;
        if (ni >= 0 && ni < n && nj >= 0 && nj < n) node.neighbors.push(ni * n + nj);
      }
    }
  }

  nearestNode(pos) {
    let best = null;
    let bestD = Infinity;
    for (const node of this.nodes) {
      const d = (node.pos.x - pos.x) ** 2 + (node.pos.z - pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  /** ¿Está el punto (x, z) sobre la calzada? */
  isOnRoad(x, z) {
    const lim = CITY.HALF + CITY.ROAD / 2;
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const half = CITY.ROAD / 2;
    const mx = (((x + CITY.HALF) % CITY.PERIOD) + CITY.PERIOD) % CITY.PERIOD;
    const mz = (((z + CITY.HALF) % CITY.PERIOD) + CITY.PERIOD) % CITY.PERIOD;
    return mx < half || mx > CITY.PERIOD - half || mz < half || mz > CITY.PERIOD - half;
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

  /** Estado del semáforo para quien circula a lo largo del eje 'x' o 'z'. */
  getLightState(axis) {
    const t = this.lightTimer % LIGHT_CYCLE;
    if (axis === 'z') {
      if (t < 9) return 'green';
      if (t < 11) return 'yellow';
      return 'red';
    }
    if (t < 11) return 'red';
    if (t < 20) return 'green';
    return 'yellow';
  }

  // ------------------------------------------------------------------
  // Materiales y texturas procedurales
  // ------------------------------------------------------------------
  createMaterials() {
    // Cuatro estilos de fachada, dos tonos cada uno. El mapa emisivo enciende ventanas de noche.
    this.facadeStyles = {};
    this.buildingMaterials = [];
    const variants = {
      office: [0xffffff, 0xe0d6c8],
      brick: [0xffffff, 0xd9c2b0],
      glass: [0xffffff, 0xc8e0e8],
      modern: [0xffffff, 0xf0e8dc],
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
          roughness: glass ? 0.12 : style === 'modern' ? 0.55 : 0.85,
          metalness: glass ? 0.85 : 0.05,
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

    this.poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.6 });
    this.lampMaterials = {
      red: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a }),
      yellow: new THREE.MeshStandardMaterial({ color: 0x221a00, emissive: 0xffb300 }),
      green: new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x2bff5a }),
    };
  }

  /** Suelo: una sola textura de canvas con calles, aceras, líneas y pasos de cebra. */
  createGround() {
    const margin = 24;
    const size = CITY.BLOCKS * CITY.PERIOD + CITY.ROAD + margin * 2;
    const px = 4096;
    const s = px / size; // píxeles por metro
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext('2d');
    const toPx = (v) => (v + size / 2) * s;

    ctx.fillStyle = '#4d6b3c';
    ctx.fillRect(0, 0, px, px);

    const half = CITY.ROAD / 2;
    const rc = this.roadCenters;
    const min = rc[0] - half;
    const max = rc[rc.length - 1] + half;

    // Manzanas: acera + interior
    this.parkBlocks = new Set();
    for (let i = 0; i < CITY.BLOCKS; i++) {
      for (let j = 0; j < CITY.BLOCKS; j++) {
        const x0 = rc[i] + half;
        const z0 = rc[j] + half;
        const bw = CITY.PERIOD - CITY.ROAD;
        ctx.fillStyle = '#a3a39c';
        ctx.fillRect(toPx(x0), toPx(z0), bw * s, bw * s);
        const isPark = this.rand() < 0.12 && !(i === 3 && j === 3) && !(i === 2 && j === 3);
        if (isPark) this.parkBlocks.add(`${i},${j}`);
        ctx.fillStyle = isPark ? '#5b8a3f' : '#8a8a84';
        const sw = CITY.SIDEWALK;
        ctx.fillRect(toPx(x0 + sw), toPx(z0 + sw), (bw - 2 * sw) * s, (bw - 2 * sw) * s);
        // bordillo
        ctx.strokeStyle = '#6f6f69';
        ctx.lineWidth = 2;
        ctx.strokeRect(toPx(x0), toPx(z0), bw * s, bw * s);
      }
    }

    // Asfalto
    ctx.fillStyle = '#4a4c52';
    for (const c of rc) {
      ctx.fillRect(toPx(c - half), toPx(min), CITY.ROAD * s, (max - min) * s);
      ctx.fillRect(toPx(min), toPx(c - half), (max - min) * s, CITY.ROAD * s);
    }

    // Marcas viales entre intersecciones
    const dash = (x1, z1, x2, z2, color, width, dashLen, gap) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * s;
      ctx.setLineDash(dashLen ? [dashLen * s, gap * s] : []);
      ctx.beginPath();
      ctx.moveTo(toPx(x1), toPx(z1));
      ctx.lineTo(toPx(x2), toPx(z2));
      ctx.stroke();
    };
    for (const c of rc) {
      for (let k = 0; k < rc.length - 1; k++) {
        const a = rc[k] + half + 2;
        const b = rc[k + 1] - half - 2;
        // doble línea amarilla central
        dash(c - 0.2, a, c - 0.2, b, '#e0b433', 0.15);
        dash(c + 0.2, a, c + 0.2, b, '#e0b433', 0.15);
        dash(a, c - 0.2, b, c - 0.2, '#e0b433', 0.15);
        dash(a, c + 0.2, b, c + 0.2, '#e0b433', 0.15);
        // divisorias de carril discontinuas
        for (const off of [-CITY.LANE, CITY.LANE]) {
          dash(c + off, a, c + off, b, '#d8d8d8', 0.14, 3, 4);
          dash(a, c + off, b, c + off, '#d8d8d8', 0.14, 3, 4);
        }
      }
    }
    ctx.setLineDash([]);

    // Parches de asfalto y manchas de aceite en el centro de los carriles
    for (let k = 0; k < 900; k++) {
      const c = rc[Math.floor(this.rand() * rc.length)];
      const along = min + this.rand() * (max - min);
      const lane = (this.rand() < 0.5 ? -1 : 1) * (CITY.LANE + (this.rand() - 0.5));
      const horizontal = this.rand() < 0.5;
      const x = horizontal ? along : c + lane;
      const z = horizontal ? c + lane : along;
      if (this.rand() < 0.35) {
        ctx.fillStyle = `rgba(30,30,32,${0.15 + this.rand() * 0.2})`;
        ctx.fillRect(toPx(x), toPx(z), (1 + this.rand() * 4) * s, (1 + this.rand() * 3) * s);
      } else {
        const r = (0.3 + this.rand() * 0.6) * s;
        const g = ctx.createRadialGradient(toPx(x), toPx(z), 0, toPx(x), toPx(z), r);
        g.addColorStop(0, 'rgba(20,20,22,0.35)');
        g.addColorStop(1, 'rgba(20,20,22,0)');
        ctx.fillStyle = g;
        ctx.fillRect(toPx(x) - r, toPx(z) - r, r * 2, r * 2);
      }
    }

    // Pasos de cebra
    ctx.fillStyle = '#e6e6e6';
    for (const cx of rc) {
      for (const cz of rc) {
        for (let k = -half + 1; k < half - 0.5; k += 1.4) {
          ctx.fillRect(toPx(cx + k), toPx(cz - half - 1.8), 0.7 * s, 1.6 * s);
          ctx.fillRect(toPx(cx + k), toPx(cz + half + 0.2), 0.7 * s, 1.6 * s);
          ctx.fillRect(toPx(cx - half - 1.8), toPx(cz + k), 1.6 * s, 0.7 * s);
          ctx.fillRect(toPx(cx + half + 0.2), toPx(cz + k), 1.6 * s, 0.7 * s);
        }
      }
    }

    // Baldosas de acera (cuadrícula de 1,5 m) y bordillo claro
    ctx.strokeStyle = 'rgba(70,70,65,0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CITY.BLOCKS; i++) {
      for (let j = 0; j < CITY.BLOCKS; j++) {
        const x0 = rc[i] + half;
        const z0 = rc[j] + half;
        const bw = CITY.PERIOD - CITY.ROAD;
        const sw = CITY.SIDEWALK;
        ctx.beginPath();
        for (let t = 0; t <= bw; t += 1.5) {
          for (const [ax, az, bx, bz] of [
            [x0 + t, z0, x0 + t, z0 + sw],
            [x0 + t, z0 + bw - sw, x0 + t, z0 + bw],
            [x0, z0 + t, x0 + sw, z0 + t],
            [x0 + bw - sw, z0 + t, x0 + bw, z0 + t],
          ]) {
            ctx.moveTo(toPx(ax), toPx(az));
            ctx.lineTo(toPx(bx), toPx(bz));
          }
        }
        for (let t = 1.5; t < sw; t += 1.5) {
          ctx.moveTo(toPx(x0), toPx(z0 + t));
          ctx.lineTo(toPx(x0 + bw), toPx(z0 + t));
          ctx.moveTo(toPx(x0), toPx(z0 + bw - t));
          ctx.lineTo(toPx(x0 + bw), toPx(z0 + bw - t));
          ctx.moveTo(toPx(x0 + t), toPx(z0));
          ctx.lineTo(toPx(x0 + t), toPx(z0 + bw));
          ctx.moveTo(toPx(x0 + bw - t), toPx(z0));
          ctx.lineTo(toPx(x0 + bw - t), toPx(z0 + bw));
        }
        ctx.stroke();
        ctx.strokeStyle = '#c9c7bf';
        ctx.lineWidth = 0.25 * s;
        ctx.strokeRect(toPx(x0), toPx(z0), bw * s, bw * s);
        ctx.strokeStyle = 'rgba(70,70,65,0.35)';
        ctx.lineWidth = 1;
      }
    }
    addNoise(ctx, px, px, 16, this.rand);

    this.mapCanvas = canvas;
    this.mapSize = size;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.game.renderer.capabilities.getMaxAnisotropy();
    const cityGround = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, envMapIntensity: 0.4 })
    );
    cityGround.rotation.x = -Math.PI / 2;
    cityGround.receiveShadow = true;
    this.scene.add(cityGround);
    this.shootables.push(cityGround);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x3f5a31, roughness: 1 })
    );
    outer.rotation.x = -Math.PI / 2;
    // Bien por debajo del suelo de la ciudad: a -0.02 m había z-fighting con buffers de profundidad
    // de 16 bits (el césped "atravesaba" el asfalto). Los muros del borde tapan el escalón.
    outer.position.y = -0.5;
    outer.receiveShadow = true;
    this.scene.add(outer);

    // Suelo físico infinito
    this.groundMaterial = new CANNON.Material('ground');
    const ground = new CANNON.Body({
      mass: 0,
      material: this.groundMaterial,
      collisionFilterGroup: GROUPS.STATIC,
    });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    this.groundBody = ground;
  }

  /** Edificios por manzana (cuatro solares), árboles en parques y en las aceras. */
  createBuildings() {
    const half = CITY.ROAD / 2;
    const rc = this.roadCenters;
    const lotGap = 3;
    const inner = CITY.PERIOD - CITY.ROAD - CITY.SIDEWALK * 2; // 42 m
    const lot = (inner - lotGap) / 2;
    const trees = [];
    this.buildings = [];

    for (let i = 0; i < CITY.BLOCKS; i++) {
      for (let j = 0; j < CITY.BLOCKS; j++) {
        const x0 = rc[i] + half + CITY.SIDEWALK;
        const z0 = rc[j] + half + CITY.SIDEWALK;
        if (this.parkBlocks.has(`${i},${j}`)) {
          for (let t = 0; t < 16; t++) {
            trees.push(new THREE.Vector3(x0 + 3 + this.rand() * (inner - 6), 0, z0 + 3 + this.rand() * (inner - 6)));
          }
          continue;
        }
        // Los edificios del centro son más altos
        const cx = (rc[i] + rc[i + 1]) / 2;
        const cz = (rc[j] + rc[j + 1]) / 2;
        const centrality = 1 - Math.min(1, Math.hypot(cx, cz) / (CITY.HALF * 1.2));
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            if (this.rand() < 0.06) continue; // solar vacío
            const shrinkX = this.rand() * 3;
            const shrinkZ = this.rand() * 3;
            const bw = lot - shrinkX;
            const bd = lot - shrinkZ;
            const bh = 10 + this.rand() * (16 + centrality * 75);
            const px = x0 + a * (lot + lotGap) + lot / 2 + (a === 0 ? shrinkX / 2 : -shrinkX / 2);
            const pz = z0 + b * (lot + lotGap) + lot / 2 + (b === 0 ? shrinkZ / 2 : -shrinkZ / 2);
            const style = bh > 55 ? (this.rand() < 0.6 ? 'glass' : 'modern') : bh < 22 ? (this.rand() < 0.6 ? 'brick' : 'office') : ['office', 'brick', 'modern', 'glass'][Math.floor(this.rand() * 4)];
            this.addBuilding(px, pz, bw, bh, bd, style);
          }
        }
      }
    }

    // Árboles de acera junto al bordillo (sin tapar los centros de cada lado, donde están las tiendas)
    for (const c of rc) {
      for (let k = 0; k < rc.length - 1; k++) {
        const a = rc[k] + half + 4;
        const b = rc[k + 1] - half - 4;
        const mid = (a + b) / 2;
        for (let t = a; t <= b; t += 11) {
          if (Math.abs(t - mid) < 9) continue;
          for (const side of [-1, 1]) {
            const off = c + side * (half + 0.9);
            if (this.rand() < 0.25) continue;
            trees.push(new THREE.Vector3(off, 0, t), new THREE.Vector3(t, 0, off));
          }
        }
      }
    }
    this.createTrees(trees);
  }

  createTrees(trees) {
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 3, 7);
    // Copa orgánica: icosaedro con vértices desplazados
    const crownGeo = new THREE.IcosahedronGeometry(1.6, 3);
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
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const crowns = new THREE.InstancedMesh(merged, crownMat, trees.length * 2);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    trees.forEach((p, k) => {
      const sc = 0.85 + this.rand() * 0.5;
      m.compose(new THREE.Vector3(p.x, 1.5 * sc, p.z), q, new THREE.Vector3(sc, sc, sc));
      trunks.setMatrixAt(k, m);
      for (let c = 0; c < 2; c++) {
        q.setFromEuler(new THREE.Euler(0, this.rand() * 6, 0));
        const s2 = sc * (c === 0 ? 1.15 : 0.85);
        m.compose(new THREE.Vector3(p.x + (c ? 0.5 : -0.2), (3.6 + c * 1.1) * sc, p.z + (c ? -0.3 : 0.2)), q, new THREE.Vector3(s2, s2, s2));
        crowns.setMatrixAt(k * 2 + c, m);
        crowns.setColorAt(k * 2 + c, col.setHSL(0.26 + this.rand() * 0.06, 0.45, 0.24 + this.rand() * 0.1));
      }
      q.identity();
      const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
      body.addShape(new CANNON.Cylinder(0.25, 0.25, 3, 6));
      body.position.set(p.x, 1.5, p.z);
      this.world.addBody(body);
    });
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    this.scene.add(trunks, crowns);
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

  /**
   * Edificio: planta baja comercial + cuerpo con fachada del estilo elegido + cornisa,
   * con retranqueo en los rascacielos y equipos en la azotea. Queda registrado para poder retirarlo.
   */
  addBuilding(x, z, w, h, d, style = 'office') {
    const rec = { rect: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 }, meshes: [] };
    const add = (mesh, collider = true) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      rec.meshes.push(mesh);
      if (collider) {
        this.buildingMeshes.push(mesh);
        this.shootables.push(mesh);
      }
      return mesh;
    };
    const mats = this.facadeStyles[style];
    const mat = mats[Math.floor(this.rand() * mats.length)];
    const [tileW, tileH] = mat.userData.tile;

    // Planta baja con escaparates
    const gh = 4.5;
    const gGeo = new THREE.BoxGeometry(w, gh, d);
    Environment.meterUV(gGeo, w, gh, d, 12, gh);
    add(new THREE.Mesh(gGeo, this.storefrontMat)).position.set(x, gh / 2, z);

    // Cuerpo (con retranqueo si es muy alto)
    const tiered = h > 50 && this.rand() < 0.6;
    const h1 = tiered ? h * 0.62 : h;
    const bodyH = h1 - gh;
    const bGeo = new THREE.BoxGeometry(w, bodyH, d);
    Environment.meterUV(bGeo, w, bodyH, d, tileW, tileH);
    add(new THREE.Mesh(bGeo, mat)).position.set(x, gh + bodyH / 2, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.6, d + 0.5), this.corniceMat), false).position.set(x, h1 + 0.3, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), this.corniceMat), false).position.set(x, gh + 0.17, z);
    let top = h1;
    if (tiered) {
      const w2 = w * 0.7;
      const d2 = d * 0.7;
      const h2 = h - h1;
      const tGeo = new THREE.BoxGeometry(w2, h2, d2);
      Environment.meterUV(tGeo, w2, h2, d2, tileW, tileH);
      add(new THREE.Mesh(tGeo, mat)).position.set(x, h1 + 0.6 + h2 / 2, z);
      add(new THREE.Mesh(new THREE.BoxGeometry(w2 + 0.4, 0.5, d2 + 0.4), this.corniceMat), false).position.set(x, h + 0.85, z);
      top = h + 0.6;
    }
    // Azotea: equipos de climatización y depósitos
    const units = Math.floor(this.rand() * 4);
    for (let k = 0; k < units; k++) {
      const sx = (this.rand() - 0.5) * w * 0.5;
      const sz = (this.rand() - 0.5) * d * 0.5;
      if (this.rand() < 0.3) {
        const tank = add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 10), this.roofMat), false);
        tank.position.set(x + sx, top + 1.1 + 0.6, z + sz);
      } else {
        add(new THREE.Mesh(new THREE.BoxGeometry(1.6 + this.rand() * 2, 1.2, 1.4 + this.rand() * 2), this.roofMat), false).position.set(x + sx, top + 1.2, z + sz);
      }
    }

    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, h / 2, z);
    this.world.addBody(body);
    rec.body = body;
    this.buildingRects.push(rec.rect);
    this.buildings.push(rec);
    return rec;
  }

  /** Quita los edificios que invaden un rectángulo (para levantar bancos, tiendas o tu casa). */
  removeBuildingsIn(r) {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      const o = b.rect;
      if (o.maxX <= r.minX || o.minX >= r.maxX || o.maxZ <= r.minZ || o.minZ >= r.maxZ) continue;
      for (const m of b.meshes) {
        this.scene.remove(m);
        const bi = this.buildingMeshes.indexOf(m);
        if (bi >= 0) this.buildingMeshes.splice(bi, 1);
        const si = this.shootables.indexOf(m);
        if (si >= 0) this.shootables.splice(si, 1);
      }
      this.world.removeBody(b.body);
      this.buildingRects.splice(this.buildingRects.indexOf(o), 1);
      this.buildings.splice(i, 1);
    }
  }

  /** Registra un edificio construido fuera (fachadas de Locations) como colisionador de cámara y disparos. */
  registerStructure(meshes, rect, body) {
    for (const m of meshes) {
      this.buildingMeshes.push(m);
      this.shootables.push(m);
    }
    if (rect) this.buildingRects.push(rect);
    if (body) this.world.addBody(body);
  }

  /** Semáforos con InstancedMesh: 8 draw calls para toda la ciudad. */
  createTrafficLights() {
    const half = CITY.ROAD / 2;
    const corners = [];
    for (const cx of this.roadCenters) {
      for (const cz of this.roadCenters) {
        // (+,+) y (-,-) controlan el eje Z; (+,-) y (-,+) el eje X
        corners.push({ x: cx + half + 0.8, z: cz + half + 0.8, axis: 'z', face: 1 });
        corners.push({ x: cx - half - 0.8, z: cz - half - 0.8, axis: 'z', face: -1 });
        corners.push({ x: cx + half + 0.8, z: cz - half - 0.8, axis: 'x', face: 1 });
        corners.push({ x: cx - half - 0.8, z: cz + half + 0.8, axis: 'x', face: -1 });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 5, 6);
    const boxGeo = new THREE.BoxGeometry(0.5, 1.5, 0.5);
    const lampGeo = new THREE.BoxGeometry(0.34, 0.34, 0.62);
    const poles = new THREE.InstancedMesh(poleGeo, this.poleMaterial, corners.length);
    const boxes = new THREE.InstancedMesh(boxGeo, this.poleMaterial, corners.length);
    poles.castShadow = true;

    const lampSets = {};
    for (const axis of ['x', 'z']) {
      for (const color of ['red', 'yellow', 'green']) {
        const count = corners.filter((c) => c.axis === axis).length;
        const mat = this.lampMaterials[color].clone();
        const im = new THREE.InstancedMesh(lampGeo, mat, count);
        im.userData.cursor = 0;
        lampSets[`${axis}-${color}`] = im;
        this.scene.add(im);
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    corners.forEach((c, k) => {
      m.compose(new THREE.Vector3(c.x, 2.5, c.z), q, one);
      poles.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(c.x, 5.2, c.z), q, one);
      boxes.setMatrixAt(k, m);
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.axis === 'z' ? 0 : Math.PI / 2);
      ['red', 'yellow', 'green'].forEach((color, idx) => {
        const im = lampSets[`${c.axis}-${color}`];
        m.compose(new THREE.Vector3(c.x, 5.7 - idx * 0.48, c.z), rot, one);
        im.setMatrixAt(im.userData.cursor++, m);
      });
    });
    this.scene.add(poles, boxes);
    this.lampSets = lampSets;
  }

  /** Farolas con brazo sobre la calzada: solo emisivas (sin luces reales) para no disparar el coste por luz. */
  createStreetLamps() {
    const lamps = [];
    const half = CITY.ROAD / 2;
    for (const c of this.roadCenters) {
      for (let k = 0; k < this.roadCenters.length - 1; k++) {
        const a = this.roadCenters[k];
        for (const t of [0.3, 0.7]) {
          const along = a + CITY.PERIOD * t;
          // [x, z, ángulo hacia la calzada]
          lamps.push([c + half + 0.5, along, -Math.PI / 2], [c - half - 0.5, along, Math.PI / 2], [along, c + half + 0.5, Math.PI], [along, c - half - 0.5, 0]);
        }
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

  createBoundaries() {
    const lim = CITY.HALF + CITY.ROAD / 2 + 6;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6d6d6d });
    const sides = [
      [0, lim, lim * 2 + 2, 1],
      [0, -lim, lim * 2 + 2, 1],
      [lim, 0, 1, lim * 2 + 2],
      [-lim, 0, 1, lim * 2 + 2],
    ];
    for (const [x, z, w, d] of sides) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), wallMat);
      mesh.position.set(x, 0.6, z);
      mesh.receiveShadow = mesh.castShadow = true;
      this.scene.add(mesh);
      const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, 3, d / 2)));
      body.position.set(x, 3, z);
      this.world.addBody(body);
    }
  }

  // ------------------------------------------------------------------
  // Cielo, sol, luna y ciclo día/noche
  // ------------------------------------------------------------------
  createSkyAndLights() {
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
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
      starPos[k * 3] = Math.sin(phi) * Math.cos(theta) * 800;
      starPos[k * 3 + 1] = Math.cos(phi) * 800;
      starPos[k * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 800;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false })
    );
    this.scene.add(this.stars);

    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(18, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xf1f1e6, fog: false, transparent: true })
    );
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

    this.scene.fog = new THREE.Fog(0xb8c8d8, 120, 520);

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

  /** Regenera el mapa de entorno si la hora ha cambiado más de 20 minutos. */
  updateEnvironmentMap(force = false) {
    const diff = Math.abs(this.timeOfDay - this.envHour);
    if (!force && diff < 0.33 && diff < 23.6) return;
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
    this.moon.position.copy(this.game.camera.position).addScaledVector(this.sunDir, -700);
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
    this.lampHeadMat.emissiveIntensity = glow * 2.5;

    // Semáforos
    for (const axis of ['x', 'z']) {
      const state = this.getLightState(axis);
      for (const color of ['red', 'yellow', 'green']) {
        this.lampSets[`${axis}-${color}`].material.emissiveIntensity = state === color ? 3 : 0.04;
      }
    }
  }
}
