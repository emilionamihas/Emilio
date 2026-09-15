import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

const BANDEROLA_COLORS = [0xd4141a, 0xffe000, 0x00539f, 0xffffff, 0x1c8c3b, 0xff8c00];

// Fondo de estadio genérico (no reproduce ningún recinto real): cielo, tribunas con
// banderolas de colores y cancha en perspectiva, para dar ambientación arcade 2.5D.
export function drawStadiumBackground(scene) {
  const g = scene.add.graphics().setDepth(-10);

  // Cielo
  g.fillGradientStyle(0x0a2a52, 0x0a2a52, 0x1c4f8a, 0x1c4f8a, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT * 0.35);

  // Tribuna trasera
  g.fillStyle(0x22262e, 1);
  g.fillRect(0, GAME_HEIGHT * 0.12, GAME_WIDTH, GAME_HEIGHT * 0.25);

  // Banderolas / hinchada (bloques de color)
  const blockW = 18;
  for (let x = 0; x < GAME_WIDTH; x += blockW) {
    const color = BANDEROLA_COLORS[Math.floor(Math.random() * BANDEROLA_COLORS.length)];
    g.fillStyle(color, 0.85);
    const h = 14 + Math.random() * 10;
    g.fillRect(x, GAME_HEIGHT * 0.14 + (18 - h), blockW - 2, h);
  }

  // Cancha (trapecio en perspectiva)
  g.fillStyle(0x1e7d32, 1);
  g.beginPath();
  g.moveTo(GAME_WIDTH * 0.08, GAME_HEIGHT * 0.37);
  g.lineTo(GAME_WIDTH * 0.92, GAME_HEIGHT * 0.37);
  g.lineTo(GAME_WIDTH, GAME_HEIGHT);
  g.lineTo(0, GAME_HEIGHT);
  g.closePath();
  g.fillPath();

  // Franjas de césped
  g.fillStyle(0x228b3a, 0.5);
  for (let i = 0; i < 6; i++) {
    const t0 = i / 6;
    const t1 = (i + 0.5) / 6;
    const y0 = Phaser.Math.Linear(GAME_HEIGHT * 0.37, GAME_HEIGHT, t0);
    const y1 = Phaser.Math.Linear(GAME_HEIGHT * 0.37, GAME_HEIGHT, t1);
    const w0 = Phaser.Math.Linear(GAME_WIDTH * 0.84, GAME_WIDTH, t0);
    const w1 = Phaser.Math.Linear(GAME_WIDTH * 0.84, GAME_WIDTH, t1);
    g.fillRect((GAME_WIDTH - w0) / 2, y0, w0, y1 - y0);
  }

  // Área penal (arco simple)
  g.lineStyle(3, 0xffffff, 0.7);
  g.strokeRect(GAME_WIDTH / 2 - 160, GAME_HEIGHT * 0.42, 320, GAME_HEIGHT * 0.5);

  return g;
}

export function celebrationFireworks(scene) {
  const colors = [0xffe000, 0xd4141a, 0x00539f, 0xffffff, 0x1c8c3b];
  for (let i = 0; i < 6; i++) {
    scene.time.delayedCall(i * 220, () => {
      const x = Phaser.Math.Between(80, GAME_WIDTH - 80);
      const y = Phaser.Math.Between(60, GAME_HEIGHT * 0.4);
      const burst = scene.add.particles(x, y, 'spark', {
        speed: { min: 80, max: 220 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.6, end: 0 },
        lifespan: 700,
        quantity: 24,
        tint: colors[Phaser.Math.Between(0, colors.length - 1)]
      });
      scene.time.delayedCall(750, () => burst.destroy());
    });
  }
}
