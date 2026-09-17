import { GAME_WIDTH, GAME_HEIGHT, GOAL_RECT, PENALTY_SPOT } from '../config/gameConfig.js';
import { drawStadiumBackground } from '../ui/Stadium.js';
import { drawGoal, worldToZone, zoneToIndex } from '../ui/GoalZones.js';
import HUD from '../ui/HUD.js';
import Ball from '../entities/Ball.js';
import ShotInputSystem from '../systems/ShotInputSystem.js';
import { loadSave, saveGame } from '../systems/SaveManager.js';
import { clamp } from '../utils/MathUtils.js';

const POINT_VALUES = [50, 30, 50, 30, 10, 30, 50, 30, 50];
const TOTAL_SHOTS = 10;

export default class PracticeScene extends Phaser.Scene {
  constructor() {
    super('Practice');
  }

  create() {
    drawStadiumBackground(this);
    drawGoal(this, { showGrid: true, pointValues: POINT_VALUES });

    this.audio = this.game.registry.get('audio');
    this.hud = new HUD(this);
    this.ball = new Ball(this, PENALTY_SPOT.x, PENALTY_SPOT.y);

    this.shotsTaken = 0;
    this.score = 0;
    this.save = loadSave();

    this._createBarrier();
    this._rollWind();

    this.shotInput = new ShotInputSystem(this, {
      onShoot: (shot) => this._onShoot(shot),
      accuracyStat: 78,
      powerStat: 78
    });
    this.shotInput.enable();

    this.hud.setRound('Desafío Rápido · Práctica');
    this._updateHudScore();
    this.hud.setHint('Arrastra desde el balón hacia la portería. ¡Apunta a las esquinas (50 pts)!');

    this.add.text(GAME_WIDTH - 12, GAME_HEIGHT - 12, 'Volver al menú', {
      fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#cccccc'
    }).setOrigin(1).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('MainMenu'));
  }

  _createBarrier() {
    this.barrierSprites = [];
    const y = GOAL_RECT.y + GOAL_RECT.height + 46;
    for (let i = -1; i <= 1; i++) {
      const s = this.add.image(GAME_WIDTH / 2 + i * 34, y, 'keeper').setTint(0x555555).setDepth(6);
      this.barrierSprites.push(s);
    }
    this.barrierOffset = { x: 0 };
    this.tweens.add({
      targets: this.barrierOffset,
      x: 60,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.barrierSprites.forEach((s, i) => s.setPosition(GAME_WIDTH / 2 + (i - 1) * 34 + this.barrierOffset.x, y));
      }
    });
  }

  _rollWind() {
    this.windStrength = Phaser.Math.Between(-2, 2) / 2; // -1..1
    const arrow = this.windStrength === 0 ? '·' : (this.windStrength > 0 ? '→'.repeat(Math.ceil(Math.abs(this.windStrength) * 2)) : '←'.repeat(Math.ceil(Math.abs(this.windStrength) * 2)));
    this.hud.setHint(`Viento: ${arrow || 'calma'}`);
    if (this.windText) this.windText.destroy();
    this.windText = this.add.text(16, 60, `Viento: ${arrow || 'calma'}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#ffe000'
    });
  }

  _onShoot(shot) {
    this.shotInput.disable();
    const windOffset = this.windStrength * 34;
    const target = { x: shot.targetWorld.x + (shot.missOverBar ? 0 : windOffset), y: shot.targetWorld.y };

    const barrierX = GAME_WIDTH / 2 + this.barrierOffset.x;
    const blocked = !shot.missWide && !shot.missOverBar &&
      Math.abs(target.x - barrierX) < 26 && Math.random() < clamp(0.4 - shot.power01 * 0.3, 0.05, 0.4);

    const finalTarget = blocked ? { x: barrierX, y: GOAL_RECT.y + GOAL_RECT.height + 30 } : target;

    this.ball.shootTo({ origin: shot.origin, target: finalTarget, power01: shot.power01, curveSigned01: shot.curveSigned01 }, () => {
      this._resolveShot(shot, blocked);
    });
  }

  _resolveShot(shot, blocked) {
    this.shotsTaken++;
    let points = 0;
    let text = '';
    let color = '#ffffff';

    if (blocked) {
      text = '¡BLOQUEADO EN LA BARRERA!';
      color = '#ffaa00';
    } else if (shot.missWide || shot.missOverBar) {
      text = '¡AFUERA!';
      color = '#ff5555';
    } else {
      const zone = worldToZone(shot.targetWorld.x, shot.targetWorld.y);
      const idx = zoneToIndex(zone.col, zone.row);
      points = POINT_VALUES[idx];
      text = `¡DIANA! +${points}`;
      color = '#ffe000';
      this.audio?.say('gol');
    }

    this.score += points;
    this.hud.shout(text, color);
    this._updateHudScore();

    this.time.delayedCall(1000, () => {
      if (this.shotsTaken >= TOTAL_SHOTS) {
        this._finish();
      } else {
        this.ball.resetTo(PENALTY_SPOT);
        this._rollWind();
        this.shotInput.enable();
      }
    });
  }

  _updateHudScore() {
    this.hud.setScore('Puntaje', this.score, `Tiro ${this.shotsTaken}/${TOTAL_SHOTS}`, '');
  }

  _finish() {
    const best = Math.max(this.score, this.save.practiceHighScore || 0);
    this.save = saveGame({ practiceHighScore: best });
    this.scene.start('Result', { mode: 'practice', practiceScore: this.score, practiceBest: best });
  }
}
