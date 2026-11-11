import type { CarPreset } from '../config/CarPresets';
import type { Profile } from '../core/Profile';
import type { BotDifficulty, GameMode, Team } from '../core/types';
import { button, el } from './dom';
import { GarageMenu } from './GarageMenu';
import { ProfileMenu } from './ProfileMenu';

export interface MenuCallbacks {
  onPlay: (mode: GameMode) => void;
  onDifficulty: (d: BotDifficulty) => void;
  onSettings: (tab: 'camera' | 'controls' | 'bindings' | 'video' | 'game') => void;
  onPreviewCar: (preset: CarPreset, accent: number) => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

type View = 'home' | 'play' | 'garage' | 'profile';

/**
 * Portada al estilo del juego de referencia: el coche en el garaje 3D detrás y
 * un menú lateral (Jugar, Garaje, Perfil, Controles, Ajustes). Incluye también
 * el menú de pausa y la pantalla de resultados.
 */
export class MainMenu {
  private readonly home: HTMLDivElement;
  private readonly side: HTMLDivElement;
  private readonly nav: HTMLElement;
  private readonly play: HTMLDivElement;
  private readonly garage: GarageMenu;
  private readonly profileMenu: ProfileMenu;
  private readonly chip: HTMLDivElement;
  private readonly carTag: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly resultTitle: HTMLDivElement;
  private readonly resultScore: HTMLDivElement;
  private readonly resultXp: HTMLDivElement;
  private readonly diffButtons = new Map<BotDifficulty, HTMLButtonElement>();
  private view: View = 'home';

  constructor(
    parent: HTMLElement,
    private readonly profile: Profile,
    difficulty: BotDifficulty,
    cb: MenuCallbacks,
  ) {
    this.home = el('div', 'home', parent);
    const top = el('div', 'home-top', this.home);
    const logo = el('div', 'logo', top);
    el('span', 'l1', logo, 'NITRO');
    el('span', 'l2', logo, 'ARENA');
    this.chip = el('div', 'profile-chip', top);
    this.chip.addEventListener('click', () => this.show('profile'));

    this.side = el('div', 'home-side', this.home);
    this.nav = el('nav', 'home-nav', this.side);
    const items: Array<[string, string, () => void]> = [
      ['JUGAR', 'Partidas contra bots y juego libre', () => this.show('play')],
      ['GARAJE', 'Coches, colores y códigos', () => this.show('garage')],
      ['PERFIL', 'Nivel y estadísticas', () => this.show('profile')],
      ['CONTROLES', 'Sensibilidad, zonas muertas y asignación', () => cb.onSettings('controls')],
      ['AJUSTES', 'Cámara, gráficos y partida', () => cb.onSettings('camera')],
    ];
    items.forEach(([label, sub, fn], i) => {
      const b = button('', this.nav, fn, `nav-item${i === 0 ? ' primary-item' : ''}`);
      el('span', 'nav-label', b, label);
      el('span', 'nav-sub', b, sub);
    });

    this.play = el('div', 'panel play', this.side);
    const ph = el('div', 'panel-head', this.play);
    button('‹', ph, () => this.show('home'), 'back');
    el('h2', '', ph, 'JUGAR');
    const modes: Array<[GameMode, string, string]> = [
      ['1v1', 'Duelo 1 vs 1', 'Tú contra un bot'],
      ['2v2', 'Dobles 2 vs 2', 'Con un compañero bot'],
      ['3v3', 'Estándar 3 vs 3', 'El formato clásico'],
      ['freeplay', 'Juego libre', 'Practica mecánicas sin reloj'],
    ];
    const grid = el('div', 'mode-grid', this.play);
    for (const [mode, title, sub] of modes) {
      const b = button('', grid, () => cb.onPlay(mode), 'mode-card');
      el('span', 'mode-title', b, title);
      el('span', 'mode-sub', b, sub);
    }
    el('div', 'section-title', this.play, 'Dificultad de los bots');
    const seg = el('div', 'segmented', this.play);
    for (const [d, label] of [
      ['novato', 'Novato'],
      ['pro', 'Pro'],
      ['allstar', 'All-Star'],
    ] as Array<[BotDifficulty, string]>) {
      const b = button(label, seg, () => {
        cb.onDifficulty(d);
        this.setDifficulty(d);
      });
      this.diffButtons.set(d, b);
    }
    this.setDifficulty(difficulty);

    this.garage = new GarageMenu(this.side, profile, cb.onPreviewCar, () => this.show('home'));
    this.profileMenu = new ProfileMenu(this.side, profile, () => this.show('home'));

    this.carTag = el('div', 'car-tag', this.home);
    el('div', 'drag-hint', this.home, 'Arrastra para girar el coche');

    // Pausa
    this.pause = el('div', 'overlay hidden', parent);
    const p = el('div', 'menu', this.pause);
    el('h2', '', p, 'PAUSA');
    button('Continuar', p, () => cb.onResume(), 'primary');
    button('Controles', p, () => cb.onSettings('controls'));
    button('Ajustes', p, () => cb.onSettings('camera'));
    button('Reiniciar partida', p, () => cb.onRestart());
    button('Salir al menú principal', p, () => cb.onQuit(), 'danger');

    // Resultados
    this.results = el('div', 'overlay hidden', parent);
    const r = el('div', 'menu results', this.results);
    el('h2', '', r, 'FIN DEL PARTIDO');
    this.resultTitle = el('div', 'big', r);
    this.resultScore = el('div', 'tagline', r);
    this.resultXp = el('div', 'xp-gain', r);
    button('Revancha', r, () => cb.onRestart(), 'primary');
    button('Menú principal', r, () => cb.onQuit());

    for (const o of [this.side, this.pause, this.results, this.chip]) o.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.show('home');
    profile.onChange = () => this.refreshProfile();
  }

