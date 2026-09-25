import * as THREE from 'three';
import { VehicleController } from './VehicleController.js';
import { driveTo } from './AITraffic.js';

// Patrullas simultáneas por nivel de búsqueda (índice = estrellas)
const UNITS_PER_LEVEL = [0, 1, 2, 3, 4, 6];

/** Cuánto "calor" suma cada delito. Al llegar a 1 sube una estrella. */
const CRIMES = {
  gunshot: { heat: 0.12, minLevel: 1 },
  hit_vehicle: { heat: 0.06 },
  steal_car: { heat: 0.35, minLevel: 1 },
  carjack: { heat: 0.6, minLevel: 1 },
  steal_police: { heat: 0.5, minLevel: 2 },
  attack_police: { heat: 0.35, minLevel: 1, cooldown: 0.4 },
  explosion: { heat: 0.5, minLevel: 2 },
  murder: { heat: 0.5, minLevel: 1 },
  kill_cop: { heat: 0.8, minLevel: 3 },
};

export class WantedSystem {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.heat = 0;
    this.timeUnseen = 0;
    this.evading = false;
    this.lastKnown = new THREE.Vector3();
    this.units = [];
    this.pool = [];
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.crimeCooldowns = {};

    this.starsEl = document.getElementById('wanted-stars');
    this.starEls = [...this.starsEl.querySelectorAll('.star')];
    this.render();
  }

  // ------------------------------------------------------------------
  // Delitos y nivel
  // ------------------------------------------------------------------
  reportCrime(type) {
    const crime = CRIMES[type];
    if (!crime) return;
    const now = this.game.time;
    if (crime.cooldown && now - (this.crimeCooldowns[type] || -99) < crime.cooldown) return;
    this.crimeCooldowns[type] = now;

    const before = this.level;
    if (crime.minLevel && this.level < crime.minLevel) this.level = crime.minLevel;
    this.heat += crime.heat;
    while (this.heat >= 1 && this.level < 5) {
      this.heat -= 1;
      this.level++;
    }
    if (this.level >= 5) this.heat = Math.min(this.heat, 0.99);

    // Cometer un delito te delata: la policía sabe dónde estás
    this.lastKnown.copy(this.game.getFocusPosition());
    this.timeUnseen = 0;
    if (this.level !== before) {
      this.render();
      if (before === 0) this.game.hud.notify('¡La policía te busca!');
    }
  }

  /** Alarma (atracos): sube directamente al nivel indicado y fija la zona de búsqueda. */
  raiseTo(level, pos) {
    const before = this.level;
    if (level > this.level) this.level = Math.min(5, level);
    this.heat = 0;
    this.lastKnown.copy(pos || this.game.getFocusPosition());
    this.timeUnseen = 0;
    this.render();
    if (before === 0 && this.level > 0) this.game.hud.notify('¡Ha saltado la alarma! La policía va de camino.');
  }

  clear() {
    const was = this.level;
    this.level = 0;
    this.heat = 0;
    this.evading = false;
    this.render();
    if (was > 0 && this.game.emit) this.game.emit('wantedCleared', {});
  }

  render() {
    this.starEls.forEach((el, i) => el.classList.toggle('active', i < this.level));
    this.starsEl.classList.toggle('evading', this.evading && this.level > 0);
  }

  get sightRadius() {
    return 55 + this.level * 15;
  }

  /** Radio del círculo de búsqueda alrededor de la última posición conocida. */
  get searchRadius() {
    return this.sightRadius * 0.5;
  }

  get evadeTime() {
    return 7 + this.level * 2.5;
  }

  // ------------------------------------------------------------------
  // Patrullas (pool propio, igual que el tráfico)
  // ------------------------------------------------------------------
  spawnUnit() {
    const focus = this.game.getFocusPosition();
    const env = this.game.env;
    const candidates = env.nodes.filter((n) => {
      const d = Math.hypot(n.pos.x - focus.x, n.pos.z - focus.z);
      return d > 75 && d < 150;
    });
    if (!candidates.length) return;
    const node = candidates[Math.floor(Math.random() * candidates.length)];
    for (const u of this.units) {
      if (Math.hypot(u.vehicle.position.x - node.pos.x, u.vehicle.position.z - node.pos.z) < 10) return;
    }
    const v = this.pool.pop() || new VehicleController(this.game, { type: 'police' });
    v.repair();
    v.place(node.pos.x, node.pos.z, Math.atan2(focus.x - node.pos.x, focus.z - node.pos.z));
    v.addToWorld();
    v.driver = 'police';
    v.sirenOn = true;
    this.units.push({ vehicle: v, node: null, prevNode: null, stuck: 0, reverseTimer: 0, calmTimer: 0 });
  }

  despawnUnit(unit) {
    unit.vehicle.removeFromWorld();
    unit.vehicle.driver = null;
    unit.vehicle.sirenOn = false;
    this.pool.push(unit.vehicle);
    this.units.splice(this.units.indexOf(unit), 1);
  }

  /** El jugador ha robado una patrulla: deja de ser unidad. */
  releaseUnit(vehicle) {
    const idx = this.units.findIndex((u) => u.vehicle === vehicle);
    if (idx >= 0) this.units.splice(idx, 1);
    vehicle.sirenOn = false;
  }

  // ------------------------------------------------------------------
  // Bucle
  // ------------------------------------------------------------------
  update(dt) {
    const game = this.game;
    const env = game.env;
    const focus = game.getFocusPosition();

    // ¿Alguna patrulla ve al jugador?
    let seen = false;
    for (const u of this.units) {
      const p = u.vehicle.position;
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d < 22 || (d < this.sightRadius && env.segmentOnRoad(p, focus))) {
        seen = true;
        break;
      }
    }

    if (this.level > 0) {
      if (seen) {
        this.timeUnseen = 0;
        this.lastKnown.copy(focus);
        // Mantenerse a la vista de la policía sigue calentando la persecución
        this.heat += dt * 0.012;
        if (this.heat >= 1 && this.level < 5) {
          this.heat = 0;
          this.level++;
        }
      } else if (Math.hypot(focus.x - this.lastKnown.x, focus.z - this.lastKnown.z) < this.searchRadius) {
        // Dentro del círculo de búsqueda la policía sigue sobre tu pista
        this.timeUnseen = 0;
      } else {
        this.timeUnseen += dt;
        if (this.timeUnseen > this.evadeTime) {
          this.clear();
          game.hud.notify('Has despistado a la policía.');
        }
      }
      const evading = this.timeUnseen > 0;
      if (evading !== this.evading) this.evading = evading;
      this.render();
    }

    // Número de patrullas
    const wantedUnits = UNITS_PER_LEVEL[this.level];
    this.spawnTimer -= dt;
    if (this.units.length < wantedUnits && this.spawnTimer <= 0) {
      this.spawnUnit();
      this.spawnTimer = 2.5;
    }

    for (let i = this.units.length - 1; i >= 0; i--) {
      const unit = this.units[i];
      const v = unit.vehicle;
      const p = v.position;
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z);

      if (v.destroyed) {
        v.sirenOn = false;
        v.input.throttle = 0;
        if (dist > 80) this.despawnUnit(unit);
        continue;
      }
      if (this.level === 0 || this.units.length > wantedUnits) {
        // Fin de la persecución: se alejan y desaparecen fuera de la vista
        unit.calmTimer += dt;
        v.sirenOn = false;
        if (dist > 70 || unit.calmTimer > 25) {
          this.despawnUnit(unit);
          continue;
        }
        this.routeTo(unit, focus, 10, true);
        continue;
      }
      if (dist > 230) {
        this.despawnUnit(unit);
        continue;
      }
      v.sirenOn = true;
      this.chase(unit, dt, focus, seen);
    }

    // Mientras vacías una cámara estás dentro del edificio: te rodean, pero no te disparan ni te arrestan
    const inside = this.game.interior || (this.game.heists && this.game.heists.active);
    if (!inside) {
      this.checkBusted(dt, focus);
      this.policeFire(dt, focus);
    }
  }

  /** A partir de 3 estrellas los agentes disparan desde las patrullas cercanas con visión. */
  policeFire(dt, focus) {
    if (this.level < 3) return;
    const game = this.game;
    const driving = game.interaction.isDriving;
    const playerSpeed = driving ? Math.abs(game.interaction.vehicle.getForwardSpeed()) : 0;
    for (const u of this.units) {
      const v = u.vehicle;
      if (v.destroyed) continue;
      u.fireTimer = (u.fireTimer ?? Math.random()) - dt;
      if (u.fireTimer > 0) continue;
      u.fireTimer = 1.3 - this.level * 0.1;
      const p = v.position;
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d > 38 || !(d < 15 || game.env.segmentOnRoad(p, focus))) continue;
      const from = new THREE.Vector3(p.x, p.y + 1.4, p.z);
      const chance = 0.22 + this.level * 0.04 - playerSpeed * 0.005 - d * 0.004;
      const hit = Math.random() < chance;
      const to = new THREE.Vector3(focus.x, focus.y + 1.1, focus.z);
      if (!hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 1.5, (Math.random() - 0.5) * 4));
      game.effects.spawnTracer(from, to);
      if (!hit) {
        game.effects.spawnSparks(to, new THREE.Vector3(0, 1, 0), 3);
      } else if (driving) {
        game.interaction.vehicle.damage(2.5);
      } else {
        game.player.takeDamage(2 + this.level * 0.8);
      }
    }
  }

  chase(unit, dt, focus, seen) {
    const v = unit.vehicle;
    const game = this.game;
    const env = game.env;
    const p = v.position;
    const dist = Math.hypot(p.x - focus.x, p.z - focus.z);

    // Recuperación: si se queda atascado, marcha atrás un momento
    if (unit.reverseTimer > 0) {
      unit.reverseTimer -= dt;
      v.input.throttle = 0;
      v.input.reverse = 1;
      v.input.steer = unit.reverseSteer;
      v.input.handbrake = false;
      return;
    }
    if (v.isFlipped()) {
      unit.stuck += dt;
      if (unit.stuck > 3) v.resetUpright();
      return;
    }

    const playerOnFoot = !game.interaction.isDriving;
    const target = seen ? focus : this.lastKnown;
    const maxSpeed = 20 + this.level * 4;

    if (playerOnFoot && dist < 14) {
      // Se detiene junto al jugador a pie para arrestarlo
      driveTo(v, focus, Math.max(0, (dist - 7) * 1.2));
    } else if (env.segmentOnRoad(p, target) || dist < 25) {
      // Línea directa por la calzada: embestir, con algo de anticipación
      let aim = target;
      if (seen && game.interaction.isDriving) {
        const pv = game.interaction.vehicle.chassisBody.velocity;
        aim = new THREE.Vector3(target.x + pv.x * 0.6, 0, target.z + pv.z * 0.6);
      }
      driveTo(v, aim, maxSpeed, { aggressive: true });
    } else {
      this.routeTo(unit, target, maxSpeed, false);
    }

    const speed = Math.abs(v.getForwardSpeed());
    if (v.input.throttle > 0.3 && speed < 1) unit.stuck += dt;
    else unit.stuck = Math.max(0, unit.stuck - dt * 2);
    if (unit.stuck > 1.6) {
      unit.stuck = 0;
      unit.reverseTimer = 1.3;
      unit.reverseSteer = Math.random() < 0.5 ? 1 : -1;
    }
  }

  /** Ruta por la red de calles: en cada cruce elige el vecino que más acerca al objetivo. */
  routeTo(unit, target, speed, wander) {
    const env = this.game.env;
    const v = unit.vehicle;
    const p = v.position;
    if (!unit.node) {
      unit.node = env.nearestNode(p);
      unit.prevNode = null;
    }
    const dNode = Math.hypot(unit.node.pos.x - p.x, unit.node.pos.z - p.z);
    if (dNode < 9) {
      const options = unit.node.neighbors.map((id) => env.nodes[id]).filter((n) => n !== unit.prevNode);
      let best = options[0];
      if (wander) {
        // Alejarse del objetivo
        best = options.reduce((a, b) => (b.pos.distanceTo(target) > a.pos.distanceTo(target) ? b : a));
      } else {
        best = options.reduce((a, b) =>
          Math.hypot(b.pos.x - target.x, b.pos.z - target.z) < Math.hypot(a.pos.x - target.x, a.pos.z - target.z) ? b : a
        );
      }
      unit.prevNode = unit.node;
      unit.node = best;
    }
    driveTo(v, unit.node.pos, speed, { aggressive: !wander });
  }

  /** BUSTED: policía detenida junto al jugador parado durante un rato. */
  checkBusted(dt, focus) {
    if (this.level === 0) {
      this.bustTimer = 0;
      return;
    }
    const game = this.game;
    const driving = game.interaction.isDriving;
    const playerSpeed = driving ? Math.abs(game.interaction.vehicle.getForwardSpeed()) : Math.hypot(game.player.body.velocity.x, game.player.body.velocity.z);
    let close = false;
    for (const u of this.units) {
      const p = u.vehicle.position;
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d < (driving ? 7 : 9) && Math.abs(u.vehicle.getForwardSpeed()) < 3) close = true;
    }
    const limit = driving ? 3.5 : 2.5;
    if (close && playerSpeed < (driving ? 1.5 : 2.5)) this.bustTimer += dt;
    else this.bustTimer = Math.max(0, this.bustTimer - dt);
    if (this.bustTimer > limit && game.onBusted) {
      this.bustTimer = 0;
      game.onBusted();
    }
  }

  /** Retira todas las patrullas (tras WASTED/BUSTED). */
  reset() {
    this.clear();
    for (let i = this.units.length - 1; i >= 0; i--) this.despawnUnit(this.units[i]);
  }
}
