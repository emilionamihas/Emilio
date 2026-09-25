import * as THREE from 'three';
import { CITY } from './Environment.js';
import { WEAPONS } from './PlayerController.js';
import { CATALOG, DEALER_MODELS, VehicleController } from './VehicleController.js';
import { formatMoney } from './GameState.js';

const INTERACT_RADIUS = 2.2;
const INCOME_PERIOD = 20; // segundos de juego = 1 hora del reloj a velocidad normal

export const BANKS = {
  puerto: { name: 'Banco del Puerto', duration: 15, loot: [12000, 18000], startLevel: 2, endLevel: 3, cooldown: 300 },
  central: { name: 'Banco Central', duration: 25, loot: [35000, 50000], startLevel: 3, endLevel: 4, cooldown: 420 },
  reserva: { name: 'Reserva Federal', duration: 35, loot: [110000, 150000], startLevel: 4, endLevel: 5, cooldown: 600 },
};

export const BUSINESSES = {
  lavanderia: { name: 'Lavandería Espuma', price: 8000, income: 120 },
  taller: { name: 'Taller Pistón', price: 15000, income: 220 },
  club: { name: 'Club Neón', price: 30000, income: 450 },
  hotel: { name: 'Hotel Marina', price: 60000, income: 900 },
  casino: { name: 'Casino Sombra', price: 150000, income: 2500 },
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
    this.incomeTimer = 0;
    this.incomeAccum = 0;
    this.incomeNotifyTimer = 0;
    this.garageCar = null;
    this.nearest = null;

    const add = (type, name, bi, bj, side, data = {}) => {
      const spot = sidewalkSpot(bi, bj, side);
      const poi = { id: data.id || name, type, name, ...spot, ...data, style: TYPE_STYLE[type] };
      this.pois.push(poi);
      return poi;
    };

    add('safehouse', 'Tu casa', 3, 3, 'W', { id: 'casa' });
    add('gunshop', 'Armería Plomo', 2, 3, 'E', { id: 'armeria' });
    add('dealer', 'Autos Velasco', 3, 4, 'W', { id: 'concesionario' });
    add('store', '24/7 Centro', 3, 2, 'W', { id: 'tienda1' });
    add('store', '24/7 Norte', 1, 4, 'N', { id: 'tienda2' });
    add('store', '24/7 Mercado', 4, 1, 'S', { id: 'tienda3' });
    add('store', '24/7 Playa', 5, 5, 'W', { id: 'tienda4' });
    add('store', '24/7 Oeste', 0, 2, 'E', { id: 'tienda5' });
    add('bank', BANKS.puerto.name, 4, 3, 'W', { id: 'puerto' });
    add('bank', BANKS.central.name, 2, 2, 'N', { id: 'central' });
    add('bank', BANKS.reserva.name, 5, 0, 'W', { id: 'reserva' });
    add('business', BUSINESSES.lavanderia.name, 1, 3, 'E', { id: 'lavanderia' });
    add('business', BUSINESSES.taller.name, 4, 4, 'N', { id: 'taller' });
    add('business', BUSINESSES.club.name, 2, 4, 'S', { id: 'club' });
    add('business', BUSINESSES.hotel.name, 1, 1, 'E', { id: 'hotel' });
    add('business', BUSINESSES.casino.name, 4, 2, 'E', { id: 'casino' });
    add('hospital', 'Hospital San Rafael', 2, 3, 'N', { id: 'hospital', passive: true });
    add('police', 'Comisaría', 4, 3, 'S', { id: 'comisaria', passive: true });
    // Letreros de los personajes de la historia (el marcador lo pone Missions)
    add('mission', 'Taller de Lucho', 3, 2, 'S', { id: 'lucho', passive: true });
    add('mission', 'Oficina de Vera', 4, 3, 'N', { id: 'vera', passive: true });
    add('mission', 'Villa Aurelio', 1, 2, 'E', { id: 'aurelio', passive: true });

    for (const poi of this.pois) this.buildPoi(poi);
  }

  byId(id) {
    return this.pois.find((p) => p.id === id);
  }

  /** Letrero sobre postes detrás del marcador y marcador en la acera. */
  buildPoi(poi) {
    const scene = this.game.scene;
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
    for (const poi of this.pois) {
      poi.signMat.emissiveIntensity = 0.15 + night * 0.9;
      if (poi.marker) {
        poi.marker.userData.arrow.position.y = 2.2 + Math.sin(t * 3) * 0.15;
        poi.marker.userData.arrow.rotation.y += dt * 2;
        poi.marker.visible = this.isAvailable(poi);
      }
    }

    this.updateIncome(dt);

    // Interacción a pie
    this.nearest = null;
    if (game.interaction.state !== 'foot' || game.menus.isOpen || game.heists.active) return;
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
        return 'Casa: guardar, garaje y descansar';
      case 'gunshop':
        return 'Armería';
      case 'dealer':
        return 'Concesionario';
      case 'store':
        return `Atracar ${poi.name}`;
      case 'bank': {
        const cd = this.game.heists.cooldownLeft(poi.id);
        return cd > 0 ? `${poi.name}: cámara vacía, vuelve en ${Math.ceil(cd)} s` : `Atracar ${poi.name}`;
      }
      case 'business':
        return st.businesses.has(poi.id) ? `${poi.name} (tuyo)` : `Comprar ${poi.name}`;
      default:
        return poi.name;
    }
  }

  interact(poi) {
    const game = this.game;
    switch (poi.type) {
      case 'store':
      case 'bank':
        game.heists.start(poi);
        break;
      case 'gunshop':
        game.menus.open(this.gunshopMenu());
        break;
      case 'dealer':
        game.menus.open(this.dealerMenu(poi));
        break;
      case 'business':
        game.menus.open(this.businessMenu(poi));
        break;
      case 'safehouse':
        game.menus.open(this.safehouseMenu());
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Menús
  // ------------------------------------------------------------------
  gunshopMenu() {
    const game = this.game;
    const st = game.state;
    const player = game.player;
    return {
      title: 'Armería Plomo',
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
          const owned = st.cars.includes(type);
          return {
            label: `${c.label} · ${c.kind}`,
            detail: `${Math.round(c.maxSpeed * 3.6)} km/h · tracción ${c.drive === 'awd' ? 'total' : c.drive === 'fwd' ? 'delantera' : 'trasera'}${owned ? ' · ya en tu garaje (compra otro)' : ''}`,
            price: c.price,
            action: () => {
              st.spend(c.price);
              if (!owned) st.cars.push(type);
              st.stats.cars++;
              st.save();
              const v = this.spawnOwnedCar(type, poi.park, poi.heading);
              game.hud.notify(`${v.label} te espera en la calle. Pulsa F para subir.`);
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
    return {
      title: b.name,
      subtitle: st.businesses.has(poi.id) ? 'Este negocio es tuyo. Ingresa dinero cada hora de juego.' : 'Cada negocio ingresa dinero automáticamente cada hora de juego.',
      closeOnBuy: false,
      items: () => [
        {
          label: st.businesses.has(poi.id) ? 'Negocio en propiedad' : `Comprar ${b.name}`,
          detail: `Ingresos: ${formatMoney(b.income)} por hora · se paga en ${Math.ceil(b.price / b.income)} horas`,
          price: st.businesses.has(poi.id) ? null : b.price,
          owned: st.businesses.has(poi.id),
          disabled: st.businesses.has(poi.id),
          action: () => {
            st.spend(b.price);
            st.businesses.add(poi.id);
            st.save();
            game.emit('businessBought', { id: poi.id });
            return `${b.name} ya es tuyo.`;
          },
        },
      ],
    };
  }

  safehouseMenu() {
    const game = this.game;
    const st = game.state;
    const home = this.byId('casa');
    return {
      title: 'Tu casa',
      subtitle: () => `Negocios: ${st.businesses.size} · Coches: ${st.cars.length} · Ganado en total: ${formatMoney(st.stats.earned)}`,
      closeOnBuy: true,
      items: () => {
        const list = [
          {
            label: 'Guardar partida',
            detail: 'La historia también se guarda sola al terminar cada misión',
            tag: 'GRATIS',
            action: () => {
              st.save();
              game.hud.notify('Partida guardada.');
            },
          },
          {
            label: 'Descansar',
            detail: 'Recupera toda la vida y adelanta el reloj 6 horas',
            tag: 'GRATIS',
            disabled: game.wanted.level > 0,
            action: () => {
              game.player.health = 100;
              game.env.timeOfDay = (game.env.timeOfDay + 6) % 24;
              game.hud.notify('Has descansado. Vida al máximo.');
            },
          },
        ];
        for (const type of st.cars) {
          const c = CATALOG[type];
          list.push({
            label: `Sacar del garaje: ${c.label}`,
            detail: c.kind,
            tag: 'GARAJE',
            action: () => {
              if (this.garageCar && this.garageCar.driver !== 'player') this.garageCar.removeFromWorld();
              this.garageCar = this.spawnOwnedCar(type, home.park, home.heading);
              game.hud.notify(`${this.garageCar.label} listo frente a tu casa.`);
            },
          });
        }
        return list;
      },
    };
  }

  spawnOwnedCar(type, pos, heading) {
    const game = this.game;
    // Aparta cualquier coche sin conductor que ocupe la plaza
    for (const v of [...game.vehicles]) {
      if (v.driver !== 'player' && Math.hypot(v.position.x - pos.x, v.position.z - pos.z) < 5) {
        if (v.driver === 'ai') game.traffic.release(v);
        v.removeFromWorld();
      }
    }
    const v = new VehicleController(game, { type, position: pos, heading });
    v.playerOwned = true;
    v.addToWorld();
    return v;
  }

  // ------------------------------------------------------------------
  // Ingresos de negocios
  // ------------------------------------------------------------------
  hourlyIncome() {
    let total = 0;
    for (const id of this.game.state.businesses) total += BUSINESSES[id].income;
    return total;
  }

  updateIncome(dt) {
    const income = this.hourlyIncome();
    if (!income) return;
    this.incomeTimer += dt;
    if (this.incomeTimer >= INCOME_PERIOD) {
      this.incomeTimer -= INCOME_PERIOD;
      this.game.state.addMoney(income);
      this.incomeAccum += income;
    }
    this.incomeNotifyTimer += dt;
    if (this.incomeNotifyTimer > 60 && this.incomeAccum > 0) {
      this.game.hud.notify(`Tus negocios han ingresado ${formatMoney(this.incomeAccum)}.`);
      this.game.hud.moneyDelta(this.incomeAccum);
      this.incomeAccum = 0;
      this.incomeNotifyTimer = 0;
      this.game.state.save();
    }
  }
}
