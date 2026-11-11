import * as THREE from 'three';
import { ARENA, BALL, GRAVITY, RULES } from '../config/PhysicsConstants';
import type { GameMode, Team } from '../core/types';
import { Arena } from '../entities/Arena';
import type { Ball } from '../entities/Ball';
import type { Car } from '../entities/Car';
import { shuffle } from '../utils/math';

export type MatchState = 'idle' | 'countdown' | 'playing' | 'goal' | 'ended';

/** Las 5 posiciones oficiales de saque del equipo azul (x, z). */
const KICKOFF_SPOTS: Array<[number, number]> = [
  [-20.48, -25.6],
  [20.48, -25.6],
  [-2.56, -38.4],
  [2.56, -38.4],
  [0, -46.08],
];

const RESPAWN_SPOTS: Array<[number, number]> = [
  [-23.04, -46.08],
  [-26.88, -46.08],
  [23.04, -46.08],
  [26.88, -46.08],
];

interface Touch {
  carId: number;
  team: Team;
  time: number;
}

export interface MatchEvents {
  onCountdown: (n: number) => void;
  onKickoffGo: () => void;
  onGoal: (team: Team, scorer: Car | null, assist: Car | null, ballSpeed: number, ballPos: THREE.Vector3) => void;
  onOvertime: () => void;
  onEnd: (winner: Team | null) => void;
  onSave: (car: Car) => void;
  onShot: (car: Car) => void;
  onRespawn: (car: Car) => void;
}

/**
 * Bucle de juego y reglas: saques con alineaciones oficiales aleatorias, reloj
 * de 5 minutos, marcador, explosión física de gol, respawn tras demolición,
 * tiempo extra con gol de oro y estadísticas.
 */
export class Match {
  state: MatchState = 'idle';
  mode: GameMode = '1v1';
  timeLeft: number = RULES.MATCH_TIME;
  overtime = false;
  overtimeElapsed = 0;
  scores: [number, number] = [0, 0];
  countdown = 0;
  private goalTimer = 0;
  private lastCountdownShown = -1;
  private touches: Touch[] = [];
  elapsed = 0;
  winner: Team | null = null;

  constructor(
    private readonly ball: Ball,
    private readonly events: MatchEvents,
  ) {}

  get isFreeplay(): boolean {
    return this.mode === 'freeplay';
  }

  /** Los coches pueden moverse (no en la cuenta atrás ni con el partido acabado). */
  get carsCanMove(): boolean {
    return this.state === 'playing' || this.state === 'goal';
  }

  start(mode: GameMode, cars: readonly Car[]): void {
    this.mode = mode;
    this.scores = [0, 0];
    this.timeLeft = RULES.MATCH_TIME;
    this.overtime = false;
    this.overtimeElapsed = 0;
    this.winner = null;
    this.elapsed = 0;
    for (const c of cars) c.stats = { score: 0, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, touches: 0 };
    this.setupKickoff(cars);
  }

  setupKickoff(cars: readonly Car[]): void {
    this.ball.reset(0, BALL.RADIUS, 0);
    this.ball.visible = true;
    this.ball.setFrozen(false);
    this.touches = [];
    const order = shuffle([0, 1, 2, 3, 4]);
    for (const team of [0, 1] as Team[]) {
      const teamCars = cars.filter((c) => c.team === team);
      teamCars.forEach((car, i) => {
        const [sx, sz] = KICKOFF_SPOTS[order[i % order.length]];
        const x = team === 0 ? sx : -sx;
        const z = team === 0 ? sz : -sz;
        car.placeAt(x, z, -x, -z);
      });
    }
    if (this.isFreeplay) {
      this.state = 'playing';
      return;
    }
    this.state = 'countdown';
    this.countdown = RULES.KICKOFF_COUNTDOWN;
    this.lastCountdownShown = -1;
  }

  registerTouch(car: Car, ballVelBefore: THREE.Vector3): void {
    this.touches.push({ carId: car.id, team: car.team, time: this.elapsed });
    if (this.touches.length > 12) this.touches.shift();
    car.stats.touches++;
    car.stats.score += 2;
    if (this.isFreeplay || this.state !== 'playing') return;
    const ownGoalZ = car.team === 0 ? -1 : 1;
    if (this.headingIntoGoal(this.ball.position, ballVelBefore, ownGoalZ)) {
      car.stats.saves++;
      car.stats.score += 50;
      this.events.onSave(car);
    }
  }

  /** Se llama tras aplicar los impulsos del toque para detectar tiros a puerta. */
  checkShot(car: Car): void {
    if (this.isFreeplay || this.state !== 'playing') return;
    const enemyGoalZ = car.team === 0 ? 1 : -1;
    if (this.headingIntoGoal(this.ball.position, this.ball.velocity, enemyGoalZ)) {
      car.stats.shots++;
      car.stats.score += 20;
      this.events.onShot(car);
    }
  }

  private headingIntoGoal(pos: THREE.Vector3, vel: THREE.Vector3, goalSign: number): boolean {
    const lineZ = goalSign * (ARENA.HALF_LENGTH + BALL.RADIUS);
    const vz = vel.z;
    if (vz * goalSign <= 1) return false;
    const t = (lineZ - pos.z) / vz;
    if (t < 0 || t > 1.6) return false;
    const x = pos.x + vel.x * t;
    const y = pos.y + vel.y * t + 0.5 * GRAVITY * t * t;
    return Math.abs(x) < ARENA.GOAL_HALF_WIDTH && y < ARENA.GOAL_HEIGHT && y > -1;
  }

