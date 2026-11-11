import { CAMERA_SLIDERS, DEFAULT_CAMERA, type CameraSettings } from '../camera/CameraSettings';
import type { InputManager } from '../core/InputManager';
import type { GameSettings } from '../game/GameSettings';
import type { BotDifficulty } from '../core/types';
import { button, el } from './dom';
import { KeybindMenu } from './KeybindMenu';

type TabId = 'camera' | 'controls' | 'bindings' | 'video' | 'game';

export interface SettingsCallbacks {
  onCameraChange: (s: CameraSettings) => void;
  onGameChange: (s: GameSettings) => void;
  onControlsChange: () => void;
  onClose: () => void;
}

interface SliderOpts {
  label: string;
  desc?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onInput: (v: number) => void;
}

/** Menú de ajustes con pestañas: cámara, controles, asignación, gráficos y partida. */
export class SettingsMenu {
  readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tabs = new Map<TabId, HTMLButtonElement>();
  private keybinds: KeybindMenu | null = null;
  private current: TabId = 'camera';

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    private camera: CameraSettings,
    private game: GameSettings,
    private readonly cb: SettingsCallbacks,
  ) {
    this.root = el('div', 'overlay hidden', parent);
    const panel = el('div', 'settings', this.root);
    const header = el('header', '', panel);
    el('div', 'title', header, 'AJUSTES');
    const tabDefs: Array<[TabId, string]> = [
      ['camera', 'Cámara'],
      ['controls', 'Controles'],
      ['bindings', 'Asignación'],
      ['video', 'Gráficos'],
      ['game', 'Partida'],
    ];
    for (const [id, label] of tabDefs) {
      this.tabs.set(id, button(label, header, () => this.show(id), 'tab'));
    }
    el('div', 'spacer', header);
    button('Cerrar ✕', header, () => this.close());
    this.body = el('div', 'body', panel);
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  get isCapturing(): boolean {
    return this.keybinds?.isListening ?? false;
  }

  open(tab: TabId = this.current): void {
    this.root.classList.remove('hidden');
    this.show(tab);
  }

  close(): void {
    this.keybinds?.cancel();
    this.root.classList.add('hidden');
    this.cb.onClose();
  }

  update(camera: CameraSettings, game: GameSettings): void {
    this.camera = camera;
    this.game = game;
  }

  private show(tab: TabId): void {
    this.keybinds?.cancel();
    this.keybinds = null;
    this.current = tab;
    for (const [id, b] of this.tabs) b.classList.toggle('active', id === tab);
    this.body.innerHTML = '';
    switch (tab) {
      case 'camera':
        this.buildCamera();
        break;
      case 'controls':
        this.buildControls();
        break;
      case 'bindings':
        this.keybinds = new KeybindMenu(this.body, this.input);
        break;
      case 'video':
        this.buildVideo();
        break;
      case 'game':
        this.buildGame();
        break;
    }
  }

  private slider(o: SliderOpts): void {
    const row = el('div', 'setting', this.body);
    const label = el('label', '', row, o.label);
    if (o.desc) el('div', 'desc', label, o.desc);
    const input = el('input', '', row);
    input.type = 'range';
    input.min = String(o.min);
    input.max = String(o.max);
    input.step = String(o.step);
    input.value = String(o.value);
    const out = el('output', '', row, o.format(o.value));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = o.format(v);
      o.onInput(v);
    });
  }

  private toggle(label: string, value: boolean, onChange: (v: boolean) => void, desc?: string): void {
    const row = el('div', 'setting toggle', this.body);
    const l = el('label', '', row, label);
    if (desc) el('div', 'desc', l, desc);
    const input = el('input', '', row);
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
  }

  private select<T extends string>(label: string, value: T, options: Array<[T, string]>, onChange: (v: T) => void): void {
    const row = el('div', 'setting toggle', this.body);
    el('label', '', row, label);
    const sel = el('select', '', row);
    for (const [v, text] of options) {
      const opt = el('option', '', sel, text);
      opt.value = v;
      if (v === value) opt.selected = true;
    }
    sel.addEventListener('change', () => onChange(sel.value as T));
  }

  private buildCamera(): void {
    el('div', 'section-title', this.body, 'Cámara');
    for (const spec of CAMERA_SLIDERS) {
      this.slider({
        label: spec.label,
        min: spec.min,
        max: spec.max,
        step: spec.step,
        value: this.camera[spec.key],
        format: spec.format,
        onInput: (v) => {
          this.camera[spec.key] = v;
          this.cb.onCameraChange(this.camera);
        },
      });
    }
    this.toggle('Ball Cam activa por defecto', this.camera.ballCamDefault, (v) => {
      this.camera.ballCamDefault = v;
      this.cb.onCameraChange(this.camera);
    });
    this.toggle('Vibración de cámara', this.camera.shake, (v) => {
      this.camera.shake = v;
      this.cb.onCameraChange(this.camera);
    });
    const row = el('div', 'row', this.body);
    row.style.marginTop = '16px';
    button('Restablecer cámara', row, () => {
      Object.assign(this.camera, DEFAULT_CAMERA);
      this.cb.onCameraChange(this.camera);
      this.show('camera');
    }, 'danger');
  }

  private buildControls(): void {
    const p = this.input.profile;
    const changed = (): void => {
      this.input.saveProfile();
      this.cb.onControlsChange();
    };
    el('div', 'section-title', this.body, 'Mando');
    this.slider({
      label: 'Zona muerta de los sticks',
      desc: 'Desplazamiento mínimo antes de registrar input',
      min: 0,
      max: 0.5,
      step: 0.01,
      value: p.stickDeadzone,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        p.stickDeadzone = v;
        changed();
      },
    });
    this.slider({
      label: 'Sensibilidad de los sticks',
      desc: 'Multiplicador tras la zona muerta (1.0 = lineal)',
      min: 0.5,
      max: 2,
      step: 0.05,
      value: p.sensitivity,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        p.sensitivity = v;
        changed();
      },
    });
    this.slider({
      label: 'Zona muerta de gatillos (L2/R2 · LT/RT)',
      min: 0,
      max: 0.4,
      step: 0.01,
      value: p.triggerDeadzone,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        p.triggerDeadzone = v;
        changed();
      },
    });
    this.slider({
      label: 'Zona muerta de dodge',
      desc: 'Inclinación necesaria para que el segundo salto sea un dodge',
      min: 0.1,
      max: 0.9,
      step: 0.01,
      value: p.dodgeDeadzone,
      format: (v) => v.toFixed(2),
      onInput: (v) => {
        p.dodgeDeadzone = v;
        changed();
      },
    });
    this.toggle('Vibración del mando', p.vibration, (v) => {
      p.vibration = v;
      changed();
    });
    el('div', 'section-title', this.body, 'Cámara');
    this.toggle('Ball Cam en modo alternar', p.ballCamToggle, (v) => {
      p.ballCamToggle = v;
      changed();
    }, 'Desactivado = Ball Cam solo mientras mantienes el botón');
  }

  private buildVideo(): void {
    const g = this.game;
    const changed = (): void => this.cb.onGameChange(g);
    el('div', 'section-title', this.body, 'Rendimiento');
    this.slider({
      label: 'Escala de resolución',
      desc: 'Baja este valor si no alcanzas 60–144 FPS estables',
      min: 0.5,
      max: 1,
      step: 0.05,
      value: g.renderScale,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => {
        g.renderScale = v;
        changed();
      },
    });
    this.slider({
      label: 'Límite de densidad de píxeles',
      desc: 'Máximo devicePixelRatio usado en pantallas HiDPI',
      min: 1,
      max: 2,
      step: 0.25,
      value: g.maxPixelRatio,
      format: (v) => `${v.toFixed(2)}x`,
      onInput: (v) => {
        g.maxPixelRatio = v;
        changed();
      },
    });
    this.toggle('Sombras', g.shadows, (v) => {
      g.shadows = v;
      changed();
    });
    this.toggle('Mostrar FPS', g.showFps, (v) => {
      g.showFps = v;
      changed();
    });
  }

  private buildGame(): void {
    const g = this.game;
    const changed = (): void => this.cb.onGameChange(g);
    el('div', 'section-title', this.body, 'Partida');
    this.select<BotDifficulty>('Dificultad de los bots', g.difficulty, [
      ['novato', 'Novato'],
      ['pro', 'Pro'],
      ['allstar', 'All-Star'],
    ], (v) => {
      g.difficulty = v;
      changed();
    });
    this.toggle('Boost infinito en Juego libre', g.infiniteBoostFreeplay, (v) => {
      g.infiniteBoostFreeplay = v;
      changed();
    });
    this.toggle('Demoliciones entre compañeros', g.friendlyDemos, (v) => {
      g.friendlyDemos = v;
      changed();
    });
    const row = el('div', 'setting toggle', this.body);
    el('label', '', row, 'Nombre del jugador');
    const name = el('input', '', row);
    name.type = 'text';
    name.maxLength = 16;
    name.value = g.playerName;
    name.style.cssText = 'font:inherit;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,.15);background:#1d2536;color:#fff;';
    name.addEventListener('change', () => {
      g.playerName = name.value.trim() || 'Jugador';
      changed();
    });
  }
}
