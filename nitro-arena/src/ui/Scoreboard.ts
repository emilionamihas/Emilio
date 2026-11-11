import type { Car } from '../entities/Car';
import { TEAM_NAMES, type Team } from '../core/types';
import { el } from './dom';

/** Marcador detallado (mantener pulsado Tab / Share-View). */
export class Scoreboard {
  readonly root: HTMLDivElement;
  private readonly tbody: HTMLTableSectionElement;
  private visible = false;
  private lastRender = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'scoreboard', parent);
    const table = el('table', '', this.root);
    const head = el('thead', '', table);
    const hr = el('tr', '', head);
    for (const h of ['JUGADOR', 'PUNTOS', 'GOLES', 'ASIST.', 'PARADAS', 'TIROS', 'DEMOS', 'TOQUES']) el('th', '', hr, h);
    this.tbody = el('tbody', '', table);
  }

  setVisible(v: boolean, cars: readonly Car[], scores: [number, number], playerId: number): void {
    const now = performance.now();
    if (v && (!this.visible || now - this.lastRender > 250)) {
      this.lastRender = now;
      this.render(cars, scores, playerId);
    }
    if (v !== this.visible) {
      this.visible = v;
      this.root.classList.toggle('show', v);
    }
  }

  private render(cars: readonly Car[], scores: [number, number], playerId: number): void {
    this.tbody.innerHTML = '';
    for (const team of [0, 1] as Team[]) {
      const head = el('tr', `team-head t${team}`, this.tbody);
      const td = el('td', '', head, `${TEAM_NAMES[team].toUpperCase()} · ${scores[team]}`);
      td.colSpan = 8;
      const list = cars.filter((c) => c.team === team).sort((a, b) => b.stats.score - a.stats.score);
      for (const c of list) {
        const tr = el('tr', `t${team}${c.id === playerId ? ' me' : ''}`, this.tbody);
        const s = c.stats;
        for (const v of [c.name, s.score, s.goals, s.assists, s.saves, s.shots, s.demos, s.touches]) el('td', '', tr, String(v));
      }
    }
  }
}