  fixedUpdate(dt: number, cars: readonly Car[]): void {
    this.elapsed += dt;
    for (const car of cars) {
      if (!car.demolished) continue;
      car.respawnTimer -= dt;
      if (car.respawnTimer <= 0) this.respawn(car, cars);
    }

    switch (this.state) {
      case 'countdown': {
        this.countdown -= dt;
        const shown = Math.ceil(this.countdown);
        if (shown !== this.lastCountdownShown && shown > 0) {
          this.lastCountdownShown = shown;
          this.events.onCountdown(shown);
        }
        for (const c of cars) c.hold();
        if (this.countdown <= 0) {
          this.state = 'playing';
          this.events.onKickoffGo();
        }
        break;
      }
      case 'playing': {
        const ballPos = this.ball.position;
        const scoring = Arena.scoringTeam(ballPos);
        if (scoring !== null) {
          this.handleGoal(scoring, cars, ballPos);
          break;
        }
        if (this.isFreeplay) break;
        if (this.overtime) {
          this.overtimeElapsed += dt;
        } else {
          this.timeLeft = Math.max(0, this.timeLeft - dt);
          if (this.timeLeft <= 0 && ballPos.y < BALL.RADIUS + 0.25) this.handleTimeUp(cars);
        }
        break;
      }
      case 'goal': {
        this.goalTimer -= dt;
        if (this.goalTimer <= 0) {
          if (this.overtime || (this.timeLeft <= 0 && this.scores[0] !== this.scores[1])) {
            this.finish();
          } else if (this.timeLeft <= 0) {
            this.startOvertime(cars);
          } else {
            this.setupKickoff(cars);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private handleGoal(team: Team, cars: readonly Car[], ballPos: THREE.Vector3): void {
    this.scores[team]++;
    const byId = new Map(cars.map((c) => [c.id, c]));
    let scorer: Car | null = null;
    let assist: Car | null = null;
    for (let i = this.touches.length - 1; i >= 0; i--) {
      const t = this.touches[i];
      if (t.team !== team) continue;
      if (!scorer) {
        scorer = byId.get(t.carId) ?? null;
        continue;
      }
      if (t.carId !== scorer.id && this.elapsed - t.time < 5) {
        assist = byId.get(t.carId) ?? null;
        break;
      }
    }
    if (scorer) {
      scorer.stats.goals++;
      scorer.stats.score += 100;
    }
    if (assist) {
      assist.stats.assists++;
      assist.stats.score += 50;
    }
    const speed = this.ball.velocity.length();

    // Explosión física: repele los coches según la distancia al balón
    for (const car of cars) {
      if (car.demolished) continue;
      const t = car.body.translation();
      const d = new THREE.Vector3(t.x - ballPos.x, t.y - ballPos.y, t.z - ballPos.z);
      const dist = d.length();
      if (dist > RULES.GOAL_EXPLOSION_RADIUS || dist < 1e-3) continue;
      const k = RULES.GOAL_EXPLOSION_FORCE * (1 - dist / RULES.GOAL_EXPLOSION_RADIUS);
      d.normalize();
      const v = car.body.linvel();
      car.body.setLinvel({ x: v.x + d.x * k, y: v.y + Math.max(0.35, d.y) * k * 0.6, z: v.z + d.z * k }, true);
      const w = car.body.angvel();
      car.body.setAngvel({ x: w.x + (Math.random() - 0.5) * 6, y: w.y, z: w.z + (Math.random() - 0.5) * 6 }, true);
    }

    this.ball.visible = false;
    this.ball.setFrozen(true);
    this.state = 'goal';
    this.goalTimer = RULES.GOAL_CELEBRATION;
    this.events.onGoal(team, scorer, assist, speed, ballPos);
  }

  private handleTimeUp(cars: readonly Car[]): void {
    if (this.scores[0] === this.scores[1]) this.startOvertime(cars);
    else this.finish();
  }

  private startOvertime(cars: readonly Car[]): void {
    this.overtime = true;
    this.overtimeElapsed = 0;
    this.events.onOvertime();
    this.setupKickoff(cars);
  }

  private finish(): void {
    this.state = 'ended';
    this.winner = this.scores[0] === this.scores[1] ? null : this.scores[0] > this.scores[1] ? 0 : 1;
    this.events.onEnd(this.winner);
  }

  respawn(car: Car, cars: readonly Car[]): void {
    const spots = shuffle(RESPAWN_SPOTS.slice());
    let spot = spots[0];
    for (const s of spots) {
      const x = car.team === 0 ? s[0] : -s[0];
      const z = car.team === 0 ? s[1] : -s[1];
      const free = cars.every((o) => o === car || o.demolished || o.currPos.distanceTo(new THREE.Vector3(x, o.currPos.y, z)) > 3);
      if (free) {
        spot = s;
        break;
      }
    }
    const x = car.team === 0 ? spot[0] : -spot[0];
    const z = car.team === 0 ? spot[1] : -spot[1];
    car.placeAt(x, z, 0, car.team === 0 ? 1 : -1);
    this.events.onRespawn(car);
  }
}
