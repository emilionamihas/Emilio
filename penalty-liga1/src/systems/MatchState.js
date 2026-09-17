import { ROUNDS_PER_MATCH } from '../config/gameConfig.js';

// Controla el estado de una tanda de penales: rondas regulares + muerte súbita.
// Turnos alternos A/B. Detecta victoria anticipada (cuando el rival ya no puede
// alcanzar el marcador con los tiros que le quedan), igual que en un partido real.
export default class MatchState {
  constructor(teamA, teamB, roundsPerMatch = ROUNDS_PER_MATCH) {
    this.teamA = teamA;
    this.teamB = teamB;
    this.roundsPerMatch = roundsPerMatch;

    this.scoreA = 0;
    this.scoreB = 0;
    this.shotsA = 0;
    this.shotsB = 0;

    this.suddenDeath = false;
    this.suddenRound = 0;
    this.turn = 'A';
    this.history = [];
    this.winner = null;
  }

  get remainingA() {
    return this.suddenDeath ? Infinity : this.roundsPerMatch - this.shotsA;
  }

  get remainingB() {
    return this.suddenDeath ? Infinity : this.roundsPerMatch - this.shotsB;
  }

  currentTeam() {
    return this.turn === 'A' ? this.teamA : this.teamB;
  }

  isRoundComplete() {
    return !this.suddenDeath && this.shotsA + this.shotsB >= this.roundsPerMatch * 2;
  }

  recordShot(scored) {
    if (this.winner) return this.winner;

    if (this.turn === 'A') {
      this.shotsA++;
      if (scored) this.scoreA++;
    } else {
      this.shotsB++;
      if (scored) this.scoreB++;
    }
    this.history.push({ team: this.turn, scored, suddenDeath: this.suddenDeath, round: this.suddenDeath ? this.suddenRound : Math.max(this.shotsA, this.shotsB) });

    this._checkEarlyWin();
    if (!this.winner) this._advanceTurn();
    return this.winner;
  }

  _checkEarlyWin() {
    if (this.suddenDeath) return;
    if (this.scoreA > this.scoreB + this.remainingB) this.winner = 'A';
    else if (this.scoreB > this.scoreA + this.remainingA) this.winner = 'B';
  }

  _advanceTurn() {
    if (!this.suddenDeath) {
      if (this.shotsA + this.shotsB >= this.roundsPerMatch * 2) {
        if (this.scoreA === this.scoreB) {
          this.suddenDeath = true;
          this.turn = 'A';
        } else {
          this.winner = this.scoreA > this.scoreB ? 'A' : 'B';
        }
        return;
      }
      this.turn = this.turn === 'A' ? 'B' : 'A';
    } else {
      if (this.turn === 'A') {
        this.turn = 'B';
      } else {
        this.suddenRound++;
        if (this.scoreA !== this.scoreB) {
          this.winner = this.scoreA > this.scoreB ? 'A' : 'B';
        }
        this.turn = 'A';
      }
    }
  }

  winningTeam() {
    if (!this.winner) return null;
    return this.winner === 'A' ? this.teamA : this.teamB;
  }
}
