import { WEAPONS } from './PlayerController.js';
import { formatMoney } from './GameState.js';

const MAP_RADIUS_M = 110; // metros visibles desde el centro del radar

/** HUD estilo GTA: radar, dinero, estrellas, velocímetro, armas, misiones y avisos. */
export class HUD {
  constructor(game) {
    this.game = game;
    const el = (id) => document.getElementById(id);
    this.root = el('hud');
    this.minimap = el('minimap');
    this.ctx = this.minimap.getContext('2d');
    this.speedo = el('speedometer');
    this.speedValue = el('speed-value');
    this.speedFill = el('speed-fill');
    this.driftTag = el('drift-tag');
    this.vehName = el('vehicle-name');
    this.vehHealth = el('vehicle-health-fill');
    this.clock = el('clock');
    this.moneyEl = el('money');
    this.moneyDeltaEl = el('money-delta');
    this.lootEl = el('loot');
    this.incomeEl = el('income');
    this.gpsEl = el('gps');
    this.weaponName = el('weapon-name');
    this.weaponAmmo = el('weapon-ammo');
    this.healthFill = el('health-fill');
    this.armorFill = el('armor-fill');
    this.crosshair = el('crosshair');
    this.hitmarker = el('hitmarker');
    this.prompt = el('prompt');
    this.notification = el('notification');
    this.bigMessage = el('big-message');
    this.objective = el('objective');
    this.timerEl = el('mission-timer');
    this.progressEl = el('progress');
    this.progressLabel = el('progress-label');
    this.progressFill = el('progress-fill');
    this.subtitle = el('subtitle');
    this.banner = el('mission-banner');
    this.bannerTitle = el('banner-title');
    this.bannerSub = el('banner-sub');
    this.wheel = el('weapon-wheel');
    this.buildWheel();

    this.lastPrompt = undefined;
    this.notifyTimer = 0;
    this.hitTimer = 0;
    this.bannerTimer = 0;
    this.deltaTimer = 0;
    this.shownMoney = 0;
  }

  /** Genera las casillas de la rueda (una por arma, empezando arriba en sentido horario). */
  buildWheel() {
    this.wheelSlots = WEAPONS.map((w, i) => {
      const slot = document.createElement('div');
      slot.className = 'wheel-slot';
      slot.style.setProperty('--angle', `${-90 + (360 / WEAPONS.length) * i}deg`);
      slot.innerHTML = `<span class="slot-name">${w.name}</span><span class="slot-info"></span>`;
      this.wheel.insertBefore(slot, this.wheel.firstChild);
      return slot;
    });
  }

  show(visible) {
    this.root.classList.toggle('hidden', !visible);
  }

  setPrompt(html) {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    this.prompt.innerHTML = html || '';
    this.prompt.classList.toggle('show', !!html);
  }

  notify(text, seconds = 3.5) {
    this.notification.textContent = text;
    this.notification.classList.add('show');
    this.notifyTimer = seconds;
  }

  bigText(text, cls) {
    this.bigMessage.textContent = text;
    this.bigMessage.className = `show ${cls}`;
  }

  hideBigText() {
    this.bigMessage.className = '';
  }

