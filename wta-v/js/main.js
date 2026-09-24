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

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(location.search);

// ----------------------------------------------------------------------
// Renderizado
// ----------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);

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
  input: new Input(canvas),
  getFocusPosition() {
    const v = game.interaction && game.interaction.vehicle;
    if (v && game.interaction.state !== 'foot') return new THREE.Vector3(v.position.x, v.position.y, v.position.z);
    return game.player.mesh.position.clone();
  },
  getShootables() {
    const list = game.env.shootables.slice();
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

const spawn = new THREE.Vector3(CITY.ROAD / 2 + 1.5, 0, 22);
game.player = new PlayerController(game, spawn);
game.player.facing = Math.PI;
game.cameraRig = new ThirdPersonCamera(game);
game.cameraRig.yaw = 0;
game.interaction = new InteractionSystem(game);
game.wanted = new WantedSystem(game);
game.traffic = new AITraffic(game, { maxActive: 12 });

// Coches aparcados junto a la acera del spawn (carril derecho de la calle x = 0)
const parked = [
  { z: 14, heading: Math.PI, type: 'sport', color: 0xffc107 },
  { z: 30, heading: Math.PI, type: 'civil' },
  { z: 46, heading: Math.PI, type: 'civil', color: 0x1e88e5 },
];
for (const p of parked) {
  const v = new VehicleController(game, { type: p.type, color: p.color, position: new THREE.Vector3(6.3, 0, p.z), heading: p.heading });
  v.addToWorld();
}

// ----------------------------------------------------------------------
// Muerte y arresto
// ----------------------------------------------------------------------
let respawnTimer = 0;
function endLife(text, cls) {
  if (respawnTimer > 0) return;
  game.hud.bigText(text, cls);
  respawnTimer = 3;
  game.timeScale = 0.3;
}
game.onPlayerDeath = () => endLife('WASTED', 'wasted');
game.onBusted = () => endLife('BUSTED', 'busted');

function respawn() {
  game.hud.hideBigText();
  game.timeScale = 1;
  game.interaction.forceExit();
  game.wanted.reset();
  game.player.health = 100;
  game.player.teleport(spawn);
  game.cameraRig.yaw = 0;
  game.hud.notify('Has vuelto al punto de inicio.');
}

// ----------------------------------------------------------------------
// Pantalla de inicio / pausa y Pointer Lock
// ----------------------------------------------------------------------
const overlay = document.getElementById('overlay');
const playBtn = document.getElementById('play-btn');
document.getElementById('loading').classList.add('hidden');
playBtn.classList.remove('hidden');

function start() {
  overlay.classList.add('hidden');
  game.hud.show(true);
  game.running = true;
}
playBtn.addEventListener('click', () => {
  game.input.requestLock();
  // Si Pointer Lock no está disponible (iframe, móvil...), se juega con el ratón libre
  setTimeout(() => {
    if (!game.input.locked) {
      game.input.freeMouse = true;
      start();
    }
  }, 400);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.input.freeMouse && game.running) {
    game.running = false;
    playBtn.textContent = 'CONTINUAR';
    overlay.classList.remove('hidden');
  }
});
canvas.addEventListener('click', () => {
  if (game.running && !game.input.locked && !game.input.freeMouse) game.input.requestLock();
});
game.input.onLockChange = (locked) => {
  if (locked) {
    start();
  } else if (!params.has('autostart') && !game.input.freeMouse) {
    // Esc libera el ratón: pausa
    game.running = false;
    playBtn.textContent = 'CONTINUAR';
    overlay.classList.remove('hidden');
  }
};
if (params.has('autostart')) start(); // sin Pointer Lock, útil para pruebas automáticas
if (params.has('time')) game.env.timeOfDay = parseFloat(params.get('time'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----------------------------------------------------------------------
// Bucle principal
// ----------------------------------------------------------------------
const clock = new THREE.Clock();

function step(dt) {
  game.time += dt;
  const input = game.input;

  game.env.timeSpeed = input.isDown('KeyT') ? 25 : 1;

  // 1. Lógica previa a la física: jugador, interacción, IA
  game.player.update(dt, game.cameraRig);
  game.interaction.update(dt);
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
  game.env.update(dt, game.getFocusPosition());
  game.effects.update(dt);
  game.hud.update(dt);

  if (respawnTimer > 0) {
    respawnTimer -= dt / Math.max(game.timeScale, 0.01);
    if (respawnTimer <= 0) respawn();
  }
}

function frame() {
  requestAnimationFrame(frame);
  const raw = Math.min(clock.getDelta(), 0.05);
  if (game.running) step(raw * game.timeScale);
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
