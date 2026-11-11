import { ACCENT_COLORS, CAR_PRESETS, type CarPreset } from '../config/CarPresets';
import type { Profile } from '../core/Profile';
import { button, el } from './dom';

/**
 * Garaje: elegir coche y color de acento. Los coches secretos aparecen
 * bloqueados hasta canjear el código.
 */
export class GarageMenu {
  readonly root: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly swatches: HTMLDivElement;
  private readonly detail: HTMLDivElement;
  private readonly codeMsg: HTMLDivElement;
  private preview: CarPreset;

  constructor(
    parent: HTMLElement,
    private readonly profile: Profile,
    private readonly onPreview: (preset: CarPreset, accent: number) => void,
    onBack: () => void,
  ) {
    this.preview = profile.car;
    this.root = el('div', 'panel garage', parent);
    const head = el('div', 'panel-head', this.root);
    button('‹', head, onBack, 'back');
    el('h2', '', head, 'GARAJE');

    el('div', 'section-title', this.root, 'Coches');
    this.list = el('div', 'car-list', this.root);
    this.detail = el('div', 'car-detail', this.root);

    el('div', 'section-title', this.root, 'Color de acento');
    this.swatches = el('div', 'swatches', this.root);

    el('div', 'section-title', this.root, 'Código secreto');
    const form = el('form', 'code-form', this.root);
    const input = el('input', '', form);
    input.id = 'secret-code';
    input.type = 'text';
    input.placeholder = 'Introduce un código';
    input.autocomplete = 'off';
    input.spellcheck = false;
    const submit = el('button', 'primary', form, 'Canjear');
    submit.type = 'submit';
    this.codeMsg = el('div', 'code-msg', this.root);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const r = profile.redeem(input.value);
      this.codeMsg.className = `code-msg ${r === 'invalid' ? 'bad' : 'good'}`;
      this.codeMsg.textContent =
        r === 'unlocked'
          ? 'Código correcto: Talon y Bastion desbloqueados.'
          : r === 'already'
            ? 'Ya tienes todos los coches de este código.'
            : 'Código no válido. Revisa que esté bien escrito.';
      input.value = '';
      this.render();
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
  }

  open(): void {
    this.preview = this.profile.car;
    this.codeMsg.textContent = '';
    this.render();
    this.onPreview(this.preview, this.profile.data.accent);
  }

  /** Al salir, el showroom vuelve al coche equipado. */
  close(): void {
    this.onPreview(this.profile.car, this.profile.data.accent);
  }

  private render(): void {
    this.list.innerHTML = '';
    for (const preset of CAR_PRESETS) {
      const unlocked = this.profile.isUnlocked(preset.id);
      const equipped = this.profile.data.selectedCar === preset.id;
      const card = button('', this.list, () => {
        this.preview = preset;
        if (unlocked) this.profile.selectCar(preset.id);
        this.onPreview(preset, this.profile.data.accent);
        this.render();
      }, `car-card${this.preview.id === preset.id ? ' active' : ''}${unlocked ? '' : ' locked'}`);
      el('span', 'car-name', card, preset.name);
      el('span', 'car-class', card, unlocked ? preset.hitboxClass : 'Bloqueado');
      if (equipped) el('span', 'badge', card, 'Equipado');
      if (!unlocked) el('span', 'lock', card, 'Código');
    }

    const p = this.preview;
    const unlocked = this.profile.isUnlocked(p.id);
    this.detail.innerHTML = '';
    el('div', 'detail-name', this.detail, p.name);
    el('p', 'detail-tag', this.detail, p.tagline);
    const dims = el('div', 'dims', this.detail);
    const fmt = (m: number): string => `${Math.round(m * 200)} cm`;
    for (const [k, v] of [
      ['Largo', fmt(p.hitboxHalf[0])],
      ['Ancho', fmt(p.hitboxHalf[2])],
      ['Alto', fmt(p.hitboxHalf[1])],
    ] as const) {
      const d = el('div', '', dims);
      el('span', 'k', d, k);
      el('span', 'v', d, v);
    }
    if (!unlocked) el('p', 'locked-note', this.detail, 'Este coche se desbloquea con un código secreto.');

    this.swatches.innerHTML = '';
    for (const c of ACCENT_COLORS) {
      const sw = button('', this.swatches, () => {
        this.profile.setAccent(c.hex);
        this.onPreview(this.preview, c.hex);
        this.render();
      }, `swatch${this.profile.data.accent === c.hex ? ' active' : ''}`);
      sw.style.setProperty('--sw', `#${c.hex.toString(16).padStart(6, '0')}`);
      sw.title = c.name;
      sw.setAttribute('aria-label', c.name);
    }
  }
}
