import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { drawStadiumBackground } from '../ui/Stadium.js';
import { loadSave, saveGame } from '../systems/SaveManager.js';
import AudioManager from '../systems/AudioManager.js';

export default class MainMenuScene extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    drawStadiumBackground(this);
    this.save = loadSave();
    this.audio = this.game.registry.get('audio') || new AudioManager();
    this.audio.setEnabled(this.save.settings.audio);
    this.game.registry.set('audio', this.audio);

    this.add.text(GAME_WIDTH / 2, 60, 'PENALTY LIGA 1', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '46px',
      color: '#ffe000',
      stroke: '#0a2a52',
      strokeThickness: 8
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 104, 'Arcade de tanda de penales · Fútbol Peruano', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const buttons = [
      { label: '🏆 Modo Torneo', scene: 'TeamSelect', data: { mode: 'tournament-pick' } },
      { label: '👥 Multijugador Local (2P)', scene: 'TeamSelect', data: { mode: 'local-p1' } },
      { label: '🎯 Práctica / Desafío Rápido', scene: 'Practice', data: {} }
    ];

    buttons.forEach((btn, i) => {
      this._makeButton(GAME_WIDTH / 2, 200 + i * 64, 360, 52, btn.label, () => {
        this.scene.start(btn.scene, btn.data);
      });
    });

    // Toggle de audio/comentarista
    const audioLabel = () => (this.audio.enabled ? '🔊 Audio: ON' : '🔇 Audio: OFF');
    this.audioBtnText = this._makeButton(GAME_WIDTH / 2 - 110, GAME_HEIGHT - 46, 190, 40, audioLabel(), () => {
      this.audio.setEnabled(!this.audio.enabled);
      this.save = saveGame({ settings: { ...this.save.settings, audio: this.audio.enabled } });
      this.audioBtnText.setText(audioLabel());
    }).labelText;

    const diffs = ['facil', 'normal', 'dificil'];
    let diffIdx = diffs.indexOf(this.save.settings.difficulty);
    const diffLabel = () => `🎚 Dificultad: ${diffs[diffIdx].toUpperCase()}`;
    this.diffBtnText = this._makeButton(GAME_WIDTH / 2 + 110, GAME_HEIGHT - 46, 190, 40, diffLabel(), () => {
      diffIdx = (diffIdx + 1) % diffs.length;
      this.save = saveGame({ settings: { ...this.save.settings, difficulty: diffs[diffIdx] } });
      this.diffBtnText.setText(diffLabel());
    }).labelText;

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 14,
      'Proyecto de fans, sin afiliación oficial con clubes o federaciones. Escudos originales.',
      { fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#99a3b0' }
    ).setOrigin(0.5);
  }

  _makeButton(x, y, w, h, label, onClick) {
    const bg = this.add.rectangle(x, y, w, h, 0x0f2f57, 0.9).setStrokeStyle(2, 0xffe000).setInteractive({ useHandCursor: true });
    const labelText = this.add.text(x, y, label, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '18px',
      color: '#ffffff'
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x1c4f8a, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(0x0f2f57, 0.9));
    bg.on('pointerdown', () => {
      this.tweens.add({ targets: [bg, labelText], scale: 0.95, duration: 60, yoyo: true });
      onClick();
    });

    return { bg, labelText };
  }
}
