import * as THREE from 'three';
import { formatMoney } from './GameState.js';
import { CATALOG } from './VehicleController.js';
import { OUTFITS } from './HumanModel.js';

/** Negocios: ingresos por MINUTO de juego (nivel 1). Se cobran en dos pagos, cada 30 s. */
export const BUSINESSES = {
  cafeteria: { name: 'Café Brisa', price: 5000, income: 700, zone: 'La Playa' },
  lavanderia: { name: 'Lavandería Espuma', price: 8000, income: 1000, zone: 'Centro' },
  taller: { name: 'Taller Pistón', price: 15000, income: 1800, zone: 'Centro' },
  gasolinera: { name: 'Gasolinera Ruta 9', price: 22000, income: 2600, zone: 'Avenida Oeste' },
  club: { name: 'Club Neón', price: 30000, income: 3600, zone: 'Centro' },
  almacen: { name: 'Almacenes del Puerto', price: 45000, income: 5200, zone: 'El Puerto' },
  hotel: { name: 'Hotel Marina', price: 60000, income: 7000, zone: 'Centro' },
  restaurante: { name: 'Restaurante Vista', price: 85000, income: 9800, zone: 'Colinas' },
  fabrica: { name: 'Fábrica Hierro', price: 110000, income: 12500, zone: 'Polígono' },
  casino: { name: 'Casino Sombra', price: 150000, income: 16000, zone: 'Centro' },
  torre: { name: 'Torre Delta', price: 260000, income: 27000, zone: 'Avenida del Este' },
  nautico: { name: 'Club Náutico', price: 420000, income: 42000, zone: 'La Playa' },
};

/** Colores de pintura y de ropa (nombre, hex). */
export const PALETTE = [
  ['Blanco', 0xf2f2f2], ['Negro', 0x111111], ['Plata', 0xa9b0b6], ['Gris', 0x4a4f55],
  ['Rojo', 0xc62828], ['Granate', 0x6d1b1b], ['Naranja', 0xef6c00], ['Amarillo', 0xf9c80e],
  ['Verde', 0x2e7d32], ['Lima', 0x76ff03], ['Azul', 0x1565c0], ['Celeste', 0x4fc3f7],
  ['Morado', 0x6a1b9a], ['Rosa', 0xec407a], ['Marrón', 0x5d4037], ['Beige', 0xc8b28c],
];
const SKINS = [['Clara', 0xffdbac], ['Media clara', 0xf1c27d], ['Media', 0xe0ac69], ['Morena', 0xc68642], ['Oscura', 0x8d5524], ['Muy oscura', 0x5c3a1e]];
const HAIRS = [['Negro', 0x1b1b1b], ['Castaño oscuro', 0x3b2314], ['Castaño', 0x6b4423], ['Pelirrojo', 0xa0522d], ['Rubio', 0xd6b370], ['Canoso', 0x9e9e9e], ['Azul', 0x1e88e5], ['Rosa', 0xf06292]];
const CAR_DESIGNS = [['liso', 'Liso'], ['franjas', 'Franjas dobles'], ['racing', 'Racing (franja ancha y laterales)'], ['bicolor', 'Bicolor (techo y faldón)']];
const CAR_FINISHES = [['brillo', 'Brillo'], ['metalizado', 'Metalizado'], ['mate', 'Mate']];
const PAINT_PRICE = 300;

const swatch = (hex) => `<span class="swatch" style="background:#${hex.toString(16).padStart(6, '0')}"></span>`;

/** Mejoras: multiplicador de ingresos y coste (fracción del precio del negocio). */
export const LEVELS = [
  null,
  { name: 'Básico', mult: 1 },
  { name: 'Reformado', mult: 1.6, cost: 0.6 },
  { name: 'De lujo', mult: 2.4, cost: 1.2 },
];

