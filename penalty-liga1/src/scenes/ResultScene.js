import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { drawStadiumBackground, celebrationFireworks } from '../ui/Stadium.js';

export default class ResultScene extends Phaser.Scene {
  constructor() {
    super('Result');
  }

  init(data) {
    this.data = data;
    this.audio = this.game.registry.get('audio');
  }

  create() {
    drawStadiumBackground(this);

    if (this.data.champion) {
      this._renderTournamentResult();
    } else if (this.data.mode === 'local') {
      this._renderLocalResult();
    } else if (this.data.mode === 'practice') {
      this._renderPracticeResult();
    }

    const btn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 46, 220, 48, 0x0f2f57, 0.95)
      .setStrokeStyle(2, 0xffe000).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 46, 'Volver al Menú', {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '16px', color: '#ffffff'
    }).setOrigin(0.5);
    btn.on('pointerdown', () => this.scene.start('MainMenu'));
  }

  _renderTournamentResult() {
    const isUserChampion = this.data.champion.id === this.data.userTeamId;
    const title = this.data.eliminated
      ? 'Quedaste eliminado del torneo'
      : (isUserChampion ? '¡CAMPEÓN DE LA COPA LIGA 1!' : `Campeón: ${this.data.champion.name}`);

    this.add.text(GAME_WIDTH / 2, 80, title, {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '28px', color: '#ffe000',
      align: 'center', wordWrap: { width: GAME_WIDTH - 80 }
    }).setOrigin(0.5);

    this.add.image(GAME_WIDTH / 2, 200, `crest_${this.data.champion.id}`).setScale(1.2);

    if (isUserChampion && !this.data.eliminated) {
      this.audio?.say('campeon');
      celebrationFireworks(this);
    }
  }

  _renderLocalResult() {
    const { localWinnerTeam, teamA, teamB, scoreLine } = this.data;
    this.add.text(GAME_WIDTH / 2, 90, `¡Gana ${localWinnerTeam.name}!`, {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '30px', color: '#ffe000'
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 140, `${teamA.name} ${scoreLine} ${teamB.name}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '18px', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.image(GAME_WIDTH / 2, 230, `crest_${localWinnerTeam.id}`).setScale(1.2);
    celebrationFireworks(this);
  }

  _renderPracticeResult() {
    const { practiceScore, practiceBest } = this.data;
    this.add.text(GAME_WIDTH / 2, 120, 'Desafío completado', {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '28px', color: '#ffe000'
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 170, `Puntaje: ${practiceScore}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '22px', color: '#ffffff'
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 205, `Mejor puntaje: ${practiceBest}`, {
      fontFamily: 'Arial, sans-serif', fontSize: '16px', color: '#cccccc'
    }).setOrigin(0.5);
  }
}
