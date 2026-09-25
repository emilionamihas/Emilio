import * as THREE from 'three';
import { CITY } from './Environment.js';
import { WEAPONS } from './PlayerController.js';
import { CATALOG, DEALER_MODELS, VehicleController } from './VehicleController.js';
import { formatMoney } from './GameState.js';
import { BUSINESSES, LEVELS } from './Properties.js';
import { Environment } from './Environment.js';
import * as CANNON from 'cannon-es';
import { GROUPS } from './Environment.js';
import { stoneTexture, wallTexture, signTexture, makeCanvas, toTexture, addNoise } from './Textures.js';

const INTERACT_RADIUS = 2.2;

export const BANKS = {
  puerto: { name: 'Banco del Puerto', duration: 15, loot: [12000, 18000], startLevel: 1, endLevel: 2, cooldown: 240 },
  colinas: { name: 'Caja de las Colinas', duration: 18, loot: [22000, 30000], startLevel: 2, endLevel: 2, cooldown: 300 },
  central: { name: 'Banco Central', duration: 25, loot: [35000, 50000], startLevel: 2, endLevel: 3, cooldown: 360 },
  reserva: { name: 'Reserva Federal', duration: 35, loot: [110000, 150000], startLevel: 3, endLevel: 4, cooldown: 480 },
};


const TYPE_STYLE = {
  safehouse: { color: '#43a047', letter: 'H', sign: '#1b5e20' },
  gunshop: { color: '#e53935', letter: 'A', sign: '#8e1b1b' },
  dealer: { color: '#1e88e5', letter: 'C', sign: '#0d3c75' },
  store: { color: '#fb8c00', letter: 'T', sign: '#b35900' },
  bank: { color: '#2e7d32', letter: '$', sign: '#0f3d1a' },
  business: { color: '#8e24aa', letter: 'N', sign: '#4a148c' },
  hospital: { color: '#ffffff', letter: '+', sign: '#c62828' },
  police: { color: '#1565c0', letter: 'P', sign: '#0b2e5c' },
  mission: { color: '#fdd835', letter: '!', sign: '#8a6d00' },
};

const rc = (i) => -CITY.HALF + i * CITY.PERIOD;

/**
 * Punto sobre la acera de la manzana (bi, bj) en el lado indicado ('W','E','N','S').
 * Devuelve la posición del marcador, la normal hacia la calle y una plaza de aparcamiento
 * en el carril derecho de esa calle con su orientación.
 */
export function sidewalkSpot(bi, bj, side, offset = 0) {
  const half = CITY.ROAD / 2;
  const sw = half + CITY.SIDEWALK / 2;
  const cx = (rc(bi) + rc(bi + 1)) / 2;
  const cz = (rc(bj) + rc(bj + 1)) / 2;
  switch (side) {
    case 'W':
      return { pos: new THREE.Vector3(rc(bi) + sw, 0, cz + offset), normal: new THREE.Vector3(-1, 0, 0), park: new THREE.Vector3(rc(bi) + 6.3, 0, cz + offset + 8), heading: Math.PI };
    case 'E':
      return { pos: new THREE.Vector3(rc(bi + 1) - sw, 0, cz + offset), normal: new THREE.Vector3(1, 0, 0), park: new THREE.Vector3(rc(bi + 1) - 6.3, 0, cz + offset - 8), heading: 0 };
    case 'N':
      return { pos: new THREE.Vector3(cx + offset, 0, rc(bj) + sw), normal: new THREE.Vector3(0, 0, -1), park: new THREE.Vector3(cx + offset - 8, 0, rc(bj) + 6.3), heading: Math.PI / 2 };
    default:
      return { pos: new THREE.Vector3(cx + offset, 0, rc(bj + 1) - sw), normal: new THREE.Vector3(0, 0, 1), park: new THREE.Vector3(cx + offset + 8, 0, rc(bj + 1) - 6.3), heading: -Math.PI / 2 };
  }
}

