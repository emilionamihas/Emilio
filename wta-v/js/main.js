import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Environment, CITY } from './Environment.js';
import { Input } from './Input.js';
import { Effects } from './Effects.js';
import { PlayerController, ThirdPersonCamera } from './PlayerController.js';
import { VehicleController } from './VehicleController.js';
import { InteractionSystem } from './InteractionSystem.js';
import { AITraffic } from './AITraffic.js';
import { WantedSystem } from './WantedSystem.js';
import { HUD } from './HUD.js';
import { GameState, formatMoney } from './GameState.js';
import { Menus } from './Menus.js';
import { Locations } from './Locations.js';
import { Heists } from './Heists.js';
import { Missions, STORY } from './Missions.js';
import { Interiors } from './Interiors.js';
import { Properties } from './Properties.js';
import { Pedestrians } from './NPC.js';
import { MapView } from './MapView.js';
import { Cheats } from './Cheats.js';
import { Quality, savedQualityMode } from './Quality.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(location.search);

// ----------------------------------------------------------------------
// Renderizado
// ----------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
// El MSAA solo en calidad Alta: a resolución alta es de lo que más GPU consume (se fija al crear el contexto)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: savedQualityMode() === 'alta', powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 650);

// ----------------------------------------------------------------------
// Física
// ----------------------------------------------------------------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.solver.iterations = 10;
world.allowSleep = false;
world.defaultContactMaterial.friction = 0.3;
world.defaultContactMaterial.restitution = 0.05;

const materials = {
  player: new CANNON.Material('player'),
  vehicle: new CANNON.Material('vehicle'),
};

// ----------------------------------------------------------------------
// Contexto compartido del juego
// ----------------------------------------------------------------------
const bus = new EventTarget();
const game = {
  renderer,
  scene,
  camera,
  world,
  materials,
  vehicles: [],
  time: 0,
  timeScale: 1,
  running: false,
  started: false,
  input: new Input(canvas),
  state: new GameState('free'), // se sustituye al elegir modo
  interior: null, // { inst, poi } mientras estás dentro de un edificio
  waypoint: null, // destino marcado en el GPS
  route: null, // ruta por las calles hasta el destino
  mapOpen: false,
  on(type, fn) {
    bus.addEventListener(type, (e) => fn(e.detail));
  },
  emit(type, detail) {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
  },
  /** Posición que "ve" el mundo exterior: dentro de un edificio cuenta la puerta. */
  getFocusPosition() {
    if (game.interior) return game.interior.poi.pos.clone();
    return game.getRenderFocus();
  },
  /** Posición real del jugador o su coche (sombras, cámara). */
  getRenderFocus() {
    const v = game.interaction && game.interaction.vehicle;
    if (v && game.interaction.state !== 'foot') return new THREE.Vector3(v.position.x, v.position.y, v.position.z);
    return game.player.mesh.position.clone();
  },
  getShootables() {
    if (game.interior) return game.interiors.shootables();
    const list = game.env.shootables.slice();
    list.push(...game.pedestrians.meshes());
    for (const v of game.vehicles) {
      if (v.driver !== 'player') list.push(v.mesh, ...v.wheelMeshes);
    }
    return list;
  },
};
window.game = game; // útil para depurar desde la consola


game.env = new Environment(game);

