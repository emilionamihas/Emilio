import * as THREE from 'three';
import { VehicleController } from './VehicleController.js';

const ENTER_RADIUS = 4.6; // medido al centro del chasis
const ENTER_TIME = 0.55;
const EXIT_TIME = 0.45;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Máquina de estados jugador <-> vehículo:
 *   foot -> entering -> driving -> exiting -> foot
 * Tecla F para entrar (si hay un coche cerca) y para salir.
 */
export class InteractionSystem {
  constructor(game) {
    this.game = game;
    this.state = 'foot';
    this.vehicle = null;
    this.candidate = null;
    this.anim = null;

    // Faros del coche del jugador: una SpotLight fija que se re-emparenta.
    // (La cantidad de luces nunca cambia, así Three.js no recompila shaders.)
    this.headlight = new THREE.SpotLight(0xfff2d8, 0, 70, 0.6, 0.45, 1);
    this.headlight.position.set(0, 0.8, 2.3);
    this.headlight.target.position.set(0, 0, 14);
    this.lightHolder = new THREE.Group();
    this.lightHolder.add(this.headlight, this.headlight.target);
    game.scene.add(this.lightHolder);
  }

  get isDriving() {
    return this.state === 'driving';
  }

  update(dt) {
    const game = this.game;
    const input = game.input;
    const player = game.player;

    switch (this.state) {
      case 'foot': {
        this.candidate = this.findNearestVehicle(player.mesh.position);
        if (this.candidate) {
          const c = this.candidate;
          if (c.ownedCar) game.hud.setPrompt(`Pulsa <kbd>F</kbd> para subir a tu ${c.spec.label}`);
          else if (c.spec.bike) game.hud.setPrompt(`Pulsa <kbd>F</kbd> para ${c.driver ? 'robar' : 'coger'} la moto`);
          else {
            const verb = c.driver === 'ai' || c.driver === 'police' || !c.playerOwned ? 'robar' : 'entrar en';
            game.hud.setPrompt(`Pulsa <kbd>F</kbd> para ${verb} el vehículo`);
          }
          if (input.wasPressed('KeyF')) this.beginEnter(this.candidate);
        } else {
          game.hud.setPrompt(null);
        }
        break;
      }
      case 'entering':
        this.tickEnter(dt);
        break;
      case 'driving': {
        const v = this.vehicle;
        VehicleController.readPlayerInput(input, v.input);
        if (input.wasPressed('KeyR') && (v.isFlipped() || Math.abs(v.getForwardSpeed()) < 2)) v.resetUpright();
        if (input.wasPressed('KeyF')) this.beginExit();
        if (v.destroyed && !this.warnedDestroyed) {
          this.warnedDestroyed = true;
          game.hud.notify('El vehículo está destrozado. Pulsa F para salir.');
        }
        game.hud.setPrompt(v.isFlipped() ? 'Pulsa <kbd>R</kbd> para enderezar el vehículo' : null);
        break;
      }
      case 'exiting':
        this.tickExit(dt);
        break;
    }

    // Faros según la hora del día
    this.headlight.intensity = this.vehicle && this.state === 'driving' ? game.env.night * 900 : 0; // candelas (luces físicas de three r155+)
  }