  private setDifficulty(d: BotDifficulty): void {
    for (const [k, b] of this.diffButtons) b.classList.toggle('active', k === d);
  }

  private show(view: View): void {
    if (this.view === 'garage' && view !== 'garage') this.garage.close();
    this.view = view;
    this.nav.hidden = view !== 'home';
    this.play.hidden = view !== 'play';
    this.garage.root.hidden = view !== 'garage';
    this.profileMenu.root.hidden = view !== 'profile';
    if (view === 'garage') this.garage.open();
    if (view === 'profile') this.profileMenu.open();
    this.refreshProfile();
  }

  refreshProfile(): void {
    const lv = this.profile.level;
    this.chip.innerHTML = '';
    el('span', 'chip-name', this.chip, this.profile.data.name);
    el('span', 'chip-level', this.chip, `Nivel ${lv.level}`);
    const bar = el('span', 'chip-bar', this.chip);
    el('span', 'chip-fill', bar).style.width = `${(lv.progress / lv.next) * 100}%`;
    const car = this.profile.car;
    this.carTag.innerHTML = '';
    el('div', 'tag-name', this.carTag, car.name);
    el('div', 'tag-class', this.carTag, car.hitboxClass);
  }

  showMain(v: boolean): void {
    this.home.hidden = !v;
    if (v) this.show(this.view === 'garage' || this.view === 'profile' ? this.view : 'home');
  }

  showPause(v: boolean): void {
    this.pause.classList.toggle('hidden', !v);
  }

  showResults(winner: Team | null, scores: [number, number], playerTeam: Team, xp: number, mvp: boolean): void {
    this.results.classList.remove('hidden');
    if (winner === null) this.resultTitle.textContent = 'EMPATE';
    else this.resultTitle.textContent = winner === playerTeam ? '¡VICTORIA!' : 'DERROTA';
    this.resultTitle.style.color = winner === null ? '' : winner === 0 ? '#7fb7ff' : '#ffb36b';
    this.resultScore.textContent = `Azul ${scores[0]} – ${scores[1]} Naranja`;
    this.resultXp.textContent = `+${xp} XP${mvp ? ' · MVP' : ''}`;
  }

  hideResults(): void {
    this.results.classList.add('hidden');
  }

  get mainVisible(): boolean {
    return !this.home.hidden;
  }
}
