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

/** Aspecto inicial del personaje (vestidor de casa). */
export const DEFAULT_LOOK = {
  top: 'polo',
  topColor: 0xeeeeee,
  hat: 'none',
  hatColor: 0x1a237e,
  bottom: 'largo',
  bottomColor: 0x2c3e66,
  shoes: 0x1b1b1b,
  skin: 0xc68642,
  hair: 0x1b1b1b,
  hairStyle: 'short',
};

/** Coche de serie con el que empiezas: es tuyo, así que usarlo no es delito. */
export const STARTER_CAR = { type: 'sedan', color: 0x1565c0, color2: 0xeeeeee, design: 'liso', finish: 'metalizado' };

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
    this.bizLevel = {};   // nivel de mejora de cada negocio (1-3)
    this.cars = [];       // coches propios: { id, type, color, color2, design, finish }
    this.nextCarId = 1;
    this.addCar(STARTER_CAR);
    this.look = { ...DEFAULT_LOOK };
    this.outfit = 'custom';
    this.savedAt = null;
    this.storyStep = 0;   // índice de la siguiente misión
    this.storyDone = false;
    this.bankCooldown = {};
    this.stats = { robberies: 0, banks: 0, earned: 0, cars: 0 };
    this.infiniteAmmo = false;
    this.cheated = false;
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
    this.bizLevel = d.bizLevel ?? {};
    this.nextCarId = d.nextCarId ?? 1;
    this.cars = [];
    // Partidas antiguas guardaban solo el tipo ('sport'); se convierten a fichas de coche
    for (const c of d.cars ?? []) this.cars.push(typeof c === 'string' ? { id: this.nextCarId++, type: c, color: null, color2: 0x111111, design: 'liso', finish: 'brillo' } : c);
    if (!this.cars.length) this.addCar(STARTER_CAR);
    this.look = { ...DEFAULT_LOOK, ...(d.look || {}) };
    this.outfit = d.outfit ?? 'custom';
    this.savedAt = d.savedAt ?? null;
    this.storyStep = d.storyStep ?? 0;
    this.storyDone = !!d.storyDone;
    this.stats = { ...this.stats, ...(d.stats || {}) };
    this.infiniteAmmo = !!d.infiniteAmmo;
    this.cheated = !!d.cheated;
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
      bizLevel: this.bizLevel,
      cars: this.cars,
      nextCarId: this.nextCarId,
      look: this.look,
      outfit: this.outfit,
      storyStep: this.storyStep,
      storyDone: this.storyDone,
      stats: this.stats,
      infiniteAmmo: this.infiniteAmmo,
      cheated: this.cheated,
      savedAt: Date.now(),
    };
    safeStorage((ls) => ls.setItem(SAVE_KEYS[this.mode], JSON.stringify(d)));
  }

  addCar(opts) {
    const car = { id: this.nextCarId++, type: opts.type, color: opts.color ?? null, color2: opts.color2 ?? 0x111111, design: opts.design || 'liso', finish: opts.finish || 'brillo' };
    this.cars.push(car);
    return car;
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
