import { WEAPONS } from './PlayerController.js';
import { CATALOG } from './VehicleController.js';
import { BUSINESSES, LEVELS } from './Properties.js';
import { STORY } from './Missions.js';

export const CHEAT_CODE = 'WTASECRET';
const BONUS = 10000000;

/**
 * Código secreto. Se puede introducir en la terminal escondida del ordenador de casa
 * o tecleándolo de corrido mientras juegas (como los trucos clásicos).
 * Da 10 millones, todas las armas con munición infinita, todos los coches, todos los
 * negocios al máximo y, en el modo historia, completa la historia.
 */
export class Cheats {
  constructor(game) {
    this.game = game;
    this.buffer = '';
    this.el = document.getElementById('cheat');
    this.input = document.getElementById('cheat-input');
    this.open = false;
    this.wasLocked = false;

    window.addEventListener(
      'keydown',
      (e) => {
        if (this.open) {
          this.onPromptKey(e);
          return;
        }
        if (!game.started || !game.running || !e.code.startsWith('Key')) return;
        this.buffer = (this.buffer + e.code.slice(3)).slice(-CHEAT_CODE.length);
        if (this.buffer === CHEAT_CODE) {
          this.buffer = '';
          this.activate();
        }
      },
      true
    );
  }

  /** Terminal: un cuadro de texto sobre el juego (libera el ratón como el mapa). */
  showPrompt() {
    const game = this.game;
    if (game.menus.isOpen) game.menus.close();
    this.open = true;
    game.mapOpen = true; // pausa la simulación y evita el menú de pausa al soltar el ratón
    this.el.classList.remove('hidden');
    this.input.value = '';
    this.wasLocked = game.input.locked;
    if (this.wasLocked) document.exitPointerLock();
    setTimeout(() => this.input.focus(), 30);
  }

  closePrompt() {
    const game = this.game;
    this.open = false;
    game.mapOpen = false;
    this.el.classList.add('hidden');
    this.input.blur();
    game.input.keys.clear();
    game.input.pressed.clear();
    if (this.wasLocked) {
      game.input.requestLock();
      setTimeout(() => {
        if (!game.input.locked) game.input.freeMouse = true;
      }, 400);
    }
  }

  onPromptKey(e) {
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      this.closePrompt();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      const code = this.input.value.trim().toUpperCase().replace(/\s+/g, '');
      this.closePrompt();
      if (code === CHEAT_CODE) this.activate();
      else this.game.hud.notify('Código incorrecto.', 2);
    }
  }

  activate() {
    const game = this.game;
    const st = game.state;
    if (!st) return;
    const player = game.player;

    // Dinero
    st.money += BONUS;
    game.hud.moneyDelta(BONUS);

    // Todas las armas, cargadas y con munición infinita
    st.infiniteAmmo = true;
    WEAPONS.forEach((w, i) => {
      if (!st.ownedWeapons.has(i)) player.giveWeapon(i);
      if (w.mag) st.clip[i] = w.mag;
    });

    // Un coche de cada modelo (propios: nunca cuentan como robo)
    const have = new Set(st.cars.map((c) => c.type));
    for (const [type, spec] of Object.entries(CATALOG)) {
      if (type === 'civil' || have.has(type)) continue;
      have.add(type);
      st.addCar({ type, color: spec.colors ? spec.colors[0] : null, finish: 'metalizado' });
    }

    // Todos los negocios, al nivel máximo
    for (const id of Object.keys(BUSINESSES)) {
      st.businesses.add(id);
      st.bizLevel[id] = LEVELS.length - 1;
    }

    // Salud, chaleco y sin policía
    player.health = 100;
    st.armor = 100;
    game.wanted.clear();

    // Historia completada (desbloquea todos los bancos)
    if (st.mode === 'story' && !st.storyDone) {
      if (game.missions.active) game.missions.cleanup(true);
      st.storyStep = STORY.length;
      st.storyDone = true;
    }
    st.cheated = true;
    st.save();
    game.hud.missionBanner('CÓDIGO ACTIVADO', '+$10.000.000 · todo desbloqueado');
    game.hud.notify('Tienes todas las armas (munición infinita), todos los coches (P › Mis coches) y todos los negocios al máximo.', 7);
    game.emit('cheatActivated', {});
  }
}
