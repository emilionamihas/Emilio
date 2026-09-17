import { GOAL_RECT, GOAL_GRID } from '../config/gameConfig.js';

// Mapea un punto normalizado (0..1, 0..1) dentro de la portería a coordenadas de mundo
export function zoneCenterToWorld(col, row) {
  const cw = GOAL_RECT.width / GOAL_GRID.cols;
  const rh = GOAL_RECT.height / GOAL_GRID.rows;
  return {
    x: GOAL_RECT.x + cw * (col + 0.5),
    y: GOAL_RECT.y + rh * (row + 0.5)
  };
}

export function worldToZone(x, y) {
  const relX = (x - GOAL_RECT.x) / GOAL_RECT.width;
  const relY = (y - GOAL_RECT.y) / GOAL_RECT.height;
  const col = Phaser.Math.Clamp(Math.floor(relX * GOAL_GRID.cols), 0, GOAL_GRID.cols - 1);
  const row = Phaser.Math.Clamp(Math.floor(relY * GOAL_GRID.rows), 0, GOAL_GRID.rows - 1);
  return { col, row };
}

export function zoneToIndex(col, row) {
  return row * GOAL_GRID.cols + col;
}

export function indexToZone(index) {
  return { col: index % GOAL_GRID.cols, row: Math.floor(index / GOAL_GRID.cols) };
}

// Dibuja el marco de la portería + red + (opcional) grid de 9 zonas visible en modo Práctica
export function drawGoal(scene, { showGrid = false, pointValues = null } = {}) {
  const g = scene.add.graphics();

  // Postes
  g.lineStyle(6, 0xf5f5f5, 1);
  g.strokeRect(GOAL_RECT.x, GOAL_RECT.y, GOAL_RECT.width, GOAL_RECT.height);

  // Red (líneas finas)
  g.lineStyle(1, 0xffffff, 0.35);
  const netCols = 12;
  const netRows = 6;
  for (let i = 1; i < netCols; i++) {
    const x = GOAL_RECT.x + (GOAL_RECT.width / netCols) * i;
    g.lineBetween(x, GOAL_RECT.y, x, GOAL_RECT.y + GOAL_RECT.height);
  }
  for (let j = 1; j < netRows; j++) {
    const y = GOAL_RECT.y + (GOAL_RECT.height / netRows) * j;
    g.lineBetween(GOAL_RECT.x, y, GOAL_RECT.x + GOAL_RECT.width, y);
  }

  if (showGrid) {
    g.lineStyle(2, 0xffe000, 0.5);
    const cw = GOAL_RECT.width / GOAL_GRID.cols;
    const rh = GOAL_RECT.height / GOAL_GRID.rows;
    for (let c = 1; c < GOAL_GRID.cols; c++) {
      g.lineBetween(GOAL_RECT.x + cw * c, GOAL_RECT.y, GOAL_RECT.x + cw * c, GOAL_RECT.y + GOAL_RECT.height);
    }
    for (let r = 1; r < GOAL_GRID.rows; r++) {
      g.lineBetween(GOAL_RECT.x, GOAL_RECT.y + rh * r, GOAL_RECT.x + GOAL_RECT.width, GOAL_RECT.y + rh * r);
    }
  }

  if (pointValues) {
    for (let row = 0; row < GOAL_GRID.rows; row++) {
      for (let col = 0; col < GOAL_GRID.cols; col++) {
        const idx = zoneToIndex(col, row);
        const pos = zoneCenterToWorld(col, row);
        scene.add.text(pos.x, pos.y, String(pointValues[idx]), {
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: '20px',
          color: '#ffe000'
        }).setOrigin(0.5).setDepth(5);
      }
    }
  }

  return g;
}
