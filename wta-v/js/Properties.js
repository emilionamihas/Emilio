import * as THREE from 'three';
import { formatMoney } from './GameState.js';
import { CATALOG } from './VehicleController.js';
import { OUTFITS } from './HumanModel.js';

/** Negocios: ingresos por MINUTO de juego (nivel 1). */
export const BUSINESSES = {
  lavanderia: { name: 'Lavandería Espuma', price: 8000, income: 250 },
  taller: { name: 'Taller Pistón', price: 15000, income: 450 },
  club: { name: 'Club Neón', price: 30000, income: 900 },
  hotel: { name: 'Hotel Marina', price: 60000, income: 1700 },
  casino: { name: 'Casino Sombra', price: 150000, income: 4000 },
};

/** Mejoras: multiplicador de ingresos y coste (fracción del precio del negocio). */
export const LEVELS = [
  null,
  { name: 'Básico', mult: 1 },
  { name: 'Reformado', mult: 1.6, cost: 0.6 },
  { name: 'De lujo', mult: 2.4, cost: 1.2 },
];

const PAY_EVERY = 60; // segundos
const OFFLINE_CAP_MIN = 60;
const DELIVERY_FEE = 250;
const WARDROBE = ['calle', 'cuero', 'traje', 'deporte', 'verano', 'golpe'];

export class Properties {
  constructor(game) {
    this.game = game;
    this.timer = 0;
  }

  get state() {
    return this.game.state;
  }

  level(id) {
    return this.state.bizLevel[id] || 1;
  }

  income(id) {
    return Math.round(BUSINESSES[id].income * LEVELS[this.level(id)].mult);
  }

  perMinute() {
    let t = 0;
    for (const id of this.state.businesses) t += this.income(id);
    return t;
  }

  buy(id) {
    const b = BUSINESSES[id];
    if (!this.state.spend(b.price)) return false;
    this.state.businesses.add(id);
    this.state.bizLevel[id] = 1;
    this.state.save();
    this.game.emit('businessBought', { id });
    return true;
  }

  upgrade(id) {
    const lvl = this.level(id);
    const next = LEVELS[lvl + 1];
    if (!next) return 'Ya está al máximo.';
    const cost = Math.round(BUSINESSES[id].price * next.cost);
    if (!this.state.spend(cost)) return `Te faltan ${formatMoney(cost - this.state.money)}.`;
    this.state.bizLevel[id] = lvl + 1;
    this.state.save();
    return `${BUSINESSES[id].name}: ahora "${next.name}", ${formatMoney(this.income(id))}/min.`;
  }

  /** Pago cada minuto de juego. */
  update(dt) {
    const perMin = this.perMinute();
    if (!perMin) {
      this.timer = 0;
      this.game.hud.setIncomeTimer(0, 0);
      return;
    }
    this.timer += dt;
    this.game.hud.setIncomeTimer(PAY_EVERY - this.timer, perMin);
    if (this.timer >= PAY_EVERY) {
      this.timer -= PAY_EVERY;
      this.state.addMoney(perMin);
      this.state.stats.businessIncome = (this.state.stats.businessIncome || 0) + perMin;
      this.game.hud.moneyDelta(perMin);
      this.game.hud.notify(`Tus negocios han ingresado ${formatMoney(perMin)}.`, 2.5);
      this.state.save();
    }
  }

  /** Al cargar la partida: lo que generaron los negocios mientras no jugabas (50 %, máx. 1 hora). */
  payOffline(savedAt) {
    const perMin = this.perMinute();
    if (!savedAt || !perMin) return;
    const minutes = Math.min(OFFLINE_CAP_MIN, Math.floor((Date.now() - savedAt) / 60000));
    if (minutes < 1) return;
    const amount = Math.round(minutes * perMin * 0.5);
    this.state.addMoney(amount);
    this.game.hud.notify(`Mientras no estabas, tus negocios generaron ${formatMoney(amount)} (${minutes} min).`, 6);
  }

  setWaypoint(pos, label) {
    this.game.waypoint = { pos: pos.clone(), label };
    this.game.hud.notify(`GPS: ${label} marcado en el radar.`, 2.5);
  }

  // ------------------------------------------------------------------
  // Menús
  // ------------------------------------------------------------------
  rootMenu() {
    const st = this.state;
    return {
      title: 'Mis propiedades',
      subtitle: () => `Ingresos: ${formatMoney(this.perMinute())}/min · próximo pago en ${Math.max(0, Math.ceil(PAY_EVERY - this.timer))} s`,
      items: () => [
        { label: 'Negocios', detail: `${st.businesses.size} de ${Object.keys(BUSINESSES).length} en propiedad`, submenu: () => this.businessesMenu() },
        { label: 'Mis coches', detail: `${st.cars.length} en el garaje · entrega donde estés por ${formatMoney(DELIVERY_FEE)}`, submenu: () => this.carsMenu() },
        { label: 'Resumen', detail: 'Dinero ganado, atracos y negocios', submenu: () => this.statsMenu() },
        {
          label: 'Quitar marca del GPS',
          detail: this.game.waypoint ? this.game.waypoint.label : 'No hay ningún destino marcado',
          tag: '',
          disabled: !this.game.waypoint,
          action: () => {
            this.game.waypoint = null;
            return 'Destino borrado.';
          },
        },
      ],
    };
  }

