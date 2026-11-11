import { ACTIONS, keyLabel, padLabel, samePad, type ActionId, type PadBinding } from '../controls/ControlMapper';
import type { InputManager } from '../core/InputManager';
import { button, el } from './dom';

type SlotKind = { kind: 'key'; slot: number } | { kind: 'pad'; slot: number };

/**
 * Remapeo completo: cualquier acción a cualquier tecla, botón de ratón, botón o
 * eje del mando (PlayStation / Xbox). Clic en una casilla y pulsa la entrada;
 * Esc cancela y Supr/Retroceso borra la asignación.
 */
export class KeybindMenu {
  readonly root: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly table: HTMLTableSectionElement;
  private listening: { action: ActionId; slot: SlotKind; btn: HTMLButtonElement } | null = null;
  private padRaf = 0;

  constructor(parent: HTMLElement, private readonly input: InputManager) {
    this.root = el('div', '', parent);
    this.status = el('div', 'pad-status', this.root);
    el('p', 'hint', this.root, 'Haz clic en una casilla y pulsa la tecla, botón o eje. Esc cancela, Supr borra.');
    const table = el('table', 'keybinds', this.root);
    const hr = el('tr', '', el('thead', '', table));
    for (const h of ['ACCIÓN', 'TECLADO / RATÓN 1', 'TECLADO / RATÓN 2', 'MANDO 1', 'MANDO 2']) el('th', '', hr, h);
    this.table = el('tbody', '', table);
    const footer = el('div', 'row', this.root);
    footer.style.marginTop = '16px';
    footer.style.display = 'flex';
    footer.style.gap = '10px';
    button('Restablecer controles por defecto', footer, () => {
      this.input.resetProfile();
      this.render();
    }, 'danger');
    window.addEventListener('keydown', this.onKey, true);
    this.render();
  }

  render(): void {
    this.cancel();
    const gp = this.input.gamepad;
    const style = gp.style;
    this.status.innerHTML = '';
    el('span', `dot ${gp.connected ? 'on' : ''}`, this.status);
    el(
      'span',
      '',
      this.status,
      gp.connected
        ? `Mando conectado: ${style === 'playstation' ? 'PlayStation (DualShock 4 / DualSense)' : style === 'xbox' ? 'Xbox' : 'Genérico'} · ${gp.name.slice(0, 48)}`
        : 'Ningún mando detectado. Conecta uno y pulsa cualquier botón.',
    );
    this.table.innerHTML = '';
    let group = '';
    for (const meta of ACTIONS) {
      if (meta.group !== group) {
        group = meta.group;
        const gr = el('tr', '', this.table);
        const td = el('td', 'section-title', gr, group);
        td.colSpan = 5;
      }
      const tr = el('tr', '', this.table);
      el('td', 'action', tr, meta.label);
      const b = this.input.profile.bindings[meta.id];
      for (let i = 0; i < 2; i++) {
        const code = b.keys[i];
        this.cell(tr, meta.id, { kind: 'key', slot: i }, code ? keyLabel(code) : '—');
      }
      for (let i = 0; i < 2; i++) {
        const p = b.pad[i];
        this.cell(tr, meta.id, { kind: 'pad', slot: i }, p ? padLabel(p, style) : '—');
      }
    }
  }

  private cell(tr: HTMLTableRowElement, action: ActionId, slot: SlotKind, label: string): void {
    const td = el('td', '', tr);
    const btn = button(label, td, () => this.listen(action, slot, btn), `bind ${label === '—' ? 'empty' : ''}`);
  }

  private listen(action: ActionId, slot: SlotKind, btn: HTMLButtonElement): void {
    this.cancel();
    this.listening = { action, slot, btn };
    btn.classList.add('listening');
    if (slot.kind === 'key') {
      btn.textContent = 'Pulsa una tecla…';
      setTimeout(() => {
        if (this.listening?.btn !== btn) return;
        this.input.keyboard.capture((code) => {
          if (!this.listening) return;
          if (code === 'Escape') {
            this.render();
            return;
          }
          if (code === 'Delete' || code === 'Backspace') this.setKey(action, slot.slot, null);
          else this.setKey(action, slot.slot, code);
          this.render();
        });
      }, 0);
    } else {
      btn.textContent = 'Pulsa en el mando…';
      this.input.gamepad.beginCapture();
      const poll = (): void => {
        if (this.listening?.btn !== btn) return;
        const result = this.input.gamepad.pollCapture();
        if (result) {
          this.setPad(action, slot.slot, result);
          this.render();
          return;
        }
        this.padRaf = requestAnimationFrame(poll);
      };
      this.padRaf = requestAnimationFrame(poll);
    }
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.listening || this.listening.slot.kind !== 'pad') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Delete' || e.code === 'Backspace') this.setPad(this.listening.action, this.listening.slot.slot, null);
    this.render();
  };

  private setKey(action: ActionId, slot: number, code: string | null): void {
    const keys = this.input.profile.bindings[action].keys.slice();
    if (code === null) keys.splice(slot, 1);
    else {
      const existing = keys.indexOf(code);
      if (existing >= 0 && existing !== slot) keys.splice(existing, 1);
      if (slot >= keys.length) keys.push(code);
      else keys[slot] = code;
    }
    this.input.profile.bindings[action].keys = keys.slice(0, 2);
    this.input.saveProfile();
  }

  private setPad(action: ActionId, slot: number, binding: PadBinding | null): void {
    const pads = this.input.profile.bindings[action].pad.slice();
    if (binding === null) pads.splice(slot, 1);
    else {
      const existing = pads.findIndex((p) => samePad(p, binding));
      if (existing >= 0 && existing !== slot) pads.splice(existing, 1);
      if (slot >= pads.length) pads.push(binding);
      else pads[slot] = binding;
    }
    this.input.profile.bindings[action].pad = pads.slice(0, 2);
    this.input.saveProfile();
  }

  cancel(): void {
    if (!this.listening) return;
    this.input.keyboard.cancelCapture();
    this.input.gamepad.endCapture();
    cancelAnimationFrame(this.padRaf);
    this.listening = null;
  }

  get isListening(): boolean {
    return this.listening !== null;
  }
}
