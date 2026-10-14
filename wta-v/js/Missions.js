import * as THREE from 'three';
import { sidewalkSpot, createMarker } from './Locations.js';
import { CITY } from './Environment.js';
import { formatMoney } from './GameState.js';
import { VehicleController } from './VehicleController.js';
import { HumanModel, OUTFITS } from './HumanModel.js';
import { driveTo } from './AITraffic.js';

const rc = (i) => -CITY.HALF + i * CITY.PERIOD;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Parrilla de salida del motocross: muestra de la pista `ahead` metros tras la línea de salida. */
function mxSpot(g, ahead, side = 0) {
  const T = g.env.mxTrack;
  const i = (T.startIdx + ahead + T.N) % T.N;
  const p = T.samples[i];
  const q = T.samples[(i + 1) % T.N];
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const l = Math.hypot(dx, dz) || 1;
  return { pos: v3(p.x - (dz / l) * side, 0, p.z + (dx / l) * side), heading: Math.atan2(dx, dz) };
}
const node = (i, j) => new THREE.Vector3(rc(i), 0, rc(j));

// Puntos fijos de la historia
export const GIVERS = {
  lucho: { name: 'Lucho', place: 'Taller de Lucho', spot: sidewalkSpot(3, 2, 'S') },
  vera: { name: 'Vera', place: 'Oficina de Vera', spot: sidewalkSpot(4, 3, 'N') },
  aurelio: { name: 'Don Aurelio', place: 'Villa Aurelio', spot: sidewalkSpot(1, 2, 'E') },
};

/**
 * Guion. Cada paso es un objetivo; el primero que no se cumple es el activo.
 * Tipos: say, goto, spawnVehicle, getInVehicle, deliver, event, loseWanted, race, destroy
 */
