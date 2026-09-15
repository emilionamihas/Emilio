import { GAME_WIDTH, GAME_HEIGHT, GOAL_RECT, GOAL_GRID, PENALTY_SPOT, DIFFICULTY } from '../config/gameConfig.js';
import { drawStadiumBackground } from '../ui/Stadium.js';
import { drawGoal, worldToZone, zoneToIndex, zoneCenterToWorld } from '../ui/GoalZones.js';
import HUD from '../ui/HUD.js';
import Ball from '../entities/Ball.js';
import Goalkeeper from '../entities/Goalkeeper.js';
import ShotInputSystem from '../systems/ShotInputSystem.js';
import MatchState from '../systems/MatchState.js';
import { aiDecideZone, resolveSave } from '../systems/GoalkeeperAI.js';
import { simulateAIShot } from '../systems/AIShooter.js';
import { loadSave } from '../systems/SaveManager.js';

export default class ShootoutScene extends Phaser.Scene {
  constructor() {
    super('Shootout');
  }

  init(data) {
    this.mode = data.mode;
    this.teamA = data.teamA;
    this.teamB = data.teamB;
    this.humanA = !!data.humanA;
    this.humanB = !!data.humanB;
    this.tournament = data.tournament || null;
    this.userTeamId = data.userTeamId || null;
    this.matchIndex = typeof data.matchIndex === 'number' ? data.matchIndex : null;

    const save = loadSave();
    this.difficulty = DIFFICULTY[save.settings.difficulty] || DIFFICULTY.normal;
    this.audio = this.game.registry.get('audio');
    this.busy = false;
  }

  create() {
    drawStadiumBackground(this);
    drawGoal(this, { showGrid: false });
    this._drawZoneNumbers();

    this.ball = new Ball(this, PENALTY_SPOT.x, PENALTY_SPOT.y);
    this.striker = this.add.image(PENALTY_SPOT.x, PENALTY_SPOT.y + 28, 'keeper').setDepth(7).setFlipY(true);
    this.keeper = new Goalkeeper(this, this.teamA.colors.primary);

    this.hud = new HUD(this);
    this.matchState = new MatchState(this.teamA, this.teamB);

    this.shotInput = new ShotInputSystem(this, { onShoot: (shot) => this._onHumanShot(shot) });

    this.pendingZone = null;
    this._setupKeeperKeyboard();

    this._startRound();
  }

