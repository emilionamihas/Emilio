import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Efectos visuales con pools fijos (sin crear objetos durante el juego):
 * chispas de impacto, trazadoras, agujeros de bala, fogonazo y humo.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;

    // Chispas: una sola InstancedMesh
    this.sparkCount = 160;
    this.sparks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffd180 }),
      this.sparkCount
    );
    this.sparks.frustumCulled = false;
    this.sparkState = Array.from({ length: this.sparkCount }, () => ({
      life: 0,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
    }));
    this.sparkCursor = 0;
    this.hideAll(this.sparks, this.sparkCount);
    scene.add(this.sparks);

    // Humo (derrape, daños): esferas instanciadas semitransparentes
    this.smokeCount = 120;
    this.smoke = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, transparent: true, opacity: 0.35, depthWrite: false, roughness: 1 }),
      this.smokeCount
    );
    this.smoke.frustumCulled = false;
    this.smokeState = Array.from({ length: this.smokeCount }, () => ({
      life: 0,
      maxLife: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      size: 1,
    }));
    this.smokeCursor = 0;
    this.hideAll(this.smoke, this.smokeCount);
    scene.add(this.smoke);

    // Humo negro para vehículos destrozados
    this.darkSmoke = new THREE.InstancedMesh(
      this.smoke.geometry,
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.55, depthWrite: false }),
      60
    );
    this.darkSmoke.frustumCulled = false;
    this.darkState = Array.from({ length: 60 }, () => ({ life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1 }));
    this.darkCursor = 0;
    this.hideAll(this.darkSmoke, 60);
    scene.add(this.darkSmoke);

    // Trazadoras
    this.tracers = [];
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      line.userData.life = 0;
      scene.add(line);
      this.tracers.push(line);
    }
    this.tracerCursor = 0;

    // Agujeros de bala
    this.decals = [];
    const decalGeo = new THREE.CircleGeometry(0.07, 8);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    for (let i = 0; i < 80; i++) {
      const d = new THREE.Mesh(decalGeo, decalMat);
      d.visible = false;
      scene.add(d);
      this.decals.push(d);
    }
    this.decalCursor = 0;

    // Fogonazo: luz fija en escena (solo cambia la intensidad, así no se recompilan shaders)
    this.flashLight = new THREE.PointLight(0xffc36b, 0, 8, 2);
    scene.add(this.flashLight);
    this.flashSprite = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 })
    );
    this.flashSprite.visible = false;
    scene.add(this.flashSprite);
    this.flashTime = 0;
  }

  hideAll(mesh, count) {
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, _m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  spawnSparks(point, normal, count = 8, color) {
    for (let i = 0; i < count; i++) {
      const s = this.sparkState[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkCount;
      s.life = 0.25 + Math.random() * 0.25;
      s.pos.copy(point);
      s.vel
        .copy(normal)
        .multiplyScalar(3 + Math.random() * 4)
        .add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5));
    }
    if (color) this.sparks.material.color.set(color);
  }

  spawnTracer(from, to) {
    const line = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    line.userData.life = 0.06;
    line.material.opacity = 0.9;
  }

  spawnDecal(point, normal, parent) {
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.visible = true;
    if (d.parent !== this.scene) this.scene.attach(d);
    d.position.copy(point).addScaledVector(normal, 0.015);
    d.lookAt(_p.copy(point).add(normal));
    // Si golpea un vehículo, el agujero se mueve con él
    if (parent) parent.attach(d);
  }

  muzzleFlash(position) {
    this.flashLight.position.copy(position);
    this.flashLight.intensity = 12;
    this.flashSprite.position.copy(position);
    this.flashSprite.visible = true;
    this.flashSprite.scale.setScalar(0.8 + Math.random() * 0.6);
    this.flashTime = 0.05;
  }

  spawnSmoke(position, velocity, size = 1, dark = false) {
    const pool = dark ? this.darkState : this.smokeState;
    const len = pool.length;
    const idx = dark ? this.darkCursor : this.smokeCursor;
    const s = pool[idx];
    if (dark) this.darkCursor = (idx + 1) % len;
    else this.smokeCursor = (idx + 1) % len;
    s.maxLife = s.life = dark ? 2.2 : 1.2 + Math.random() * 0.5;
    s.pos.copy(position);
    s.vel.copy(velocity);
    s.size = size;
  }

  updateSmoke(mesh, pool, dt) {
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      if (s.life <= 0) {
        _m.makeScale(0, 0, 0);
      } else {
        s.life -= dt;
        s.pos.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(1 - dt * 1.5);
        s.vel.y += dt * 1.2;
        const t = 1 - s.life / s.maxLife;
        const sc = s.size * (0.4 + t * 2.2) * (s.life > 0 ? 1 : 0);
        _s.set(sc, sc, sc);
        _m.compose(s.pos, _q, _s);
      }
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < this.sparkCount; i++) {
      const s = this.sparkState[i];
      if (s.life <= 0) {
        _m.makeScale(0, 0, 0);
      } else {
        s.life -= dt;
        s.vel.y -= 18 * dt;
        s.pos.addScaledVector(s.vel, dt);
        _s.setScalar(s.life > 0 ? 1 : 0);
        _m.compose(s.pos, _q, _s);
      }
      this.sparks.setMatrixAt(i, _m);
    }
    this.sparks.instanceMatrix.needsUpdate = true;

    this.updateSmoke(this.smoke, this.smokeState, dt);
    this.updateSmoke(this.darkSmoke, this.darkState, dt);

    for (const line of this.tracers) {
      if (line.userData.life > 0) {
        line.userData.life -= dt;
        line.material.opacity = Math.max(0, line.userData.life / 0.06) * 0.9;
      }
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        this.flashLight.intensity = 0;
        this.flashSprite.visible = false;
      }
    }
  }
}