export const STORY = [
  {
    id: 'recien-llegado',
    title: 'Recién llegado',
    giver: 'lucho',
    reward: 1500,
    steps: [
      { type: 'say', lines: ['Lucho: ¿Así que tú eres el sobrino de Ramón? Puerto Sombra no regala nada.', 'Lucho: Tráeme un coche que no sea el tuyo. Me da igual de quién sea. Te pago por la chapa.'] },
      { type: 'getInVehicle', text: 'Roba un coche que no sea tuyo (acércate a uno y pulsa F)', notOwned: true },
      { type: 'deliver', text: 'Lleva el coche robado al taller de Lucho', at: 'lucho', notOwned: true },
      { type: 'say', lines: ['Lucho: No está mal para ser el primero. Vuelve cuando quieras más trabajo.'] },
    ],
  },
  {
    id: 'hierro',
    title: 'Hierro',
    giver: 'lucho',
    reward: 2500,
    steps: [
      { type: 'say', lines: ['Lucho: Sin un hierro en la mano aquí no te respeta nadie.', 'Lucho: Pasa por la Armería Plomo, cómprate una pistola y demuestra que sabes usarla.'] },
      { type: 'event', event: 'weaponBought', text: 'Compra un arma de fuego en la Armería Plomo (A en el radar)', poi: 'armeria', already: (g) => [...g.state.ownedWeapons].some((i) => i > 0) },
      { type: 'event', event: 'storeRobbed', text: 'Atraca cualquier tienda 24/7 (T en el radar) con el arma en la mano' },
      { type: 'loseWanted', text: 'Pierde a la policía' },
      { type: 'say', lines: ['Lucho: Eso es. Rápido y limpio.'] },
    ],
  },
  {
    id: 'pedido-especial',
    title: 'Pedido especial',
    giver: 'lucho',
    reward: 6000,
    timeLimit: 180,
    steps: [
      { type: 'say', lines: ['Lucho: Un cliente quiere un Vento GT amarillo. Hay uno aparcado en el barrio del hotel.', 'Lucho: Tiene alarma. Y lo quiero entero, ¿entendido?'] },
      { type: 'spawnVehicle', vehicle: 'sport', color: 0xffc107, at: sidewalkSpot(1, 1, 'S').park, heading: -Math.PI / 2 },
      { type: 'getInVehicle', text: 'Roba el Vento GT amarillo', tagged: true, alarm: 2 },
      { type: 'deliver', text: 'Lleva el Vento GT al taller de Lucho sin destrozarlo', at: 'lucho', tagged: true },
      { type: 'say', lines: ['Lucho: Precioso. Ni un rasguño... bueno, casi.', 'Lucho: Te he hablado de ti a una amiga, Vera. Ella juega en otra liga.'] },
    ],
  },
  {
    id: 'primer-banco',
    title: 'El primer banco',
    giver: 'vera',
    reward: 3000,
    steps: [
      { type: 'say', lines: ['Vera: Lucho dice que tienes sangre fría. Vamos a comprobarlo.', 'Vera: Banco del Puerto. Entra encañonando, taladra la cámara acorazada y llena la bolsa con los carros.', 'Vera: Y no vengas aquí con la policía detrás: el dinero solo vale si lo pierdes de vista.'] },
      { type: 'event', event: 'bankRobbed', text: 'Atraca el Banco del Puerto ($ en el radar)', poi: 'puerto', filter: (d) => d.id === 'puerto' },
      { type: 'loseWanted', text: 'Pierde a la policía para asegurar el botín', loot: true },
      { type: 'say', lines: ['Vera: Bien hecho. Quédate con tu parte. Pronto hablaremos de cosas grandes.'] },
    ],
  },
  {
    id: 'lavar-dinero',
    title: 'Lavar el dinero',
    giver: 'vera',
    reward: 4000,
    steps: [
      { type: 'say', lines: ['Vera: Tanto efectivo llama la atención. Necesitas un negocio que lo justifique.', 'Vera: La Lavandería Espuma está en venta. Cómprala, o cualquier otro negocio (N en el radar).'] },
      { type: 'event', event: 'businessBought', text: 'Compra un negocio (N en el radar)', poi: 'lavanderia', already: (g) => g.state.businesses.size > 0 },
      { type: 'say', lines: ['Vera: Ahora tus ingresos parecen legales, y el negocio te paga cada minuto. Mira tus cuentas con la tecla P.'] },
    ],
  },
  {
    id: 'chofer',
    title: 'Chófer de huida',
    giver: 'vera',
    reward: 8000,
    steps: [
      { type: 'say', lines: ['Vera: Para el golpe grande necesito un conductor. Te he dejado un Toro en la puerta.', 'Vera: Recorre la ruta de escape antes de que se acabe el tiempo.'] },
      { type: 'spawnVehicle', vehicle: 'muscle', color: 0x111111, at: sidewalkSpot(4, 3, 'N').park, heading: Math.PI / 2 },
      { type: 'getInVehicle', text: 'Sube al Toro negro', tagged: true },
      {
        type: 'race',
        text: 'Pasa por los puntos de control',
        time: 125,
        checkpoints: [node(5, 3), node(5, 5), node(3, 5), node(3, 1), node(1, 1), node(1, 4), node(4, 4), node(4, 3)],
      },
      { type: 'say', lines: ['Vera: Sabes conducir. Eso te hace valioso.'] },
    ],
  },
  {
    id: 'competencia',
    title: 'Competencia',
    giver: 'aurelio',
    reward: 15000,
    steps: [
      { type: 'say', lines: ['Don Aurelio: Así que tú eres el nuevo de Vera. Te pediré un favor.', 'Don Aurelio: Los Morados andan dando vueltas por mi ciudad en sus Toros morados. Tres coches.', 'Don Aurelio: Quiero ver los tres ardiendo. Un subfusil ayuda, un lanzacohetes... ayuda más.'] },
      { type: 'destroy', text: 'Destruye los coches de los Morados', count: 3, vehicle: 'muscle', color: 0x6a1b9a },
      { type: 'loseWanted', text: 'Pierde a la policía' },
      { type: 'say', lines: ['Don Aurelio: Me gustas. Vera tiene algo grande para ti, y yo pongo los contactos.'] },
    ],
  },
  {
    id: 'boveda-central',
    title: 'Bóveda Central',
    giver: 'vera',
    reward: 10000,
    steps: [
      { type: 'say', lines: ['Vera: Banco Central. Tres estrellas en cuanto salgas con la pasta.', 'Vera: Ponte chaleco por si acaso. Al salir tienes unos segundos de ventaja: úsalos.'] },
      { type: 'event', event: 'bankRobbed', text: 'Atraca el Banco Central', poi: 'central', filter: (d) => d.id === 'central' },
      { type: 'loseWanted', text: 'Pierde a la policía para asegurar el botín', loot: true },
      { type: 'say', lines: ['Vera: Ya casi estamos. Solo queda uno... el más grande.'] },
    ],
  },
  {
    id: 'gran-golpe',
    title: 'El Gran Golpe',
    giver: 'vera',
    reward: 50000,
    steps: [
      { type: 'say', lines: ['Vera: La Reserva Federal. Cuatro estrellas. Media ciudad detrás de ti.', 'Don Aurelio: Si sales vivo, esta ciudad es tuya.'] },
      { type: 'event', event: 'bankRobbed', text: 'Atraca la Reserva Federal', poi: 'reserva', filter: (d) => d.id === 'reserva' },
      { type: 'loseWanted', text: 'Sobrevive y pierde a la policía', loot: true },
      { type: 'goto', text: 'Vuelve a casa', poi: 'casa', radius: 3 },
      { type: 'say', lines: ['Vera: Lo hiciste. Nadie había sacado un céntimo de esa cámara.', 'Don Aurelio: Bienvenido a la cima, socio. La ciudad es tuya.', 'Lucho: Oye, campeón. Ahora que eres alguien, tengo trabajos de los divertidos. Pásate por el taller.'] },
    ],
  },
  // ---------------- Segunda parte ----------------
  {
    id: 'barro-y-gloria',
    title: 'Barro y gloria',
    chapter: 'SEGUNDA PARTE',
    giver: 'lucho',
    reward: 12000,
    keepVehicle: true,
    steps: [
      { type: 'say', lines: ['Lucho: Los del Polígono montan carreras ilegales en el motocross de Las Dunas. Apuestas fuertes.', 'Lucho: He puesto tu nombre en la lista. Hay una moto de cross esperándote en la salida.', 'Lucho: Tres rivales, una vuelta. Solo cuenta ganar.'] },
      { type: 'goto', text: 'Ve al circuito de motocross (al oeste, junto a la circunvalación)', pos: (g) => mxSpot(g, 30).pos, label: 'Motocross', radius: 14 },
      { type: 'spawnVehicle', vehicle: 'cross', color: 0xfdd835, gift: true, at: (g) => mxSpot(g, 26, 0) },
      { type: 'getInVehicle', text: 'Súbete a tu moto de cross amarilla', tagged: true },
      { type: 'mxRace', text: 'Gana la carrera', laps: 1, rivals: [[0xd50000, 14.6, 8.4], [0x1e88e5, 15.3, 8.8], [0x43a047, 16.1, 9.2]] },
      { type: 'say', lines: ['Lucho: ¡Primero! He ganado una fortuna apostando por ti.', 'Lucho: Quédate la moto, te la has ganado.'] },
    ],
  },
  {
    id: 'mercancia-fragil',
    title: 'Mercancía frágil',
    giver: 'lucho',
    reward: 9000,
    timeLimit: 150,
    steps: [
      { type: 'say', lines: ['Lucho: El chiringuito de la Isla Faro me ha pedido veinte cajas de champán francés. Robado, claro.', 'Lucho: Van en esa furgoneta. Cruza el puente hasta la isla, y ojo con las cuestas del sur: si la furgo salta, adiós champán.'] },
      { type: 'spawnVehicle', vehicle: 'van', color: 0xf5f5f5, gift: true, at: (g) => ({ pos: GIVERS.lucho.spot.park, heading: -Math.PI / 2 }) },
      { type: 'getInVehicle', text: 'Sube a la furgoneta blanca', tagged: true },
      { type: 'deliver', text: 'Lleva el champán al chiringuito de la Isla Faro (cruza el puente)', poi: 'chiringuito', tagged: true, minHealth: 0.62 },
      { type: 'say', lines: ['Lucho: ¿Ni una botella rota? Eres un artista.'] },
    ],
  },
  {
    id: 'rodaje',
    title: 'Rodaje',
    giver: 'vera',
    reward: 11000,
    timeLimit: 240,
    steps: [
      { type: 'say', lines: ['Vera: Una tapadera necesita publicidad. Una productora rueda un anuncio de coches y busca un especialista.', 'Vera: Te dejan un Vento GT. Tres saltos desde tres rampas distintas, de más de un segundo en el aire, y aterrizando de pie.'] },
      { type: 'spawnVehicle', vehicle: 'sport', color: 0xff6d00, gift: true, at: (g) => ({ pos: GIVERS.vera.spot.park, heading: Math.PI / 2 }) },
      { type: 'getInVehicle', text: 'Sube al Vento GT naranja', tagged: true },
      { type: 'stunt', text: 'Salta desde las rampas amarillas y negras', count: 3, minAir: 1 },
      { type: 'say', lines: ['Vera: El director dice que es la mejor toma de su carrera. Nadie sospechará de una empresa con anuncios tan bonitos.'] },
    ],
  },
  {
    id: 'contable',
    title: 'El contable',
    giver: 'vera',
    reward: 16000,
    steps: [
      { type: 'say', lines: ['Vera: Problema. El contable de Aurelio se ha largado con un maletín lleno de pruebas contra nosotros.', 'Vera: Lo han visto en Las Lomas, conduciendo como un loco por las cuestas.', 'Vera: Páralo a golpes, pero no revientes el coche: si arde, arde el maletín.'] },
      { type: 'goto', text: 'Ve a Las Lomas (al este)', pos: () => v3(300, 0, 92), label: 'Las Lomas', radius: 40 },
      { type: 'chase', text: 'Para el coche del contable (embístelo o dispara a las ruedas, sin reventarlo)', vehicle: 'sedan', color: 0x9e9e9e, cruise: 23, stopAt: 0.45 },
      { type: 'grab', text: 'Coge el maletín del coche (acércate a pie)' },
      { type: 'goto', text: 'Lleva el maletín a Vera', poi: 'vera', radius: 3 },
      { type: 'say', lines: ['Vera: Bien. El contable va a tomarse unas vacaciones muy largas.'] },
    ],
  },
  {
    id: 'correo-aereo',
    title: 'Correo aéreo',
    giver: 'aurelio',
    reward: 30000,
    steps: [
      { type: 'say', lines: ['Don Aurelio: Un último favor, socio. Un paquete para el chiringuito de la isla, y nadie puede verlo pasar por el puente.', 'Don Aurelio: Te espera una avioneta en la Avenida Oeste. Sigue los aros para despistar al radar y suelta el paquete sobre la isla.', 'Don Aurelio: Después, aterriza donde puedas. Entera, a ser posible.'] },
      { type: 'spawnVehicle', vehicle: 'avioneta', color: 0xf2f2f2, gift: true, at: () => ({ pos: v3(-40, 0, -2.2), heading: -Math.PI / 2 }) },
      { type: 'getInVehicle', text: 'Sube a la avioneta de la Avenida Oeste', tagged: true },
      {
        type: 'rings',
        text: 'Despega y pasa por los aros',
        time: 300,
        rings: [[-260, 24, -4], [-400, 45, -150], [-260, 70, -322], [-110, 58, -322], [100, 72, -330], [262, 60, -150], [300, 46, 150], [120, 42, 300]],
      },
      { type: 'airdrop', text: 'Vuela bajo sobre la Isla Faro para soltar el paquete', poi: 'chiringuito', radius: 34, maxAlt: 45 },
      { type: 'land', text: 'Aterriza en una calle recta y detén la avioneta (S frena)' },
      { type: 'say', lines: ['Don Aurelio: Perfecto. Ya no hay nada en esta ciudad que no puedas hacer.', 'HISTORIA COMPLETADA. Puerto Sombra es tuya de verdad.'] },
    ],
  },
];