/** Marcador de suelo estilo GTA (anillo + columna de luz). Con `beam` se ve desde lejos. */
export function createMarker(color, { beam = false, radius = 0.9 } = {}) {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.75, radius, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const colMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const col = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, beam ? 60 : 1.4, 24, 1, true), colMat);
  col.position.y = beam ? 30 : 0.7;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 4), new THREE.MeshBasicMaterial({ color: c }));
  arrow.rotation.x = Math.PI;
  arrow.position.y = 2.2;
  group.add(ring, col, arrow);
  group.userData.arrow = arrow;
  return group;
}

function makeSignTexture(text, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 64;
  ctx.font = `${size}px Anton, Impact, 'Arial Black', sans-serif`;
  while (ctx.measureText(text).width > 460 && size > 24) {
    size -= 4;
    ctx.font = `${size}px Anton, Impact, 'Arial Black', sans-serif`;
  }
  ctx.fillText(text.toUpperCase(), 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Locations {
  constructor(game) {
    this.game = game;
    this.pois = [];
    this.garageCar = null;
    this.nearest = null;

    const env = game.env;
    // `where`: [manzana i, manzana j, lado] en el centro, o { at: [x, z], road } en cualquier calle
    const add = (type, name, where, data = {}) => {
      const spot = Array.isArray(where) ? sidewalkSpot(...where) : env.spotAt(where.at[0], where.at[1], where.road);
      const poi = { id: data.id || name, type, name, ...spot, ...data, style: TYPE_STYLE[type] };
      this.pois.push(poi);
      return poi;
    };

    add('safehouse', 'Tu casa', [3, 3, 'W'], { id: 'casa' });
    add('gunshop', 'Armería Plomo', [2, 3, 'E'], { id: 'armeria' });
    add('gunshop', 'Armería Costa', { at: [250, 108], road: 'lomas' }, { id: 'armeria2' });
    add('dealer', 'Autos Velasco', [3, 4, 'W'], { id: 'concesionario' });
    add('store', '24/7 Centro', [3, 2, 'W'], { id: 'tienda1' });
    add('store', '24/7 Norte', [1, 4, 'N'], { id: 'tienda2' });
    add('store', '24/7 Mercado', [4, 1, 'S'], { id: 'tienda3' });
    add('store', '24/7 Playa', [5, 5, 'W'], { id: 'tienda4' });
    add('store', '24/7 Oeste', [0, 2, 'E'], { id: 'tienda5' });
    add('store', '24/7 Puerto', { at: [-152, 245], road: 'puertoOeste' }, { id: 'tienda6' });
    add('store', '24/7 Jardines', { at: [230, -150], road: 'jardines' }, { id: 'tienda7' });
    add('bank', BANKS.puerto.name, [4, 3, 'W'], { id: 'puerto' });
    add('bank', BANKS.colinas.name, { at: [60, -470], road: 'mirador' }, { id: 'colinas' });
    add('bank', BANKS.central.name, [2, 1, 'N'], { id: 'central' });
    add('bank', BANKS.reserva.name, [5, 0, 'W'], { id: 'reserva' });
    add('business', BUSINESSES.cafeteria.name, { at: [252, 238], road: 'paseo' }, { id: 'cafeteria' });
    add('business', BUSINESSES.lavanderia.name, [1, 3, 'E'], { id: 'lavanderia' });
    add('business', BUSINESSES.taller.name, [4, 4, 'N'], { id: 'taller' });
    add('business', BUSINESSES.gasolinera.name, { at: [-262, -12], road: 'oeste' }, { id: 'gasolinera' });
    add('business', BUSINESSES.club.name, [2, 4, 'S'], { id: 'club' });
    add('business', BUSINESSES.almacen.name, { at: [-80, 314], road: 'circunvalacion' }, { id: 'almacen' });
    add('business', BUSINESSES.hotel.name, [1, 1, 'E'], { id: 'hotel' });
    add('business', BUSINESSES.restaurante.name, { at: [200, -436], road: 'mirador' }, { id: 'restaurante' });
    add('business', BUSINESSES.fabrica.name, { at: [-300, -58], road: 'industria' }, { id: 'fabrica' });
    add('business', BUSINESSES.casino.name, [4, 2, 'E'], { id: 'casino' });
    add('business', BUSINESSES.torre.name, { at: [310, -22], road: 'avEste' }, { id: 'torre' });
    add('business', BUSINESSES.nautico.name, { at: [90, 314], road: 'circunvalacion' }, { id: 'nautico' });
    add('hospital', 'Hospital San Rafael', [2, 3, 'N'], { id: 'hospital', passive: true });
    add('police', 'Comisaría', [4, 3, 'S'], { id: 'comisaria', passive: true });
    // Letreros de los personajes de la historia (el marcador lo pone Missions)
    add('mission', 'Taller de Lucho', [3, 2, 'S'], { id: 'lucho', passive: true });
    add('mission', 'Oficina de Vera', [4, 3, 'N'], { id: 'vera', passive: true });
    add('mission', 'Villa Aurelio', [1, 2, 'E'], { id: 'aurelio', passive: true });
    env.poiSpots = this.pois.map((p) => p.pos);

    for (const poi of this.pois) this.buildPoi(poi);
  }

  byId(id) {
    return this.pois.find((p) => p.id === id);
  }

  /** Letrero sobre postes detrás del marcador y marcador en la acera. */
  buildPoi(poi) {
    const scene = this.game.scene;
    if (poi.type === 'bank' || poi.type === 'store' || poi.type === 'safehouse') {
      this.buildFacade(poi);
      poi.marker = createMarker(poi.style.color);
      poi.marker.position.copy(poi.pos);
      scene.add(poi.marker);
      poi.signMat = new THREE.MeshStandardMaterial(); // sin letrero de postes
      return;
    }
    const group = new THREE.Group();
    const signMat = new THREE.MeshStandardMaterial({ map: makeSignTexture(poi.name, poi.style.sign), emissive: 0xffffff, emissiveIntensity: 0.15 });
    poi.signMat = signMat;
    const board = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.15, 0.12), [
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      new THREE.MeshStandardMaterial({ color: 0x222222 }),
      signMat,
      signMat,
    ]);
    board.position.y = 3.4;
    board.castShadow = true;
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const p1 = new THREE.Mesh(postGeo, postMat);
    p1.position.set(1.9, 1.7, 0);
    const p2 = p1.clone();
    p2.position.x = -1.9;
    group.add(board, p1, p2);
    // Detrás del marcador, mirando a la calle
    const back = poi.pos.clone().addScaledVector(poi.normal, -1.35);
    group.position.copy(back);
    group.rotation.y = Math.atan2(poi.normal.x, poi.normal.z);
    scene.add(group);
    poi.sign = group;

    if (!poi.passive) {
      poi.marker = createMarker(poi.style.color);
      poi.marker.position.copy(poi.pos);
      scene.add(poi.marker);
    }
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------
  update(dt) {
    const game = this.game;
    const t = game.time;
    const night = game.env.night;
    if (this.homeLamp) this.homeLamp.material.emissiveIntensity = night * 2.5;
    const cam = game.camera.position;
    for (const poi of this.pois) {
      // Lejos no se dibujan (la niebla ya los tapa): ahorra cientos de llamadas de dibujo
      const d = Math.hypot(poi.pos.x - cam.x, poi.pos.z - cam.z);
      if (poi.facade) poi.facade.visible = d < 330;
      if (poi.sign) poi.sign.visible = d < 220;
      if (poi.marker) for (const c of poi.marker.children) c.visible = d < 140;
      poi.signMat.emissiveIntensity = 0.15 + night * 0.9;
      if (poi.glowMat) poi.glowMat.emissiveIntensity = 0.35 + night * 0.9;
      if (poi.signGlow) poi.signGlow.emissiveIntensity = 0.5 + night * 1.6;
      if (poi.marker) {
        poi.marker.userData.arrow.position.y = 2.2 + Math.sin(t * 3) * 0.15;
        poi.marker.userData.arrow.rotation.y += dt * 2;
        poi.marker.visible = this.isAvailable(poi);
      }
    }

    // Interacción a pie
    this.nearest = null;
    if (game.interaction.state !== 'foot' || game.menus.isOpen || game.interior) return;
    const p = game.player.mesh.position;
    for (const poi of this.pois) {
      if (!poi.marker || !poi.marker.visible) continue;
      if (Math.hypot(p.x - poi.pos.x, p.z - poi.pos.z) < INTERACT_RADIUS) {
        this.nearest = poi;
        break;
      }
    }
    if (this.nearest) {
      game.hud.setPrompt(`Pulsa <kbd>E</kbd> · ${this.promptFor(this.nearest)}`);
      if (game.input.wasPressed('KeyE')) this.interact(this.nearest);
    }
  }

  isAvailable(poi) {
    if (poi.type === 'bank') return this.game.missions.bankAvailable(poi.id);
    return true;
  }

  promptFor(poi) {
    const st = this.game.state;
    switch (poi.type) {
      case 'safehouse':
        return 'Entrar en casa';
      case 'gunshop':
        return 'Armería';
      case 'dealer':
        return 'Concesionario';
      case 'store':
        return `Entrar en ${poi.name}`;
      case 'bank': {
        const cd = this.game.heists.cooldownLeft(poi.id);
        return cd > 0 ? `Entrar en ${poi.name} (cámara vacía: ${Math.ceil(cd)} s)` : `Entrar en ${poi.name}`;
      }
      case 'business':
        return st.businesses.has(poi.id) ? `${poi.name} (tuyo · ${formatMoney(this.game.properties.income(poi.id))}/min)` : `Comprar ${poi.name}`;
      default:
        return poi.name;
    }
  }

  interact(poi) {
    const game = this.game;
    switch (poi.type) {
      case 'store':
      case 'bank':
      case 'safehouse':
        if (game.wanted.level > 0) {
          game.hud.notify('No puedes entrar con la policía detrás. Piérdela primero.');
          break;
        }
        game.interiors.enter(poi);
        break;
      case 'gunshop':
        game.menus.open(this.gunshopMenu(poi));
        break;
      case 'dealer':
        game.menus.open(this.dealerMenu(poi));
        break;
      case 'business':
        game.menus.open(this.businessMenu(poi));
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Menús
  // ------------------------------------------------------------------
  gunshopMenu(poi) {
    const game = this.game;
    const st = game.state;
    const player = game.player;
    return {
      title: poi ? poi.name : 'Armería Plomo',
      subtitle: 'W/S para elegir · E para comprar · Q para salir',
      items: () => {
        const list = [];
        WEAPONS.forEach((w, i) => {
          if (w.melee) return;
          if (!st.ownedWeapons.has(i)) {
            list.push({
              label: w.name,
              detail: `Daño ${w.damage}${w.pellets ? ' ×' + w.pellets : ''} · cargador ${w.mag}${w.explosive ? ' · explosivo' : ''}`,
              price: w.price,
              action: () => {
                st.spend(w.price);
                player.giveWeapon(i);
                player.selectWeapon(i);
                game.emit('weaponBought', { index: i });
                st.save();
                return `${w.name} comprada.`;
              },
            });
          } else {
            list.push({
              label: `Munición: ${w.name}`,
              detail: `+${w.ammoPack} balas · tienes ${player.clip(i)} + ${player.reserve(i)}`,
              price: w.ammoPrice,
              action: () => {
                st.spend(w.ammoPrice);
                player.addAmmo(i, w.ammoPack);
                st.save();
                return `+${w.ammoPack} balas de ${w.name}.`;
              },
            });
          }
        });
        list.push({
          label: 'Chaleco antibalas',
          detail: `Absorbe el 70 % del daño · aguante actual ${Math.round(st.armor)}/100`,
          price: 600,
          disabled: st.armor >= 100,
          action: () => {
            st.spend(600);
            st.armor = 100;
            st.save();
            return 'Chaleco puesto.';
          },
        });
        return list;
      },
    };
  }

  dealerMenu(poi) {
    const game = this.game;
    const st = game.state;
    return {
      title: 'Autos Velasco',
      subtitle: 'Los coches comprados son tuyos: no cuenta como robo y quedan en tu garaje',
      closeOnBuy: true,
      items: () =>
        DEALER_MODELS.map((type) => {
          const c = CATALOG[type];
          const owned = st.cars.filter((car) => car.type === type).length;
          return {
            label: `${c.label} · ${c.kind}`,
            detail: `${Math.round(c.maxSpeed * 3.6)} km/h · tracción ${c.drive === 'awd' ? 'total' : c.drive === 'fwd' ? 'delantera' : 'trasera'}${owned ? ` · ya tienes ${owned}` : ''}`,
            price: c.price,
            action: () => {
              st.spend(c.price);
              const car = st.addCar({ type, color: c.colors[Math.floor(Math.random() * c.colors.length)] });
              st.stats.cars++;
              st.save();
              const v = this.spawnOwnedCar(car, poi.park, poi.heading);
              game.hud.notify(`${v.label} es tuyo y te espera en la calle. Personalízalo con P › Mis coches.`);
              game.emit('carBought', { type });
            },
          };
        }),
    };
  }

  businessMenu(poi) {
    const game = this.game;
    const st = game.state;
    const b = BUSINESSES[poi.id];
    const props = game.properties;
    return {
      title: b.name,
      subtitle: () => (st.businesses.has(poi.id) ? `Tuyo · nivel "${LEVELS[props.level(poi.id)].name}" · ${formatMoney(props.income(poi.id))} por minuto` : `Genera ${formatMoney(b.income)} por minuto desde el primer minuto`),
      items: () => {
        if (!st.businesses.has(poi.id)) {
          return [
            {
              label: `Comprar ${b.name}`,
              detail: `${formatMoney(b.income)}/min · se amortiza en ${Math.ceil(b.price / b.income)} minutos`,
              price: b.price,
              action: () => (props.buy(poi.id) ? `${b.name} ya es tuyo. Cobras cada minuto.` : 'No te llega el dinero.'),
            },
          ];
        }
        return props.businessDetail(poi.id).items();
      },
    };
  }

  /**
   * Aparca un coche en la calle. Con una ficha de coche propio ({ id, type, color... }) el coche es tuyo:
   * no cuenta como robo y, si ya estaba en la calle, se mueve en vez de duplicarse.
   * Con un tipo ('sport') es un coche cualquiera (misiones).
   */
  spawnOwnedCar(typeOrCar, pos, heading) {
    const game = this.game;
    const car = typeof typeOrCar === 'object' ? typeOrCar : null;
    const type = car ? car.type : typeOrCar;
    if (car) {
      const existing = game.vehicles.find((v) => v.ownedCar && v.ownedCar.id === car.id);
      if (existing && existing.driver !== 'player') existing.removeFromWorld();
      if (existing && existing.driver === 'player') return existing;
    }
    // Aparta cualquier coche sin conductor que ocupe la plaza
    for (const v of [...game.vehicles]) {
      if (v.driver !== 'player' && Math.hypot(v.position.x - pos.x, v.position.z - pos.z) < 5) {
        if (v.driver === 'ai') game.traffic.release(v);
        v.removeFromWorld();
      }
    }
    const v = new VehicleController(game, { type, position: pos, heading });
    v.playerOwned = true;
    if (car) {
      v.ownedCar = car;
      v.applyStyle(car);
    }
    v.addToWorld();
    return v;
  }

  // ------------------------------------------------------------------
  // Fachadas propias: banco, tienda 24/7 y tu casa
  // ------------------------------------------------------------------
  /**
   * Construye el edificio del lugar sobre el solar que hay detrás del marcador.
   * Coordenadas locales: +Z = hacia la calle (normal), X = a lo largo de la acera, origen en la fachada.
   */
  buildFacade(poi) {
    const game = this.game;
    const env = game.env;
    const dims = { bank: [20, 16, 13], store: [12, 10, 5.2], safehouse: [12, 12, 10.5] }[poi.type];
    const [W, D, H] = dims;
    const n = poi.normal;
    const front = poi.pos.clone().addScaledVector(n, -CITY.SIDEWALK / 2); // línea de fachada
    const center = front.clone().addScaledVector(n, -D / 2);
    const yaw = Math.atan2(n.x, n.z);
    const rect = Environment.obbAABB({ x: center.x, z: center.z, hx: W / 2, hz: D / 2, yaw });
    env.removeBuildingsIn({ minX: rect.minX - 0.5, maxX: rect.maxX + 0.5, minZ: rect.minZ - 0.5, maxZ: rect.maxZ + 0.5 });

    const group = new THREE.Group();
    group.position.copy(front);
    group.rotation.y = yaw;
    game.scene.add(group);
    const meshes = [];
    const add = (geo, material, x, y, z, collider = true) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      if (collider) meshes.push(m);
      return m;
    };
    const box = (w, h, d, material, x, y, z, collider) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z, collider);
    const M = (o) => new THREE.MeshStandardMaterial(o);
    const darkGlass = M({ color: 0x0f161c, metalness: 0.9, roughness: 0.08, envMapIntensity: 1.3 });
    const trim = M({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });

    // Cuerpo principal con textura en metros
    const shell = (material, tileW, tileH) => {
      const geo = new THREE.BoxGeometry(W, H, D);
      Environment.meterUV(geo, W, H, D, tileW, tileH);
      return add(geo, material, 0, H / 2, -D / 2);
    };

    if (poi.type === 'bank') {
      const stone = stoneTexture(Math.random, poi.id === 'reserva' ? [200, 196, 188] : [226, 216, 196]);
      shell(M({ map: stone, roughness: 0.75 }), 4, 2);
      const stoneMat = M({ map: stone, roughness: 0.6 });
      // Escalinata
      for (let k = 0; k < 3; k++) box(11 - k * 0.6, 0.18, 1.2 - k * 0.4, stoneMat, 0, 0.09 + k * 0.18, 0.6 - k * 0.2, false);
      // Pórtico: columnas, entablamento con rótulo y frontón
      const colGeo = new THREE.CylinderGeometry(0.42, 0.48, 8.2, 20);
      for (const x of [-4.2, -1.4, 1.4, 4.2]) {
        add(colGeo, stoneMat, x, 4.6, 0.9);
        box(1.1, 0.3, 1.1, stoneMat, x, 0.6, 0.9, false);
        box(1.1, 0.3, 1.1, stoneMat, x, 8.75, 0.9, false);
      }
      const title = poi.name.toUpperCase();
      const frieze = signTexture(title, '#d8ccb4', '#3a2e1c', { border: false, font: 'Georgia, "Times New Roman", serif' });
      box(11, 1.3, 2.4, [stoneMat, stoneMat, stoneMat, stoneMat, M({ map: frieze, roughness: 0.7 }), stoneMat], 0, 9.55, 0.2);
      const tri = new THREE.Shape();
      tri.moveTo(-5.8, 0);
      tri.lineTo(5.8, 0);
      tri.lineTo(0, 2.2);
      tri.closePath();
      const ped = new THREE.ExtrudeGeometry(tri, { depth: 2.2, bevelEnabled: false });
      add(ped, stoneMat, 0, 10.2, -0.9, false);
      // Puertas de madera con herrajes y ventanales laterales
      box(3.2, 4.2, 0.12, M({ color: 0x3b2414, roughness: 0.5 }), 0, 2.45, 0.06, false);
      box(0.08, 4.2, 0.14, M({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }), 0, 2.45, 0.08, false);
      for (const x of [-7.5, 7.5]) {
        for (const y of [3.2, 7.4]) {
          box(2.2, 2.8, 0.12, darkGlass, x, y, 0.04, false);
          box(2.5, 0.2, 0.3, stoneMat, x, y - 1.5, 0.12, false);
        }
      }
      box(W + 0.6, 0.6, D + 0.6, stoneMat, 0, H + 0.3, -D / 2, false); // cornisa
    } else if (poi.type === 'store') {
      shell(M({ map: wallTexture('#d8d2c6'), roughness: 0.85 }), 4, 4);
      // Escaparate iluminado
      const glow = toTexture(
        makeCanvas(256, 128, (ctx) => {
          ctx.fillStyle = '#fff4dc';
          ctx.fillRect(0, 0, 256, 128);
          const colors = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00'];
          for (let row = 0; row < 3; row++) {
            ctx.fillStyle = '#9e9e9e';
            ctx.fillRect(0, 40 + row * 34, 256, 3);
            for (let x = 4; x < 252; x += 14) {
              ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
              ctx.fillRect(x, 14 + row * 34, 10, 24);
            }
          }
          addNoise(ctx, 256, 128, 8);
        }),
        { repeat: false }
      );
      const windowMat = M({ color: 0x9fb4bf, map: glow, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.3 });
      poi.glowMat = windowMat;
      box(W - 1, 2.9, 0.1, windowMat, 0, 1.75, 0.05, false);
      box(W - 0.8, 0.12, 0.2, trim, 0, 3.25, 0.1, false);
      for (const x of [-W / 2 + 0.5, -1.4, 1.4, W / 2 - 0.5]) box(0.12, 3, 0.2, trim, x, 1.7, 0.1, false);
      box(2.2, 2.6, 0.12, M({ color: 0x9fb4bf, metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.6 }), 0, 1.3, 0.12, false);
      // Toldo a rayas
      const stripes = toTexture(
        makeCanvas(128, 32, (ctx) => {
          for (let x = 0; x < 128; x += 16) {
            ctx.fillStyle = (x / 16) % 2 ? '#f5f5f5' : '#c62828';
            ctx.fillRect(x, 0, 16, 32);
          }
        })
      );
      stripes.repeat.set(3, 1);
      const awning = box(W - 0.4, 0.08, 1.8, M({ map: stripes, roughness: 0.9, side: THREE.DoubleSide }), 0, 3.5, 0.9, false);
      awning.rotation.x = 0.3;
      // Rótulo luminoso
      const signTex = signTexture(poi.name.toUpperCase(), '#b71c1c', '#fff');
      const signMat = M({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.5 });
      poi.signGlow = signMat;
      box(8, 1.2, 0.3, [trim, trim, trim, trim, signMat, trim], 0, 4.4, 0.15, false);
    } else {
      // Tu casa: adosado moderno
      const render = M({ map: wallTexture('#ece7de'), roughness: 0.8 });
      shell(render, 4, 4);
      const woodTex = toTexture(
        makeCanvas(128, 128, (ctx) => {
          for (let y = 0; y < 128; y += 8) {
            const t = 0.85 + Math.random() * 0.25;
            ctx.fillStyle = `rgb(${120 * t},${78 * t},${46 * t})`;
            ctx.fillRect(0, y, 128, 7);
          }
          addNoise(ctx, 128, 128, 10);
        })
      );
      woodTex.repeat.set(2, 3);
      box(4.4, H - 0.4, 0.15, M({ map: woodTex, roughness: 0.7 }), -3.6, H / 2, 0.08, false);
      // Puerta con marquesina y aplique
      box(1.3, 2.4, 0.12, M({ color: 0x1f2a30, roughness: 0.4 }), 1.2, 1.2, 0.07, false);
      box(2.6, 0.12, 1.4, trim, 1.2, 2.75, 0.7, false);
      this.homeLamp = box(0.15, 0.3, 0.15, M({ color: 0xffffff, emissive: 0xffd89a, emissiveIntensity: 0 }), 2.2, 2.2, 0.12, false);
      // Garaje
      const garageTex = toTexture(
        makeCanvas(128, 128, (ctx) => {
          ctx.fillStyle = '#b8bcc0';
          ctx.fillRect(0, 0, 128, 128);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          for (let y = 0; y < 128; y += 16) ctx.fillRect(0, y, 128, 2);
          addNoise(ctx, 128, 128, 8);
        })
      );
      box(3.4, 2.6, 0.12, M({ map: garageTex, metalness: 0.5, roughness: 0.4 }), 4.2, 1.3, 0.07, false);
      // Ventanas y balcón con barandilla de cristal
      for (const [x, y, w] of [[1.2, 5.2, 2.4], [4.2, 5.2, 2.4], [2.7, 8.3, 5.4]]) {
        box(w, 2, 0.1, darkGlass, x, y, 0.06, false);
        box(w + 0.2, 0.12, 0.25, trim, x, y - 1.05, 0.12, false);
      }
      box(6.4, 0.2, 1.4, render, 2.7, 6.9, 0.7, false);
      box(6.4, 0.9, 0.04, M({ color: 0xa8c4d0, transparent: true, opacity: 0.35, roughness: 0.05 }), 2.7, 7.45, 1.38, false);
      box(W + 0.4, 0.4, D + 0.4, trim, 0, H + 0.2, -D / 2, false);
    }

    group.updateMatrixWorld(true);
    const body = new CANNON.Body({ mass: 0, collisionFilterGroup: GROUPS.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(W / 2, H / 2, D / 2)));
    body.position.set(center.x, H / 2, center.z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), yaw);
    env.registerStructure(meshes, rect, body);
    poi.facade = group;
  }
}
