import { GAME_WIDTH, GAME_HEIGHT } from './config/gameConfig.js';
import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import MainMenuScene from './scenes/MainMenuScene.js';
import TeamSelectScene from './scenes/TeamSelectScene.js';
import TournamentBracketScene from './scenes/TournamentBracketScene.js';
import ShootoutScene from './scenes/ShootoutScene.js';
import PracticeScene from './scenes/PracticeScene.js';
import ResultScene from './scenes/ResultScene.js';

// En esta versión "artifact", Phaser se carga como build UMD desde jsDelivr
// (ver <script> en index.html) y ya expone window.Phaser global — no hace
// falta importarlo como paquete npm.
const Phaser = window.Phaser;

function start() {
  const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#061a33',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    input: {
      activePointers: 2
    },
    scene: [
      BootScene,
      PreloadScene,
      MainMenuScene,
      TeamSelectScene,
      TournamentBracketScene,
      ShootoutScene,
      PracticeScene,
      ResultScene
    ]
  };

  new Phaser.Game(config);
}

if (window.claude?.hot?.ready) {
  window.claude.hot.ready(start);
} else {
  start();
}