// Contactos: el jugador no tiene fricción (lo movemos por velocidad),
// los chasis resbalan un poco contra el suelo y los muros.
world.addContactMaterial(new CANNON.ContactMaterial(materials.player, game.env.groundMaterial, { friction: 0, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(materials.player, world.defaultMaterial, { friction: 0, restitution: 0 }));
world.addContactMaterial(new CANNON.ContactMaterial(materials.vehicle, game.env.groundMaterial, { friction: 0.05, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(materials.vehicle, materials.vehicle, { friction: 0.2, restitution: 0.02 }));

game.effects = new Effects(scene);
game.hud = new HUD(game);

// Delante de casa (acera oeste de la manzana 3,3, junto a la glorieta)
const spawn = new THREE.Vector3(CITY.ROAD / 2 + 1.5, 0, 36);
game.player = new PlayerController(game, spawn);
game.player.facing = Math.PI;
game.cameraRig = new ThirdPersonCamera(game);
game.cameraRig.yaw = 0;
game.interaction = new InteractionSystem(game);
game.wanted = new WantedSystem(game);
game.traffic = new AITraffic(game, { maxActive: 12 });
game.menus = new Menus(game);
game.locations = new Locations(game);
// Con los solares de los lugares ya reservados se levantan edificios, árboles, farolas y semáforos
game.env.finalize(spawn);
game.heists = new Heists(game);
game.missions = new Missions(game);
game.interiors = new Interiors(game);
game.properties = new Properties(game);
game.pedestrians = new Pedestrians(game, { count: 10 });
game.map = new MapView(game);
game.cheats = new Cheats(game);
game.quality = new Quality(game);

/** Vestidor: el personaje mira a la cámara para ver cómo queda la ropa (el juego está en pausa). */
game.previewPlayer = () => {
  const p = game.player;
  p.facing = game.cameraRig.yaw;
  p.syncMesh();
  p.model.animate(0.1, { speed: 0 });
  for (let i = 0; i < 20; i++) game.cameraRig.update(1 / 30);
};

// NPC abatidos: delito según a quién
game.onNpcKilled = (npc) => {
  if (npc.role === 'police' || npc.role === 'guard') game.wanted.reportCrime('kill_cop');
  else game.wanted.reportCrime('murder');
};

// Coches aparcados junto a la acera del spawn (carril derecho de la calle x = 0)
const parked = [
  { z: 47, type: 'compact' },
  { z: 58, type: 'muscle', color: 0xb71c1c },
  { z: 70, type: 'pickup' },
  { z: 80, type: 'scooter', color: 0x26a69a },
];
for (const p of parked) {
  const v = new VehicleController(game, { type: p.type, color: p.color, position: new THREE.Vector3(6.3, 0, p.z), heading: Math.PI });
  v.addToWorld();
}

// ----------------------------------------------------------------------
// Explosiones (cohetes y coches que revientan)
// ----------------------------------------------------------------------
game.explosion = (point, radius, damage, source = null) => {
  const fx = game.effects;
  fx.muzzleFlash(point);
  fx.flashLight.intensity = 60;
  fx.flashLight.distance = radius * 5;
  fx.flashTime = 0.15;
  fx.spawnSparks(point, new THREE.Vector3(0, 1, 0), 40, 0xff8a3d);
  for (let i = 0; i < 14; i++) {
    fx.spawnSmoke(point, new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 5, (Math.random() - 0.5) * 7), 1.8, true);
  }
  for (const v of [...game.vehicles]) {
    if (v === source) continue;
    const b = v.chassisBody;
    const d = Math.hypot(b.position.x - point.x, b.position.y - point.y, b.position.z - point.z);
    if (d > radius) continue;
    const k = 1 - d / radius;
    const dir = new CANNON.Vec3(b.position.x - point.x, 0, b.position.z - point.z);
    dir.normalize();
    b.applyImpulse(new CANNON.Vec3(dir.x * b.mass * 6 * k, b.mass * 5 * k, dir.z * b.mass * 6 * k), new CANNON.Vec3(0.2, 0, 0.3));
    v.damage(damage * k);
  }
  if (game.interaction.state === 'foot') {
    const p = game.player.mesh.position;
    const d = p.distanceTo(point);
    if (d < radius) game.player.takeDamage(damage * 0.8 * (1 - d / radius));
  }
};

// ----------------------------------------------------------------------
// Muerte y arresto
// ----------------------------------------------------------------------
let respawnTimer = 0;
let downKind = null;
function endLife(text, cls, kind) {
  if (respawnTimer > 0) return;
  downKind = kind;
  game.hud.bigText(text, cls);
  respawnTimer = 3;
  game.timeScale = 0.3;
  game.missions.onPlayerDown(kind);
}
game.onPlayerDeath = () => endLife('WASTED', 'wasted', 'wasted');
game.onBusted = () => endLife('BUSTED', 'busted', 'busted');

function respawn() {
  const st = game.state;
  const lostLoot = game.heists.onPlayerDown();
  // Factura del hospital o fianza: 10 % del dinero, máximo $5.000
  const fee = Math.min(5000, Math.floor(st.money * 0.1));
  st.money -= fee;
  const where = game.locations.byId(downKind === 'busted' ? 'comisaria' : 'hospital');

  game.hud.hideBigText();
  game.timeScale = 1;
  if (game.interior) game.interiors.exit({ instant: true });
  game.interaction.forceExit();
  game.wanted.reset();
  game.player.health = 100;
  game.player.teleport(where.pos);
  game.player.facing = Math.atan2(where.normal.x, where.normal.z);
  game.cameraRig.yaw = Math.atan2(-where.normal.x, -where.normal.z);
  game.hud.moneyDelta(-fee);
  const what = downKind === 'busted' ? `Fianza pagada: ${formatMoney(fee)}` : `Factura del hospital: ${formatMoney(fee)}`;
  game.hud.notify(lostLoot ? `${what}. Has perdido el botín (${formatMoney(lostLoot)}).` : `${what}.`, 5);
  st.save();
}

// ----------------------------------------------------------------------
// Menú principal, pausa y Pointer Lock
// ----------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const modeSelect = document.getElementById('mode-select');
const pauseActions = document.getElementById('pause-actions');
const playBtn = document.getElementById('play-btn');
const resetBtn = document.getElementById('btn-reset');
document.getElementById('loading').classList.add('hidden');
modeSelect.classList.remove('hidden');

// Descripción del botón de historia según la partida guardada
const storySave = GameState.peek('story');
if (storySave) {
  const next = STORY[storySave.storyStep];
  document.getElementById('story-desc').textContent = storySave.storyDone
    ? `Historia completada · ${formatMoney(storySave.money)}. Sigue jugando en la ciudad.`
    : `Continuar: misión ${storySave.storyStep + 1}/${STORY.length} "${next ? next.title : ''}" · ${formatMoney(storySave.money)}`;
  resetBtn.classList.remove('hidden');
}
const freeSave = GameState.peek('free');
if (freeSave) document.getElementById('free-desc').textContent = `Continuar partida libre · ${formatMoney(freeSave.money)} · ${freeSave.businesses.length} negocios`;

function applyState() {
  const st = game.state;
  const player = game.player;
  player.weaponIndex = 0;
  player.updateWeaponVisual();
  // Tu coche (el primero del garaje) aparcado frente a casa
  const home = game.locations.byId('casa');
  if (st.cars[0]) game.locations.spawnOwnedCar(st.cars[0], home.park, home.heading);
  if (st.outfit && st.outfit !== 'custom') player.setOutfit(st.outfit);
  else player.applyLook(st.look);
  game.hud.shownMoney = st.money;
  // Las armas iniciales llegan con munición
  for (const i of st.ownedWeapons) if (i > 0 && st.clip[i] == null) player.giveWeapon(i);
}

function chooseMode(mode) {
  const st = new GameState(mode);
  const loaded = st.load();
  game.state = st;
  applyState();
  game.started = true;
  modeSelect.classList.add('hidden');
  pauseActions.classList.remove('hidden');
  if (loaded) game.properties.payOffline(st.savedAt);
  if (mode === 'story' && !loaded) game.missions.playIntro();
  if (mode === 'story' && loaded && !st.storyDone) game.hud.notify('Partida cargada. Sigue el marcador amarillo del radar.');
  if (mode === 'free') game.hud.notify('Modo libre: atraca bancos (verde $), compra negocios (N) y coches (C).', 6);
  st.save();
  requestPlay();
}

function start() {
  if (!game.started) return;
  overlay.classList.add('hidden');
  game.hud.show(true);
  game.running = true;
}

function pause() {
  game.running = false;
  if (game.menus.isOpen) game.menus.close();
  overlay.classList.remove('hidden');
}

function requestPlay() {
  game.input.requestLock();
  // Si Pointer Lock no está disponible (iframe, móvil...), se juega con el ratón libre
  setTimeout(() => {
    if (!game.input.locked) {
      game.input.freeMouse = true;
      start();
    }
  }, 400);
}

document.getElementById('btn-story').addEventListener('click', () => chooseMode('story'));
document.getElementById('btn-free').addEventListener('click', () => chooseMode('free'));
resetBtn.addEventListener('click', () => {
  GameState.erase('story');
  resetBtn.classList.add('hidden');
  document.getElementById('story-desc').textContent = '9 misiones: de robar tu primer coche a vaciar la Reserva Federal.';
});
playBtn.addEventListener('click', requestPlay);
document.getElementById('btn-menu').addEventListener('click', () => {
  game.state.save();
  location.reload();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.input.freeMouse && game.running && !game.menus.isOpen) pause();
});
canvas.addEventListener('click', () => {
  if (game.running && !game.input.locked && !game.input.freeMouse) game.input.requestLock();
});
game.input.onLockChange = (locked) => {
  if (game.mapOpen) return; // el mapa libera el ratón a propósito
  if (locked) start();
  else if (!params.has('autostart') && !game.input.freeMouse) pause(); // Esc libera el ratón: pausa
};

// Arranque directo para pruebas automáticas: ?autostart=story | ?autostart=free
if (params.has('autostart')) {
  const mode = params.get('autostart') === 'story' ? 'story' : 'free';
  const st = new GameState(mode);
  if (!params.has('fresh')) st.load();
  game.state = st;
  applyState();
  game.started = true;
  if (mode === 'story' && st.storyStep === 0) game.missions.playIntro();
  start();
}
if (params.has('time')) game.env.timeOfDay = parseFloat(params.get('time'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('beforeunload', () => {
  if (game.started) game.state.save();
});

// ----------------------------------------------------------------------
// Bucle principal
// ----------------------------------------------------------------------
const clock = new THREE.Clock();

function step(dt) {
  game.time += dt;
  const input = game.input;

  game.env.timeSpeed = input.isDown('KeyT') ? 25 : 1;
  if (input.wasPressed('KeyP') && !game.menus.isOpen) game.menus.open(game.properties.rootMenu());
  if (input.wasPressed('KeyM') && !game.menus.isOpen) game.map.show();

  // 1. Lógica previa a la física: jugador, interacción, lugares, misiones e IA
  game.player.update(dt, game.cameraRig);
  game.interaction.update(dt);
  game.locations.update(dt);
  game.missions.update(dt);
  game.heists.update(dt);
  game.interiors.update(dt);
  game.properties.update(dt);
  game.pedestrians.update(dt);
  game.map.update(dt);
  game.traffic.update(dt);
  game.wanted.update(dt);
  for (const v of game.vehicles) v.update(dt);

  // 2. Física con paso fijo
  world.step(FIXED_STEP, dt, 4);

  // 3. Sincronizar mallas con cuerpos físicos
  for (const v of game.vehicles) v.sync();
  game.player.animate(dt);

  // 4. Cámara, entorno, efectos y HUD
  game.cameraRig.update(dt);
  game.env.update(dt, game.getRenderFocus());
  if (game.waypoint) {
    const f = game.getFocusPosition();
    if (Math.hypot(f.x - game.waypoint.pos.x, f.z - game.waypoint.pos.z) < 8) {
      game.hud.notify(`Has llegado: ${game.waypoint.label}.`, 2);
      game.waypoint = null;
      game.route = null;
    }
  }
  game.effects.update(dt);
  game.hud.update(dt);

  if (respawnTimer > 0) {
    respawnTimer -= dt / Math.max(game.timeScale, 0.01);
    if (respawnTimer <= 0) respawn();
  }
}

function frame() {
  requestAnimationFrame(frame);
  const real = clock.getDelta();
  game.quality.update(real, game.running && !game.menus.isOpen && !game.mapOpen);
  const raw = Math.min(real, 0.05);
  // Con un menú de tienda abierto el mundo se congela
  if (game.running && !game.menus.isOpen && !game.mapOpen) step(raw * game.timeScale);
  renderer.render(scene, camera);
  game.input.endFrame();
}

// Depuración: avanzar la simulación N pasos sin renderizar (p. ej. game.simulate(60))
game.simulate = (frames, dt = FIXED_STEP) => {
  for (let i = 0; i < frames; i++) {
    step(dt);
    game.input.endFrame();
  }
};

// Primer encuadre de la cámara antes de empezar
game.player.syncMesh();
game.cameraRig.update(1);
frame();
