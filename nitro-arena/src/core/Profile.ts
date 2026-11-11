import { ACCENT_COLORS, CAR_PRESETS, SECRET_CODE, getPreset, type CarId, type CarPreset } from '../config/CarPresets';
import { StorageManager } from './StorageManager';

const PROFILE_KEY = 'nitro-arena.profile.v1';

export interface ProfileStats {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  mvps: number;
  flipResets: number;
}

export interface ProfileData {
  name: string;
  selectedCar: CarId;
  accent: number;
  unlocked: CarId[];
  xp: number;
  stats: ProfileStats;
}

function defaults(): ProfileData {
  return {
    name: 'Jugador',
    selectedCar: 'vector',
    accent: ACCENT_COLORS[0].hex,
    unlocked: CAR_PRESETS.filter((p) => !p.secret).map((p) => p.id),
    xp: 0,
    stats: { matches: 0, wins: 0, losses: 0, draws: 0, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, mvps: 0, flipResets: 0 },
  };
}

export interface MatchResult {
  won: boolean | null;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  mvp: boolean;
}

export type RedeemResult = 'unlocked' | 'already' | 'invalid';

/** Perfil local del jugador (guardado en este navegador). */
export class Profile {
  data: ProfileData;
  onChange: (() => void) | null = null;

  constructor() {
    this.data = StorageManager.load(PROFILE_KEY, defaults());
    for (const p of CAR_PRESETS) {
      if (!p.secret && !this.data.unlocked.includes(p.id)) this.data.unlocked.push(p.id);
    }
    if (!this.isUnlocked(this.data.selectedCar)) this.data.selectedCar = 'vector';
  }

  private save(): void {
    StorageManager.save(PROFILE_KEY, this.data);
    this.onChange?.();
  }

  get car(): CarPreset {
    return getPreset(this.data.selectedCar);
  }

  /** Nivel con progresión creciente: el nivel n requiere 250·n XP adicionales. */
  get level(): { level: number; progress: number; next: number } {
    let level = 1;
    let remaining = this.data.xp;
    while (remaining >= level * 250) {
      remaining -= level * 250;
      level++;
    }
    return { level, progress: remaining, next: level * 250 };
  }

  isUnlocked(id: CarId): boolean {
    return this.data.unlocked.includes(id);
  }

  selectCar(id: CarId): boolean {
    if (!this.isUnlocked(id)) return false;
    this.data.selectedCar = id;
    this.save();
    return true;
  }

  setAccent(hex: number): void {
    this.data.accent = hex;
    this.save();
  }

  setName(name: string): void {
    this.data.name = name.trim().slice(0, 16) || 'Jugador';
    this.save();
  }

  redeem(code: string): RedeemResult {
    if (code.trim().toLowerCase() !== SECRET_CODE) return 'invalid';
    const secret = CAR_PRESETS.filter((p) => p.secret).map((p) => p.id);
    if (secret.every((id) => this.isUnlocked(id))) return 'already';
    for (const id of secret) if (!this.isUnlocked(id)) this.data.unlocked.push(id);
    this.save();
    return 'unlocked';
  }

  addFlipReset(): void {
    this.data.stats.flipResets++;
    this.save();
  }

  /** Registra un partido terminado y devuelve la XP ganada. */
  recordMatch(r: MatchResult): number {
    const s = this.data.stats;
    s.matches++;
    if (r.won === true) s.wins++;
    else if (r.won === false) s.losses++;
    else s.draws++;
    s.goals += r.goals;
    s.assists += r.assists;
    s.saves += r.saves;
    s.shots += r.shots;
    s.demos += r.demos;
    if (r.mvp) s.mvps++;
    const xp = 100 + (r.won ? 75 : 0) + r.goals * 25 + r.assists * 15 + r.saves * 15 + r.demos * 10 + (r.mvp ? 50 : 0);
    this.data.xp += xp;
    this.save();
    return xp;
  }

  resetStats(): void {
    const d = defaults();
    this.data.stats = d.stats;
    this.data.xp = 0;
    this.save();
  }
}
