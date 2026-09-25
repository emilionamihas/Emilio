import * as THREE from 'three';
import { sidewalkSpot, createMarker } from './Locations.js';
import { CITY } from './Environment.js';
import { formatMoney } from './GameState.js';

const rc = (i) => -CITY.HALF + i * CITY.PERIOD;
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
      { type: 'say', lines: ['Lucho: ¿Así que tú eres el sobrino de Ramón? Puerto Sombra no regala nada.', 'Lucho: Tráeme cualquier coche. Me da igual de quién sea. Te pago por la chapa.'] },
      { type: 'getInVehicle', text: 'Consigue un coche (acércate a uno y pulsa F)' },
      { type: 'deliver', text: 'Lleva el coche al taller de Lucho', at: 'lucho' },
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
      { type: 'say', lines: ['Vera: Lucho dice que tienes sangre fría. Vamos a comprobarlo.', 'Vera: Banco del Puerto. Entra, vacía la cámara y aguanta hasta que termine.', 'Vera: Y no vengas aquí con la policía detrás: el dinero solo vale si lo pierdes de vista.'] },
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
      { type: 'say', lines: ['Vera: Ahora tus ingresos parecen legales. Cada hora te caerá algo.'] },
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
      { type: 'say', lines: ['Vera: Banco Central. Cuatro estrellas en cuanto suene la alarma.', 'Vera: Ponte chaleco. Esta vez la policía viene a disparar.'] },
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
      { type: 'say', lines: ['Vera: La Reserva Federal. Cinco estrellas. Todo Puerto Sombra detrás de ti.', 'Don Aurelio: Si sales vivo, esta ciudad es tuya.'] },
      { type: 'event', event: 'bankRobbed', text: 'Atraca la Reserva Federal', poi: 'reserva', filter: (d) => d.id === 'reserva' },
      { type: 'loseWanted', text: 'Sobrevive y pierde a la policía', loot: true },
      { type: 'goto', text: 'Vuelve a casa', poi: 'casa', radius: 3 },
      { type: 'say', lines: ['Vera: Lo hiciste. Nadie había sacado un céntimo de esa cámara.', 'Don Aurelio: Bienvenido a la cima, socio. La ciudad es tuya.'] },
    ],
  },
];

/** Índice de la misión en la que se atraca cada banco (desbloqueo en la historia). */
const BANK_MISSION = { puerto: 3, central: 7, reserva: 8 };

export class Missions {
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
    game.hud.missionBanner(mission.title.toUpperCase(), 'MISIÓN');
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
        const v = game.locations.spawnOwnedCar(step.vehicle, step.at, step.heading);
        v.playerOwned = false;
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
      if (!success || v.tag === 'target') v.removeFromWorld();
      v.tag = null;
    }
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
        if (step.tagged) this.setTarget(a.missionVehicle.position, 'Objetivo', false);
        if (v && (!step.tagged || v === a.missionVehicle)) {
          if (step.alarm) game.wanted.raiseTo(step.alarm);
          this.advance();
        }
        break;
      }
      case 'deliver': {
        const g = GIVERS[step.at];
        const dest = g.spot.park;
        this.setTarget(dest, g.place, true);
        const inter = game.interaction;
        const v = inter.isDriving ? inter.vehicle : null;
        if (step.tagged && v !== a.missionVehicle) {
          game.hud.setObjective('Vuelve a subir al vehículo de la misión');
          if (a.missionVehicle) this.setTarget(a.missionVehicle.position, 'Vehículo', false);
          break;
        }
        game.hud.setObjective(step.text);
        if (v && Math.hypot(v.position.x - dest.x, v.position.z - dest.z) < 6) {
          if (game.wanted.level > 0) {
            game.hud.setObjective('Pierde a la policía antes de entregar el coche');
          } else if (v.getSpeedKmh() < 8) {
            // Lucho se queda el coche
            inter.forceExit();
            game.player.teleport(g.spot.pos);
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
        const poi = game.locations.byId(step.poi);
        this.setTarget(poi.pos, poi.name, true);
        const p = game.getFocusPosition();
        if (Math.hypot(p.x - poi.pos.x, p.z - poi.pos.z) < (step.radius || 4)) this.advance();
        break;
      }
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

  isDrivingMissionCar() {
    const inter = this.game.interaction;
    return inter.isDriving && inter.vehicle === this.active.missionVehicle;
  }

  setTarget(pos, label, marker) {
    this.target = pos;
    this.targetLabel = label;
    this.targetMarker.visible = marker;
    if (marker) this.targetMarker.position.set(pos.x, 0, pos.z);
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
