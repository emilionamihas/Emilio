import * as THREE from 'three';
import type { CarPreset } from '../config/CarPresets';
import { TEAM_COLORS } from '../core/types';
import { buildCarModel } from '../entities/CarModel';
import type { Materials } from './Materials';
import { spotlightTexture } from './Textures';
import { damp } from '../utils/math';

/**
 * Escena del menú principal y del garaje: el coche del jugador sobre una
 * plataforma giratoria con focos. Se puede girar arrastrando con el ratón o el dedo.
 */
export class Showroom {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 120);
  private readonly turntable = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private carRoot: THREE.Object3D | null = null;
  private yaw = -0.75;
  private yawVel = 0;
  private dragging = false;
  private lastX = 0;
  private idle = 0;
  private time = 0;
  private width = 1;
  active = true;

  constructor(
    private readonly mats: Materials,
    env: THREE.Texture | null,
    surface: HTMLElement,
  ) {
    this.scene.background = new THREE.Color(0x07090f);
    this.scene.fog = new THREE.Fog(0x07090f, 14, 40);
    if (env) {
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.55;
    }

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      mats.realistic
        ? new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.28, metalness: 0.6 })
        : new THREE.MeshLambertMaterial({ color: 0x10131b }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshBasicMaterial({ map: spotlightTexture(), transparent: true, opacity: 0.35, depthWrite: false, color: 0x9cc4ff }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.005;
    this.scene.add(glow);

    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.62, 0.08, 64),
      mats.realistic
        ? new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.35, metalness: 0.7 })
        : new THREE.MeshLambertMaterial({ color: 0x1a1f2b }),
    );
    disc.position.y = 0.04;
    disc.receiveShadow = true;
    this.turntable.add(disc);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[0] }),
    );
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.082;
    this.turntable.add(this.ring);
    this.scene.add(this.turntable);

    // Paneles de luz verticales al fondo
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x1d2a44 });
    for (let i = -4; i <= 4; i++) {
      const a = (i / 4) * 1.1 - Math.PI / 2;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5, 0.12), i % 2 === 0 ? panelMat : new THREE.MeshBasicMaterial({ color: 0x2a3d66 }));
      panel.position.set(Math.cos(a) * 9, 2.5, Math.sin(a) * 9);
      this.scene.add(panel);
    }

    this.scene.add(new THREE.HemisphereLight(0xbfd2ff, 0x10131a, 0.6));
    const key = new THREE.SpotLight(0xffffff, 60, 20, 0.6, 0.6, 1.4);
    key.position.set(2.5, 5.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    this.scene.add(key, key.target);
    const rimBlue = new THREE.PointLight(0x3d8bff, 14, 10, 1.6);
    rimBlue.position.set(-3, 1.4, -2);
    const rimOrange = new THREE.PointLight(0xff8a1f, 10, 10, 1.6);
    rimOrange.position.set(3, 1.0, -2.8);
    this.scene.add(rimBlue, rimOrange);

    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  setCar(preset: CarPreset, accent: number): void {
    if (this.carRoot) this.turntable.remove(this.carRoot);
    const built = buildCarModel(preset, TEAM_COLORS[0], accent, this.mats);
    built.root.position.y = 0.08 + 0.17;
    built.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.carRoot = built.root;
    this.turntable.add(built.root);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.camera.aspect = width / Math.max(1, height);
    // En pantallas anchas el coche queda a la derecha, junto al menú
    if (width > 900) this.camera.setViewOffset(width, height, -width * 0.16, -height * 0.02, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.dragging) {
      this.idle += dt;
      this.yawVel = damp(this.yawVel, this.idle > 2 ? 0.25 : 0, 2, dt);
    }
    this.yaw += this.yawVel * dt;
    if (this.carRoot) this.carRoot.rotation.y = this.yaw;
    this.ring.scale.setScalar(1 + Math.sin(this.time * 2) * 0.004);
    const narrow = this.width <= 900;
    const dist = narrow ? 5.2 : 4.4;
    this.camera.position.set(Math.sin(0.35) * dist, 1.35 + Math.sin(this.time * 0.3) * 0.03, Math.cos(0.35) * dist);
    this.camera.lookAt(0, narrow ? 0.65 : 0.45, 0);
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.active) return;
    this.dragging = true;
    this.lastX = e.clientX;
    this.idle = 0;
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    this.lastX = e.clientX;
    this.yaw += dx * 0.01;
    this.yawVel = dx * 0.6;
  };

  private onUp = (): void => {
    this.dragging = false;
  };
}
