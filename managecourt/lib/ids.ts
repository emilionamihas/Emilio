const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type Rand = () => number;

const defaultRand: Rand = () => {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
};

function randomChars(n: number, rand: Rand): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s;
}

export function makeId(prefix: string, rand: Rand = defaultRand): string {
  return `${prefix}_${randomChars(10, rand).toLowerCase()}`;
}

/** Código legible para el pase digital: MC-7KQ4-X2 */
export function makePassCode(rand: Rand = defaultRand): string {
  return `MC-${randomChars(4, rand)}-${randomChars(2, rand)}`;
}
