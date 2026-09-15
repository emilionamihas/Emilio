import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { drawStadiumBackground } from '../ui/Stadium.js';
import { simulateCpuMatch } from '../systems/TournamentManager.js';

export default class TournamentBracketScene extends Phaser.Scene {
  constructor() {
    super('TournamentBracket');
  }

  init(data) {
    this.tournament = data.tournament;
    this.userTeamId = data.userTeamId;

    if (data.userMatchResult) {
      const { matchIndex, winnerTeam, scoreLine } = data.userMatchResult;
      this.tournament.recordMatchResult(matchIndex, winnerTeam, scoreLine);
    }
  }

  create() {
    drawStadiumBackground(this);
    this._autoSimulateCpuMatches();

    if (this.tournament.isTournamentOver()) {
      this.scene.start('Result', { champion: this.tournament.getChampion(), userTeamId: this.userTeamId, tournament: this.tournament });
      return;
    }

    const userStillIn = this._teamStillInTournament();
    if (!userStillIn) {
      this._finishRemainingRoundsInstantly();
      this.scene.start('Result', {
        champion: this.tournament.getChampion(),
        userTeamId: this.userTeamId,
        tournament: this.tournament,
        eliminated: true
      });
      return;
    }

    this._renderBracket();
  }

  _teamStillInTournament() {
    return this.tournament.currentRound.some(
      (m) => m.teamA.id === this.userTeamId || m.teamB.id === this.userTeamId
    );
  }

  _autoSimulateCpuMatches() {
    this.tournament.currentRound.forEach((match, idx) => {
      if (match.winner) return;
      const involvesUser = match.teamA.id === this.userTeamId || match.teamB.id === this.userTeamId;
      if (involvesUser) return;
      const { winner, scoreA, scoreB } = simulateCpuMatch(match.teamA, match.teamB);
      this.tournament.recordMatchResult(idx, winner, `${scoreA}-${scoreB}`);
    });
  }

  _finishRemainingRoundsInstantly() {
    let guard = 0;
    while (!this.tournament.isTournamentOver() && guard < 20) {
      this.tournament.currentRound.forEach((match, idx) => {
        if (match.winner) return;
        const { winner, scoreA, scoreB } = simulateCpuMatch(match.teamA, match.teamB);
        this.tournament.recordMatchResult(idx, winner, `${scoreA}-${scoreB}`);
      });
      guard++;
    }
  }

  _renderBracket() {
    const roundName = this.tournament.roundNameFor(this.tournament.currentRoundIndex);
    this.add.text(GAME_WIDTH / 2, 26, `Copa Liga 1 · ${roundName}`, {
      fontFamily: 'Arial Black, Arial, sans-serif',
      fontSize: '24px',
      color: '#ffe000'
    }).setOrigin(0.5);

    const colCount = this.tournament.rounds.length;
    const colWidth = Math.min(190, (GAME_WIDTH - 60) / colCount);
    const startX = 60;

    this.tournament.rounds.forEach((round, ri) => {
      const x = startX + ri * colWidth;
      this.add.text(x, 56, this.tournament.roundNameFor(ri).replace(' de Final', ''), {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#99a3b0'
      }).setOrigin(0, 0);

      const rowHeight = (GAME_HEIGHT - 100) / round.length;
      round.forEach((match, mi) => {
        const y = 78 + rowHeight * mi + rowHeight / 2;
        this._matchCard(x, y, colWidth - 14, match);
      });
    });

    const pendingIndex = this.tournament.currentRound.findIndex(
      (m) => !m.winner && (m.teamA.id === this.userTeamId || m.teamB.id === this.userTeamId)
    );

    if (pendingIndex >= 0) {
      const match = this.tournament.currentRound[pendingIndex];
      const userIsA = match.teamA.id === this.userTeamId;
      const opponent = userIsA ? match.teamB : match.teamA;

      const btn = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 44, 260, 48, 0x1c8c3b, 0.95)
        .setStrokeStyle(2, 0xffffff).setInteractive({ useHandCursor: true });
      this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 44, `⚽ Jugar vs ${opponent.name}`, {
        fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '16px', color: '#ffffff'
      }).setOrigin(0.5);

      btn.on('pointerdown', () => {
        this.scene.start('Shootout', {
          mode: 'tournament',
          teamA: match.teamA,
          teamB: match.teamB,
          humanA: userIsA,
          humanB: !userIsA,
          tournament: this.tournament,
          userTeamId: this.userTeamId,
          matchIndex: pendingIndex
        });
      });
    }
  }

  _matchCard(x, y, w, match) {
    const winnerA = match.winner && match.winner.id === match.teamA.id;
    const winnerB = match.winner && match.winner.id === match.teamB.id;

    this.add.rectangle(x + w / 2, y, w, 46, 0x0f2f57, 0.85).setStrokeStyle(1, 0x1c4f8a);
    this.add.text(x + 6, y - 14, match.teamA.shortName, {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '12px',
      color: winnerA ? '#ffe000' : '#ffffff'
    });
    this.add.text(x + 6, y + 2, match.teamB.shortName, {
      fontFamily: 'Arial Black, Arial, sans-serif', fontSize: '12px',
      color: winnerB ? '#ffe000' : '#ffffff'
    });
    if (match.scoreLine) {
      this.add.text(x + w - 6, y, match.scoreLine, {
        fontFamily: 'Arial, sans-serif', fontSize: '11px', color: '#cccccc'
      }).setOrigin(1, 0.5);
    }
  }
}