/** Índice de la misión en la que se atraca cada banco (desbloqueo en la historia). */
const BANK_MISSION = { puerto: 3, colinas: 3, central: 7, reserva: 8 };

export class Missions {
  static STORY_IDS = STORY.map((m) => m.id);

  constructor(game) {
    this.game = game;
    this.active = null;       // { mission, index, stepIndex, ... }
    this.giverMarker = createMarker('#fdd835', { beam: true, radius: 1.1 });
    this.giverMarker.visible = false;
    this.targetMarker = createMarker('#fdd835', { beam: true, radius: 1.4 });
    this.targetMarker.visible = false;
    game.scene.add(this.giverMarker, this.targetMarker);
    this.target = null;        // posición del objetivo actual (radar)
    this.targetVehicles = [];  // vehículos con blip de misión
    this.sayQueue = [];
    this.sayTimer = 0;
    this.intro = false;

    for (const ev of ['weaponBought', 'storeRobbed', 'businessBought', 'bankRobbed', 'lootSecured', 'wantedCleared']) {
      game.on(ev, (detail) => this.onEvent(ev, detail));
    }
  }

  get story() {
    return this.game.state.mode === 'story';
  }

  bankAvailable(id) {
    if (!this.story || this.game.state.storyDone) return true;
    const idx = BANK_MISSION[id];
    if (this.game.state.storyStep > idx) return true;
    return !!(this.active && this.active.index === idx);
  }

