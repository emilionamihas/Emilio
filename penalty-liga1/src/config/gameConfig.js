// Dimensiones base del "mundo" del juego (diseño responsivo vía Phaser.Scale.FIT)
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Rectángulo de la portería en coordenadas de mundo (vista desde atrás del pateador,
// simulando profundidad 2.5D: la portería está "lejos", arriba de la pantalla)
export const GOAL_RECT = {
  x: GAME_WIDTH / 2 - 190,
  y: 70,
  width: 380,
  height: 140
};

// Punto de penal (desde donde sale el balón)
export const PENALTY_SPOT = { x: GAME_WIDTH / 2, y: GAME_HEIGHT - 90 };

// Grid de la portería: 3 columnas x 3 filas = 9 zonas (índice 0..8, fila-mayor)
export const GOAL_GRID = { cols: 3, rows: 3 };

export const ROUNDS_PER_MATCH = 5;

export const DIFFICULTY = {
  facil: { keeperReactMs: 750, keeperSkillMod: 0.75 },
  normal: { keeperReactMs: 600, keeperSkillMod: 1.0 },
  dificil: { keeperReactMs: 450, keeperSkillMod: 1.25 }
};

export const STORAGE_KEY = 'penalty-liga1-save-v1';
