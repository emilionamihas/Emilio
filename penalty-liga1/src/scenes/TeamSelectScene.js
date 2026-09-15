import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { TEAMS } from '../data/teams.js';
import { drawStadiumBackground } from '../ui/Stadium.js';
import TournamentManager from '../systems/TournamentManager.js';

const COLS = 5;

export default class TeamSelectScene extends Phaser.Scene {
  constructor() {
    super('TeamSelect');
  }

  init(data) {
    this.mode = data.mode || 'tournament-pick';
    this.prevData = data;
  }

  create() {
    drawStadiumBackground(this);

    const titleByMode = {
      'tournament-pick': 'Elige tu equipo para el Torneo Liga 1',
      'local-p1': 'Jugador 1: elige tu equipo',
      'local-p2': 'Jugador 2: elige tu equipo'
    };

    this.add.text(GAME_WIDTH / 2, 30, titleByMode[this.mode] || 'Elige tu equipo', {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '24px',
      color: '#ffe000'
    }).setOrigin(0.5);

    const startX = 90;
    const startY = 90;
    const cellW = 165;
    const cellH = 130;

    TEAMS.forEach((team, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * cellW;
      const y = startY + row * cellH;
      this._createTeamCard(x, y, team);
    });

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'Toca un escudo para seleccionar', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
      color: '#cccccc'
    }).setOrigin(0.5);
  }

  _createTeamCard(x, y, team) {
    const bg = this.add.rectangle(x, y, 150, 116, 0x0f2f57, 0.85)
      .setStrokeStyle(2, 0x1c4f8a)
      .setInteractive({ useHandCursor: true });

    const crest = this.add.image(x, y - 26, `crest_${team.id}`).setScale(0.5);
    this.add.text(x, y + 20, team.name, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: 138 }
    }).setOrigin(0.5);

    const avg = Math.round((team.stats.shotPower + team.stats.shotAccuracy + team.stats.goalkeeping) / 3);
    this.add.text(x, y + 48, `OVR ${avg}`, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '12px',
      color: '#ffe000'
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffe000));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0x1c4f8a));
    bg.on('pointerdown', () => this._selectTeam(team));
  }

  _selectTeam(team) {
    if (this.mode === 'tournament-pick') {
      const pool = Phaser.Utils.Array.Shuffle(TEAMS.filter((t) => t.id !== team.id)).slice(0, 7);
      const bracketTeams = Phaser.Utils.Array.Shuffle([team, ...pool]);
      const tournament = new TournamentManager(bracketTeams);
      this.scene.start('TournamentBracket', { tournament, userTeamId: team.id });
      return;
    }

    if (this.mode === 'local-p1') {
      this.scene.start('TeamSelect', { mode: 'local-p2', teamA: team });
      return;
    }

    if (this.mode === 'local-p2') {
      this.scene.start('Shootout', {
        mode: 'local',
        teamA: this.prevData.teamA,
        teamB: team,
        humanA: true,
        humanB: true
      });
    }
  }
}
