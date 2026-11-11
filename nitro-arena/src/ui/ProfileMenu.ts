import type { Profile } from '../core/Profile';
import { button, el } from './dom';

/** Perfil: nombre, nivel y estadísticas acumuladas en este navegador. */
export class ProfileMenu {
  readonly root: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private readonly levelBox: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private confirmReset = false;
  private readonly resetBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, private readonly profile: Profile, onBack: () => void) {
    this.root = el('div', 'panel profile', parent);
    const head = el('div', 'panel-head', this.root);
    button('‹', head, onBack, 'back');
    el('h2', '', head, 'PERFIL');

    el('div', 'section-title', this.root, 'Nombre');
    const row = el('div', 'code-form', this.root);
    this.nameInput = el('input', '', row);
    this.nameInput.id = 'player-name';
    this.nameInput.maxLength = 16;
    this.nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    this.nameInput.addEventListener('change', () => profile.setName(this.nameInput.value));

    this.levelBox = el('div', 'level-box', this.root);
    el('div', 'section-title', this.root, 'Estadísticas');
    this.stats = el('div', 'stat-grid', this.root);
    this.resetBtn = button('Borrar estadísticas', this.root, () => {
      if (!this.confirmReset) {
        this.confirmReset = true;
        this.resetBtn.textContent = 'Pulsa otra vez para confirmar';
        return;
      }
      profile.resetStats();
      this.open();
    }, 'danger');
  }

  open(): void {
    this.confirmReset = false;
    this.resetBtn.textContent = 'Borrar estadísticas';
    const d = this.profile.data;
    this.nameInput.value = d.name;
    const lv = this.profile.level;
    this.levelBox.innerHTML = '';
    el('div', 'level-num', this.levelBox, `Nivel ${lv.level}`);
    const bar = el('div', 'xp-bar', this.levelBox);
    el('div', 'xp-fill', bar).style.width = `${(lv.progress / lv.next) * 100}%`;
    el('div', 'xp-text', this.levelBox, `${lv.progress} / ${lv.next} XP`);

    const s = d.stats;
    const winRate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
    const entries: Array<[string, string | number]> = [
      ['Partidos', s.matches],
      ['Victorias', s.wins],
      ['Derrotas', s.losses],
      ['% victorias', `${winRate}%`],
      ['Goles', s.goals],
      ['Asistencias', s.assists],
      ['Paradas', s.saves],
      ['Tiros', s.shots],
      ['Demoliciones', s.demos],
      ['MVP', s.mvps],
      ['Flip resets', s.flipResets],
      ['Goles por partido', s.matches ? (s.goals / s.matches).toFixed(2) : '0.00'],
    ];
    this.stats.innerHTML = '';
    for (const [k, v] of entries) {
      const c = el('div', 'stat', this.stats);
      el('span', 'v', c, String(v));
      el('span', 'k', c, k);
    }
  }
}
