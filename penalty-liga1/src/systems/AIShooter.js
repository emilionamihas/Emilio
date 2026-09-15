import { GOAL_RECT, PENALTY_SPOT } from '../config/gameConfig.js';
import { zoneCenterToWorld, indexToZone } from '../ui/GoalZones.js';
import { clamp, randomInRange } from '../utils/MathUtils.js';

// Genera un disparo "virtual" para un equipo controlado por la CPU, con el mismo
// formato de datos que produce ShotInputSystem, para reutilizar toda la lógica
// de animación/resolución de gol o atajada.
export function simulateAIShot(team, difficultyMod = 1) {
  const accuracy = clamp(team.stats.shotAccuracy * difficultyMod, 10, 99);
  const power01 = clamp(team.stats.shotPower / 100 + randomInRange(-0.08, 0.08), 0.35, 1);

  const missChance = clamp(((100 - accuracy) / 100) * 0.32, 0.03, 0.38);
  const roll = Math.random();
  const missWide = roll < missChance * 0.45;
  const missOverBar = !missWide && roll < missChance;

  let zoneIndex = Phaser.Math.Between(0, 8);
  if (Math.random() < accuracy / 150) {
    zoneIndex = [0, 2, 6, 8][Phaser.Math.Between(0, 3)]; // equipos precisos buscan las esquinas
  }

  const { col, row } = indexToZone(zoneIndex);
  let targetWorld = zoneCenterToWorld(col, row);

  if (missWide) {
    targetWorld = { x: targetWorld.x + (col === 0 ? -70 : 70), y: targetWorld.y };
  } else if (missOverBar) {
    targetWorld = { x: targetWorld.x, y: GOAL_RECT.y - 40 };
  }

  return {
    power01,
    curveSigned01: randomInRange(-0.6, 0.6),
    targetWorld,
    missWide,
    missOverBar,
    zoneIndex,
    origin: { x: PENALTY_SPOT.x, y: PENALTY_SPOT.y }
  };
}
