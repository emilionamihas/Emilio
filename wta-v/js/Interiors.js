import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS } from './Environment.js';
import { NPC } from './NPC.js';
import { OUTFITS } from './HumanModel.js';
import { woodFloorTexture, tileFloorTexture, marbleTexture, wallTexture, carpetTexture, shelfTexture, stoneTexture, signTexture, makeCanvas, toTexture, addNoise } from './Textures.js';

/**
 * Interiores (casa, tiendas 24/7 y bancos). Se construyen fuera del mapa (x ≥ 1600) la primera vez
 * que entras y se reutilizan. Entrar/salir hace un fundido a negro y teletransporta al jugador.
 */

const BASE_X = 1600;

// Configuración de cada banco (la tienda y la casa son únicas)
export const BANK_LAYOUT = {
  puerto: { guards: 2, tellers: 2, customers: 3, carts: 3, drill: 10, gold: false, police: 3 },
  central: { guards: 3, tellers: 3, customers: 4, carts: 4, drill: 14, gold: false, police: 5 },
  reserva: { guards: 4, tellers: 3, customers: 3, carts: 5, drill: 18, gold: true, police: 7 },
};

function mat(opts) {
  return new THREE.MeshStandardMaterial(opts);
}

export class Interiors {
  constructor(game) {
    this.game = game;
    this.cache = {};
    this.count = 0;
    this.fadeEl = document.getElementById('fade');
    this.busy = false;
    // Luces de interior fijas en escena (intensidad 0 fuera) para no recompilar shaders
    this.lights = [0, 1, 2].map(() => {
      const l = new THREE.PointLight(0xfff1dc, 0, 22, 1.4);
      game.scene.add(l);
      return l;
    });
  }

  get current() {
    return this.game.interior;
  }

  // ------------------------------------------------------------------
  // Construcción genérica
  // ------------------------------------------------------------------
  newInstance(key, w, d, h) {
    const origin = new THREE.Vector3(BASE_X + this.count * 90, 0, 0);
    this.count++;
    const group = new THREE.Group();
    group.position.copy(origin);
    this.game.scene.add(group);
    return {
      key,
      origin,
      group,
      w,
      d,
      h,
      bodies: [],
      colliders: [],
      shootables: [],
      interactables: [],
      npcs: [],
      bounds: { minX: origin.x - w / 2 + 0.6, maxX: origin.x + w / 2 - 0.6, minZ: origin.z - d / 2 + 0.6, maxZ: origin.z + d / 2 - 0.6 },
      spawn: new THREE.Vector3(origin.x, 0, origin.z + d / 2 - 2.6),
      lightSpots: [],
    };
  }

  /** Caja con colisión opcional. Posición en coordenadas locales de la instancia. */
  box(inst, w, h, d, material, x, y, z, { collide = true, shadow = true, shootable = true, parent } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    (parent || inst.group).add(m);
    if (shootable) inst.shootables.push(m);
    if (collide) {
      const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
      body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
      body.position.set(inst.origin.x + x, y, inst.origin.z + z);
      this.game.world.addBody(body);
      inst.bodies.push(body);
      m.userData.body = body;
      // Todo lo sólido de más de 1,5 m frena la cámara (paredes de la cámara acorazada, armarios...)
      if (h > 1.5) inst.colliders.push(m);
    }
    return m;
  }

