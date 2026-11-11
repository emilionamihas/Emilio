import type { GameMode, Team } from '../core/types';
import { button, el } from './dom';

export interface MenuCallbacks {
  onPlay: (mode: GameMode) => void;
  onSettings: () => void;
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

/** Pantalla de inicio, menú de pausa y pantalla de resultados. */
export class MainMenu {
  private readonly main: HTMLDivElement;
  private readonly pause: HTMLDivElement;
  private readonly results: HTMLDivElement;
  private readonly resultTitle: HTMLDivElement;
  private readonly resultScore: HTMLDivElement;

  constructor(parent: HTMLElement, cb: MenuCallbacks) {
    this.main = el('div', 'overlay', parent);
    const m = el('div', 'menu', this.main);
    el('h1', '', m, 'NITRO ARENA');
    el('div', 'tagline', m, 'Fútbol con coches · físicas emergentes · 120 Hz');
    button('1 vs 1', m, () => cb.onPlay('1v1'), 'primary');
    const row = el('div', 'row', m);
    button('2 vs 2', row, () => cb.onPlay('2v2'));
    button('3 vs 3', row, () => cb.onPlay('3v3'));
    button('Juego libre (entrenamiento)', m, () => cb.onPlay('freeplay'));
    button('Ajustes y controles', m, () => cb.onSettings());
    const help = el('div', 'controls-help', m);
    const lines: Array<[string, string]> = [
      ['Acelerar / Freno', 'W / S · R2 / L2'],
      ['Girar / Pitch', 'A D / W S · Stick izq.'],
      ['Salto', 'Espacio / Clic der. · ✕ / A'],
      ['Boost', 'Clic izq. / F · ○ / B'],
      ['Powerslide / Air Roll', 'Shift · □ / X'],
      ['Air Roll izq / der', 'Q / E · L1 / R1'],
      ['Ball Cam', 'C · △ / Y'],
      ['Marcador / Pausa', 'Tab / Esc · Share / Options'],
    ];
    for (const [a, b] of lines) {
      const d = el('div', '', help);
      el('b', '', d, a);
      d.append(` ${b}`);
    }

    this.pause = el('div', 'overlay hidden', parent);
    const p = el('div', 'menu', this.pause);
    el('h2', '', p, 'PAUSA');
    button('Continuar', p, () => cb.onResume(), 'primary');
    button('Ajustes', p, () => cb.onSettings());
    button('Reiniciar partida', p, () => cb.onRestart());
    button('Salir al menú principal', p, () => cb.onQuit(), 'danger');

    this.results = el('div', 'overlay hidden', parent);
    const r = el('div', 'menu results', this.results);
    el('h2', '', r, 'FIN DEL PARTIDO');
    this.resultTitle = el('div', 'big', r);
    this.resultScore = el('div', 'tagline', r);
    button('Revancha', r, () => cb.onRestart(), 'primary');
    button('Menú principal', r, () => cb.onQuit());

    for (const o of [this.main, this.pause, this.results]) o.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  showMain(v: boolean): void {
    this.main.classList.toggle('hidden', !v);
  }

  showPause(v: boolean): void {
    this.pause.classList.toggle('hidden', !v);
  }

  showResults(winner: Team | null, scores: [number, number], playerTeam: Team): void {
    this.results.classList.remove('hidden');
    if (winner === null) this.resultTitle.textContent = 'EMPATE';
    else this.resultTitle.textContent = winner === playerTeam ? '¡VICTORIA!' : 'DERROTA';
    this.resultTitle.style.color = winner === null ? '' : winner === 0 ? '#7fb7ff' : '#ffb36b';
    this.resultScore.textContent = `Azul ${scores[0]} – ${scores[1]} Naranja`;
  }

  hideResults(): void {
    this.results.classList.add('hidden');
  }

  get mainVisible(): boolean {
    return !this.main.classList.contains('hidden');
  }

  get pauseVisible(): boolean {
    return !this.pause.classList.contains('hidden');
  }
}