  _drawZoneNumbers() {
    const labelsOrder = [7, 8, 9, 4, 5, 6, 1, 2, 3];
    const cw = GOAL_RECT.width / GOAL_GRID.cols;
    const rh = GOAL_RECT.height / GOAL_GRID.rows;
    let i = 0;
    for (let row = 0; row < GOAL_GRID.rows; row++) {
      for (let col = 0; col < GOAL_GRID.cols; col++) {
        const pos = zoneCenterToWorld(col, row);
        this.add.text(pos.x, pos.y, String(labelsOrder[i]), {
          fontFamily: 'Arial, sans-serif', fontSize: '13px', color: '#ffffff'
        }).setOrigin(0.5).setAlpha(0.25).setDepth(3);

        const zoneIndex = zoneToIndex(col, row);
        const hitZone = this.add.rectangle(pos.x, pos.y, cw - 4, rh - 4, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true })
          .setDepth(4);
        hitZone.on('pointerdown', () => this._commitKeeperZone(zoneIndex));
        i++;
      }
    }
  }

  _setupKeeperKeyboard() {
    this.input.keyboard.on('keydown', (event) => {
      if (!this.awaitingKeeperInput) return;
      const mapped = this._keyCodeToZone(event);
      if (mapped != null) this._commitKeeperZone(mapped);
    });
  }

  _keyCodeToZone(event) {
    const map = {
      Digit7: 0, Numpad7: 0,
      Digit8: 1, Numpad8: 1,
      Digit9: 2, Numpad9: 2,
      Digit4: 3, Numpad4: 3,
      Digit5: 4, Numpad5: 4,
      Digit6: 5, Numpad6: 5,
      Digit1: 6, Numpad1: 6,
      Digit2: 7, Numpad2: 7,
      Digit3: 8, Numpad3: 8
    };
    return map[event.code] ?? null;
  }

  _startRound() {
    if (this.matchState.winner) {
      this._finalizeMatch();
      return;
    }

    this.busy = false;
    const shooterKey = this.matchState.turn;
    const shooterTeam = shooterKey === 'A' ? this.teamA : this.teamB;
    const keeperTeam = shooterKey === 'A' ? this.teamB : this.teamA;
    const humanShooting = shooterKey === 'A' ? this.humanA : this.humanB;
    const humanDefending = shooterKey === 'A' ? this.humanB : this.humanA;

    this.currentShooterTeam = shooterTeam;
    this.currentKeeperTeam = keeperTeam;
    this.currentHumanDefending = humanDefending;

    this.ball.resetTo(PENALTY_SPOT);
    this.striker.setPosition(PENALTY_SPOT.x, PENALTY_SPOT.y + 28).setTint(shooterTeam.colors.primary);
    this.keeper.reset();
    this.keeper.sprite.setTint(keeperTeam.colors.primary);

    const roundLabel = this.matchState.suddenDeath
      ? `Muerte Súbita · Ronda ${this.matchState.suddenRound + 1}`
      : `Ronda ${Math.max(this.matchState.shotsA, this.matchState.shotsB) + 1} de ${this.matchState.roundsPerMatch}`;
    this.hud.setRound(roundLabel);
    this.hud.setScore(this.teamA.shortName, this.matchState.scoreA, this.teamB.shortName, this.matchState.scoreB);
    this.hud.setHint(humanShooting
      ? 'Arrastra desde el balón hacia la portería para patear'
      : (humanDefending ? 'Defiende: usa el teclado (7-8-9 / 4-5-6 / 1-2-3) o toca una zona' : `${shooterTeam.name} está pateando...`));

    this.awaitingKeeperInput = false;
    this.pendingZone = null;

    if (humanShooting) {
      this.shotInput.accuracyStat = shooterTeam.stats.shotAccuracy;
      this.shotInput.powerStat = shooterTeam.stats.shotPower;
      this.shotInput.enable();
    } else {
      this.time.delayedCall(700, () => {
        const shot = simulateAIShot(shooterTeam, humanDefending ? 1 : this.difficulty.keeperSkillMod);
        this._resolveShot(shot);
      });
    }
  }

  _onHumanShot(shot) {
    if (this.busy) return;
    this.shotInput.disable();
    this._resolveShot(shot);
  }

  _resolveShot(shot) {
    this.busy = true;
    const flightDuration = 620 * (1.15 - shot.power01 * 0.3);

    if (shot.missWide || shot.missOverBar) {
      this.ball.shootTo({ origin: shot.origin, target: shot.targetWorld, power01: shot.power01, curveSigned01: shot.curveSigned01, durationMs: flightDuration }, () => {
        this._announce('afuera', '¡A LA TRIBUNA!', '#ff5555');
        this.matchState.recordShot(false);
        this._afterShot();
      });
      return;
    }

    const zone = worldToZone(shot.targetWorld.x, shot.targetWorld.y);
    const shotZoneIndex = zoneToIndex(zone.col, zone.row);

    if (this.currentHumanDefending) {
      this.awaitingKeeperInput = true;
      this.pendingZone = null;
      this.diveCommitRatio = null;
      const startTime = this.time.now;

      this.ball.shootTo({ origin: shot.origin, target: shot.targetWorld, power01: shot.power01, curveSigned01: shot.curveSigned01, durationMs: flightDuration }, () => {
        this.awaitingKeeperInput = false;
        let saved = false;
        if (this.pendingZone != null && this.diveCommitRatio <= 0.9) {
          saved = resolveSave(this.pendingZone, shotZoneIndex, shot.power01, this.currentKeeperTeam.stats.goalkeeping);
        }
        this._resolveOutcome(saved);
      });

      this._pendingFlightStart = startTime;
      this._pendingFlightDuration = flightDuration;
    } else {
      const diveZone = aiDecideZone(shotZoneIndex, this.currentKeeperTeam.stats.goalkeeping, this.difficulty.keeperSkillMod);
      this.keeper.dive(diveZone, Math.min(320, flightDuration * 0.6));

      this.ball.shootTo({ origin: shot.origin, target: shot.targetWorld, power01: shot.power01, curveSigned01: shot.curveSigned01, durationMs: flightDuration }, () => {
        const saved = resolveSave(diveZone, shotZoneIndex, shot.power01, this.currentKeeperTeam.stats.goalkeeping);
        this._resolveOutcome(saved);
      });
    }
  }

  _commitKeeperZone(zoneIndex) {
    if (!this.awaitingKeeperInput || this.pendingZone != null) return;
    this.pendingZone = zoneIndex;
    this.diveCommitRatio = (this.time.now - this._pendingFlightStart) / this._pendingFlightDuration;
    const remaining = Math.max(80, this._pendingFlightDuration * (1 - this.diveCommitRatio));
    this.keeper.dive(zoneIndex, remaining);
  }

  _resolveOutcome(saved) {
    if (saved) {
      this._announce('atajada', '¡ATAJÓ EL PORTERO!', '#55d6ff');
      this.matchState.recordShot(false);
      this.cameras.main.flash(180, 120, 200, 255);
    } else {
      this._announce('gol', '¡GOOOL!', '#ffe000');
      this.matchState.recordShot(true);
      this.cameras.main.shake(200, 0.006);
    }
    this._afterShot();
  }

  _announce(category, text, color) {
    this.hud.shout(text, color);
    this.audio?.say(category);
  }

  _afterShot() {
    this.hud.setScore(this.teamA.shortName, this.matchState.scoreA, this.teamB.shortName, this.matchState.scoreB);
    this.time.delayedCall(1300, () => this._startRound());
  }

  _finalizeMatch() {
    const winnerTeam = this.matchState.winningTeam();
    const scoreLine = `${this.matchState.scoreA}-${this.matchState.scoreB}`;

    if (this.mode === 'tournament') {
      this.scene.start('TournamentBracket', {
        tournament: this.tournament,
        userTeamId: this.userTeamId,
        userMatchResult: { matchIndex: this.matchIndex, winnerTeam, scoreLine }
      });
    } else {
      this.scene.start('Result', {
        mode: 'local',
        localWinnerTeam: winnerTeam,
        teamA: this.teamA,
        teamB: this.teamB,
        scoreLine
      });
    }
  }
}