const PAY_EVERY = 30; // segundos (medio minuto de ingresos por pago)
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
      const pay = Math.round((perMin * PAY_EVERY) / 60);
      this.state.addMoney(pay);
      this.state.stats.businessIncome = (this.state.stats.businessIncome || 0) + pay;
      this.game.hud.moneyDelta(pay);
      this.game.hud.notify(`Tus negocios han ingresado ${formatMoney(pay)}.`, 2);
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
    this.game.map.setDestination(pos, label);
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
          label: 'Quitar ruta del GPS',
          detail: this.game.waypoint ? this.game.waypoint.label : 'No hay ningún destino marcado',
          tag: '',
          disabled: !this.game.waypoint,
          action: () => {
            this.game.waypoint = null;
            this.game.route = null;
            return 'Ruta borrada.';
          },
        },
        // Solo desde el ordenador de casa: una línea de comandos sin más explicación
        ...(this.game.interior && this.game.interior.inst.key === 'house'
          ? [{ label: '>_', detail: '', tag: '', action: () => this.game.cheats.showPrompt() }]
          : []),
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

  carLabel(car) {
    const c = CATALOG[car.type];
    const design = CAR_DESIGNS.find(([id]) => id === car.design);
    return `${car.color != null ? swatch(car.color) : ''}${c.label} · ${c.kind}${design && car.design !== 'liso' ? ' · ' + design[1].split(' ')[0] : ''}`;
  }

  carsMenu() {
    const st = this.state;
    return {
      title: 'Mis coches',
      subtitle: () => 'Son tuyos: usarlos no es delito. Elige uno para traerlo o personalizarlo.',
      items: () => {
        const list = st.cars.map((car) => ({
          label: this.carLabel(car),
          detail: `${Math.round(CATALOG[car.type].maxSpeed * 3.6)} km/h · ${this.findVehicle(car) ? 'en la calle' : 'en el garaje'}`,
          submenu: () => this.carDetail(car),
        }));
        list.push({
          label: 'Comprar otro coche',
          detail: 'Marca Autos Velasco en el GPS',
          tag: 'GPS',
          action: () => {
            this.setWaypoint(this.game.locations.byId('concesionario').pos, 'Autos Velasco');
            return 'Autos Velasco marcado en el GPS.';
          },
        });
        return list;
      },
    };
  }

  findVehicle(car) {
    return this.game.vehicles.find((v) => v.ownedCar && v.ownedCar.id === car.id && !v.destroyed);
  }

  /** Aplica el cambio a la ficha y al coche si está en la calle. */
  restyle(car, changes) {
    if (!this.state.spend(PAINT_PRICE)) return `Te faltan ${formatMoney(PAINT_PRICE - this.state.money)}.`;
    Object.assign(car, changes);
    const v = this.findVehicle(car);
    if (v) v.applyStyle(car);
    this.state.save();
    return 'Hecho. ¡Queda genial!';
  }

  carDetail(car) {
    const atHome = () => this.game.interior && this.game.interior.inst.key === 'house';
    const colorMenu = (field, title) => () => ({
      title,
      subtitle: `${formatMoney(PAINT_PRICE)} por cambio`,
      items: () =>
        PALETTE.map(([name, hex]) => ({
          label: `${swatch(hex)}${name}`,
          detail: car[field] === hex ? 'Color actual' : '',
          price: PAINT_PRICE,
          action: () => this.restyle(car, { [field]: hex }),
        })),
    });
    return {
      title: CATALOG[car.type].label,
      subtitle: () => `Tu ${CATALOG[car.type].kind.toLowerCase()}: nadie te busca por conducirlo`,
      items: () => [
        {
          label: atHome() ? 'Sacarlo a la puerta de casa' : 'Traerlo hasta aquí',
          detail: atHome() ? 'Gratis: te espera al salir' : `Un mecánico lo aparca en la calle más cercana`,
          price: atHome() ? null : DELIVERY_FEE,
          tag: atHome() ? 'GRATIS' : undefined,
          action: () => this.deliverCar(car),
        },
        { label: 'Pintura', detail: 'Color principal', submenu: colorMenu('color', 'Pintura') },
        { label: 'Segundo color', detail: 'Para franjas, racing y bicolor', submenu: colorMenu('color2', 'Segundo color') },
        {
          label: 'Dibujo',
          detail: CAR_DESIGNS.find(([id]) => id === car.design)?.[1] || 'Liso',
          submenu: () => ({
            title: 'Dibujo',
            subtitle: `${formatMoney(PAINT_PRICE)} por cambio`,
            items: () => CAR_DESIGNS.map(([id, name]) => ({ label: name, detail: car.design === id ? 'Actual' : '', price: PAINT_PRICE, action: () => this.restyle(car, { design: id }) })),
          }),
        },
        {
          label: 'Acabado',
          detail: CAR_FINISHES.find(([id]) => id === car.finish)?.[1] || 'Brillo',
          submenu: () => ({
            title: 'Acabado',
            subtitle: `${formatMoney(PAINT_PRICE)} por cambio`,
            items: () => CAR_FINISHES.map(([id, name]) => ({ label: name, detail: car.finish === id ? 'Actual' : '', price: PAINT_PRICE, action: () => this.restyle(car, { finish: id }) })),
          }),
        },
      ],
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

  /** Trae un coche propio: gratis a la puerta de casa (desde dentro) o a la calle más cercana por 250. */
  deliverCar(car) {
    const game = this.game;
    const home = game.locations.byId('casa');
    if (game.interior) {
      if (game.interior.inst.key !== 'house') return 'Sal a la calle para que te lo traigan.';
      game.locations.spawnOwnedCar(car, home.park, home.heading);
      game.menus.close();
      return 'Te espera en la puerta de casa.';
    }
    if (game.interaction.state !== 'foot') return 'Bájate del vehículo primero.';
    if (!this.state.spend(DELIVERY_FEE)) return 'No tienes dinero para la entrega.';
    const p = game.player.mesh.position;
    const env = game.env;
    // Plaza en el carril derecho de la calle más cercana
    const { pos, heading } = env.parkingNear(p);
    game.locations.spawnOwnedCar(car, pos, heading);
    game.menus.close();
    game.hud.notify(`${CATALOG[car.type].label} aparcado cerca de ti.`);
    return 'Entregado.';
  }

  /** Cambia el aspecto (se guarda y se aplica al instante). */
  setLook(changes) {
    Object.assign(this.state.look, changes);
    this.state.outfit = 'custom';
    this.game.player.applyLook(this.state.look);
    this.state.save();
    this.game.previewPlayer();
  }

  wardrobeMenu() {
    const look = this.state.look;
    const colorList = (field, title, list = PALETTE) => () => ({
      title,
      subtitle: 'Elige un color',
      items: () => list.map(([name, hex]) => ({ label: `${swatch(hex)}${name}`, tag: look[field] === hex ? 'PUESTO' : '', action: () => this.setLook({ [field]: hex }) })),
    });
    const styleList = (field, title, options) => () => ({
      title,
      subtitle: 'Elige un estilo',
      items: () => options.map(([id, name]) => ({ label: name, tag: look[field] === id ? 'PUESTO' : '', action: () => this.setLook({ [field]: id }) })),
    });
    const player = this.game.player;
    return {
      title: 'Vestidor',
      subtitle: 'Todo se guarda al momento. Q para volver.',
      items: () => [
        { label: 'Parte de arriba', detail: 'Camiseta, polo, camisa, sudadera o tirantes', submenu: styleList('top', 'Parte de arriba', [['camiseta', 'Camiseta'], ['polo', 'Polo'], ['camisa', 'Camisa de manga larga'], ['sudadera', 'Sudadera'], ['tirantes', 'Camiseta de tirantes']]) },
        { label: `${swatch(look.topColor)}Color de arriba`, submenu: colorList('topColor', 'Color de arriba') },
        { label: 'Gorro', detail: 'Gorra, gorra hacia atrás, gorro de lana, sombrero o nada', submenu: styleList('hat', 'Gorro', [['none', 'Sin gorro'], ['gorra', 'Gorra'], ['gorraAtras', 'Gorra hacia atrás'], ['lana', 'Gorro de lana'], ['sombrero', 'Sombrero']]) },
        { label: `${swatch(look.hatColor)}Color del gorro`, submenu: colorList('hatColor', 'Color del gorro') },
        { label: 'Parte de abajo', detail: 'Pantalón largo o short', submenu: styleList('bottom', 'Parte de abajo', [['largo', 'Pantalón largo'], ['short', 'Short']]) },
        { label: `${swatch(look.bottomColor)}Color de abajo`, submenu: colorList('bottomColor', 'Color de abajo') },
        { label: `${swatch(look.shoes)}Zapatillas`, submenu: colorList('shoes', 'Zapatillas') },
        { label: `${swatch(look.skin)}Tono de piel`, submenu: colorList('skin', 'Tono de piel', SKINS) },
        { label: 'Peinado', submenu: styleList('hairStyle', 'Peinado', [['short', 'Corto'], ['long', 'Largo'], ['bun', 'Moño'], ['bald', 'Rapado']]) },
        { label: `${swatch(look.hair)}Color de pelo`, submenu: colorList('hair', 'Color de pelo', HAIRS) },
        {
          label: 'Conjuntos',
          detail: 'Traje, chupa de cuero, chándal, mono de golpe...',
          submenu: () => ({
            title: 'Conjuntos',
            subtitle: 'Ropa completa ya combinada',
            items: () =>
              WARDROBE.map((id) => ({
                label: OUTFITS[id].name,
                detail: id === 'golpe' ? 'Mono y pasamontañas para los atracos' : '',
                tag: player.outfitId === id ? 'PUESTO' : '',
                action: () => {
                  player.setOutfit(id);
                  this.state.outfit = id;
                  this.state.save();
                  this.game.previewPlayer();
                  return `Te has puesto: ${OUTFITS[id].name}.`;
                },
              })),
          }),
        },
      ],
    };
  }
}
