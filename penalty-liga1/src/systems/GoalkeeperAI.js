import { GOAL_GRID } from '../config/gameConfig.js';
import { clamp } from '../utils/MathUtils.js';

const TOTAL_ZONES = GOAL_GRID.cols * GOAL_GRID.rows;

// Zonas "cómodas" (centro) reciben algo más de peso cuando el portero adivina mal,
// ya que un portero real cubre mejor el centro que las esquinas altas.
const ZONE_WEIGHTS = [0.9, 1.1, 0.9, 1.0, 1.3, 1.0, 0.7, 1.0, 0.7];

// Decide a qué zona se lanza el portero controlado por IA, ANTES de conocer con certeza
// el resultado real del tiro (simula que el portero "lee" al pateador con cierto acierto).
export function aiDecideZone(shotZoneIndex, keeperSkill = 75, difficultyMod = 1.0) {
  const correctGuessChance = clamp((keeperSkill / 100) * 0.55 * difficultyMod, 0.05, 0.85);

  if (Math.random() < correctGuessChance) {
    return shotZoneIndex;
  }

  // Elige otra zona (posiblemente adyacente) ponderada por comodidad del portero
  const weights = ZONE_WEIGHTS.map((w, i) => (i === shotZoneIndex ? 0 : w));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < TOTAL_ZONES; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return (shotZoneIndex + 1) % TOTAL_ZONES;
}

function areAdjacent(a, b) {
  if (a === b) return false;
  const ca = a % GOAL_GRID.cols, ra = Math.floor(a / GOAL_GRID.cols);
  const cb = b % GOAL_GRID.cols, rb = Math.floor(b / GOAL_GRID.cols);
  return Math.abs(ca - cb) <= 1 && Math.abs(ra - rb) <= 1;
}

// Resuelve si hubo atajada. power01 alto dificulta la atajada incluso acertando el lado.
export function resolveSave(diveZoneIndex, shotZoneIndex, power01 = 0.6, keeperSkill = 75) {
  const skillFactor = clamp(keeperSkill / 100, 0.2, 1);

  if (diveZoneIndex === shotZoneIndex) {
    const baseSaveChance = 0.55 + skillFactor * 0.35;
    const saveChance = clamp(baseSaveChance - power01 * 0.3, 0.15, 0.95);
    return Math.random() < saveChance;
  }

  if (areAdjacent(diveZoneIndex, shotZoneIndex)) {
    const partialChance = clamp(0.12 + skillFactor * 0.15 - power01 * 0.15, 0.02, 0.35);
    return Math.random() < partialChance;
  }

  return false;
}
