import { VehicleController } from './VehicleController.js';

const KEY = 'wtav-quality';
const MODES = ['auto', 'alta', 'media', 'baja'];

/**
 * Niveles de calidad. Lo que más cuesta en la GPU, por orden: resolución de render (píxeles por
 * fotograma), sombras (se dibuja la escena dos veces), antialiasing MSAA y el barniz de los coches.
 */
export const LEVELS = {
  alta: { label: 'Alta', pixelRatio: 1.5, shadowEvery: 1, shadows: true, shadowSize: 2048, soft: true, clearcoat: true, treeShadows: true, traffic: 12, peds: 10, far: 650, fog: 560 },
  media: { label: 'Media', pixelRatio: 1, shadowEvery: 2, shadows: true, shadowSize: 1024, soft: false, clearcoat: false, treeShadows: true, traffic: 10, peds: 8, far: 560, fog: 520 },
  baja: { label: 'Baja', pixelRatio: 0.7, shadowEvery: 1, shadows: false, shadowSize: 512, soft: false, clearcoat: false, treeShadows: false, traffic: 7, peds: 5, far: 430, fog: 400 },
};

/** Modo guardado ('auto' por defecto). Se lee antes de crear el renderer (el MSAA no se puede cambiar después). */
export function savedQualityMode() {
  try {
    const m = localStorage.getItem(KEY);
    return MODES.includes(m) ? m : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Calidad gráfica con ajuste automático: mide los FPS reales y, en modo "auto", baja a Baja si
 * el juego no llega a ~40 FPS de forma sostenida (y vuelve a Media si sobra margen).
 * F3 muestra el contador de FPS.
 */
export class Quality {
  constructor(game) {
    this.game = game;
    this.mode = savedQualityMode();
    this.level = null;
    this.frames = 0;
    this.acc = 0;
    this.fps = 60;
    this.history = [];
    this.autoDowngraded = false;
    this.cooldown = 6; // segundos antes de empezar a juzgar (carga de shaders)

    this.fpsEl = document.getElementById('fps');
    this.button = document.getElementById('btn-quality');
    if (this.button) this.button.addEventListener('click', () => this.cycle());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.fpsEl.classList.toggle('hidden');
      }
    });
    this.apply(this.mode === 'auto' ? 'media' : this.mode);
  }

  get label() {
    return this.mode === 'auto' ? `Auto (${LEVELS[this.level].label})` : LEVELS[this.level].label;
  }

  apply(level) {
    const game = this.game;
    const q = LEVELS[level];
    const prev = this.level ? LEVELS[this.level] : null;
    this.level = level;
    const r = game.renderer;

    // Resolución interna
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(Math.min(dpr, q.pixelRatio));
    r.setSize(window.innerWidth, window.innerHeight);

    // Sombras (cambiarlas obliga a recompilar los materiales una vez)
    const sun = game.env.sun;
    const shadowChanged = !prev || prev.shadows !== q.shadows || prev.soft !== q.soft;
    r.shadowMap.enabled = q.shadows;
    // En Media las sombras se recalculan cada 2 fotogramas (el pase de sombras redibuja media escena)
    r.shadowMap.autoUpdate = q.shadowEvery === 1;
    r.shadowMap.needsUpdate = true;
    r.shadowMap.type = q.soft ? 2 /* PCFSoftShadowMap */ : 1 /* PCFShadowMap */;
    sun.castShadow = q.shadows;
    if (sun.shadow.mapSize.x !== q.shadowSize) {
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    if (shadowChanged) {
      game.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    for (const t of game.env.treeMeshes || []) t.castShadow = q.treeShadows;

    // Barniz de los coches (MeshPhysicalMaterial con clearcoat es el sombreador más caro de la escena)
    VehicleController.setClearcoat(q.clearcoat);

    // Distancia de visión, tráfico y peatones
    game.env.setViewDistance(q.far, q.fog);
    if (game.traffic) game.traffic.maxActive = q.traffic;
    if (game.pedestrians) game.pedestrians.count = q.peds;
    this.updateButton();
  }

  updateButton() {
    if (this.button) this.button.textContent = `Gráficos: ${this.label} · F3 muestra los FPS`;
  }

  /** Cambia de modo: Auto → Alta → Media → Baja. */
  cycle() {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    try {
      localStorage.setItem(KEY, this.mode);
    } catch {
      /* sin almacenamiento: solo esta sesión */
    }
    this.autoDowngraded = false;
    this.history = [];
    this.cooldown = 4;
    this.apply(this.mode === 'auto' ? 'media' : this.mode);
    if (this.mode === 'alta' && !this.game.renderer.getContextAttributes().antialias) {
      this.button.textContent += ' · recarga la página para el antialiasing';
    }
  }

  /** Se llama en cada fotograma con el tiempo real transcurrido. */
  update(rawDt, running) {
    this.frameNo = (this.frameNo || 0) + 1;
    const q = LEVELS[this.level];
    if (q.shadows && q.shadowEvery > 1 && this.frameNo % q.shadowEvery === 0) this.game.renderer.shadowMap.needsUpdate = true;
    this.frames++;
    this.acc += rawDt;
    if (this.acc < 1) return;
    this.fps = this.frames / this.acc;
    this.frames = 0;
    this.acc = 0;
    if (this.fpsEl) this.fpsEl.textContent = `${Math.round(this.fps)} FPS · ${LEVELS[this.level].label}`;
    if (!running || this.mode !== 'auto') return;
    if (this.cooldown > 0) {
      this.cooldown--;
      return;
    }
    this.history.push(this.fps);
    if (this.history.length > 10) this.history.shift();
    const last = (n) => this.history.slice(-n);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    if (this.level === 'media' && this.history.length >= 4 && avg(last(4)) < 40) {
      this.apply('baja');
      this.autoDowngraded = true;
      this.history = [];
      this.cooldown = 3;
      this.game.hud.notify('Calidad gráfica bajada a "Baja" para ganar fluidez (se cambia en el menú de pausa).', 5);
    } else if (this.level === 'baja' && this.autoDowngraded && this.history.length >= 10 && Math.min(...last(10)) > 58) {
      this.apply('media');
      this.history = [];
      this.cooldown = 3;
    }
  }
}