  nextMission() {
    const st = this.game.state;
    // Partidas terminadas antes de la segunda parte: se reabre la historia con las misiones nuevas
    if (this.story && st.storyDone && st.storyStep < STORY.length) {
      st.storyDone = false;
      st.save();
      this.game.hud.missionBanner('SEGUNDA PARTE', 'Nuevas misiones disponibles');
      this.say(['Lucho tiene trabajo nuevo para ti: busca el marcador amarillo (!) en el radar.']);
    }
    if (!this.story || st.storyDone) return null;
    return STORY[st.storyStep] || null;
  }

  playIntro() {
    this.say([
      'Puerto Sombra. Llegas con 300 dólares y la dirección del taller de un viejo amigo de tu tío.',
      'Busca el marcador amarillo (!) en el radar: Lucho te espera.',
    ]);
  }

  say(lines) {
    this.sayQueue.push(...lines);
  }

  // ------------------------------------------------------------------
  // Inicio / fin
  // ------------------------------------------------------------------
  start(mission) {
    const game = this.game;
    this.active = {
      mission,
      index: STORY.indexOf(mission),
      stepIndex: -1,
      timeLeft: mission.timeLimit || null,
      spawned: [],
      flags: {},
    };
    this.giverMarker.visible = false;
    game.hud.missionBanner(mission.title.toUpperCase(), mission.chapter || 'MISIÓN');
    this.advance();
  }

  advance() {
    const a = this.active;
    a.stepIndex++;
    a.flags = {};
    const step = a.mission.steps[a.stepIndex];
    if (!step) {
      this.complete();
      return;
    }
    this.enterStep(step);
  }

  enterStep(step) {
    const game = this.game;
    const a = this.active;
    this.target = null;
    this.targetMarker.visible = false;
    game.hud.setObjective(step.text || '');
    // Objetivos que ya cumples (p. ej. ya tenías un arma) no bloquean la historia
    if (step.already && step.already(game)) {
      this.advance();
      return;
    }

    switch (step.type) {
      case 'say':
        this.say(step.lines);
        a.flags.waitSay = true;
        break;
      case 'spawnVehicle': {
        const at = typeof step.at === 'function' ? step.at(game) : { pos: step.at, heading: step.heading };
        const v = game.locations.spawnOwnedCar(step.vehicle, at.pos, at.heading);
        v.playerOwned = !!step.gift; // regalo de un contacto: subirse no es robarlo
        v.tag = 'mission';
        if (step.color) v.paintMat.color.setHex(step.color);
        a.spawned.push(v);
        a.missionVehicle = v;
        this.advance();
        return;
      }
      case 'destroy': {
        a.targets = [];
        for (let i = 0; i < step.count; i++) {
          const v = game.traffic.spawnPersistent(step.vehicle, step.color, 'target');
          if (v) a.targets.push(v);
        }
        a.spawned.push(...a.targets);
        break;
      }
      case 'race':
        a.cp = 0;
        a.raceTime = step.time;
        break;
      case 'mxRace':
        this.setupMxRace(step);
        break;
      case 'chase':
        this.setupChase(step);
        break;
      case 'rings':
        this.setupRings(step);
        break;
      case 'stunt':
        a.stunt = { used: new Set(), count: 0, air: 0, from: null, pending: null };
        break;
      default:
        break;
    }
  }

  complete() {
    const game = this.game;
    const a = this.active;
    const st = game.state;
    st.addMoney(a.mission.reward);
    game.hud.moneyDelta(a.mission.reward);
    // Premio: el vehículo de la misión pasa a tu garaje
    const mv = a.missionVehicle;
    if (a.mission.keepVehicle && mv && !mv.destroyed) {
      const car = st.addCar({ type: mv.type, color: mv.paintMat.color.getHex() });
      mv.ownedCar = car;
      mv.playerOwned = true;
      a.spawned = a.spawned.filter((v) => v !== mv);
      mv.tag = null;
      mv.damageScale = 1;
      game.hud.notify(`${mv.label} ya es tuya (P › Mis coches).`, 4);
    }
    st.storyStep = a.index + 1;
    if (st.storyStep >= STORY.length) st.storyDone = true;
    st.save();
    game.hud.missionBanner('MISIÓN SUPERADA', `+${formatMoney(a.mission.reward)}`);
    this.cleanup(true);
    if (st.storyDone) {
      this.say(['HISTORIA COMPLETADA. Puerto Sombra es tuya: todos los bancos y negocios siguen disponibles.']);
    }
  }

  fail(reason) {
    const game = this.game;
    if (!this.active) return;
    game.hud.missionBanner('MISIÓN FALLIDA', reason);
    this.cleanup(false);
  }

  cleanup(success) {
    const game = this.game;
    const a = this.active;
    for (const v of a.spawned) {
      // Los coches de misión se retiran salvo el que conduce el jugador
      if (v.driver === 'player') continue;
      if (v.driver === 'ai') game.traffic.release(v);
      if (!success || v.tag === 'target' || v.tag === 'rival') v.removeFromWorld();
      v.rider = null;
      v.tag = null;
      v.damageScale = 1;
    }
    for (const m of a.meshes || []) game.scene.remove(m);
    game.hud.hideBigText();
    this.active = null;
    this.target = null;
    this.targetMarker.visible = false;
    this.targetVehicles = [];
    game.hud.setObjective('');
    game.hud.setTimer(null);
  }

