import { WEAPONS } from './PlayerController.js';

const MAP_RADIUS_M = 110; // metros visibles desde el centro del radar

/** HUD estilo GTA: radar circular, velocímetro, arma, reloj, avisos. */
export class HUD {
  constructor(game) {
    this.game = game;
    this.el = (id) => document.getElementById(id);
    this.root = this.el('hud');
    this.minimap = this.el('minimap');
    this.ctx = this.minimap.getContext('2d');
    this.speedo = this.el('speedometer');
    this.speedValue = this.el('speed-value');
    this.speedFill = this.el('speed-fill');
    this.driftTag = this.el('drift-tag');
    this.vehHealth = this.el('vehicle-health-fill');
    this.clock = this.el('clock');
    this.weaponName = this.el('weapon-name');
    this.weaponAmmo = this.el('weapon-ammo');
    this.healthFill = this.el('health-fill');
    this.crosshair = this.el('crosshair');
    this.hitmarker = this.el('hitmarker');
    this.prompt = this.el('prompt');
    this.notification = this.el('notification');
    this.bigMessage = this.el('big-message');
    this.wheel = this.el('weapon-wheel');
    this.wheelSlots = [...this.wheel.querySelectorAll('.wheel-slot')];
    this.lastPrompt = undefined;
    this.notifyTimer = 0;
    this.hitTimer = 0;
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
    if (open) this.wheelSlots.forEach((s, i) => s.classList.toggle('selected', i === selected));
  }

  update(dt) {
    const game = this.game;
    const player = game.player;

    this.clock.textContent = game.env.getClockString();

    const w = WEAPONS[player.weaponIndex];
    this.weaponName.textContent = w.name;
    this.weaponAmmo.textContent = w.mag ? (player.reloadTimer > 0 ? 'RECARGANDO' : `${player.ammo[player.weaponIndex]} / ∞`) : '';

    this.healthFill.style.width = `${player.health}%`;
    this.healthFill.classList.toggle('low', player.health < 30);
    this.crosshair.classList.toggle('aiming', player.aiming);

    const v = game.interaction.vehicle;
    if (v && game.interaction.isDriving) {
      const kmh = v.getSpeedKmh();
      this.speedValue.textContent = Math.round(kmh);
      this.speedFill.style.width = `${Math.min(100, (kmh / (v.spec.maxSpeed * 3.6)) * 100)}%`;
      this.driftTag.classList.toggle('on', v.drifting);
      this.vehHealth.style.width = `${Math.max(0, v.health)}%`;
    }

    if (this.notifyTimer > 0) {
      this.notifyTimer -= dt;
      if (this.notifyTimer <= 0) this.notification.classList.remove('show');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmarker.classList.remove('show');
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
    const yaw = game.cameraRig.yaw;
    const scale = half / MAP_RADIUS_M; // px por metro en el radar
    const mapPxPerM = env.mapCanvas.width / env.mapSize;

    ctx.save();
    ctx.fillStyle = '#23331f';
    ctx.fillRect(0, 0, size, size);
    ctx.translate(half, half);
    // Hacer que "hacia donde mira la cámara" apunte hacia arriba en el radar
    ctx.rotate(yaw);
    ctx.scale(scale / mapPxPerM, scale / mapPxPerM);
    const mx = (focus.x + env.mapSize / 2) * mapPxPerM;
    const mz = (focus.z + env.mapSize / 2) * mapPxPerM;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(env.mapCanvas, -mx, -mz);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Mundo (x, z) -> píxel del radar, con la misma rotación que el mapa
    const toRadar = (x, z) => {
      const dx = x - focus.x;
      const dz = z - focus.z;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      return [half + (dx * c - dz * s) * scale, half + (dx * s + dz * c) * scale];
    };

    // Vehículos
    const flash = Math.floor(game.time * 5) % 2 === 0;
    for (const v of game.vehicles) {
      if (v.driver === 'player') continue;
      const [x, y] = toRadar(v.position.x, v.position.z);
      if ((x - half) ** 2 + (y - half) ** 2 > (half - 6) ** 2) continue;
      if (v.type === 'police' && v.driver === 'police') {
        ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = v.playerOwned ? '#4fc3f7' : 'rgba(230,230,230,0.7)';
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      }
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
  }
}
