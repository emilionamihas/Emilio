/**
 * Estado persistente de la partida: dinero, armas, munición, negocios, coches y progreso.
 * Se guarda en localStorage por modo (historia y libre tienen partidas separadas).
 */
const SAVE_KEYS = { story: 'wtav-save-story-v1', free: 'wtav-save-free-v1' };

export const START = {
  story: { money: 300, weapons: [0], armor: 0 },
  // En modo libre empiezas con capital para probarlo todo, pero las armas se siguen comprando
  free: { money: 60000, weapons: [0, 1], armor: 50 },
};

/** $1.234.567 (agrupa siempre de tres en tres, también con 4 cifras). */
export function formatMoney(n) {
  const v = Math.floor(Math.abs(n));
  return (n < 0 ? '-$' : '$') + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function safeStorage(fn) {
  try {
    return fn(window.localStorage);
  } catch {
    return null;
  }
}

export class GameState {
  constructor(mode) {
    this.mode = mode; // 'story' | 'free'
    this.reset();
  }

  reset() {
    const s = START[this.mode];
    this.money = s.money;
    this.ownedWeapons = new Set(s.weapons);
    this.reserve = {};    // munición de reserva por arma
    this.clip = {};       // munición en el cargador por arma
    this.armor = s.armor;
    this.businesses = new Set();
    this.cars = [];       // tipos de coche comprados
    this.storyStep = 0;   // índice de la siguiente misión
    this.storyDone = false;
    this.bankCooldown = {};
    this.stats = { robberies: 0, banks: 0, earned: 0, cars: 0 };
  }

  static hasSave(mode) {
    return !!safeStorage((ls) => ls.getItem(SAVE_KEYS[mode]));
  }

  static peek(mode) {
    const raw = safeStorage((ls) => ls.getItem(SAVE_KEYS[mode]));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static erase(mode) {
    safeStorage((ls) => ls.removeItem(SAVE_KEYS[mode]));
  }

  load() {
    const d = GameState.peek(this.mode);
    if (!d) return false;
    this.money = d.money ?? this.money;
    this.ownedWeapons = new Set(d.weapons ?? [0]);
    this.reserve = d.reserve ?? {};
    this.clip = d.clip ?? {};
    this.armor = d.armor ?? 0;
    this.businesses = new Set(d.businesses ?? []);
    this.cars = d.cars ?? [];
    this.storyStep = d.storyStep ?? 0;
    this.storyDone = !!d.storyDone;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    return true;
  }

  save() {
    const d = {
      money: Math.floor(this.money),
      weapons: [...this.ownedWeapons],
      reserve: this.reserve,
      clip: this.clip,
      armor: Math.round(this.armor),
      businesses: [...this.businesses],
      cars: this.cars,
      storyStep: this.storyStep,
      storyDone: this.storyDone,
      stats: this.stats,
      savedAt: Date.now(),
    };
    safeStorage((ls) => ls.setItem(SAVE_KEYS[this.mode], JSON.stringify(d)));
  }

  addMoney(amount) {
    this.money += amount;
    if (amount > 0) this.stats.earned += amount;
  }

  spend(amount) {
    if (this.money < amount) return false;
    this.money -= amount;
    return true;
  }
}