  /** Muerte o arresto durante una misión. */
  onPlayerDown(kind) {
    if (this.active) this.fail(kind === 'busted' ? 'Te han arrestado' : 'Has muerto');
  }

  onEvent(type, detail) {
    const a = this.active;
    if (!a) return;
    const step = a.mission.steps[a.stepIndex];
    if (!step) return;
    if (step.type === 'event' && step.event === type && (!step.filter || step.filter(detail))) {
      this.advance();
    }
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------
  update(dt) {
    const game = this.game;
    this.updateSubtitles(dt);
    if (!this.story) return;

    // Marcador del siguiente encargo
    if (!this.active) {
      const next = this.nextMission();
      this.giverMarker.visible = !!next;
      if (!next) this.target = null;
      if (next) {
        const g = GIVERS[next.giver];
        this.giverMarker.position.copy(g.spot.pos);
        this.giverMarker.userData.arrow.position.y = 2.4 + Math.sin(game.time * 3) * 0.2;
        this.target = g.spot.pos;
        this.targetLabel = `${g.name}: ${next.title}`;
        const p = game.player.mesh.position;
        if (game.interaction.state === 'foot' && Math.hypot(p.x - g.spot.pos.x, p.z - g.spot.pos.z) < 2.4) {
          game.hud.setPrompt(`Pulsa <kbd>E</kbd> · Misión: ${next.title} (${g.name})`);
          if (game.input.wasPressed('KeyE')) this.start(next);
        }
      }
      return;
    }

    const a = this.active;
    const step = a.mission.steps[a.stepIndex];

    // Límite de tiempo global de la misión
    if (a.timeLeft != null) {
      a.timeLeft -= dt;
      game.hud.setTimer(a.timeLeft);
      if (a.timeLeft <= 0) {
        this.fail('Se acabó el tiempo');
        return;
      }
    }
    if (a.missionVehicle && a.missionVehicle.destroyed) {
      this.fail('El vehículo ha quedado destrozado');
      return;
    }
    this.targetVehicles = a.missionVehicle && !this.isDrivingMissionCar() ? [a.missionVehicle] : [];

    switch (step.type) {
      case 'say':
        if (this.sayQueue.length === 0 && this.sayTimer <= 0) this.advance();
        break;
      case 'getInVehicle': {
        const inter = game.interaction;
        const v = inter.isDriving ? inter.vehicle : null;
        game.hud.setObjective(step.text);
        if (step.tagged) this.setTarget(a.missionVehicle.position, 'Objetivo', false);
        if (v && step.notOwned && v.ownedCar) {
          game.hud.setObjective('Ese es tu coche. Roba uno que no sea tuyo.');
          break;
        }
        if (v && (!step.tagged || v === a.missionVehicle)) {
          if (step.alarm) game.wanted.raiseTo(step.alarm);
          this.advance();
        }
        break;
      }
      case 'deliver': {
        const g = step.poi ? null : GIVERS[step.at];
        const poi = step.poi ? game.locations.byId(step.poi) : null;
        const dest = poi ? poi.park : g.spot.park;
        this.setTarget(dest, poi ? poi.name : g.place, true);
        const inter = game.interaction;
        const v = inter.isDriving ? inter.vehicle : null;
        if (step.notOwned && v && v.ownedCar) {
          game.hud.setObjective('Lucho no quiere tu coche: roba otro.');
          break;
        }
        if (step.tagged && v !== a.missionVehicle) {
          game.hud.setObjective('Vuelve a subir al vehículo de la misión');
          if (a.missionVehicle) this.setTarget(a.missionVehicle.position, 'Vehículo', false);
          break;
        }
        game.hud.setObjective(step.text);
        // Carga frágil: los golpes (y los saltos) la rompen
        if (step.minHealth && a.missionVehicle) {
          const mv = a.missionVehicle;
          const left = (mv.health / mv.maxHealth - step.minHealth) / (1 - step.minHealth);
          if (left <= 0) {
            this.fail('La mercancía se ha roto');
            return;
          }
          game.hud.setObjective(`${step.text} · carga intacta: ${Math.round(left * 100)} %`);
        }
        if (v && Math.hypot(v.position.x - dest.x, v.position.z - dest.z) < 6) {
          if (game.wanted.level > 0) {
            game.hud.setObjective('Pierde a la policía antes de entregar el coche');
          } else if (v.getSpeedKmh() < 8) {
            // Lucho se queda el coche
            inter.forceExit();
            game.player.teleport(poi ? poi.pos : g.spot.pos);
            v.removeFromWorld();
            this.advance();
          }
        }
        break;
      }
      case 'event':
        if (step.poi) {
          const poi = game.locations.byId(step.poi);
          if (poi) this.setTarget(poi.pos, poi.name, false);
        }
        break;
      case 'loseWanted':
        if (game.wanted.level === 0 && (!step.loot || game.heists.pendingLoot === 0)) this.advance();
        break;
      case 'goto': {
        const poi = step.poi ? game.locations.byId(step.poi) : null;
        const pos = poi ? poi.pos : (a.flags.pos ||= step.pos(game));
        this.setTarget(pos, poi ? poi.name : step.label, true);
        const p = game.getFocusPosition();
        if (Math.hypot(p.x - pos.x, p.z - pos.z) < (step.radius || 4)) this.advance();
        break;
      }
      case 'mxRace':
        this.updateMxRace(step, dt);
        break;
      case 'chase':
        this.updateChase(step, dt);
        break;
      case 'grab': {
        const t = a.chaseTarget;
        this.setTarget(t.position, 'Maletín', true);
        const p = game.player.mesh.position;
        if (game.interaction.state !== 'foot') game.hud.setObjective(`${step.text} · bájate del coche`);
        else game.hud.setObjective(step.text);
        if (game.interaction.state === 'foot' && Math.hypot(p.x - t.position.x, p.z - t.position.z) < 3.5) {
          game.hud.notify('Tienes el maletín.', 2.5);
          this.advance();
        }
        break;
      }
      case 'rings':
        this.updateRings(step, dt);
        break;
      case 'airdrop':
        this.updateAirdrop(step, dt);
        break;
      case 'land': {
        const v = a.missionVehicle;
        this.targetMarker.visible = false;
        this.target = null;
        if (this.isDrivingMissionCar() && !v.airborne && Math.abs(v.getForwardSpeed()) < 1.5) {
          game.hud.notify('Avioneta en tierra.', 2);
          this.advance();
        }
        break;
      }
      case 'stunt':
        this.updateStunt(step, dt);
        break;
      case 'race':
        this.updateRace(step, dt);
        break;
      case 'destroy': {
        const alive = a.targets.filter((v) => !v.destroyed);
        this.targetVehicles = alive;
        game.hud.setObjective(`${step.text} (${step.count - alive.length}/${step.count})`);
        if (!alive.length) this.advance();
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------------
  // Carrera de motocross contra rivales de la IA
  // ------------------------------------------------------------------
  setupMxRace(step) {
    const game = this.game;
    const a = this.active;
    const T = game.env.mxTrack;
    a.meshes ||= [];
    // La moto del jugador, en cabeza de parrilla (con el piloto encima)
    const me = mxSpot(game, 22, 0);
    a.missionVehicle.place(me.pos.x, me.pos.z, me.heading);
    a.missionVehicle.damageScale = 0.3;
    a.racers = [{ v: a.missionVehicle, me: true, idx: (T.startIdx + 22) % T.N, prog: 0, done: false }];
    step.rivals.forEach(([color, straight, corner], k) => {
      const spot = mxSpot(game, 16 - k * 5, k % 2 ? 1.6 : -1.6);
      const v = new VehicleController(game, { type: 'cross', color, position: spot.pos, heading: spot.heading });
      v.addToWorld();
      v.driver = 'ai';
      v.tag = 'rival';
      v.damageScale = 0.3;
      const model = new HumanModel({ ...OUTFITS.deporte, shirt: color, pants: 0x222222 });
      game.scene.add(model.root);
      a.meshes.push(model.root);
      v.rider = { mesh: model.root, model };
      a.spawned.push(v);
      a.racers.push({ v, me: false, straight, corner, idx: (T.startIdx + 16 - k * 5 + T.N) % T.N, prog: 0, done: false, stuck: 0 });
    });
    a.finished = 0;
    a.countdown = 3.99;
    a.raceTime = 0;
  }

  /** Avance por la pista: índice de muestra más cercano por delante (no cuenta atajar hacia atrás). */
  trackProgress(r) {
    const T = this.game.env.mxTrack;
    const S = T.samples;
    const p = r.v.position;
    let best = r.idx;
    let bd = Infinity;
    for (let k = -3; k < 30; k++) {
      const i = (r.idx + k + T.N) % T.N;
      const d = (S[i].x - p.x) ** 2 + (S[i].z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const step = (best - r.idx + T.N) % T.N;
    if (step < 40) {
      r.prog += step;
      r.idx = best;
    }
    return Math.sqrt(bd);
  }

  updateMxRace(step, dt) {
    const game = this.game;
    const a = this.active;
    const T = game.env.mxTrack;
    const S = T.samples;
    const total = T.N * step.laps - 4;
    // Cuenta atrás: los rivales esperan con el freno echado
    if (a.countdown > 0) {
      const before = Math.ceil(a.countdown);
      a.countdown -= dt;
      const now = Math.ceil(a.countdown);
      if (now !== before || !a.countShown) {
        a.countShown = true;
        game.hud.bigText(now > 0 ? String(now) : '¡YA!', 'count');
      }
      for (const r of a.racers) {
        if (r.me) continue;
        Object.assign(r.v.input, { throttle: 0, reverse: 0, steer: 0, handbrake: true });
      }
      game.hud.setObjective('Prepárate…');
      return;
    }
    if (a.countdown > -1) {
      a.countdown -= dt;
      if (a.countdown <= -1) game.hud.hideBigText();
    }
    a.raceTime += dt;
    for (const r of a.racers) {
      if (r.done) {
        if (!r.me) Object.assign(r.v.input, { throttle: 0, reverse: 0, steer: 0, handbrake: true });
        continue;
      }
      if (r.me && !this.isDrivingMissionCar()) continue;
      this.trackProgress(r);
      if (!r.me) {
        const v = r.v;
        const tg = S[(r.idx + 7) % T.N];
        const kc = Math.abs(T.curv[(r.idx + 10) % T.N]);
        driveTo(v, tg, kc > 1 / 12 ? r.corner : r.straight);
        v.input.handbrake = false;
        // Caídas: se levanta y sigue (como en los videojuegos de carreras)
        if (v.isFlipped() || (Math.abs(v.getForwardSpeed()) < 0.6 && v.groundedWheels() > 0)) r.stuck += dt;
        else r.stuck = 0;
        if (r.stuck > 2.5) {
          // vuelve a la pista un poco más adelante (por si se quedó en el foso de un salto)
          r.idx = (r.idx + 12) % T.N;
          r.prog += 12;
          const p = S[r.idx];
          const q = S[(r.idx + 1) % T.N];
          v.place(p.x, p.z, Math.atan2(q.x - p.x, q.z - p.z));
          r.stuck = 0;
        }
      }
      if (r.prog >= total) {
        r.done = true;
        a.finished++;
        r.place = a.finished;
        if (r.me) {
          game.hud.setTimer(null);
          if (r.place === 1) {
            game.hud.bigText('¡1.º!', 'count');
            setTimeout(() => game.hud.hideBigText(), 1800);
            this.advance();
          } else this.fail(`Has llegado ${r.place}.º`);
          return;
        }
        // Si un rival cruza la meta antes, ya no se puede ganar
        this.fail('Ha ganado otro piloto');
        return;
      }
    }
    const me = a.racers[0];
    const pos = 1 + a.racers.filter((r) => !r.me && (r.done || r.prog > me.prog)).length;
    const ahead = S[(me.idx + 40) % T.N];
    this.setTarget(ahead, 'Pista', false);
    game.hud.setObjective(this.isDrivingMissionCar() ? `${step.text} · posición ${pos}/${a.racers.length} · ${Math.min(100, Math.round((me.prog / total) * 100))} %` : 'Vuelve a tu moto, ¡la carrera sigue!');
    game.hud.setTimer(a.raceTime);
    game.hud.timerEl.classList.remove('urgent');
  }

  // ------------------------------------------------------------------
  // Persecución: un coche que huye por las cuestas sin respetar semáforos
  // ------------------------------------------------------------------
  setupChase(step) {
    const game = this.game;
    const a = this.active;
    const traffic = game.traffic;
    const spot = traffic.findSpawn(45, 110, false) || traffic.findSpawn(30, 160, false);
    const v = new VehicleController(game, { type: step.vehicle, color: step.color });
    v.tag = 'target';
    if (spot) v.place(spot.pos.x, spot.pos.z, Math.atan2(spot.dir.x, spot.dir.z));
    v.addToWorld();
    v.driver = 'ai';
    const agent = traffic.makeAgent(v, spot.from, spot.to, step.cruise, true);
    agent.flee = true;
    traffic.agents.push(agent);
    a.spawned.push(v);
    a.chaseTarget = v;
    a.farTime = 0;
    game.hud.notify('¡Ahí está! El coche gris.', 3);
  }

  updateChase(step, dt) {
    const game = this.game;
    const a = this.active;
    const v = a.chaseTarget;
    this.targetVehicles = [v];
    this.target = v.position;
    this.targetLabel = 'Contable';
    this.targetMarker.visible = false;
    if (v.destroyed) {
      this.fail('El coche ha ardido con el maletín dentro');
      return;
    }
    const left = (v.health / v.maxHealth - step.stopAt) / (1 - step.stopAt);
    game.hud.setObjective(`${step.text} · coche del contable: ${Math.max(0, Math.round(left * 100))} %`);
    if (left <= 0) {
      // Se rinde: deja de ser tráfico, frena y echa humo
      game.traffic.release(v);
      Object.assign(v.input, { throttle: 0, reverse: 0, steer: 0, handbrake: true });
      game.hud.notify('¡El contable se ha parado! Ve a por el maletín.', 3);
      this.advance();
      return;
    }
    const p = game.getFocusPosition();
    const d = Math.hypot(p.x - v.position.x, p.z - v.position.z);
    a.farTime = d > 200 ? a.farTime + dt : 0;
    if (d > 200) game.hud.setObjective(`¡Se escapa! Acércate (${Math.ceil(8 - a.farTime)} s)`);
    if (a.farTime > 8) this.fail('El contable se ha escapado');
  }

  // ------------------------------------------------------------------
  // Aros en el aire (avioneta), lanzamiento y aterrizaje
  // ------------------------------------------------------------------
  setupRings(step) {
    const game = this.game;
    const a = this.active;
    a.meshes ||= [];
    a.ring = 0;
    a.raceTime = step.time;
    a.rings = step.rings.map(([x, y, z], i) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xfdd835, transparent: true, opacity: 0.9, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(9, 0.6, 8, 40), mat);
      mesh.position.set(x, y, z);
      const next = step.rings[i + 1] || step.rings[i];
      const prev = step.rings[i - 1] || [x - 1, y, z];
      // de cara a la dirección de vuelo (del anterior al siguiente)
      mesh.lookAt(x + (next[0] - prev[0]), y, z + (next[2] - prev[2]));
      game.scene.add(mesh);
      a.meshes.push(mesh);
      return mesh;
    });
    this.styleRings();
  }

  styleRings() {
    const a = this.active;
    a.rings.forEach((m, i) => {
      m.visible = i >= a.ring;
      m.material.opacity = i === a.ring ? 0.95 : 0.35;
      m.material.color.setHex(i === a.ring ? 0xfdd835 : 0xffffff);
    });
  }

  updateRings(step, dt) {
    const game = this.game;
    const a = this.active;
    a.raceTime -= dt;
    game.hud.setTimer(a.raceTime);
    if (a.raceTime <= 0) {
      this.fail('Se acabó el tiempo');
      return;
    }
    const ring = a.rings[a.ring];
    this.setTarget(ring.position, `Aro ${a.ring + 1}`, false);
    if (!this.isDrivingMissionCar()) {
      game.hud.setObjective('Sube a la avioneta');
      return;
    }
    const v = a.missionVehicle;
    const alt = Math.round(ring.position.y);
    game.hud.setObjective(`${step.text} (${a.ring}/${a.rings.length}) · el siguiente está a ${alt} m de altura`);
    if (v.position.distanceTo(ring.position) < 10.5) {
      a.ring++;
      game.hud.notify(`Aro ${a.ring}/${a.rings.length}`, 1.2);
      if (a.ring >= a.rings.length) {
        game.hud.setTimer(null);
        for (const m of a.rings) m.visible = false;
        this.advance();
        return;
      }
      this.styleRings();
    }
    // Giran despacio para que se vean desde lejos
    for (const m of a.rings) m.rotateZ(dt * 0.4);
  }

  updateAirdrop(step, dt) {
    const game = this.game;
    const a = this.active;
    const poi = game.locations.byId(step.poi);
    this.setTarget(poi.pos, 'Isla Faro', true);
    const v = a.missionVehicle;
    if (a.crate) {
      // El paquete cae con paracaídas
      a.crate.position.y -= dt * 4;
      a.crate.rotation.y += dt;
      if (a.crate.position.y < 1.2) {
        a.crate.position.y = 1.2;
        game.hud.notify('¡Paquete entregado en la isla!', 2.5);
        a.crate = null;
        this.advance();
      }
      return;
    }
    if (!this.isDrivingMissionCar()) return;
    const d = Math.hypot(v.position.x - poi.pos.x, v.position.z - poi.pos.z);
    const alt = v.position.y;
    game.hud.setObjective(`${step.text} · ${Math.round(d)} m · altura ${Math.round(alt)} m (máx. ${step.maxAlt})`);
    if (d < step.radius && alt < step.maxAlt && v.airborne) {
      // Caja con paracaídas
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), new THREE.MeshStandardMaterial({ color: 0x8d6e47, roughness: 0.9 }));
      const chute = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff7043, side: THREE.DoubleSide }));
      chute.position.y = 3.4;
      g.add(box, chute);
      g.position.set(v.position.x, v.position.y - 2, v.position.z);
      game.scene.add(g);
      (a.meshes ||= []).push(g);
      a.crate = g;
      game.hud.notify('Paquete fuera.', 1.5);
    }
  }

  // ------------------------------------------------------------------
  // Saltos desde las rampas
  // ------------------------------------------------------------------
  updateStunt(step, dt) {
    const game = this.game;
    const a = this.active;
    const s = a.stunt;
    const env = game.env;
    const ramps = env.rampSpots || [];
    const v = a.missionVehicle;
    const free = ramps.filter((r, i) => !s.used.has(i));
    // Objetivo: la rampa libre más cercana
    const p = v.position;
    let near = null;
    let nd = Infinity;
    ramps.forEach(([x, z], i) => {
      if (s.used.has(i)) return;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < nd) {
        nd = d;
        near = i;
      }
    });
    if (near !== null) this.setTarget(new THREE.Vector3(ramps[near][0], 0, ramps[near][1]), 'Rampa', false);
    if (!this.isDrivingMissionCar()) {
      game.hud.setObjective('Vuelve al Vento GT');
      return;
    }
    game.hud.setObjective(`${step.text} (${s.count}/${step.count}) · rampas libres: ${free.length}`);
    const inAir = v.groundedWheels() === 0;
    if (inAir) {
      if (s.air === 0) s.from = near !== null && nd < 22 ? near : null;
      s.air += dt;
    } else if (s.air > 0) {
      const air = s.air;
      s.air = 0;
      if (s.from !== null && air >= step.minAir) s.pending = { ramp: s.from, air, t: 1 };
      else if (s.from !== null && air > 0.3) game.hud.notify(`Muy corto (${air.toFixed(1)} s): coge más carrerilla`, 2.5);
    }
    if (s.pending) {
      s.pending.t -= dt;
      if (v.isFlipped()) {
        game.hud.notify('¡Corten! Hay que aterrizar de pie. Repite.', 2.5);
        s.pending = null;
      } else if (s.pending.t <= 0) {
        s.used.add(s.pending.ramp);
        s.count++;
        game.hud.notify(`¡Toma buena! ${s.pending.air.toFixed(1)} s en el aire (${s.count}/${step.count})`, 2.5);
        s.pending = null;
        if (s.count >= step.count) this.advance();
      }
    }
  }

  isDrivingMissionCar() {
    const inter = this.game.interaction;
    return inter.isDriving && inter.vehicle === this.active.missionVehicle;
  }

  setTarget(pos, label, marker) {
    this.target = pos;
    this.targetLabel = label;
    this.targetMarker.visible = marker;
    if (marker) this.targetMarker.position.set(pos.x, this.game.env.groundHeight(pos.x, pos.z), pos.z);
  }

  updateRace(step, dt) {
    const game = this.game;
    const a = this.active;
    const inter = game.interaction;
    if (!inter.isDriving || inter.vehicle !== a.missionVehicle) {
      game.hud.setObjective('Vuelve a subir al Toro negro');
      this.setTarget(a.missionVehicle.position, 'Vehículo', false);
      a.raceTime -= dt;
    } else {
      const cp = step.checkpoints[a.cp];
      this.setTarget(cp, `Control ${a.cp + 1}`, true);
      game.hud.setObjective(`${step.text} (${a.cp}/${step.checkpoints.length})`);
      a.raceTime -= dt;
      const p = inter.vehicle.position;
      if (Math.hypot(p.x - cp.x, p.z - cp.z) < 10) {
        a.cp++;
        game.hud.notify(`Control ${a.cp}/${step.checkpoints.length}`, 1.5);
        if (a.cp >= step.checkpoints.length) {
          game.hud.setTimer(null);
          this.advance();
          return;
        }
      }
    }
    game.hud.setTimer(a.raceTime);
    if (a.raceTime <= 0) this.fail('No llegaste a tiempo');
  }

  updateSubtitles(dt) {
    // Enter salta la frase actual
    if (this.sayTimer > 0 && this.game.input.wasPressed('Enter')) this.sayTimer = 0.001;
    if (this.sayTimer > 0) {
      this.sayTimer -= dt;
      if (this.sayTimer <= 0) this.game.hud.setSubtitle(null);
    }
    if (this.sayTimer <= 0 && this.sayQueue.length) {
      const line = this.sayQueue.shift();
      this.game.hud.setSubtitle(line);
      this.sayTimer = Math.min(6, 2 + line.length * 0.045);
    }
  }
}
