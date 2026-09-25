import * as THREE from 'three';
import { CATALOG } from './VehicleController.js';
import { formatMoney } from './GameState.js';
import { BUSINESSES } from './Properties.js';

/**
 * Mapa a pantalla completa (tecla M) con ruta por las calles.
 * Se elige destino en la lista (W/S + E) o haciendo clic en el mapa. X borra la ruta.
 * La ruta se calcula con A* sobre la red de cruces y se dibuja aquí y en el radar.
 */
export class MapView {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('map');
    this.canvas = document.getElementById('map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.listEl = document.getElementById('map-list');
    this.open = false;
    this.index = 0;
    this.routeTimer = 0;
    this.wasLocked = false;

    window.addEventListener('keydown', (e) => this.onKey(e));
    this.canvas.addEventListener('click', (e) => this.onClick(e));
  }

  // ------------------------------------------------------------------
  // Ruta
  // ------------------------------------------------------------------
  /** A* entre los cruces más cercanos al origen y al destino. Devuelve puntos en el mundo. */
  computeRoute(from, to) {
    const env = this.game.env;
    const start = env.nearestNode(from);
    const goal = env.nearestNode(to);
    const h = (n) => Math.hypot(n.pos.x - goal.pos.x, n.pos.z - goal.pos.z);
    const open = new Set([start.id]);
    const came = new Map();
    const g = new Map([[start.id, 0]]);
    const f = new Map([[start.id, h(start)]]);
    while (open.size) {
      let cur = null;
      let best = Infinity;
      for (const id of open) {
        if (f.get(id) < best) {
          best = f.get(id);
          cur = id;
        }
      }
      if (cur === goal.id) break;
      open.delete(cur);
      const node = env.nodes[cur];
      for (const nid of node.neighbors) {
        const nb = env.nodes[nid];
        const tentative = g.get(cur) + node.pos.distanceTo(nb.pos);
        if (tentative < (g.get(nid) ?? Infinity)) {
          came.set(nid, cur);
          g.set(nid, tentative);
          f.set(nid, tentative + h(nb));
          open.add(nid);
        }
      }
    }
    const path = [];
    let id = goal.id;
    while (id !== undefined) {
      path.unshift(env.nodes[id].pos.clone());
      id = came.get(id);
    }
    const pts = [new THREE.Vector3(from.x, 0, from.z), ...path, new THREE.Vector3(to.x, 0, to.z)];
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1]);
    return { points: pts, length };
  }

  setDestination(pos, label) {
    const game = this.game;
    game.waypoint = { pos: pos.clone(), label };
    this.refreshRoute();
    game.hud.notify(`Ruta marcada: ${label}.`, 2);
  }

  refreshRoute() {
    const game = this.game;
    if (!game.waypoint) {
      game.route = null;
      return;
    }
    game.route = this.computeRoute(game.getFocusPosition(), game.waypoint.pos);
  }

  update(dt) {
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.routeTimer = 0.8;
      this.refreshRoute();
    }
  }

  // ------------------------------------------------------------------
  // Destinos de la lista
  // ------------------------------------------------------------------
  destinations() {
    const game = this.game;
    const st = game.state;
    const list = [];
    const m = game.missions;
    if (m.target && st.mode === 'story') list.push({ label: `Misión: ${m.targetLabel || 'objetivo'}`, pos: m.target.clone(), color: '#fdd835' });
    const order = ['safehouse', 'gunshop', 'dealer', 'bank', 'store', 'business', 'hospital', 'police'];
    const pois = game.locations.pois.filter((p) => order.includes(p.type) && (!p.marker || p.marker.visible));
    pois.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    for (const p of pois) {
      let extra = '';
      if (p.type === 'business') extra = st.businesses.has(p.id) ? ' (tuyo)' : ` · ${formatMoney(BUSINESSES[p.id].price)}`;
      list.push({ label: `${p.name}${extra}`, pos: p.pos.clone(), color: p.style.color, letter: p.style.letter });
    }
    for (const v of game.vehicles) {
      if (v.ownedCar && v.driver !== 'player') list.push({ label: `Tu coche: ${CATALOG[v.ownedCar.type].label}`, pos: new THREE.Vector3(v.position.x, 0, v.position.z), color: '#4fc3f7', letter: 'C' });
    }
    return list;
  }

  // ------------------------------------------------------------------
  // Abrir / cerrar
  // ------------------------------------------------------------------
  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  show() {
    const game = this.game;
    if (game.menus.isOpen) return;
    this.open = true;
    game.mapOpen = true;
    this.index = 0;
    this.el.classList.remove('hidden');
    // Para poder hacer clic en el mapa se libera el ratón (sin pausar el juego)
    this.wasLocked = game.input.locked;
    if (this.wasLocked) document.exitPointerLock();
    this.render();
  }

  close() {
    const game = this.game;
    this.open = false;
    game.mapOpen = false;
    this.el.classList.add('hidden');
    game.input.pressed.clear();
    if (this.wasLocked) {
      game.input.requestLock();
      setTimeout(() => {
        if (!game.input.locked) game.input.freeMouse = true;
      }, 400);
    }
  }

  onKey(e) {
    if (!this.open) return;
    const list = this.destinations();
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.index = (this.index - 1 + list.length) % list.length;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.index = (this.index + 1) % list.length;
        break;
      case 'KeyE':
      case 'Enter': {
        const d = list[this.index];
        if (d) this.setDestination(d.pos, d.label);
        this.close();
        break;
      }
      case 'KeyX':
        this.game.waypoint = null;
        this.game.route = null;
        break;
      case 'KeyM':
      case 'KeyQ':
      case 'Escape':
        this.close();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.open) this.render();
  }

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------
  worldToMap(x, z) {
    const env = this.game.env;
    const size = this.canvas.width;
    return [((x + env.mapSize / 2) / env.mapSize) * size, ((z + env.mapSize / 2) / env.mapSize) * size];
  }

  onClick(e) {
    const env = this.game.env;
    const r = this.canvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    const x = u * env.mapSize - env.mapSize / 2;
    const z = v * env.mapSize - env.mapSize / 2;
    this.setDestination(new THREE.Vector3(x, 0, z), 'Punto del mapa');
    this.render();
  }

  render() {
    const game = this.game;
    const ctx = this.ctx;
    const size = this.canvas.width;
    ctx.drawImage(game.env.mapCanvas, 0, 0, size, size);
    ctx.fillStyle = 'rgba(10,14,20,0.25)';
    ctx.fillRect(0, 0, size, size);

    // Ruta
    if (game.route) {
      ctx.strokeStyle = '#c05cff';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      game.route.points.forEach((p, i) => {
        const [x, y] = this.worldToMap(p.x, p.z);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }

    const list = this.destinations();
    ctx.font = "bold 13px 'Rajdhani', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach((d, i) => {
      const [x, y] = this.worldToMap(d.pos.x, d.pos.z);
      const sel = i === this.index;
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(x, y, sel ? 13 : 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, sel ? 11 : 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = d.color === '#ffffff' ? '#c62828' : '#fff';
      ctx.fillText(d.letter || '!', x, y + 0.5);
      if (sel) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        const w = ctx.measureText(d.label).width + 14;
        ctx.fillRect(x - w / 2, y - 34, w, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText(d.label, x, y - 24);
      }
    });
    if (game.waypoint) {
      const [x, y] = this.worldToMap(game.waypoint.pos.x, game.waypoint.pos.z);
      ctx.fillStyle = '#c05cff';
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + 9, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x - 9, y);
      ctx.closePath();
      ctx.fill();
    }

    // Tú
    const f = game.getFocusPosition();
    const [px, py] = this.worldToMap(f.x, f.z);
    const heading = game.interaction.isDriving ? game.interaction.vehicle.getHeading() : game.player.facing;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - heading);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Lista lateral
    this.listEl.innerHTML = '';
    list.forEach((d, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'map-item' + (i === this.index ? ' selected' : '');
      const dist = Math.round(Math.hypot(d.pos.x - f.x, d.pos.z - f.z));
      row.innerHTML = `<span class="map-dot" style="background:${d.color}"></span><span>${d.label}</span><span class="map-dist">${dist} m</span>`;
      row.addEventListener('click', () => {
        this.setDestination(d.pos, d.label);
        this.close();
      });
      this.listEl.appendChild(row);
    });
    const sel = this.listEl.children[this.index];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
}
