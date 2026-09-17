// Simula al instante una tanda de penales entre dos equipos CPU (para no obligar
// al jugador a jugar los partidos de la llave en los que no participa).
export function simulateCpuMatch(teamA, teamB) {
  let scoreA = 0;
  let scoreB = 0;
  for (let round = 0; round < 5; round++) {
    if (Math.random() * 100 < teamA.stats.shotAccuracy - teamB.stats.goalkeeping * 0.25) scoreA++;
    if (Math.random() * 100 < teamB.stats.shotAccuracy - teamA.stats.goalkeeping * 0.25) scoreB++;
  }
  while (scoreA === scoreB) {
    if (Math.random() * 100 < teamA.stats.shotAccuracy) scoreA++;
    if (Math.random() * 100 < teamB.stats.shotAccuracy) scoreB++;
  }
  return { winner: scoreA > scoreB ? teamA : teamB, scoreA, scoreB };
}

// Genera y avanza un bracket de eliminación directa (Octavos -> Cuartos -> Semifinal -> Final).
export default class TournamentManager {
  constructor(teams) {
    if ((teams.length & (teams.length - 1)) !== 0) {
      throw new Error('El número de equipos del torneo debe ser potencia de 2 (8, 16...)');
    }
    this.teams = teams;
    this.rounds = [];
    this._seedFirstRound();
  }

  _seedFirstRound() {
    const round = [];
    for (let i = 0; i < this.teams.length; i += 2) {
      round.push({ teamA: this.teams[i], teamB: this.teams[i + 1], winner: null });
    }
    this.rounds.push(round);
  }

  get currentRoundIndex() {
    return this.rounds.length - 1;
  }

  get currentRound() {
    return this.rounds[this.currentRoundIndex];
  }

  isTournamentOver() {
    return this.currentRound.length === 1 && !!this.currentRound[0].winner;
  }

  getChampion() {
    return this.isTournamentOver() ? this.currentRound[0].winner : null;
  }

  recordMatchResult(matchIndex, winnerTeam, scoreLine = '') {
    this.currentRound[matchIndex].winner = winnerTeam;
    this.currentRound[matchIndex].scoreLine = scoreLine;
    if (this.currentRound.every((m) => m.winner)) {
      this._advanceRound();
    }
  }

  nextPendingMatch() {
    return this.currentRound.find((m) => !m.winner) || null;
  }

  _advanceRound() {
    const winners = this.currentRound.map((m) => m.winner);
    if (winners.length === 1) return;
    const nextRound = [];
    for (let i = 0; i < winners.length; i += 2) {
      nextRound.push({ teamA: winners[i], teamB: winners[i + 1], winner: null });
    }
    this.rounds.push(nextRound);
  }

  roundNameFor(index) {
    const teamsInRound = this.rounds[index].length * 2;
    if (teamsInRound >= 16) return 'Octavos de Final';
    if (teamsInRound === 8) return 'Cuartos de Final';
    if (teamsInRound === 4) return 'Semifinal';
    return 'Gran Final';
  }
}
