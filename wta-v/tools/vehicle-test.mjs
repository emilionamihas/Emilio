/**
 * Banco de pruebas de conducción: ejecuta el VehicleController real sobre un suelo plano
 * y mide cada modelo del catálogo. Uso: npm install && npm run test:vehicles [tipo]
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { VehicleController, CATALOG } from '../js/VehicleController.js';

const DT = 1 / 60;
const noop = () => {};

function makeGame() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.3;
  const ground = new CANNON.Body({ mass: 0 });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  return {
    world,
    scene: new THREE.Scene(),
    materials: { vehicle: new CANNON.Material('vehicle') },
    vehicles: [],
    effects: { spawnSmoke: noop, muzzleFlash: noop, spawnSparks: noop },
    env: { night: 0 },
    wanted: { reportCrime: noop },
  };
}

function setup(type) {
  const game = makeGame();
  const v = new VehicleController(game, { type });
  v.addToWorld();
  v.driver = 'player';
  const state = { minUp: 1, t: 0 };
  const step = (sec, fn) => {
    for (let i = 0; i < Math.round(sec / DT); i++) {
      if (fn) fn(state.t);
      v.update(DT);
      game.world.step(DT);
      state.t += DT;
      const up = v.chassisBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
      state.minUp = Math.min(state.minUp, up.y);
    }
  };
  const set = (throttle, steer = 0, handbrake = false, reverse = 0) => Object.assign(v.input, { throttle, steer, handbrake, reverse });
  const kmh = () => v.getSpeedKmh();
  const reachSpeed = (target) => {
    set(1);
    let t = 0;
    while (kmh() < target && t < 30) {
      step(DT);
      t += DT;
    }
    return t;
  };
  return { v, game, step, set, kmh, reachSpeed, state };
}

const deg = (r) => (r * 180) / Math.PI;
function yawDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function testType(type) {
  const r = { type };
  // 1. Aceleración y punta
  {
    const s = setup(type);
    s.step(0.5);
    r.to100 = s.reachSpeed(100);
    s.set(1);
    s.step(25);
    r.top = s.kmh();
  }
  // 2. Frenada desde 100 km/h
  {
    const s = setup(type);
    s.step(0.5);
    s.reachSpeed(100);
    const p0 = s.v.position.clone();
    s.set(0, 0, false, 1);
    let t = 0;
    while (s.v.getForwardSpeed() > 0.5 && t < 10) {
      s.step(DT);
      t += DT;
    }
    r.brake100 = s.v.position.distanceTo(p0);
  }
  // 3. Curva cerrada a 80 km/h con volante a tope
  {
    const s = setup(type);
    s.step(0.5);
    s.reachSpeed(80);
    s.state.minUp = 1;
    s.set(1, 1);
    s.step(3);
    r.turnMinUp = s.state.minUp;
    r.turnFlip = s.v.isFlipped();
  }
  // 4. Slalom a 90 km/h
  {
    const s = setup(type);
    s.step(0.5);
    s.reachSpeed(90);
    s.state.minUp = 1;
    s.step(6, (t) => s.set(1, Math.sin(t * 4) > 0 ? 1 : -1));
    r.slalomMinUp = s.state.minUp;
    r.slalomFlip = s.v.isFlipped();
  }
  // 5. Freno de mano a 80 km/h: 1 s de derrape y luego recuperar
  {
    const s = setup(type);
    s.step(0.5);
    s.reachSpeed(80);
    const h0 = s.v.getHeading();
    s.state.minUp = 1;
    s.set(1, 1, true);
    s.step(1.0);
    r.hbYaw = Math.abs(deg(yawDiff(h0, s.v.getHeading())));
    r.hbSpeed = s.kmh();
    s.set(1, 0, false);
    s.step(1.5);
    r.recoverYawRate = Math.abs(deg(s.v.chassisBody.angularVelocity.y));
    r.recoverSpeed = s.kmh();
    r.hbFlip = s.v.isFlipped() || s.state.minUp < 0.5;
  }
  const checks = [
    ['0-100 < 12 s', r.to100 < 12],
    ['punta > 120 km/h', r.top > 120],
    ['frenada 100-0 < 60 m', r.brake100 < 60],
    ['curva sin volcar', !r.turnFlip && r.turnMinUp > 0.8],
    ['slalom sin volcar', !r.slalomFlip && r.slalomMinUp > 0.8],
    ['derrape gira 35-140°', r.hbYaw > 35 && r.hbYaw < 140],
    ['sale del derrape (giro < 60°/s)', r.recoverYawRate < 60 && !r.hbFlip],
  ];
  r.failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return r;
}

const only = process.argv[2];
const types = only ? [only] : Object.keys(CATALOG).filter((k) => k !== 'civil');
let failures = 0;
console.log('tipo      0-100  punta  fren100  curvaUp slalomUp  hbGiro hbVel  recGiro recVel  resultado');
for (const type of types) {
  const r = testType(type);
  if (r.failed.length) failures++;
  console.log(
    `${type.padEnd(9)} ${r.to100.toFixed(1).padStart(5)}s ${r.top.toFixed(0).padStart(5)} ${r.brake100.toFixed(0).padStart(6)}m ` +
      `${r.turnMinUp.toFixed(2).padStart(7)} ${r.slalomMinUp.toFixed(2).padStart(8)} ${r.hbYaw.toFixed(0).padStart(6)}° ${r.hbSpeed.toFixed(0).padStart(5)} ` +
      `${r.recoverYawRate.toFixed(0).padStart(7)}°/s ${r.recoverSpeed.toFixed(0).padStart(5)}  ${r.failed.length ? 'FALLA: ' + r.failed.join(', ') : 'OK'}`
  );
}
process.exit(failures ? 1 : 0);
