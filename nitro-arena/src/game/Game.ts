import * as THREE from 'three';
import { CameraController } from '../camera/CameraController';
import { DEFAULT_CAMERA, type CameraSettings } from '../camera/CameraSettings';
import { ARENA, BALL, TICK_RATE } from '../config/PhysicsConstants';
import { GameLoop } from '../core/GameLoop';
import { InputManager, type FrameInput } from '../core/InputManager';
import { PhysicsEngine } from '../core/PhysicsEngine';
import { StorageManager, STORAGE_KEYS } from '../core/StorageManager';
import { emptyControls, TEAM_COLORS, type BotDifficulty, type GameMode, type Team } from '../core/types';
import { ACCENT_COLORS, CAR_PRESETS } from '../config/CarPresets';
import { Profile } from '../core/Profile';
import { createEnvironment, Materials } from '../render/Materials';
import { Showroom } from '../render/Showroom';
import { Arena } from '../entities/Arena';
import { Ball } from '../entities/Ball';
import { BoostPadManager } from '../entities/BoostPad';
import { Car, type CarEvent } from '../entities/Car';
import { Particles } from '../fx/Particles';
import { Trail } from '../fx/Trail';
import { HUD } from '../ui/HUD';
import { MainMenu } from '../ui/MainMenu';
import { Scoreboard } from '../ui/Scoreboard';
import { SettingsMenu } from '../ui/SettingsMenu';
import { BotController } from './BotController';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from './GameSettings';
import { Interactions } from './Interactions';
import { Match } from './Match';

const BOT_NAMES = ['Atlas', 'Bolt', 'Comet', 'Drift', 'Ember', 'Flux', 'Gale', 'Halo'];

