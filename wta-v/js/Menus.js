import { formatMoney } from './GameState.js';

/**
 * Menú de tienda/negocio. Se maneja con teclado (funciona con el ratón capturado):
 *   W/S o flechas para moverse, E/Enter para comprar, 1-9 compra directa, Q/Retroceso para cerrar.
 * Con el ratón libre también se puede hacer clic.
 * Mientras está abierto el juego se pausa.
 */
export class Menus {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('shop');
    this.titleEl = document.getElementById('shop-title');
    this.subEl = document.getElementById('shop-sub');
    this.listEl = document.getElementById('shop-list');
    this.moneyEl = document.getElementById('shop-money');
    this.current = null;
    this.index = 0;
    this.stack = []; // submenús: Q vuelve al anterior

    // Se registra después del listener de Input, así puede limpiar la tecla que cierra el menú
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get isOpen() {
    return !!this.current;
  }

  /**
   * @param {object} menu { title, subtitle, items: () => [{ label, detail, price, disabled, owned, action }] }
   */
  open(menu) {
    this.stack = [];
    this.current = menu;
    this.index = 0;
    this.el.classList.remove('hidden');
    this.render();
  }

  /** Abre un submenú; Q/Retroceso vuelve al anterior. */
  push(menu) {
    this.stack.push({ menu: this.current, index: this.index });
    this.current = menu;
    this.index = 0;
    this.render();
  }

  back() {
    const prev = this.stack.pop();
    if (!prev) {
      this.close();
      return;
    }
    this.current = prev.menu;
    this.index = prev.index;
    this.render();
  }

  close() {
    if (!this.current) return;
    this.stack = [];
    const onClose = this.current.onClose;
    this.current = null;
    this.el.classList.add('hidden');
    this.game.input.pressed.clear();
    if (onClose) onClose();
  }

  items() {
    return this.current.items();
  }

  render() {
    if (!this.current) return;
    const items = this.items();
    this.index = Math.min(this.index, items.length - 1);
    this.titleEl.textContent = this.current.title;
    this.subEl.textContent = typeof this.current.subtitle === 'function' ? this.current.subtitle() : this.current.subtitle || '';
    this.moneyEl.textContent = formatMoney(this.game.state.money);
    this.listEl.innerHTML = '';
    items.forEach((it, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'shop-item' + (i === this.index ? ' selected' : '') + (it.disabled ? ' disabled' : '') + (it.owned ? ' owned' : '');
      const price = it.owned ? 'COMPRADO' : it.price != null ? formatMoney(it.price) : it.submenu ? '›' : it.tag || '';
      row.innerHTML = `<span class="shop-key">${i < 9 ? i + 1 : ''}</span><span class="shop-label">${it.label}<small>${it.detail || ''}</small></span><span class="shop-price">${price}</span>`;
      row.addEventListener('click', () => {
        this.index = i;
        this.activate();
      });
      this.listEl.appendChild(row);
    });
  }

  activate() {
    const it = this.items()[this.index];
    if (!it || it.disabled) return;
    if (it.submenu) {
      this.push(it.submenu());
      return;
    }
    if (it.price != null && !it.owned && this.game.state.money < it.price) {
      this.flash(`Te faltan ${formatMoney(it.price - this.game.state.money)}`);
      return;
    }
    const result = it.action();
    if (typeof result === 'string') this.flash(result);
    if (this.current && this.current.closeOnBuy && !(this.current.keepOpen && this.current.keepOpen(result))) this.close();
    else this.render();
  }

  flash(text) {
    this.subEl.textContent = text;
    this.subEl.classList.add('warn');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.subEl.classList.remove('warn');
      this.render();
    }, 1600);
  }

  onKey(e) {
    if (!this.current) return;
    const n = this.items().length;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.index = (this.index - 1 + n) % n;
        this.render();
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.index = (this.index + 1) % n;
        this.render();
        break;
      case 'KeyE':
      case 'Enter':
      case 'Space':
        this.activate();
        break;
      case 'KeyQ':
      case 'Backspace':
        this.back();
        break;
      case 'Escape':
        this.close();
        break;
      default:
        if (/^Digit[1-9]$/.test(e.code)) {
          const i = Number(e.code.slice(5)) - 1;
          if (i < n) {
            this.index = i;
            this.activate();
          }
        } else {
          return;
        }
    }
    e.preventDefault();
    this.game.input.pressed.clear();
  }
}
