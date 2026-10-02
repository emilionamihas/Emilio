import { WEAPONS } from './PlayerController.js';
import { CATALOG } from './VehicleController.js';
import { BUSINESSES, LEVELS, OLDSTYLE_LOOK } from './Properties.js';
import { STORY } from './Missions.js';

export const CHEAT_CODE = 'WTASECRET';
export const OLDSTYLE_CODE = 'OLDSTYLE';
export const FLY_CODE = 'WTAFLY';
const MAX_CODE = Math.max(CHEAT_CODE.length, OLDSTYLE_CODE.length, FLY_CODE.length);
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
        this.buffer = (this.buffer + e.code.slice(3)).slice(-MAX_CODE);
        if (this.buffer.endsWith(CHEAT_CODE)) {
          this.buffer = '';
          this.activate();
        } else if (this.buffer.endsWith(OLDSTYLE_CODE)) {
          this.buffer = '';
          this.oldStyle();
        } else if (this.buffer.endsWith(FLY_CODE)) {
          this.buffer = '';
          this.fly();
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
      else if (code === OLDSTYLE_CODE) this.oldStyle();
      else if (code === FLY_CODE) this.fly();
      else this.game.hud.notify('Código incorrecto.', 2);
    }
  }

  /**
   * OLDSTYLE: te viste con los colores secretos (gorra beige hacia atrás, polo azul navy,
   * pantalón beige y zapatillas blancas) y los deja disponibles en el vestidor.
   */
  oldStyle() {
    const game = this.game;
    const st = game.state;
    if (!st) return;
    if (!st.secrets.includes('oldstyle')) st.secrets.push('oldstyle');
    Object.assign(st.look, OLDSTYLE_LOOK);
    st.outfit = 'custom';
    game.player.applyLook(st.look);
    st.save();
    game.hud.missionBanner('OLD STYLE', 'Colores secretos desbloqueados');
    game.hud.notify('Azul navy y beige ya están en tu vestidor, y el conjunto "Old Style" en Conjuntos.', 6);
  }

  /**
   * WTAFLY: una avioneta propia en tu garaje (P › Mis coches) y aparcada en la calle más cercana.
   */
  fly() {
    const game = this.game;
    const st = game.state;
    if (!st) return;
    let car = st.cars.find((c) => c.type === 'avioneta');
    if (!car) car = st.addCar({ type: 'avioneta', color: 0xf2f2f2, finish: 'brillo' });
    st.save();
    if (game.interior || game.interaction.state !== 'foot') {
      game.hud.missionBanner('WTAFLY', 'Avioneta en tu garaje');
      game.hud.notify('Tienes una avioneta: pídela desde P › Mis coches cuando estés a pie en la calle.', 6);
      return;
    }
    const { pos, heading } = game.env.parkingNear(game.player.mesh.position);
    game.locations.spawnOwnedCar(car, pos, heading);
    game.waypoint = { pos: pos.clone(), label: 'Tu avioneta' };
    game.map.refreshRoute && game.map.refreshRoute();
    game.hud.missionBanner('WTAFLY', 'Tu avioneta te espera en la calle');
    game.hud.notify('Avioneta Gaviota aparcada en la calle más cercana (ruta en el GPS). Sube con F.', 6);
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
      if (type === 'civil' || spec.plane || have.has(type)) continue; // la avioneta es de WTAFLY
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