  /** Habitación: suelo, paredes (con hueco de puerta en la pared frontal +Z) y techo con paneles de luz. */
  room(inst, { floorMat, wallMat, ceilingColor = 0xf2f0ea, doorWidth = 2.2 }) {
    const { w, d, h } = inst;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    inst.group.add(floor);
    inst.shootables.push(floor);
    const t = 0.25;
    const walls = [
      this.box(inst, w + t * 2, h, t, wallMat, 0, h / 2, -d / 2 - t / 2),
      this.box(inst, t, h, d, wallMat, -w / 2 - t / 2, h / 2, 0),
      this.box(inst, t, h, d, wallMat, w / 2 + t / 2, h / 2, 0),
    ];
    // Pared de la puerta en dos tramos + dintel
    const side = (w - doorWidth) / 2;
    walls.push(this.box(inst, side + t, h, t, wallMat, -w / 2 + side / 2 - t / 2, h / 2, d / 2 + t / 2));
    walls.push(this.box(inst, side + t, h, t, wallMat, w / 2 - side / 2 + t / 2, h / 2, d / 2 + t / 2));
    walls.push(this.box(inst, doorWidth, h - 2.4, t, wallMat, 0, 2.4 + (h - 2.4) / 2, d / 2 + t / 2, { collide: false }));
    // La puerta en sí (cerrada, sin colisión: se sale con E)
    const door = this.box(inst, doorWidth - 0.1, 2.35, 0.08, mat({ color: 0x3b2a1e, roughness: 0.6 }), 0, 1.18, d / 2 + 0.05, { collide: false });
    this.box(inst, 0.05, 0.3, 0.06, mat({ color: 0xc0c0c0, metalness: 1, roughness: 0.2 }), doorWidth / 2 - 0.3, 1.1, d / 2 - 0.02, { collide: false, parent: inst.group });
    // Cuerpo físico que tapa el hueco de la puerta
    const plug = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    plug.addShape(new CANNON.Box(new CANNON.Vec3(doorWidth / 2, h / 2, t / 2)));
    plug.position.set(inst.origin.x, h / 2, inst.origin.z + d / 2 + t / 2);
    this.game.world.addBody(plug);
    inst.bodies.push(plug);
    inst.colliders.push(...walls, door);

    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, 0.2, d + t * 2), mat({ color: ceilingColor, roughness: 0.9 }));
    ceiling.position.y = h + 0.1;
    ceiling.castShadow = true;
    inst.group.add(ceiling);
    inst.colliders.push(ceiling);
    // Paneles de luz empotrados
    const panelMat = mat({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 1.2 });
    for (let x = -w / 2 + 2.5; x < w / 2 - 1; x += 4) {
      for (let z = -d / 2 + 2.5; z < d / 2 - 1; z += 4) {
        this.box(inst, 1.2, 0.04, 1.2, panelMat, x, h - 0.02, z, { collide: false, shadow: false, shootable: false });
      }
    }
    // Rodapié
    const skirting = mat({ color: 0x3a3a3a, roughness: 0.6 });
    this.box(inst, w, 0.12, 0.03, skirting, 0, 0.06, -d / 2 + 0.02, { collide: false, shadow: false, shootable: false });
    this.box(inst, 0.03, 0.12, d, skirting, -w / 2 + 0.02, 0.06, 0, { collide: false, shadow: false, shootable: false });
    this.box(inst, 0.03, 0.12, d, skirting, w / 2 - 0.02, 0.06, 0, { collide: false, shadow: false, shootable: false });

    inst.interactables.push({ id: 'exit', pos: this.world(inst, 0, d / 2 - 0.9), radius: 1.4, label: 'Salir a la calle' });
    inst.ceiling = h;
  }

  world(inst, x, z) {
    return new THREE.Vector3(inst.origin.x + x, 0, inst.origin.z + z);
  }

  painting(inst, x, y, z, rotY, w = 1.2, h = 0.9) {
    const tex = toTexture(
      makeCanvas(128, 96, (ctx) => {
        const hue = Math.random() * 360;
        const g = ctx.createLinearGradient(0, 0, 128, 96);
        g.addColorStop(0, `hsl(${hue},45%,55%)`);
        g.addColorStop(1, `hsl(${(hue + 60) % 360},40%,30%)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 96);
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = `hsla(${(hue + k * 40) % 360},55%,${40 + k * 8}%,0.7)`;
          ctx.beginPath();
          ctx.arc(Math.random() * 128, Math.random() * 96, 10 + Math.random() * 25, 0, Math.PI * 2);
          ctx.fill();
        }
      }),
      { repeat: false }
    );
    const frame = this.box(inst, w + 0.1, h + 0.1, 0.05, mat({ color: 0x2b1d12 }), x, y, z, { collide: false, shootable: false });
    frame.rotation.y = rotY;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({ map: tex, roughness: 0.7 }));
    art.position.z = 0.03;
    frame.add(art);
  }

  plant(inst, x, z, scale = 1) {
    this.box(inst, 0.45 * scale, 0.5 * scale, 0.45 * scale, mat({ color: 0x6d4c41, roughness: 0.8 }), x, 0.25 * scale, z, { collide: true });
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 * scale, 1), mat({ color: 0x2e6b2e, roughness: 0.9, flatShading: true }));
    leaves.position.set(x, 0.95 * scale, z);
    leaves.scale.y = 1.4;
    leaves.castShadow = true;
    inst.group.add(leaves);
  }

  // ------------------------------------------------------------------
  // Casa
  // ------------------------------------------------------------------
  buildHouse() {
    const inst = this.newInstance('house', 14, 12, 3.2);
    this.room(inst, { floorMat: mat({ map: woodFloorTexture(), roughness: 0.55 }), wallMat: mat({ map: wallTexture('#e8e1d4'), roughness: 0.9 }) });
    inst.floorMat = inst.group.children[0].material;
    inst.floorMat.map.repeat.set(3, 3);
    const B = (...a) => this.box(inst, ...a);

    const fabric = mat({ color: 0x4a5560, roughness: 0.95 });
    const cushion = mat({ color: 0x5d6a75, roughness: 0.95 });
    const wood = mat({ color: 0x5a3d28, roughness: 0.6 });
    const white = mat({ color: 0xf0f0f0, roughness: 0.4 });
    const metal = mat({ color: 0xb8bcc0, metalness: 0.9, roughness: 0.25 });
    const black = mat({ color: 0x111111, roughness: 0.3 });

    // Salón (delante a la derecha): alfombra, sofá en L, mesa de centro, TV
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), mat({ map: carpetTexture('#3e5c6e'), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(3.2, 0.02, 1.2);
    rug.receiveShadow = true;
    inst.group.add(rug);
    B(3.2, 0.45, 0.95, fabric, 3.2, 0.23, -0.4);
    B(3.2, 0.5, 0.25, fabric, 3.2, 0.7, -0.8);
    B(0.95, 0.45, 1.8, fabric, 5.0, 0.23, 0.55);
    B(1.4, 0.18, 0.8, cushion, 2.5, 0.54, -0.35, { collide: false });
    B(1.4, 0.18, 0.8, cushion, 4.0, 0.54, -0.35, { collide: false });
    B(1.3, 0.05, 0.7, mat({ color: 0x9fb8c4, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55 }), 3.2, 0.42, 1.2);
    for (const [lx, lz] of [[-0.55, -0.25], [0.55, -0.25], [-0.55, 0.25], [0.55, 0.25]]) B(0.04, 0.4, 0.04, metal, 3.2 + lx, 0.2, 1.2 + lz, { collide: false });
    B(2.2, 0.5, 0.45, wood, 3.2, 0.25, 3.0);
    const tv = B(1.9, 1.05, 0.06, black, 3.2, 1.15, 3.1);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.95), mat({ color: 0x000000, emissive: 0x2a6fd6, emissiveIntensity: 0.6, roughness: 0.2 }));
    screen.position.z = -0.035;
    screen.rotation.y = Math.PI;
    tv.add(screen);
    inst.tvScreen = screen;

    // Cocina (delante a la izquierda)
    const counter = mat({ color: 0xdedad2, roughness: 0.35 });
    B(0.7, 0.9, 5, mat({ color: 0x2f3b45, roughness: 0.6 }), -6.6, 0.45, 2.4);
    B(0.75, 0.05, 5, counter, -6.6, 0.92, 2.4, { collide: false });
    B(0.8, 2.0, 0.8, metal, -6.6, 1.0, -0.6);
    B(0.7, 0.9, 2.2, mat({ color: 0x2f3b45, roughness: 0.6 }), -4.4, 0.45, 2.6);
    B(0.9, 0.05, 2.4, counter, -4.4, 0.92, 2.6, { collide: false });
    for (const z of [2.0, 3.2]) B(0.35, 0.7, 0.35, black, -3.7, 0.35, z, { collide: false });

    // Dormitorio (fondo a la izquierda)
    B(2.2, 0.45, 2.3, wood, -4.6, 0.23, -4.6);
    B(2.1, 0.25, 2.1, white, -4.6, 0.55, -4.5, { collide: false });
    B(2.12, 0.08, 1.4, mat({ color: 0x7b2d2d, roughness: 0.95 }), -4.6, 0.7, -4.1, { collide: false });
    B(0.7, 0.18, 0.4, white, -5.1, 0.75, -5.4, { collide: false });
    B(0.7, 0.18, 0.4, white, -4.1, 0.75, -5.4, { collide: false });
    B(2.3, 1.2, 0.12, wood, -4.6, 0.9, -5.85);
    B(0.5, 0.5, 0.45, wood, -6.1, 0.25, -5.4);
    B(0.2, 0.35, 0.2, mat({ color: 0xfff3d6, emissive: 0xffd89a, emissiveIntensity: 0.8 }), -6.1, 0.68, -5.4, { collide: false });
    inst.interactables.push({ id: 'bed', pos: this.world(inst, -4.6, -3.1), radius: 1.5, label: 'Dormir: guarda la partida, recupera vida y pasa 8 horas' });

    // Armario (pared izquierda)
    B(0.65, 2.3, 2.0, mat({ color: 0xcfc7b8, roughness: 0.6 }), -6.65, 1.15, -1.9);
    B(0.02, 2.2, 0.02, black, -6.31, 1.15, -1.9, { collide: false });
    inst.interactables.push({ id: 'wardrobe', pos: this.world(inst, -5.7, -1.9), radius: 1.3, label: 'Vestidor: polo, gorro, short, colores y peinado' });

    // Despacho (fondo a la derecha) con portátil
    B(1.8, 0.05, 0.8, wood, 4.5, 0.76, -5.3);
    for (const [lx, lz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) B(0.05, 0.75, 0.05, metal, 4.5 + lx, 0.37, -5.3 + lz);
    B(0.55, 0.9, 0.55, black, 4.5, 0.45, -4.4);
    const laptop = B(0.45, 0.02, 0.32, metal, 4.5, 0.79, -5.35, { collide: false });
    const lscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.28), mat({ color: 0x000000, emissive: 0x4fc3f7, emissiveIntensity: 1.0 }));
    lscreen.position.set(0, 0.15, -0.16);
    lscreen.rotation.x = -0.2;
    laptop.add(lscreen);
    inst.interactables.push({ id: 'laptop', pos: this.world(inst, 4.5, -4.1), radius: 1.3, label: 'Ordenador: negocios, coches y garaje' });

    // Ventanal con vistas (pared derecha)
    const view = toTexture(
      makeCanvas(512, 256, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#8fb8d8');
        g.addColorStop(1, '#e6d8c4');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 256);
        for (let x = 0; x < 512; ) {
          const bw = 20 + Math.random() * 50;
          const bh = 60 + Math.random() * 150;
          ctx.fillStyle = `rgb(${70 + Math.random() * 40},${80 + Math.random() * 40},${95 + Math.random() * 40})`;
          ctx.fillRect(x, 256 - bh, bw, bh);
          ctx.fillStyle = 'rgba(255,240,200,0.5)';
          for (let wy = 256 - bh + 8; wy < 250; wy += 12) for (let wx = x + 4; wx < x + bw - 4; wx += 9) if (Math.random() < 0.3) ctx.fillRect(wx, wy, 4, 5);
          x += bw + 2;
        }
        addNoise(ctx, 512, 256, 6);
      }),
      { repeat: false }
    );
    const windowMat = mat({ map: view, emissive: 0xffffff, emissiveMap: view, emissiveIntensity: 0.7 });
    inst.windowMat = windowMat;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(5, 2), windowMat);
    win.position.set(inst.w / 2 - 0.01, 1.6, -1);
    win.rotation.y = -Math.PI / 2;
    inst.group.add(win);
    for (const z of [-3.5, -1, 1.5]) B(0.1, 2.1, 0.08, black, inst.w / 2 - 0.05, 1.6, z, { collide: false });
    B(0.1, 0.08, 5.1, black, inst.w / 2 - 0.05, 2.6, -1, { collide: false });
    B(0.1, 0.08, 5.1, black, inst.w / 2 - 0.05, 0.6, -1, { collide: false });

    this.painting(inst, -1.5, 1.8, -5.98, 0);
    this.painting(inst, 1.5, 1.7, -5.98, 0, 0.9, 1.2);
    this.painting(inst, -6.98, 1.7, 1.4, Math.PI / 2);
    this.plant(inst, 6.3, 3.2);
    this.plant(inst, -1.0, -5.4, 0.8);
    this.plant(inst, 1.0, 5.2, 1.1);

    inst.lightSpots = [new THREE.Vector3(3, 2.8, 1), new THREE.Vector3(-4.5, 2.8, -3.5), new THREE.Vector3(-4.5, 2.8, 2.5)];
    return inst;
  }

  // ------------------------------------------------------------------
  // Tienda 24/7
  // ------------------------------------------------------------------
  buildStore() {
    const inst = this.newInstance('store', 12, 10, 3.4);
    const floorMat = mat({ map: tileFloorTexture(), roughness: 0.3 });
    floorMat.map.repeat.set(4, 3);
    this.room(inst, { floorMat, wallMat: mat({ map: wallTexture('#f2f0ea'), roughness: 0.8 }) });
    const B = (...a) => this.box(inst, ...a);
    const shelfTex = shelfTexture();
    const shelfMat = mat({ map: shelfTex, roughness: 0.7 });
    const frame = mat({ color: 0xdadada, metalness: 0.6, roughness: 0.4 });

    // Estanterías de doble cara
    for (const x of [-3.8, -1.4]) {
      const s = B(0.9, 1.8, 5.2, [frame, frame, frame, frame, frame, frame], x, 0.9, -0.6);
      const faceL = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.7), shelfMat);
      faceL.rotation.y = -Math.PI / 2;
      faceL.position.x = -0.46;
      s.add(faceL);
      const faceR = faceL.clone();
      faceR.rotation.y = Math.PI / 2;
      faceR.position.x = 0.46;
      s.add(faceR);
    }
    // Neveras al fondo con puertas de cristal iluminadas
    const fridgeTex = shelfTexture();
    const fridge = mat({ map: fridgeTex, emissive: 0xffffff, emissiveMap: fridgeTex, emissiveIntensity: 0.55, roughness: 0.1, metalness: 0.2 });
    const fr = B(8, 2.2, 0.8, frame, -1.5, 1.1, -4.55);
    const glassFace = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 2), fridge);
    glassFace.position.z = 0.41;
    fr.add(glassFace);
    // Mostrador con caja registradora (a la derecha de la entrada)
    const counterMat = mat({ color: 0x8e2020, roughness: 0.6 });
    B(0.9, 1.05, 3.6, counterMat, 3.6, 0.52, 0.6);
    B(1.0, 0.05, 3.7, mat({ color: 0x333333, roughness: 0.3 }), 3.6, 1.07, 0.6, { collide: false });
    const register = B(0.45, 0.25, 0.4, mat({ color: 0x222222, roughness: 0.4 }), 3.5, 1.22, 0.1, { collide: false });
    register.rotation.y = -Math.PI / 2;
    B(1.5, 1.2, 0.3, mat({ map: shelfTex, roughness: 0.7 }), 5.6, 1.6, 0.6, { collide: false }); // tabaco detrás
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.6), mat({ map: signTexture('24/7', '#b71c1c'), emissive: 0xffffff, emissiveMap: signTexture('24/7', '#b71c1c'), emissiveIntensity: 0.6 }));
    sign.position.set(3.6, 2.8, -4.9);
    inst.group.add(sign);
    this.plant(inst, -5.3, 4.2, 0.8);

    inst.counterPos = this.world(inst, 3.6, 0.6);
    inst.cashierPos = this.world(inst, 4.6, 0.3);
    inst.interactables.push({ id: 'rob-store', pos: this.world(inst, 2.6, 0.6), radius: 1.6, label: 'Atracar la tienda (o apunta al dependiente)' });
    inst.lightSpots = [new THREE.Vector3(-2.5, 3.0, -1), new THREE.Vector3(3, 3.0, 1.5), new THREE.Vector3(0, 3.0, 3.5)];
    return inst;
  }

  // ------------------------------------------------------------------
  // Banco
  // ------------------------------------------------------------------
  buildBank(id) {
    const layout = BANK_LAYOUT[id];
    const inst = this.newInstance(`bank-${id}`, 24, 22, 6);
    const floorMat = mat({ map: marbleTexture(Math.random, id === 'reserva'), roughness: 0.15, metalness: 0.05 });
    floorMat.map.repeat.set(6, 5);
    const stone = stoneTexture(Math.random, id === 'reserva' ? [196, 190, 180] : [224, 214, 196]);
    stone.repeat.set(4, 1.5);
    this.room(inst, { floorMat, wallMat: mat({ map: stone, roughness: 0.7 }), ceilingColor: 0xe8e2d4, doorWidth: 3 });
    const B = (...a) => this.box(inst, ...a);
    const brass = mat({ color: 0xc9a14a, metalness: 1, roughness: 0.3 });
    const woodDark = mat({ color: 0x3b2618, roughness: 0.5 });
    const glass = mat({ color: 0xbfd8e0, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.25 });

    // Columnas
    for (const x of [-7, 7]) {
      for (const z of [-1, 6]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 6, 20), mat({ map: stone, roughness: 0.6 }));
        col.position.set(x, 3, z);
        col.castShadow = true;
        inst.group.add(col);
        inst.shootables.push(col);
        inst.colliders.push(col);
        const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
        body.addShape(new CANNON.Cylinder(0.5, 0.5, 6, 10));
        body.position.set(inst.origin.x + x, 3, inst.origin.z + z);
        this.game.world.addBody(body);
        inst.bodies.push(body);
      }
    }
    // Mostrador de ventanillas con mamparas de cristal (atraviesa el banco, hueco a la derecha)
    B(16, 1.15, 1.0, woodDark, -3, 0.58, -3.2);
    B(16.2, 0.06, 1.1, mat({ color: 0x1c1c1c, roughness: 0.2 }), -3, 1.18, -3.2, { collide: false });
    const glassWall = B(16, 1.3, 0.03, glass, -3, 1.85, -3.2, { collide: false, shadow: false, shootable: false });
    glassWall.renderOrder = 2;
    for (let x = -10.5; x <= 4.5; x += 3) B(0.06, 1.3, 0.08, brass, x, 1.85, -3.2, { collide: false });
    const bankSign = signTexture(id === 'reserva' ? 'RESERVA FEDERAL' : id === 'central' ? 'BANCO CENTRAL' : 'BANCO DEL PUERTO', '#1d2b22', '#e9d8a6');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.3), mat({ map: bankSign, roughness: 0.6 }));
    sign.position.set(0, 4.6, -5.88);
    inst.group.add(sign);
    // Bancos de espera y alfombra de entrada
    for (const x of [-8, 8]) B(2.4, 0.45, 0.6, woodDark, x, 0.23, 8.5);
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(3, 5), mat({ map: carpetTexture('#6b1f24'), roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.02, 8);
    inst.group.add(rug);
    this.plant(inst, -11, 9.8, 1.3);
    this.plant(inst, 11, 9.8, 1.3);
    this.painting(inst, -11.97, 3, 3, Math.PI / 2, 2, 1.4);
    this.painting(inst, 11.97, 3, 3, -Math.PI / 2, 2, 1.4);

    // Cámara acorazada al fondo: muro con puerta circular
    const vaultWallMat = mat({ color: 0x5b5f63, metalness: 0.6, roughness: 0.4 });
    B(9, 6, 0.6, vaultWallMat, -7.5, 3, -6.2);
    B(9, 6, 0.6, vaultWallMat, 7.5, 3, -6.2);
    B(6, 2.8, 0.6, vaultWallMat, 0, 4.6, -6.2);
    // Jambas: sin ellas quedaba un hueco a cada lado de la puerta redonda
    B(1.4, 3.2, 0.6, vaultWallMat, -2.3, 1.6, -6.2);
    B(1.4, 3.2, 0.6, vaultWallMat, 2.3, 1.6, -6.2);
    // Paredes interiores de la cámara
    B(0.4, 6, 4.4, vaultWallMat, -3, 3, -8.6);
    B(0.4, 6, 4.4, vaultWallMat, 3, 3, -8.6);
    const door = new THREE.Group();
    door.position.set(inst.origin.x - 1.55, 1.6, inst.origin.z - 5.85);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.45, 40), mat({ color: 0x9aa0a6, metalness: 1, roughness: 0.25 }));
    disc.rotation.x = Math.PI / 2;
    disc.position.x = 1.55;
    disc.castShadow = true;
    door.add(disc);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 8, 24), brass);
    wheel.position.set(1.55, 0, 0.26);
    door.add(wheel);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), brass);
      spoke.position.set(1.55, 0, 0.26);
      spoke.rotation.z = (k * Math.PI) / 3;
      door.add(spoke);
    }
    this.game.scene.add(door);
    const doorBody = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    doorBody.addShape(new CANNON.Box(new CANNON.Vec3(1.6, 1.6, 0.3)));
    doorBody.position.set(inst.origin.x, 1.6, inst.origin.z - 6.1);
    this.game.world.addBody(doorBody);
    inst.bodies.push(doorBody);
    inst.shootables.push(disc);
    inst.vault = { door, doorBody, open: false, angle: 0, drillPos: this.world(inst, 0, -4.7) };

    // Carros de dinero (o lingotes en la Reserva Federal)
    const cash = toTexture(
      makeCanvas(64, 64, (ctx) => {
        ctx.fillStyle = '#2f6b3a';
        ctx.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 64; y += 8) {
          ctx.fillStyle = y % 16 ? '#3d8a4a' : '#6fae6a';
          ctx.fillRect(0, y, 64, 3);
        }
        ctx.fillStyle = '#e8e2c8';
        ctx.fillRect(28, 0, 8, 64);
      })
    );
    const cashMat = mat({ map: cash, roughness: 0.8 });
    const goldMat = mat({ color: 0xd4a93a, metalness: 1, roughness: 0.2 });
    inst.carts = [];
    for (let k = 0; k < layout.carts; k++) {
      const x = -2 + (k % 3) * 2;
      const z = -7.6 - Math.floor(k / 3) * 1.8;
      const cart = new THREE.Group();
      cart.position.set(inst.origin.x + x, 0, inst.origin.z + z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.7), mat({ color: 0x777c80, metalness: 0.8, roughness: 0.35 }));
      base.position.y = 0.45;
      const load = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.6), layout.gold && k % 2 === 0 ? goldMat : cashMat);
      load.position.y = 0.97;
      base.castShadow = load.castShadow = true;
      cart.add(base, load);
      this.game.scene.add(cart);
      inst.carts.push({ group: cart, load, pos: new THREE.Vector3(cart.position.x, 0, cart.position.z), taken: false, gold: layout.gold && k % 2 === 0 });
    }
    inst.layout = layout;
    inst.bankId = id;
    inst.counterPos = this.world(inst, -3, -2.2);
    inst.interactables.push({ id: 'rob-bank', pos: this.world(inst, -3, -2.1), radius: 1.8, label: 'Atracar el banco (o apunta a un cajero)' });
    inst.interactables.push({ id: 'vault', pos: inst.vault.drillPos, radius: 1.8, label: 'Taladrar la cámara acorazada' });
    inst.lightSpots = [new THREE.Vector3(0, 5.2, 4), new THREE.Vector3(-6, 5.2, -1), new THREE.Vector3(0, 4.0, -8.5)];
    return inst;
  }

  get(key) {
    if (!this.cache[key]) {
      if (key === 'house') this.cache[key] = this.buildHouse();
      else if (key === 'store') this.cache[key] = this.buildStore();
      else this.cache[key] = this.buildBank(key.replace('bank-', ''));
    }
    return this.cache[key];
  }

  // ------------------------------------------------------------------
  // Entrar / salir
  // ------------------------------------------------------------------
  fade(fn) {
    if (this.busy) return;
    this.busy = true;
    this.fadeEl.classList.add('show');
    setTimeout(() => {
      fn();
      setTimeout(() => {
        this.fadeEl.classList.remove('show');
        this.busy = false;
      }, 120);
    }, 280);
  }

  keyFor(poi) {
    if (poi.type === 'safehouse') return 'house';
    if (poi.type === 'store') return 'store';
    return `bank-${poi.id}`;
  }

  enter(poi, { instant = false } = {}) {
    const go = () => {
      const game = this.game;
      const inst = this.get(this.keyFor(poi));
      game.interior = { inst, poi };
      this.populate(inst, poi);
      game.player.teleport(inst.spawn);
      game.player.facing = Math.PI;
      game.cameraRig.yaw = 0;
      game.cameraRig.pitch = -0.1;
      inst.lightSpots.forEach((p, i) => {
        this.lights[i].position.set(inst.origin.x + p.x, p.y, inst.origin.z + p.z);
        this.lights[i].intensity = inst.key.startsWith('bank') ? 60 : 30;
        this.lights[i].distance = inst.key.startsWith('bank') ? 30 : 18;
      });
      game.hud.setPrompt(null);
      game.input.pressed.clear(); // la E que abrió la puerta no debe usarse también dentro
      game.emit('enteredInterior', { key: inst.key, poi });
    };
    if (instant) go();
    else this.fade(go);
  }

  exit({ instant = false } = {}) {
    const go = () => {
      const game = this.game;
      const cur = game.interior;
      if (!cur) return;
      for (const n of cur.inst.npcs) n.remove();
      cur.inst.npcs = [];
      game.interior = null;
      for (const l of this.lights) l.intensity = 0;
      const out = cur.poi.pos.clone().addScaledVector(cur.poi.normal, 0.6);
      game.player.teleport(out);
      game.input.pressed.clear();
      game.player.facing = Math.atan2(cur.poi.normal.x, cur.poi.normal.z);
      game.cameraRig.yaw = Math.atan2(-cur.poi.normal.x, -cur.poi.normal.z);
      game.emit('exitedInterior', { key: cur.inst.key, poi: cur.poi });
    };
    if (instant) go();
    else this.fade(go);
  }

  /** Crea los NPC del interior cada vez que entras. */
  populate(inst, poi) {
    const game = this.game;
    for (const n of inst.npcs) n.remove();
    inst.npcs = [];
    const o = inst.origin;
    const add = (opts) => {
      const n = new NPC(game, { bounds: inst.bounds, ...opts });
      inst.npcs.push(n);
      return n;
    };
    if (inst.key === 'store') {
      inst.cashier = add({ role: 'cashier', outfit: OUTFITS.dependiente, position: inst.cashierPos.clone(), facing: -Math.PI / 2 });
      for (let k = 0; k < 1 + Math.floor(Math.random() * 2); k++) {
        add({ role: 'civilian', position: new THREE.Vector3(o.x - 2.6, 0, o.z - 2 + k * 2.5), facing: Math.random() * 6 });
      }
    } else if (inst.key.startsWith('bank')) {
      const L = inst.layout;
      inst.tellers = [];
      for (let k = 0; k < L.tellers; k++) {
        inst.tellers.push(add({ role: 'teller', outfit: OUTFITS.cajero, position: new THREE.Vector3(o.x - 9 + k * 4, 0, o.z - 4.3), facing: 0 }));
      }
      for (let k = 0; k < L.customers; k++) {
        add({ role: 'civilian', position: new THREE.Vector3(o.x - 8 + k * 4 + Math.random(), 0, o.z - 1.6 + Math.random() * 3), facing: Math.PI });
      }
      const guardSpots = [[-4, 9], [4, 9], [9, -1], [-10, 2], [0, 3]];
      for (let k = 0; k < L.guards; k++) {
        const [gx, gz] = guardSpots[k];
        add({ role: 'guard', outfit: OUTFITS.guardia, position: new THREE.Vector3(o.x + gx, 0, o.z + gz), facing: gz > 5 ? 0 : Math.PI / 2, armed: true });
      }
      // Estado de la cámara según el enfriamiento del banco
      const v = inst.vault;
      const robbedRecently = game.heists.cooldownLeft(poi.id) > 0;
      v.open = robbedRecently;
      v.angle = robbedRecently ? -1.9 : 0;
      v.door.rotation.y = v.angle;
      if (!robbedRecently && !game.world.bodies.includes(v.doorBody)) game.world.addBody(v.doorBody);
      if (robbedRecently && game.world.bodies.includes(v.doorBody)) game.world.removeBody(v.doorBody);
      for (const c of inst.carts) {
        c.taken = robbedRecently;
        c.load.visible = !robbedRecently;
      }
    }
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------
  update(dt) {
    const game = this.game;
    const cur = game.interior;
    if (!cur) return;
    const inst = cur.inst;
    for (const n of inst.npcs) n.update(dt);

    // Puerta de la cámara abriéndose
    if (inst.vault && inst.vault.open && inst.vault.angle > -1.9) {
      inst.vault.angle = Math.max(-1.9, inst.vault.angle - dt * 0.8);
      inst.vault.door.rotation.y = inst.vault.angle;
    }
    if (inst.tvScreen) inst.tvScreen.material.emissiveIntensity = 0.45 + Math.sin(game.time * 7) * 0.05 + Math.random() * 0.08;
    if (inst.windowMat) inst.windowMat.emissiveIntensity = 0.15 + (1 - game.env.night) * 0.75;

    if (this.busy || game.menus.isOpen || game.interaction.state !== 'foot') return;
    const p = game.player.mesh.position;
    let near = null;
    for (const it of inst.interactables) {
      if (it.hidden && it.hidden()) continue;
      if (Math.hypot(p.x - it.pos.x, p.z - it.pos.z) < it.radius) {
        near = it;
        break;
      }
    }
    // Los atracos definen sus propios textos (Heists)
    const heistPrompt = game.heists.interiorPrompt(inst, near);
    if (heistPrompt !== undefined) {
      game.hud.setPrompt(heistPrompt);
    } else if (near) {
      game.hud.setPrompt(`Pulsa <kbd>E</kbd> · ${near.label}`);
    } else {
      game.hud.setPrompt(null);
    }
    if (near && game.input.wasPressed('KeyE')) this.use(near, inst, cur.poi);
  }

  use(it, inst, poi) {
    const game = this.game;
    switch (it.id) {
      case 'exit':
        if (game.heists.canLeave(inst)) this.exit();
        break;
      case 'bed':
        if (game.wanted.level > 0) {
          game.hud.notify('No puedes dormir con la policía buscándote.');
          break;
        }
        this.fade(() => {
          game.player.health = 100;
          game.env.timeOfDay = (game.env.timeOfDay + 8) % 24;
          game.state.save();
          game.hud.notify('Has dormido 8 horas. Partida guardada.');
        });
        break;
      case 'wardrobe':
        game.menus.open(game.properties.wardrobeMenu());
        game.previewPlayer();
        break;
      case 'laptop':
        game.menus.open(game.properties.rootMenu());
        break;
      default:
        game.heists.useInterior(it.id, inst, poi);
        break;
    }
  }

  /** Colisionadores de cámara y blancos de disparo del interior actual. */
  cameraColliders() {
    const cur = this.game.interior;
    return cur ? cur.inst.colliders : [];
  }

  shootables() {
    const cur = this.game.interior;
    if (!cur) return [];
    return [...cur.inst.shootables, ...cur.inst.npcs.filter((n) => !n.dead).map((n) => n.root), ...(cur.inst.carts || []).map((c) => c.group)];
  }
}