  businessesMenu() {
    const st = this.state;
    return {
      title: 'Negocios',
      subtitle: () => `Total: ${formatMoney(this.perMinute())}/min`,
      items: () =>
        Object.entries(BUSINESSES).map(([id, b]) => {
          const owned = st.businesses.has(id);
          if (owned) {
            const lvl = this.level(id);
            return {
              label: `${b.name} · ${LEVELS[lvl].name}`,
              detail: `${formatMoney(this.income(id))}/min${LEVELS[lvl + 1] ? ` · mejora a "${LEVELS[lvl + 1].name}": ${formatMoney(BUSINESSES[id].income * LEVELS[lvl + 1].mult)}/min` : ' · nivel máximo'}`,
              submenu: () => this.businessDetail(id),
            };
          }
          return {
            label: b.name,
            detail: `En venta · ${formatMoney(b.income)}/min · se amortiza en ${Math.ceil(b.price / b.income)} min`,
            tag: formatMoney(b.price),
            action: () => {
              const poi = this.game.locations.byId(id);
              this.setWaypoint(poi.pos, b.name);
              return `${b.name} marcado en el GPS. Ve allí para comprarlo.`;
            },
          };
        }),
    };
  }

  businessDetail(id) {
    const b = BUSINESSES[id];
    return {
      title: b.name,
      subtitle: () => `Nivel ${this.level(id)}/3 · ${formatMoney(this.income(id))}/min`,
      items: () => {
        const lvl = this.level(id);
        const next = LEVELS[lvl + 1];
        return [
          next
            ? {
                label: `Mejorar a "${next.name}"`,
                detail: `Pasa de ${formatMoney(this.income(id))} a ${formatMoney(Math.round(b.income * next.mult))} por minuto`,
                price: Math.round(b.price * next.cost),
                action: () => this.upgrade(id),
              }
            : { label: 'Nivel máximo', detail: 'Este negocio ya está a tope', tag: '', disabled: true, action: () => {} },
          {
            label: 'Marcar en el GPS',
            detail: 'Muestra la ubicación en el radar',
            tag: 'GPS',
            action: () => {
              this.setWaypoint(this.game.locations.byId(id).pos, b.name);
              return 'Marcado.';
            },
          },
        ];
      },
    };
  }

  carsMenu() {
    const st = this.state;
    return {
      title: 'Mis coches',
      subtitle: () => (st.cars.length ? `Un mecánico te lo trae donde estés por ${formatMoney(DELIVERY_FEE)}` : 'Aún no tienes coches: cómpralos en Autos Velasco (C en el radar)'),
      items: () => {
        if (!st.cars.length) {
          return [
            {
              label: 'Ir al concesionario',
              detail: 'Marca Autos Velasco en el GPS',
              tag: 'GPS',
              action: () => {
                this.setWaypoint(this.game.locations.byId('concesionario').pos, 'Autos Velasco');
                return 'Marcado.';
              },
            },
          ];
        }
        return st.cars.map((type) => {
          const c = CATALOG[type];
          return {
            label: `${c.label} · ${c.kind}`,
            detail: `${Math.round(c.maxSpeed * 3.6)} km/h · tracción ${c.drive === 'awd' ? 'total' : c.drive === 'fwd' ? 'delantera' : 'trasera'}`,
            price: DELIVERY_FEE,
            action: () => this.deliverCar(type),
          };
        });
      },
    };
  }

  statsMenu() {
    const st = this.state;
    const s = st.stats;
    const row = (label, detail) => ({ label, detail, tag: '', disabled: true, action: () => {} });
    return {
      title: 'Resumen',
      subtitle: `Dinero actual: ${formatMoney(st.money)}`,
      items: () => [
        row('Dinero ganado en total', formatMoney(s.earned)),
        row('Ingresos de negocios', formatMoney(s.businessIncome || 0)),
        row('Atracos completados', `${s.robberies} (bancos con botín asegurado: ${s.banks})`),
        row('Coches comprados', String(s.cars)),
        row('Negocios', `${st.businesses.size} · ${formatMoney(this.perMinute())}/min`),
      ],
    };
  }

  /** Trae un coche del garaje a la calle más cercana. */
  deliverCar(type) {
    const game = this.game;
    if (game.interior) return 'Sal a la calle para que te lo traigan.';
    if (game.interaction.state !== 'foot') return 'Bájate del vehículo primero.';
    if (!this.state.spend(DELIVERY_FEE)) return 'No tienes dinero para la entrega.';
    const p = game.player.mesh.position;
    const env = game.env;
    const node = env.nearestNode(p);
    // Tramo desde el cruce más cercano hacia el vecino más cercano al jugador, en el carril derecho
    const next = node.neighbors.map((id) => env.nodes[id]).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
    const dir = new THREE.Vector3().subVectors(next.pos, node.pos).normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    const along = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, node.pos).dot(dir) + 6, 12, 50);
    const pos = node.pos.clone().addScaledVector(dir, along).addScaledVector(right, 6.2);
    const v = game.locations.spawnOwnedCar(type, pos, Math.atan2(dir.x, dir.z));
    game.menus.close();
    return `${v.label} aparcado cerca de ti.`;
  }

  wardrobeMenu() {
    const player = this.game.player;
    return {
      title: 'Armario',
      subtitle: 'Elige qué ponerte',
      items: () =>
        WARDROBE.map((id) => ({
          label: OUTFITS[id].name,
          detail: id === 'golpe' ? 'Mono y pasamontañas para los atracos' : '',
          tag: player.outfitId === id ? 'PUESTO' : '',
          action: () => {
            player.setOutfit(id);
            this.state.outfit = id;
            this.state.save();
            return `Te has puesto: ${OUTFITS[id].name}.`;
          },
        })),
    };
  }
}
