import { BANKS } from './Locations.js';
import { formatMoney } from './GameState.js';

const ROB_RADIUS = 6;
const STORE = { duration: 7, loot: [600, 1400], startLevel: 1, endLevel: 2, cooldown: 120 };

const rand = (a, b) => Math.round(a + Math.random() * (b - a));

/**
 * Atracos. Tiendas: el dinero es tuyo al terminar. Bancos: el botín queda "en la bolsa"
 * y solo se asegura cuando pierdes a la policía; si te matan o te arrestan, lo pierdes.
 */
export class Heists {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.pendingLoot = 0;
    this.pendingFrom = null;
    this.cooldowns = {}; // id -> instante (game.time) en que vuelve a estar disponible
  }

  cooldownLeft(id) {
    return Math.max(0, (this.cooldowns[id] || 0) - this.game.time);
  }

  start(poi) {
    const game = this.game;
    const w = game.player.weapon;
    if (w.melee) {
      game.hud.notify('Necesitas un arma de fuego en la mano para atracar. Cómprala en la Armería.');
      return;
    }
    if (this.cooldownLeft(poi.id) > 0) {
      game.hud.notify(`Acaban de atracar ${poi.name}. Vuelve en ${Math.ceil(this.cooldownLeft(poi.id))} s.`);
      return;
    }
    const cfg = poi.type === 'bank' ? BANKS[poi.id] : STORE;
    const total = rand(cfg.loot[0], cfg.loot[1]);
    this.active = { poi, cfg, total, time: 0, bank: poi.type === 'bank' };
    game.wanted.raiseTo(cfg.startLevel, poi.pos);
    game.hud.notify(
      this.active.bank
        ? `¡Atraco en ${poi.name}! Quédate junto a la cámara acorazada mientras se vacía.`
        : `¡Atraco! Mantente junto a la caja de ${poi.name}.`
    );
  }

  update(dt) {
    const game = this.game;
    const a = this.active;

    if (a) {
      const p = game.player.mesh.position;
      const inside = game.interaction.state === 'foot' && Math.hypot(p.x - a.poi.pos.x, p.z - a.poi.pos.z) < ROB_RADIUS;
      if (!inside) {
        this.abort();
      } else {
        a.time += dt;
        const progress = Math.min(1, a.time / a.cfg.duration);
        game.hud.setProgress(`${a.bank ? 'VACIANDO CÁMARA' : 'VACIANDO CAJA'} · ${formatMoney(a.total * progress)}`, progress);
        if (progress >= 1) this.complete();
      }
    }

    // Botín asegurado al quedar limpio
    if (this.pendingLoot > 0 && game.wanted.level === 0 && !this.active) {
      const amount = this.pendingLoot;
      const from = this.pendingFrom;
      this.pendingLoot = 0;
      this.pendingFrom = null;
      game.state.addMoney(amount);
      game.state.stats.banks++;
      game.hud.moneyDelta(amount);
      game.hud.notify(`Botín asegurado: ${formatMoney(amount)}.`);
      game.state.save();
      game.emit('lootSecured', { amount, id: from });
    }
    game.hud.setLoot(this.pendingLoot);
  }

  abort() {
    const game = this.game;
    const a = this.active;
    this.active = null;
    game.hud.setProgress(null);
    const progress = Math.min(1, a.time / a.cfg.duration);
    this.cooldowns[a.poi.id] = game.time + a.cfg.cooldown * 0.5;
    if (a.bank && progress > 0.3) {
      const partial = Math.round(a.total * progress);
      this.pendingLoot += partial;
      this.pendingFrom = a.poi.id;
      game.hud.notify(`Te has ido con parte del botín: ${formatMoney(partial)}. Pierde a la policía para asegurarlo.`);
      game.emit('bankRobbed', { id: a.poi.id, partial: true });
    } else {
      game.hud.notify('Atraco abortado: te alejaste demasiado.');
    }
  }

  complete() {
    const game = this.game;
    const a = this.active;
    this.active = null;
    game.hud.setProgress(null);
    this.cooldowns[a.poi.id] = game.time + a.cfg.cooldown;
    game.wanted.raiseTo(a.cfg.endLevel, a.poi.pos);
    game.state.stats.robberies++;
    if (a.bank) {
      this.pendingLoot += a.total;
      this.pendingFrom = a.poi.id;
      game.hud.notify(`¡Cámara vaciada! ${formatMoney(a.total)} en la bolsa. Pierde a la policía para asegurarlo.`, 5);
      game.emit('bankRobbed', { id: a.poi.id, partial: false });
    } else {
      game.state.addMoney(a.total);
      game.hud.moneyDelta(a.total);
      game.hud.notify(`Te llevas ${formatMoney(a.total)} de la caja. ¡Huye!`);
      game.emit('storeRobbed', { id: a.poi.id });
    }
  }

  /** Muerte o arresto: se pierde lo que no estaba asegurado. */
  onPlayerDown() {
    if (this.active) {
      this.active = null;
      this.game.hud.setProgress(null);
    }
    const lost = this.pendingLoot;
    this.pendingLoot = 0;
    this.pendingFrom = null;
    return lost;
  }
}