  missionBanner(title, sub) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub || '';
    this.banner.classList.add('show');
    this.bannerTimer = 3.5;
  }

  setObjective(text) {
    if (this.objective.textContent !== text) this.objective.textContent = text || '';
    this.objective.classList.toggle('show', !!text);
  }

  setTimer(seconds) {
    if (seconds == null) {
      this.timerEl.classList.remove('show');
      return;
    }
    const s = Math.max(0, Math.ceil(seconds));
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.add('show');
    this.timerEl.classList.toggle('urgent', s <= 15);
  }

  setProgress(label, value) {
    if (label == null) {
      this.progressEl.classList.remove('show');
      return;
    }
    this.progressEl.classList.add('show');
    this.progressLabel.textContent = label;
    this.progressFill.style.width = `${Math.round(value * 100)}%`;
  }

  setLoot(amount) {
    const text = amount > 0 ? `BOLSA ${formatMoney(amount)}` : '';
    if (this.lootEl.textContent !== text) this.lootEl.textContent = text;
  }

  /** Ingresos de negocios: "+$1.200/min · 0:42". */
  setIncomeTimer(secondsLeft, perMinute) {
    const s = Math.max(0, Math.ceil(secondsLeft));
    const text = perMinute ? `+${formatMoney(perMinute)}/min · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '';
    if (this.incomeEl.textContent !== text) this.incomeEl.textContent = text;
  }

  setSubtitle(text) {
    this.subtitle.textContent = text || '';
    this.subtitle.classList.toggle('show', !!text);
  }

  moneyDelta(amount) {
    this.moneyDeltaEl.textContent = `${amount >= 0 ? '+' : '-'}${formatMoney(Math.abs(amount))}`;
    this.moneyDeltaEl.classList.toggle('negative', amount < 0);
    this.moneyDeltaEl.classList.add('show');
    this.deltaTimer = 2.5;
  }

  flashHitmarker() {
    this.hitmarker.classList.add('show');
    this.hitTimer = 0.12;
  }

  showSpeedometer(v) {
    this.speedo.classList.toggle('hidden', !v);
    this.crosshair.classList.toggle('driving', v);
  }

  setWeaponWheel(open, selected) {
    this.wheel.classList.toggle('hidden', !open);
    if (!open) return;
    const player = this.game.player;
    const st = this.game.state;
    this.wheelSlots.forEach((slot, i) => {
      const w = WEAPONS[i];
      const owned = st.ownedWeapons.has(i);
      slot.classList.toggle('selected', i === selected);
      slot.classList.toggle('locked', !owned);
      slot.querySelector('.slot-info').textContent = !owned ? formatMoney(w.price) : w.mag ? (st.infiniteAmmo ? '∞' : `${player.clip(i)} / ${player.reserve(i)}`) : '';
    });
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    const st = game.state;

    this.clock.textContent = game.env.getClockString();

    // Dinero con animación de conteo
    const diff = st.money - this.shownMoney;
    this.shownMoney = Math.abs(diff) < 1 ? st.money : this.shownMoney + diff * Math.min(1, dt * 6);
    this.moneyEl.textContent = formatMoney(this.shownMoney);

    const w = WEAPONS[player.weaponIndex];
    this.weaponName.textContent = w.name;
    this.weaponAmmo.textContent = w.mag ? (this.game.state.infiniteAmmo ? '∞' : player.reloadTimer > 0 ? 'RECARGANDO' : `${player.clip()} / ${player.reserve()}`) : '';

    this.healthFill.style.width = `${player.health}%`;
    this.healthFill.classList.toggle('low', player.health < 30);
    this.armorFill.style.width = `${Math.max(0, st.armor)}%`;
    this.crosshair.classList.toggle('aiming', player.aiming);

    const v = game.interaction.vehicle;
    if (v && game.interaction.isDriving) {
      const kmh = v.getSpeedKmh();
      this.speedValue.textContent = Math.round(kmh);
      this.speedFill.style.width = `${Math.min(100, (kmh / (v.spec.maxSpeed * 3.6)) * 100)}%`;
      this.driftTag.classList.toggle('on', v.drifting);
      this.vehHealth.style.width = `${Math.max(0, (v.health / v.maxHealth) * 100)}%`;
      if (this.vehName.textContent !== v.label) this.vehName.textContent = v.label;
    }

    if (this.notifyTimer > 0) {
      this.notifyTimer -= dt;
      if (this.notifyTimer <= 0) this.notification.classList.remove('show');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmarker.classList.remove('show');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('show');
    }
    if (this.deltaTimer > 0) {
      this.deltaTimer -= dt;
      if (this.deltaTimer <= 0) this.moneyDeltaEl.classList.remove('show');
    }

    this.drawMinimap();
  }

  /** Radar rotado según la cámara, usando el mismo canvas que la textura del suelo. */
  drawMinimap() {
    const game = this.game;
    const ctx = this.ctx;
    const size = this.minimap.width;
    const half = size / 2;
    const env = game.env;
    const focus = game.getFocusPosition();
    // Dentro de un edificio el radar se queda mirando al norte
    const yaw = game.interior ? Math.PI : game.cameraRig.yaw;
    const scale = half / MAP_RADIUS_M; // px por metro en el radar
    const mapPxPerM = env.mapCanvas.width / env.mapSize;

    ctx.save();
    ctx.fillStyle = '#23331f';
    ctx.fillRect(0, 0, size, size);
    ctx.translate(half, half);
    // Lo que tiene delante la cámara queda hacia arriba en el radar
    ctx.rotate(yaw);
    ctx.scale(scale / mapPxPerM, scale / mapPxPerM);
    const mx = (focus.x + env.mapSize / 2) * mapPxPerM;
    const mz = (focus.z + env.mapSize / 2) * mapPxPerM;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(env.mapCanvas, -mx, -mz);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Mundo (x, z) -> píxel del radar, con la misma rotación que el mapa
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const toRadar = (x, z) => {
      const dx = x - focus.x;
      const dz = z - focus.z;
      return [half + (dx * c - dz * s) * scale, half + (dx * s + dz * c) * scale];
    };
    const inside = (x, y, margin = 6) => (x - half) ** 2 + (y - half) ** 2 <= (half - margin) ** 2;
    /** Si está fuera, lo pega al borde del radar. */
    const clampEdge = (x, y, margin = 12) => {
      const dx = x - half;
      const dy = y - half;
      const d = Math.hypot(dx, dy);
      const max = half - margin;
      return d <= max ? [x, y, false] : [half + (dx / d) * max, half + (dy / d) * max, true];
    };

    const flash = Math.floor(game.time * 5) % 2 === 0;

    // Zona de búsqueda
    const wanted = game.wanted;
    if (wanted.level > 0) {
      const [x, y] = toRadar(wanted.lastKnown.x, wanted.lastKnown.z);
      ctx.strokeStyle = flash ? 'rgba(255,59,48,0.8)' : 'rgba(47,123,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, wanted.searchRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Lugares: letras en círculos de color; los cercanos fuera del radar se pegan al borde
    ctx.font = "bold 11px 'Rajdhani', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const poi of game.locations.pois) {
      if ((poi.marker && !poi.marker.visible) || poi.type === 'mission') continue;
      let [x, y] = toRadar(poi.pos.x, poi.pos.z);
      const dist = Math.hypot(poi.pos.x - focus.x, poi.pos.z - focus.z);
      let edge = false;
      if (!inside(x, y)) {
        if (dist > 260 || poi.type === 'store' || poi.type === 'business') continue;
        [x, y, edge] = clampEdge(x, y);
      }
      this.drawBlip(ctx, x, y, poi.style.color, poi.style.letter, edge ? 0.6 : 1);
    }

    // Vehículos
    for (const v of game.vehicles) {
      if (v.driver === 'player') continue;
      const [x, y] = toRadar(v.position.x, v.position.z);
      if (!inside(x, y)) continue;
      if (v.type === 'police' && v.driver === 'police') {
        ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = v.playerOwned ? '#4fc3f7' : 'rgba(230,230,230,0.6)';
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
    }

    // Objetivos de misión: vehículos (rojo) y destino (amarillo, pegado al borde si está lejos)
    const missions = game.missions;
    for (const v of missions.targetVehicles) {
      const [x, y] = clampEdge(...toRadar(v.position.x, v.position.z));
      this.drawBlip(ctx, x, y, v.tag === 'target' ? '#e53935' : '#fdd835', '', 1, 6);
    }
    // Ruta GPS por las calles (recortada al círculo del radar)
    if (game.route) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, half - 4, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = '#c05cff';
      ctx.lineWidth = 5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      game.route.points.forEach((p, i) => {
        const [x, y] = toRadar(p.x, p.z);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }
    const gpsText = game.waypoint && game.route ? `GPS · ${game.waypoint.label} · ${Math.round(game.route.length)} m` : '';
    if (this.gpsEl.textContent !== gpsText) this.gpsEl.textContent = gpsText;
    if (game.waypoint) {
      const [x, y] = clampEdge(...toRadar(game.waypoint.pos.x, game.waypoint.pos.z));
      this.drawBlip(ctx, x, y, '#ba68c8', '◆', 1, 7);
    }
    if (missions.target) {
      const [x, y] = clampEdge(...toRadar(missions.target.x, missions.target.z));
      this.drawBlip(ctx, x, y, '#fdd835', '!', 1, 8);
    }

    // Jugador: flecha en el centro orientada según su rumbo real
    const heading = game.interaction.isDriving ? game.interaction.vehicle.getHeading() : game.player.facing;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(Math.PI - (heading - yaw));
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawBlip(ctx, x, y, color, letter, alpha = 1, r = 7) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (letter) {
      ctx.fillStyle = color === '#ffffff' ? '#c62828' : '#fff';
      ctx.fillText(letter, x, y + 0.5);
    }
    ctx.globalAlpha = 1;
  }
}
