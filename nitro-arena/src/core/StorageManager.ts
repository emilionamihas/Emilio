/**
 * Persistencia en localStorage con fusión profunda sobre valores por defecto.
 * Si el almacenamiento no está disponible (modo privado, bloqueado), el juego
 * sigue funcionando con los valores por defecto en memoria.
 */
export const STORAGE_KEYS = {
  controls: 'nitro-arena.controls.v1',
  camera: 'nitro-arena.camera.v1',
  game: 'nitro-arena.game.v1',
} as const;

type PlainObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    if (override === undefined || override === null) return base;
    if (Array.isArray(base)) return (Array.isArray(override) ? override : base) as T;
    if (typeof override !== typeof base) return base;
    return override as T;
  }
  const out: PlainObject = { ...(base as PlainObject) };
  for (const key of Object.keys(base as PlainObject)) {
    out[key] = deepMerge((base as PlainObject)[key], override[key]);
  }
  return out as T;
}

export class StorageManager {
  static load<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      return deepMerge(structuredClone(fallback), JSON.parse(raw));
    } catch {
      return structuredClone(fallback);
    }
  }

  static save<T>(key: string, value: T): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  static remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* almacenamiento no disponible: no hay nada que borrar */
    }
  }
}
