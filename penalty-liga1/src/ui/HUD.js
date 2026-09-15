import { GAME_WIDTH } from '../config/gameConfig.js';

export default class HUD {
  constructor(scene) {
    this.scene = scene;

    this.scoreText = scene.add.text(GAME_WIDTH / 2, 16, '', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '24px',
      color: '#ffffff'
    }).setOrigin(0.5, 0).setDepth(20);

    this.roundText = scene.add.text(GAME_WIDTH / 2, 44, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      color: '#ffe000'
    }).setOrigin(0.5, 0).setDepth(20);

    this.commentaryText = scene.add.text(GAME_WIDTH / 2, 150, '', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '34px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 6
    }).setOrigin(0.5).setDepth(25).setAlpha(0);

    this.hintText = scene.add.text(GAME_WIDTH / 2, GAME_WIDTH < 700 ? 500 : 500, '', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#cccccc'
    }).setOrigin(0.5).setDepth(20);
  }

  setScore(nameA, scoreA, nameB, scoreB) {
    this.scoreText.setText(`${nameA}  ${scoreA} - ${scoreB}  ${nameB}`);
  }

  setRound(label) {
    this.roundText.setText(label);
  }

  setHint(text) {
    this.hintText.setText(text);
  }

  shout(text, color = '#ffffff') {
    this.commentaryText.setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.scene.tweens.add({
      targets: this.commentaryText,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut'
    });
    this.scene.tweens.add({
      targets: this.commentaryText,
      alpha: 0,
      delay: 900,
      duration: 400
    });
  }
}
