import * as THREE from 'three';
import { BANKS } from './Locations.js';
import { formatMoney } from './GameState.js';
import { NPC } from './NPC.js';
import { OUTFITS } from './HumanModel.js';

const STORE = { duration: 3, loot: [900, 2000], startLevel: 1, endLevel: 1, cooldown: 90 };
const GRAB_TIME = 0.5;
const REINFORCE_EVERY = 30;
const FIRST_REINFORCE = 25;
const HEAD_START = 20; // segundos sin patrullas nuevas al salir con el botín

const rand = (a, b) => Math.round(a + Math.random() * (b - a));

/**
 * Atracos dentro de los interiores.
 *  Tienda: encañonas al dependiente (o E en el mostrador) y vacía la caja mientras no te alejes.
 *  Banco: alarma -> guardias y policía a pie -> taladras la cámara -> recoges los carros -> sales.
 * El botín de los bancos va a la bolsa y solo es tuyo cuando pierdes a la policía.
 */
export class Heists {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.pendingLoot = 0;
    this.pendingFrom = null;
    this.cooldowns = {};
    game.on('exitedInterior', ({ key }) => this.onExitInterior(key));
  }

  cooldownLeft(id) {
    return Math.max(0, (this.cooldowns[id] || 0) - this.game.time);
  }

  hasFirearm() {
    return !this.game.player.weapon.melee;
  }

  // ------------------------------------------------------------------
  // Inicio de los atracos
  // ------------------------------------------------------------------
  startStore(inst, poi) {
    const game = this.game;
    if (this.active) return;
    if (!this.hasFirearm()) {
      game.hud.notify('Necesitas un arma de fuego en la mano. Cómprala en la Armería.');
      return;
    }
    if (this.cooldownLeft(poi.id) > 0) {
      game.hud.notify(`La caja está vacía: la atracaron hace poco. Vuelve en ${Math.ceil(this.cooldownLeft(poi.id))} s.`);
      return;
    }
    if (!inst.cashier || inst.cashier.dead) {
      game.hud.notify('No hay nadie que abra la caja.');
      return;
    }
    this.active = { type: 'store', inst, poi, time: 0, total: rand(STORE.loot[0], STORE.loot[1]) };
    inst.cashier.state = 'handsUp';
    for (const n of inst.npcs) if (n !== inst.cashier) n.panic(game.player.mesh.position);
    game.wanted.raiseTo(STORE.startLevel, poi.pos);
    game.hud.notify('¡Manos arriba! El dependiente está llenando la bolsa. No te alejes del mostrador.');
  }

  startBank(inst, poi) {
    const game = this.game;
    if (this.active) return;
    if (this.cooldownLeft(poi.id) > 0) {
      game.hud.notify(`La cámara ya está vacía. Vuelve en ${Math.ceil(this.cooldownLeft(poi.id))} s.`);
      return;
    }
    const cfg = BANKS[poi.id];
    const total = rand(cfg.loot[0], cfg.loot[1]);
    // Reparto del botín entre carros (los de oro valen 1,5 veces más)
    const weights = inst.carts.map((c) => (c.gold ? 1.5 : 1));
    const sum = weights.reduce((a, b) => a + b, 0);
    inst.carts.forEach((c, i) => (c.value = Math.round((total * weights[i]) / sum)));
    this.active = { type: 'bank', inst, poi, cfg, stage: 'alarm', drill: 0, loot: 0, reinforceTimer: FIRST_REINFORCE, policeSpawned: 0, grab: null };
    for (const n of inst.npcs) n.panic(game.player.mesh.position);
    for (const t of inst.tellers || []) t.state = 'handsUp';
    game.wanted.raiseTo(cfg.startLevel, poi.pos);
    game.hud.notify(`¡Alarma en ${poi.name}! Taladra la cámara acorazada (al fondo) y coge el dinero.`, 5);
    game.pedestrians.panicAround(poi.pos, 40);
  }

  useInterior(id, inst, poi) {
    const a = this.active;
    if (id === 'rob-store') this.startStore(inst, poi);
    else if (id === 'rob-bank') this.startBank(inst, poi);
    else if (id === 'vault') {
      if (!a) {
        if (!this.hasFirearm()) {
          this.game.hud.notify('Sin un arma en la mano nadie te va a dejar taladrar la cámara.');
          return;
        }
        this.startBank(inst, poi);
      }
      const b = this.active;
      if (b && b.type === 'bank' && b.stage === 'alarm') {
        b.stage = 'drilling';
        this.game.hud.notify('Taladro colocado. Quédate junto a la puerta de la cámara.');
      }
    }
  }

  canLeave() {
    return true;
  }

  /** Texto de ayuda contextual dentro de un interior (undefined = el normal del interior). */
  interiorPrompt(inst, near) {
    const a = this.active;
    if (!a || a.inst !== inst) {
      if (near && near.id === 'vault' && inst.vault && inst.vault.open) return 'La cámara está abierta y vacía.';
      return undefined;
    }
    if (a.type === 'store') return near && near.id === 'exit' ? 'Pulsa <kbd>E</kbd> · Huir sin el dinero' : null;
    if (a.stage === 'alarm') {
      if (near && near.id === 'vault') return 'Pulsa <kbd>E</kbd> · Colocar el taladro en la cámara acorazada';
      return near && near.id === 'exit' ? 'Pulsa <kbd>E</kbd> · Huir' : null;
    }
    if (a.stage === 'open') {
      const cart = this.nearestCart(inst);
      if (cart && !a.grab) return `Pulsa <kbd>E</kbd> · Coger ${cart.gold ? 'los lingotes' : 'el dinero'} (${formatMoney(cart.value)})`;
      if (near && near.id === 'exit') return `Pulsa <kbd>E</kbd> · Salir con ${formatMoney(a.loot)}`;
    }
    return null;
  }

  nearestCart(inst) {
    const p = this.game.player.mesh.position;
    for (const c of inst.carts) {
      if (!c.taken && Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 1.6) return c;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------
  update(dt) {
    const game = this.game;
    const cur = game.interior;

    if (cur && !this.active) this.detectHoldUp(cur);

    const a = this.active;
    if (a && a.type === 'store') this.updateStore(a, dt);
    if (a && a.type === 'bank') this.updateBank(a, dt);

    // Botín asegurado al quedar limpio (y fuera del banco)
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
    const inBag = this.pendingLoot + (a && a.type === 'bank' ? a.loot : 0);
    game.hud.setLoot(inBag);
  }

  /** Apuntar a un empleado o disparar dentro inicia el atraco. */
  detectHoldUp(cur) {
    const game = this.game;
    const inst = cur.inst;
    const kind = inst.key === 'store' ? 'store' : inst.key.startsWith('bank') ? 'bank' : null;
    if (!kind || !this.hasFirearm()) return;
    const shot = game.time - game.player.lastShot < 0.05;
    let aimedAt = null;
    if (game.player.aiming) {
      // Encañonar: empleado a menos de 14 m y a menos de 12° de la mira
      const cam = game.camera;
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      for (const n of inst.npcs) {
        if (n.dead || (n.role !== 'cashier' && n.role !== 'teller')) continue;
        const to = new THREE.Vector3(n.pos.x, 1.3, n.pos.z).sub(cam.position);
        const d = to.length();
        if (d < 14 && fwd.angleTo(to) < 0.21) {
          aimedAt = n;
          break;
        }
      }
    }
    if (!aimedAt && !shot) return;
    if (kind === 'store') this.startStore(inst, cur.poi);
    else this.startBank(inst, cur.poi);
  }

  updateStore(a, dt) {
    const game = this.game;
    const inst = a.inst;
    if (game.interior?.inst !== inst) return;
    if (inst.cashier.dead) {
      this.active = null;
      game.hud.setProgress(null);
      this.cooldowns[a.poi.id] = game.time + STORE.cooldown;
      game.hud.notify('Has matado al dependiente: nadie puede abrir la caja.');
      return;
    }
    const p = game.player.mesh.position;
    const near = Math.hypot(p.x - inst.counterPos.x, p.z - inst.counterPos.z) < 9;
    if (near) a.time += dt;
    const progress = Math.min(1, a.time / STORE.duration);
    game.hud.setProgress(near ? `LLENANDO LA BOLSA · ${formatMoney(a.total * progress)}` : 'ACÉRCATE AL MOSTRADOR', progress);
    if (progress >= 1) {
      this.active = null;
      game.hud.setProgress(null);
      this.cooldowns[a.poi.id] = game.time + STORE.cooldown;
      game.wanted.raiseTo(STORE.endLevel, a.poi.pos);
      game.wanted.giveHeadStart(10);
      game.state.addMoney(a.total);
      game.state.stats.robberies++;
      game.hud.moneyDelta(a.total);
      game.hud.notify(`Te llevas ${formatMoney(a.total)}. ¡Sal de aquí!`);
      game.emit('storeRobbed', { id: a.poi.id });
    }
  }

  updateBank(a, dt) {
    const game = this.game;
    const inst = a.inst;
    if (game.interior?.inst !== inst) return;
    const p = game.player.mesh.position;

    // Refuerzos: policía a pie entrando por la puerta
    a.reinforceTimer -= dt;
    const alivePolice = inst.npcs.filter((n) => n.role === 'police' && !n.dead).length;
    if (a.reinforceTimer <= 0 && a.policeSpawned < inst.layout.police && alivePolice < 4) {
      a.reinforceTimer = REINFORCE_EVERY;
      const n = 1 + (a.policeSpawned < inst.layout.police - 1 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const pos = inst.spawn.clone().add(new THREE.Vector3((k ? 1 : -1) * 0.9, 0, 0.3));
        const cop = new NPC(game, { role: 'police', outfit: OUTFITS.policia, position: pos, facing: Math.PI, armed: true, bounds: inst.bounds });
        cop.hostile = true;
        inst.npcs.push(cop);
        a.policeSpawned++;
      }
      game.hud.notify('¡La policía está entrando en el banco!', 2.5);
    }

    if (a.stage === 'drilling') {
      const d = Math.hypot(p.x - inst.vault.drillPos.x, p.z - inst.vault.drillPos.z);
      if (d < 2.6) a.drill += dt;
      const progress = Math.min(1, a.drill / inst.layout.drill);
      game.hud.setProgress(d < 2.6 ? `TALADRANDO LA CÁMARA · ${Math.round(progress * 100)} %` : 'VUELVE AL TALADRO', progress);
      if (Math.random() < 0.5) game.effects.spawnSparks(inst.vault.drillPos.clone().setY(1.4).add(new THREE.Vector3(0, 0, -1.1)), new THREE.Vector3(0, 0.5, 1), 2, 0xffd180);
      if (progress >= 1) {
        a.stage = 'open';
        inst.vault.open = true;
        game.world.removeBody(inst.vault.doorBody);
        game.hud.setProgress(null);
        game.hud.notify('¡Cámara abierta! Coge el dinero de los carros y sal.');
      }
    } else if (a.stage === 'open') {
      if (a.grab) {
        const c = a.grab.cart;
        const close = Math.hypot(p.x - c.pos.x, p.z - c.pos.z) < 2;
        if (!close) {
          a.grab = null;
          game.hud.setProgress(null);
        } else {
          a.grab.t += dt;
          game.hud.setProgress('METIENDO EN LA BOLSA', Math.min(1, a.grab.t / GRAB_TIME));
          if (a.grab.t >= GRAB_TIME) {
            c.taken = true;
            c.load.visible = false;
            a.loot += c.value;
            a.grab = null;
            game.hud.setProgress(null);
            const left = inst.carts.filter((x) => !x.taken).length;
            game.hud.notify(left ? `+${formatMoney(c.value)}. Quedan ${left} carros.` : `+${formatMoney(c.value)}. ¡Cámara vacía! Sal del banco.`, 2.5);
          }
        }
      } else if (game.input.wasPressed('KeyE')) {
        const cart = this.nearestCart(inst);
        if (cart) a.grab = { cart, t: 0 };
      }
    }
  }

  /** Al salir de un interior se cierra el atraco en curso. */
  onExitInterior(key) {
    const game = this.game;
    const a = this.active;
    if (!a) return;
    if (a.type === 'store') {
      this.active = null;
      game.hud.setProgress(null);
      game.hud.notify('Te has ido sin el dinero de la caja.');
      return;
    }
    if (a.type === 'bank' && key === a.inst.key) {
      this.active = null;
      game.hud.setProgress(null);
      this.cooldowns[a.poi.id] = game.time + a.cfg.cooldown * (a.loot > 0 ? 1 : 0.3);
      if (a.loot > 0) {
        this.pendingLoot += a.loot;
        this.pendingFrom = a.poi.id;
        game.state.stats.robberies++;
        game.wanted.raiseTo(a.cfg.endLevel, a.poi.pos);
        game.wanted.giveHeadStart(HEAD_START);
        game.hud.notify(`Llevas ${formatMoney(a.loot)} en la bolsa. Tienes ${HEAD_START} s de ventaja: pierde a la policía para asegurarlo.`, 5);
        game.emit('bankRobbed', { id: a.poi.id, partial: a.loot < a.inst.carts.reduce((s, c) => s + (c.value || 0), 0) });
      } else {
        game.hud.notify('Has salido del banco sin nada.');
      }
    }
  }

  /** Muerte o arresto: se pierde lo que no estaba asegurado. */
  onPlayerDown() {
    const a = this.active;
    let lost = this.pendingLoot;
    if (a && a.type === 'bank') lost += a.loot;
    this.active = null;
    this.game.hud.setProgress(null);
    this.pendingLoot = 0;
    this.pendingFrom = null;
    return lost;
  }
}