/** Orquestador: escena, física a 120 Hz, entidades, reglas, bots, cámara, efectos y UI. */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly sun: THREE.DirectionalLight;
  private readonly arena: Arena;
  private readonly ball: Ball;
  private readonly pads = new BoostPadManager();
  private readonly particles = new Particles();
  private readonly cameraCtl: CameraController;
  private readonly input: InputManager;
  private readonly hud: HUD;
  private readonly scoreboard: Scoreboard;
  private readonly settingsMenu: SettingsMenu;
  private readonly menu: MainMenu;
  private readonly match: Match;
  private readonly interactions: Interactions;
  private readonly loop: GameLoop;
  private readonly mats: Materials;
  private readonly profile = new Profile();
  private readonly showroom: Showroom;

  private cars: Car[] = [];
  private player: Car | null = null;
  private bots: BotController[] = [];
  private readonly trails = new Map<number, Trail>();
  private cameraSettings: CameraSettings;
  private gameSettings: GameSettings;

  private inMatch = false;
  private paused = false;
  private settingsFromPause = false;
  private lastInput: FrameInput | null = null;
  private goalFlash: [number, number] = [0, 0];
  private readonly tmp = new THREE.Vector3();

  static async create(
    canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    onProgress: (progress: number, step: string) => Promise<void>,
  ): Promise<Game> {
    await onProgress(0.15, 'Cargando motor de físicas');
    const physics = await PhysicsEngine.create();
    await onProgress(0.55, 'Generando arena, césped y balón');
    const game = new Game(canvas, uiRoot, physics);
    await onProgress(1, 'Preparando el garaje');
    return game;
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
    private readonly physics: PhysicsEngine,
  ) {
    this.cameraSettings = StorageManager.load(STORAGE_KEYS.camera, DEFAULT_CAMERA);
    this.gameSettings = StorageManager.load(STORAGE_KEYS.game, DEFAULT_GAME_SETTINGS);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mats = new Materials(this.gameSettings.quality);
    let env: THREE.Texture | null = null;
    if (this.mats.realistic) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      env = createEnvironment(this.renderer);
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.4;
    }

    this.scene.background = new THREE.Color(0x1a1d3a);
    this.scene.fog = new THREE.Fog(0x2a2850, 160, 420);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2c3a2a, this.mats.realistic ? 0.9 : 1.45));
    this.sun = new THREE.DirectionalLight(0xfff4e6, this.mats.realistic ? 2.4 : 1.7);
    this.sun.position.set(35, 70, 25);
    this.sun.target.position.set(0, 0, 0);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60;
    sc.right = 60;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 10;
    sc.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);

    this.arena = new Arena(physics, this.mats, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.arena.group);
    this.ball = new Ball(physics, this.mats);
    this.ball.addTo(this.scene);
    this.scene.add(this.pads.group, this.particles.mesh);

    this.cameraCtl = new CameraController(physics, this.cameraSettings);
    this.input = new InputManager(canvas);
    this.hud = new HUD(uiRoot);
    this.hud.setVisible(false);
    this.scoreboard = new Scoreboard(uiRoot);

    this.match = new Match(this.ball, {
      onCountdown: (n) => this.hud.showCenter(String(n), 0.9),
      onKickoffGo: () => this.hud.showCenter('¡YA!', 0.7),
      onGoal: (team, scorer, assist, speed, pos) => this.onGoal(team, scorer, assist, speed, pos),
      onOvertime: () => {
        this.hud.showCenter('PRÓRROGA', 2.4);
        this.hud.showSub('Gol de oro', 2.4);
      },
      onEnd: (winner) => this.onMatchEnd(winner),
      onSave: (car) => this.hud.feed(`${car.name} · ¡Parada!`, car.team),
      onShot: (car) => this.hud.feed(`${car.name} · Tiro a puerta`, car.team),
      onRespawn: (car) => this.trails.get(car.id)?.reset(),
    });

    this.interactions = new Interactions(physics, this.ball, {
      onBallTouch: (car, relSpeed, velBefore) => {
        this.match.registerTouch(car, velBefore);
        this.match.checkShot(car);
        if (relSpeed > 9) {
          const p = this.ball.currPos;
          this.particles.burst(p, Math.min(14, Math.round(relSpeed / 3)), relSpeed * 0.35, [0xffffff, 0xffe8a0], 0.12, 0.45);
        }
        if (car === this.player) this.rumble(Math.min(1, relSpeed / 30), 0.4, 90);
      },
      onDemolish: (attacker, victim) => {
        attacker.stats.demos++;
        attacker.stats.score += 25;
        const p = victim.currPos.clone();
        this.particles.burst(p, 70, 16, [TEAM_COLORS[victim.team], 0xffd27a, 0x444a55, 0xff5a3d], 0.4, 1.6);
        this.hud.feed(`${attacker.name} demolió a ${victim.name}`, attacker.team);
        this.trails.get(victim.id)?.reset();
        if (this.player && p.distanceTo(this.player.currPos) < 25) this.cameraCtl.shake(0.35);
        if (victim === this.player) {
          this.hud.showCenter('DEMOLIDO', 1.5, victim.team === 0 ? 'blue' : 'orange');
          this.rumble(1, 1, 400);
        }
        if (attacker === this.player) this.rumble(0.8, 0.6, 200);
      },
      onBump: (attacker, victim) => {
        if (attacker === this.player || victim === this.player) this.rumble(0.5, 0.3, 120);
      },
      onPinch: (car) => {
        if (car === this.player) this.hud.showMechanic('PINCH');
      },
    });

    this.settingsMenu = new SettingsMenu(uiRoot, this.input, this.cameraSettings, this.gameSettings, {
      onCameraChange: (s) => {
        this.cameraSettings = s;
        this.cameraCtl.settings = s;
        this.cameraCtl.applyFov();
        StorageManager.save(STORAGE_KEYS.camera, s);
      },
      onGameChange: (g) => {
        this.gameSettings = g;
        StorageManager.save(STORAGE_KEYS.game, g);
        this.applyVideoSettings();
        this.interactions.friendlyDemos = g.friendlyDemos;
        if (this.player && this.match.isFreeplay) this.player.infiniteBoost = g.infiniteBoostFreeplay;
        this.hud.setFps(g.showFps ? 0 : null);
      },
      onControlsChange: () => this.input.syncEdges(),
      onClose: () => {
        this.input.syncEdges();
        if (this.inMatch && this.settingsFromPause) this.menu.showPause(true);
        else if (!this.inMatch) this.menu.showMain(true);
      },
    });

    this.showroom = new Showroom(this.mats, env, canvas);
    this.showroom.setCar(this.profile.car, this.profile.data.accent);

    this.menu = new MainMenu(uiRoot, this.profile, this.gameSettings.difficulty, {
      onPlay: (mode) => this.startMatch(mode),
      onDifficulty: (d: BotDifficulty) => {
        this.gameSettings.difficulty = d;
        StorageManager.save(STORAGE_KEYS.game, this.gameSettings);
      },
      onPreviewCar: (preset, accent) => this.showroom.setCar(preset, accent),
      onSettings: (tab) => {
        this.settingsFromPause = this.inMatch;
        this.menu.showMain(false);
        this.menu.showPause(false);
        this.settingsMenu.update(this.cameraSettings, this.gameSettings);
        this.settingsMenu.open(tab);
      },
      onResume: () => this.setPaused(false),
      onRestart: () => this.startMatch(this.match.mode),
      onQuit: () => this.quitToMenu(),
    });

    this.input.gamepad.onConnectionChange = (connected, _name, style) => {
      const label = style === 'playstation' ? 'Mando PlayStation' : style === 'xbox' ? 'Mando Xbox' : 'Mando';
      this.hud.toast(connected ? `${label} conectado` : `${label} desconectado`);
      if (!connected && this.inMatch && !this.paused) this.setPaused(true);
    };

    this.pads.onPickup = (id, pad) => {
      if (this.player && id === this.player.id) this.rumble(pad.big ? 0.3 : 0.1, 0.2, 60);
    };

    window.addEventListener('resize', this.onResize);
    this.applyVideoSettings();
    this.onResize();
    this.hud.setFps(this.gameSettings.showFps ? 0 : null);

    this.loop = new GameLoop(1 / TICK_RATE, (dt) => this.fixedUpdate(dt), (a, fdt) => this.render(a, fdt));
    this.loop.start();
  }

  // ---------------------------------------------------------------- partida

  private startMatch(mode: GameMode): void {
    for (const c of this.cars) c.dispose(this.scene);
    for (const t of this.trails.values()) this.scene.remove(t.mesh);
    this.trails.clear();
    this.cars = [];
    this.bots = [];
    this.particles.clear();

    const teamSize = mode === '2v2' ? 2 : mode === '3v3' ? 3 : 1;
    let id = 0;
    const prof = this.profile.data;
    const player = new Car(this.physics, id++, 0, prof.name, false, this.profile.car, prof.accent, this.mats);
    this.cars.push(player);
    this.player = player;
    player.onEvent = this.onCarEvent;
    if (mode !== 'freeplay') {
      const names = BOT_NAMES.slice();
      const bot = (team: Team): Car => {
        const preset = CAR_PRESETS[Math.floor(Math.random() * CAR_PRESETS.length)];
        const accent = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)].hex;
        return new Car(this.physics, id++, team, names.shift() ?? 'Bot', true, preset, accent, this.mats);
      };
      for (let i = 1; i < teamSize; i++) this.cars.push(bot(0));
      for (let i = 0; i < teamSize; i++) this.cars.push(bot(1));
    }
    for (const car of this.cars) {
      car.addTo(this.scene);
      const trail = new Trail(26, car.team === 0 ? 0x7fd0ff : 0xffb347);
      this.trails.set(car.id, trail);
      this.scene.add(trail.mesh);
      if (car.isBot) this.bots.push(new BotController(car, this.gameSettings.difficulty));
    }
    player.infiniteBoost = mode === 'freeplay' && this.gameSettings.infiniteBoostFreeplay;
    this.interactions.friendlyDemos = this.gameSettings.friendlyDemos;
    this.interactions.reset();
    this.pads.reset();
    this.match.start(mode, this.cars);
    this.gameSettings.lastMode = mode;
    StorageManager.save(STORAGE_KEYS.game, this.gameSettings);

    this.cameraCtl.ballCam = this.cameraSettings.ballCamDefault;
    this.cameraCtl.snap();
    this.hud.setVisible(true);
    this.hud.clearMessages();
    this.hud.setMatchUiVisible(true);
    this.hud.setScores(0, 0);
    if (mode === 'freeplay') {
      this.hud.setClockText('LIBRE');
      this.hud.showSub('Juego libre · R / R3 reinicia el balón', 4);
    }
    this.menu.showMain(false);
    this.menu.showPause(false);
    this.menu.hideResults();
    this.inMatch = true;
    this.showroom.active = false;
    this.paused = false;
    this.input.syncEdges();
  }

  private quitToMenu(): void {
    for (const c of this.cars) c.dispose(this.scene);
    for (const t of this.trails.values()) this.scene.remove(t.mesh);
    this.trails.clear();
    this.cars = [];
    this.bots = [];
    this.player = null;
    this.inMatch = false;
    this.showroom.active = true;
    this.showroom.setCar(this.profile.car, this.profile.data.accent);
    this.paused = false;
    this.match.state = 'idle';
    this.ball.reset(0, BALL.RADIUS, 0);
    this.ball.visible = true;
    this.ball.setFrozen(false);
    this.hud.setVisible(false);
    this.scoreboard.setVisible(false, [], [0, 0], -1);
    this.menu.showPause(false);
    this.menu.hideResults();
    this.menu.showMain(true);
  }

  private setPaused(p: boolean): void {
    if (!this.inMatch || this.match.state === 'ended') return;
    this.paused = p;
    this.menu.showPause(p);
    this.input.syncEdges();
  }

  /** Fin del partido: resultados, MVP y estadísticas del perfil. */
  private onMatchEnd(winner: Team | null): void {
    this.hud.clearMessages();
    const player = this.player;
    if (!player) return;
    const won = winner === null ? null : winner === player.team;
    const winners = winner === null ? this.cars : this.cars.filter((c) => c.team === winner);
    const top = winners.reduce<Car | null>((best, c) => (!best || c.stats.score > best.stats.score ? c : best), null);
    const mvp = top === player && won !== false;
    const s = player.stats;
    const xp = this.profile.recordMatch({
      won,
      goals: s.goals,
      assists: s.assists,
      saves: s.saves,
      shots: s.shots,
      demos: s.demos,
      mvp,
    });
    this.menu.showResults(winner, this.match.scores, player.team, xp, mvp);
  }

  private onGoal(team: Team, scorer: Car | null, assist: Car | null, speed: number, pos: THREE.Vector3): void {
    this.hud.setScores(this.match.scores[0], this.match.scores[1]);
    this.hud.showCenter('¡GOL!', 2.6, team === 0 ? 'blue' : 'orange');
    const who = scorer ? scorer.name : 'Gol en propia';
    const extra = assist ? ` · asistencia de ${assist.name}` : '';
    this.hud.showSub(`${who} · ${Math.round(speed * 3.6)} km/h${extra}`, 2.6);
    this.hud.feed(`${who} marcó para ${team === 0 ? 'Azul' : 'Naranja'}`, team);
    const color = TEAM_COLORS[team];
    this.particles.burst(pos, 160, 26, [color, 0xffffff, 0xffd27a], 0.55, 2.2);
    this.goalFlash[team === 0 ? 1 : 0] = 1;
    this.cameraCtl.shake(0.6);
    this.rumble(1, 0.8, 500);
  }

  private onCarEvent = (car: Car, e: CarEvent): void => {
    if (car !== this.player) return;
    if (e === 'flipReset') {
      this.profile.addFlipReset();
      this.hud.showMechanic('FLIP RESET');
      this.rumble(0.4, 0.4, 100);
    }
  };

  private rumble(strong: number, weak: number, ms: number): void {
    if (!this.input.profile.vibration) return;
    this.input.gamepad.rumble(strong, weak, ms);
  }

  // ---------------------------------------------------------------- bucle

  private fixedUpdate(dt: number): void {
    const fi = this.input.sample();
    this.lastInput = fi;

    if (this.settingsMenu.isOpen) {
      if (fi.pausePressed && !this.settingsMenu.isCapturing) this.settingsMenu.close();
      return;
    }
    if (!this.inMatch) return;
    if (fi.pausePressed && this.match.state !== 'ended') this.setPaused(!this.paused);
    if (this.paused) return;

    if (this.input.profile.ballCamToggle) {
      if (fi.ballCamPressed) this.cameraCtl.ballCam = !this.cameraCtl.ballCam;
    } else {
      this.cameraCtl.ballCam = this.cameraSettings.ballCamDefault ? !fi.ballCamHeld : fi.ballCamHeld;
    }

    if (this.match.isFreeplay && fi.resetPressed) {
      this.match.setupKickoff(this.cars);
      this.pads.reset();
      this.cameraCtl.snap();
    }

    const canMove = this.match.carsCanMove;
    if (this.player) this.player.controls = canMove ? fi.car : emptyControls();
    const kickoff = this.match.state === 'playing' && this.ball.currPos.lengthSq() < 0.5 && this.ball.velocity.lengthSq() < 0.01;
    const ctx = { ball: this.ball, cars: this.cars, kickoff, frozen: !canMove };
    for (const bot of this.bots) bot.car.controls = bot.update(dt, ctx);

    this.match.fixedUpdate(dt, this.cars);
    if (this.match.state === 'ended') return;

    this.ball.beginStep();
    for (const car of this.cars) car.preStep(dt);
    this.physics.step();
    this.interactions.process(this.cars, this.match.elapsed);
    for (const car of this.cars) car.postStep(dt);
    this.ball.endStep();
    this.pads.update(dt, this.cars);
  }

  private render(alpha: number, frameDt: number): void {
    for (const car of this.cars) car.render(alpha, frameDt);
    this.ball.render(alpha);
    this.pads.render(frameDt);
    this.updateCarEffects(frameDt);
    this.particles.update(frameDt);

    for (const team of [0, 1] as Team[]) {
      this.goalFlash[team] = Math.max(0, this.goalFlash[team] - frameDt * 0.5);
      this.arena.flashGoal(team, this.goalFlash[team]);
    }

    const player = this.player;
    if (this.inMatch && player) {
      const li = this.lastInput;
      this.cameraCtl.update(
        Math.min(frameDt, 0.05),
        { position: player.renderPos, quaternion: player.renderQuat, onSurface: player.groundWheels >= 3 && !player.demolished },
        this.ball.renderPos,
        li?.lookX ?? 0,
        li?.lookY ?? 0,
      );
      this.updateHud(frameDt, player);
    } else {
      this.showroom.update(Math.min(frameDt, 0.05));
      this.renderer.render(this.showroom.scene, this.showroom.camera);
      return;
    }
    this.renderer.render(this.scene, this.cameraCtl.camera);
  }

  private updateCarEffects(frameDt: number): void {
    const back = this.tmp;
    for (const car of this.cars) {
      const trail = this.trails.get(car.id);
      if (!trail) continue;
      const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(car.renderQuat);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(car.renderQuat);
      const side = new THREE.Vector3(0, 0, 1).applyQuaternion(car.renderQuat);
      back.copy(car.renderPos).addScaledVector(fwd, -0.6).addScaledVector(up, 0.22);
      trail.update(frameDt, car.supersonic && !car.demolished, back, side);
      if (car.isBoosting && !car.demolished && Math.random() < 0.8) {
        const vel = fwd.clone().multiplyScalar(-6 - Math.random() * 4).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5));
        const pos = back.clone().addScaledVector(fwd, -0.4);
        this.particles.emit(pos, vel, car.team === 0 ? 0x8fd6ff : 0xffb85c, 0.09 + Math.random() * 0.06, 0.35, 0, 2);
      }
    }
  }

  private updateHud(frameDt: number, player: Car): void {
    this.hud.update(frameDt);
    this.hud.setBoost(player.boost);
    this.hud.setSpeed(player.demolished ? 0 : player.speed, player.supersonic);
    this.hud.setFlip(!player.demolished && player.hasFlipAvailable);
    if (!this.match.isFreeplay) this.hud.setClock(this.match.overtime ? this.match.overtimeElapsed : this.match.timeLeft, this.match.overtime);
    const showArrow = this.ball.visible && this.match.state !== 'ended';
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.hud.setBallArrow(showArrow ? this.cameraCtl.offscreenIndicator(this.ball.renderPos, w, h) : null);
    if (this.gameSettings.showFps) this.hud.setFps(this.loop.fps);
    const sbHeld = (this.lastInput?.scoreboardHeld ?? false) && !this.paused;
    this.scoreboard.setVisible(sbHeld || this.match.state === 'ended', this.cars, this.match.scores, player.id);
  }

  // ---------------------------------------------------------------- vídeo

  private applyVideoSettings(): void {
    const g = this.gameSettings;
    const ratio = Math.min(window.devicePixelRatio || 1, g.maxPixelRatio) * g.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = g.shadows;
    this.sun.castShadow = g.shadows;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
    this.onResize();
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cameraCtl.resize(w, h);
    this.showroom?.resize(w, h);
  };

  /** Dimensiones útiles para depuración desde la consola del navegador. */
  get debugInfo(): Record<string, unknown> {
    const p = this.player;
    return {
      arena: ARENA,
      fps: this.loop.fps,
      player: p
        ? { speed: p.speed, boost: p.boost, onGround: p.onGround, wheels: p.numWheelContacts, flip: p.hasFlipAvailable, supersonic: p.supersonic }
        : null,
      ball: { pos: this.ball.currPos.toArray(), speed: this.ball.velocity.length() },
      state: this.match.state,
    };
  }
}