  findNearestVehicle(pos) {
    let best = null;
    let bestD = ENTER_RADIUS;
    for (const v of this.game.vehicles) {
      if (!v.inWorld || v.driver === 'player') continue;
      const d = Math.hypot(v.position.x - pos.x, v.position.z - pos.z);
      if (d < bestD && Math.abs(v.position.y - pos.y) < 3) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Posición de la puerta del conductor (lado izquierdo, +X local). */
  doorPosition(v, side = 1, out = new THREE.Vector3()) {
    const q = v.chassisBody.quaternion;
    const local = new THREE.Vector3(1.55 * side, 0, 0.35);
    local.applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    return out.set(v.position.x + local.x, 0, v.position.z + local.z);
  }

  // ------------------------------------------------------------------
  // Entrar
  // ------------------------------------------------------------------
  beginEnter(v) {
    const game = this.game;
    const player = game.player;
    const previousDriver = v.driver;

    // Robo: el tráfico suelta el vehículo y la policía se entera
    if (previousDriver === 'ai') game.traffic.release(v);
    if (previousDriver === 'police') game.wanted.releaseUnit(v);
    if (v.type === 'police') game.wanted.reportCrime('steal_police');
    else if (!v.playerOwned) game.wanted.reportCrime(previousDriver === 'ai' ? 'carjack' : 'steal_car');

    v.driver = 'player';
    v.input.throttle = v.input.reverse = v.input.steer = 0;
    v.input.handbrake = true;
    v.playerOwned = true;
    this.vehicle = v;
    this.warnedDestroyed = false;

    player.setEnabled(false);
    game.hud.setPrompt(null);
    this.state = 'entering';
    const start = player.mesh.position.clone();
    this.anim = { t: 0, start };
    game.cameraRig.setMode('vehicle', v);
    this.lightHolder.removeFromParent();
    v.mesh.add(this.lightHolder);
  }

  tickEnter(dt) {
    const player = this.game.player;
    const v = this.vehicle;
    this.anim.t += dt / ENTER_TIME;
    const t = Math.min(1, this.anim.t);
    const door = this.doorPosition(v, 1, _a);
    // Primera mitad: caminar hasta la puerta. Segunda: deslizarse al asiento.
    if (t < 0.6) {
      const k = THREE.MathUtils.smoothstep(t / 0.6, 0, 1);
      player.mesh.position.lerpVectors(this.anim.start, door, k);
    } else {
      const k = (t - 0.6) / 0.4;
      const seat = _b.set(v.position.x, v.position.y - 0.3, v.position.z);
      player.mesh.position.lerpVectors(door, seat, k);
      if (!v.spec.bike) player.mesh.scale.setScalar(1 - k * 0.3);
    }
    player.mesh.rotation.y = Math.atan2(door.x - player.mesh.position.x, door.z - player.mesh.position.z) || player.mesh.rotation.y;
    player.model.animate(dt, { speed: t < 0.6 ? 2 : 0 });

    if (t >= 1) {
      // En moto el piloto se ve: lo coloca la propia moto en cada fotograma
      player.mesh.visible = !!v.spec.bike;
      if (v.spec.bike) v.rider = player;
      player.mesh.scale.setScalar(1);
      v.input.handbrake = false;
      this.state = 'driving';
      this.game.hud.showSpeedometer(true);
    }
  }

  // ------------------------------------------------------------------
  // Salir
  // ------------------------------------------------------------------
  beginExit() {
    const game = this.game;
    const v = this.vehicle;
    const env = game.env;

    // Busca un lado libre: primero el del conductor, luego el copiloto, luego por encima
    let side = 1;
    let door = this.doorPosition(v, 1);
    if (env.isInsideBuilding(door.x, door.z)) {
      side = -1;
      door = this.doorPosition(v, -1);
      if (env.isInsideBuilding(door.x, door.z)) door = new THREE.Vector3(v.position.x, 2.2, v.position.z);
    }

    const speed = v.getForwardSpeed();
    const jumpOut = Math.abs(speed) > 8; // salto en marcha: el coche sigue sin conductor

    v.driver = null;
    v.rider = null;
    v.input.throttle = v.input.reverse = v.input.steer = 0;
    v.input.handbrake = !jumpOut;
    game.hud.showSpeedometer(false);
    game.hud.setPrompt(null);

    const player = game.player;
    player.mesh.visible = true;
    player.facing = v.getHeading();
    const seat = new THREE.Vector3(v.position.x, v.position.y - 0.3, v.position.z);
    this.anim = { t: 0, seat, door, jumpOut, side, bike: !!v.spec.bike, carVel: v.chassisBody.velocity.clone() };
    this.state = 'exiting';
  }

  tickExit(dt) {
    const game = this.game;
    const player = game.player;
    const a = this.anim;
    a.t += dt / (a.jumpOut ? 0.2 : EXIT_TIME);
    const t = Math.min(1, a.t);
    const k = THREE.MathUtils.smoothstep(t, 0, 1);
    player.mesh.position.lerpVectors(a.seat, a.door, k);
    player.mesh.position.y = a.seat.y * (1 - k) + (a.door.y || 0) * k;
    player.mesh.scale.setScalar(a.bike ? 1 : 0.7 + 0.3 * k);
    player.mesh.rotation.set(0, player.facing, 0);

    if (t >= 1) {
      player.mesh.scale.setScalar(1);
      // Al saltar en marcha se hereda parte de la velocidad del coche
      const vel = a.jumpOut ? new THREE.Vector3(a.carVel.x * 0.4, 2, a.carVel.z * 0.4) : null;
      player.teleport(a.door, vel);
      player.setEnabled(true);
      if (a.jumpOut) player.takeDamage(8);
      game.cameraRig.setMode('foot', player);
      this.lightHolder.removeFromParent();
      game.scene.add(this.lightHolder);
      this.vehicle = null;
      this.state = 'foot';
    }
  }

  /** Saca al jugador del coche de inmediato (respawn tras WASTED/BUSTED). */
  forceExit() {
    if (this.vehicle) {
      this.vehicle.driver = null;
      this.vehicle.rider = null;
      this.vehicle.input.handbrake = true;
    }
    this.lightHolder.removeFromParent();
    this.game.scene.add(this.lightHolder);
    this.vehicle = null;
    this.state = 'foot';
    const player = this.game.player;
    player.mesh.visible = true;
    player.mesh.scale.setScalar(1);
    player.mesh.rotation.set(0, player.facing, 0);
    player.setEnabled(true);
    this.game.hud.showSpeedometer(false);
    this.game.cameraRig.setMode('foot', player);
  }
}
