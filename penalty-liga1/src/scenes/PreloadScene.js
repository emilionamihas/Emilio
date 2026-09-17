import { TEAMS } from '../data/teams.js';
import { generateAllCrests } from '../data/CrestFactory.js';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create() {
    this._generateBallTexture();
    this._generateKeeperTexture();
    this._generateSparkTexture();
    generateAllCrests(this, TEAMS);
    this.scene.start('MainMenu');
  }

  _generateBallTexture() {
    const g = this.add.graphics();
    const r = 12;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(r, r, r);
    g.lineStyle(1.5, 0x222222, 0.6);
    g.strokeCircle(r, r, r);
    g.fillStyle(0x222222, 1);
    g.fillCircle(r, r, 3.2);
    for (let i = 0; i < 5; i++) {
      const ang = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      g.fillCircle(r + Math.cos(ang) * 6, r + Math.sin(ang) * 6, 2.1);
    }
    g.generateTexture('ball', r * 2, r * 2);
    g.destroy();
  }

  _generateKeeperTexture() {
    const g = this.add.graphics();
    const w = 40, h = 58;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(w / 2, 10, 9); // cabeza
    g.fillRoundedRect(w / 2 - 12, 18, 24, 30, 6); // torso
    g.fillRoundedRect(w / 2 - 20, 20, 10, 24, 4); // brazo izq
    g.fillRoundedRect(w / 2 + 10, 20, 10, 24, 4); // brazo der
    g.fillRoundedRect(w / 2 - 9, 46, 8, 12, 3); // pierna izq
    g.fillRoundedRect(w / 2 + 1, 46, 8, 12, 3); // pierna der
    g.generateTexture('keeper', w, h);
    g.destroy();
  }

  _generateSparkTexture() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }
}
