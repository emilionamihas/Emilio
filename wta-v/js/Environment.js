import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from 'three/addons/objects/Sky.js';

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
    // Fachada con ventanas: mapa de color + mapa emisivo para la noche.
    const w = 128;
    const h = 256;
    const facade = document.createElement('canvas');
    facade.width = w;
    facade.height = h;
    const glow = document.createElement('canvas');
    glow.width = w;
    glow.height = h;
    const fc = facade.getContext('2d');
    const gc = glow.getContext('2d');
    fc.fillStyle = '#d8d8d8';
    fc.fillRect(0, 0, w, h);
    gc.fillStyle = '#000';
    gc.fillRect(0, 0, w, h);
    const cols = 4;
    const rows = 8;
    const cw = w / cols;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + 6;
        const y = r * rh + 7;
        fc.fillStyle = '#3b4a5a';
        fc.fillRect(x, y, cw - 12, rh - 12);
        fc.fillStyle = 'rgba(255,255,255,0.18)';
        fc.fillRect(x, y, (cw - 12) / 2, rh - 12);
        if (this.rand() < 0.45) {
          const warm = this.rand() < 0.7;
          gc.fillStyle = warm ? '#ffd27a' : '#bfe3ff';
          gc.fillRect(x, y, cw - 12, rh - 12);
        }
      }
    }
    // El píxel (0,0) queda como pared lisa: lo usamos para los techos.
    const facadeTex = new THREE.CanvasTexture(facade);
    facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
    facadeTex.colorSpace = THREE.SRGBColorSpace;
    facadeTex.anisotropy = 8;
    const glowTex = new THREE.CanvasTexture(glow);
    glowTex.wrapS = glowTex.wrapT = THREE.RepeatWrapping;
    glowTex.colorSpace = THREE.SRGBColorSpace;

    const tints = ['#c9b8a0', '#9fa9b3', '#b58f7a', '#d9d4c5', '#7f8c8d', '#a3b18a'];
    this.buildingMaterials = tints.map(
      (tint) =>
        new THREE.MeshStandardMaterial({
          color: tint,
          map: facadeTex,
          emissive: 0xffffff,
          emissiveMap: glowTex,
          emissiveIntensity: 0,
          roughness: 0.85,
          metalness: 0.05,
        })
    );

    this.poleMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.4 });
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
    const px = 2048;
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

    this.mapCanvas = canvas;
    this.mapSize = size;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.game.renderer.capabilities.getMaxAnisotropy();
    const cityGround = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 })
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
    outer.position.y = -0.02;
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

  /** Genera los edificios con UV escaladas a metros para que las ventanas no se estiren. */
  createBuildings() {
    const half = CITY.ROAD / 2;
    const rc = this.roadCenters;
    const lotGap = 3;
    const inner = CITY.PERIOD - CITY.ROAD - CITY.SIDEWALK * 2; // 42 m
    const lot = (inner - lotGap) / 2;

    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
    const crownGeo = new THREE.ConeGeometry(2.1, 4.5, 7);
    const trees = [];

    for (let i = 0; i < CITY.BLOCKS; i++) {
      for (let j = 0; j < CITY.BLOCKS; j++) {
        const x0 = rc[i] + half + CITY.SIDEWALK;
        const z0 = rc[j] + half + CITY.SIDEWALK;
        if (this.parkBlocks.has(`${i},${j}`)) {
          for (let t = 0; t < 14; t++) {
            trees.push(new THREE.Vector3(x0 + 3 + this.rand() * (inner - 6), 0, z0 + 3 + this.rand() * (inner - 6)));
          }
          continue;
        }
        // Distancia al centro: los edificios del centro son más altos
        const cx = (rc[i] + rc[i + 1]) / 2;
        const cz = (rc[j] + rc[j + 1]) / 2;
        const centrality = 1 - Math.min(1, Math.hypot(cx, cz) / (CITY.HALF * 1.2));
        for (let a = 0; a < 2; a++) {
          for (let b = 0; b < 2; b++) {
            if (this.rand() < 0.08) continue; // solar vacío
            const shrinkX = this.rand() * 4;
            const shrinkZ = this.rand() * 4;
            const bw = lot - shrinkX;
            const bd = lot - shrinkZ;
            const bh = 8 + this.rand() * (18 + centrality * 70);
            const px = x0 + a * (lot + lotGap) + lot / 2 + (a === 0 ? shrinkX / 2 : -shrinkX / 2);
            const pz = z0 + b * (lot + lotGap) + lot / 2 + (b === 0 ? shrinkZ / 2 : -shrinkZ / 2);
            this.addBuilding(px, pz, bw, bh, bd);
          }
        }
      }
    }

    // Árboles instanciados
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.9 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length);
    const m = new THREE.Matrix4();
    trees.forEach((p, k) => {
      const sc = 0.8 + this.rand() * 0.6;
      m.compose(new THREE.Vector3(p.x, 1.2 * sc, p.z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
      trunks.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(p.x, 4.4 * sc, p.z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc));
      crowns.setMatrixAt(k, m);
      const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
      body.addShape(new CANNON.Cylinder(0.35, 0.35, 3, 6));
      body.position.set(p.x, 1.5, p.z);
      this.world.addBody(body);
    });
    trunks.castShadow = crowns.castShadow = true;
    this.scene.add(trunks, crowns);
  }

  addBuilding(x, z, w, h, d) {
    const geo = new THREE.BoxGeometry(w, h, d);
    // Escala las UV para que un "tile" de textura mida 12 m x 24 m.
    const uv = geo.attributes.uv;
    for (let face = 0; face < 6; face++) {
      const along = face < 2 ? d : w; // caras ±X usan la profundidad, ±Z el ancho
      for (let v = 0; v < 4; v++) {
        const idx = face * 4 + v;
        if (face === 2 || face === 3) {
          uv.setXY(idx, 0.01, 0.01); // techo / base: pared lisa
        } else {
          uv.setXY(idx, uv.getX(idx) * (along / 12), uv.getY(idx) * (h / 24));
        }
      }
    }
    const mat = this.buildingMaterials[Math.floor(this.rand() * this.buildingMaterials.length)];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.buildingMeshes.push(mesh);
    this.shootables.push(mesh);

    // Detalle de azotea
    if (h > 25 && this.rand() < 0.6) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 3, d * 0.3), this.poleMaterial);
      roof.position.set(x, h + 1.5, z);
      roof.castShadow = true;
      this.scene.add(roof);
    }

    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, h / 2, z);
    this.world.addBody(body);
    this.buildingRects.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
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

  /** Farolas: solo emisivas (sin luces reales) para no disparar el coste por luz. */
  createStreetLamps() {
    const positions = [];
    const half = CITY.ROAD / 2;
    for (const c of this.roadCenters) {
      for (let k = 0; k < this.roadCenters.length - 1; k++) {
        const mid = (this.roadCenters[k] + this.roadCenters[k + 1]) / 2;
        positions.push([c + half + 1.2, mid], [c - half - 1.2, mid], [mid, c + half + 1.2], [mid, c - half - 1.2]);
      }
    }
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 5), this.poleMaterial, positions.length);
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0x555555, emissive: 0xffe0a0, emissiveIntensity: 0 });
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), this.lampHeadMat, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach(([x, z], k) => {
      m.makeTranslation(x, 3, z);
      pole.setMatrixAt(k, m);
      m.makeTranslation(x, 6, z);
      heads.setMatrixAt(k, m);
    });
    pole.castShadow = true;
    this.scene.add(pole, heads);
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
    this.sunDir = new THREE.Vector3();
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
