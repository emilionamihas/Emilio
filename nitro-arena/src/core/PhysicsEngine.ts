import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { DT, GRAVITY } from '../config/PhysicsConstants';

export type ColliderTag =
  | { kind: 'arena' }
  | { kind: 'ball' }
  | { kind: 'car'; carId: number };

export interface RayHit {
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  collider: RAPIER.Collider;
  tag: ColliderTag | undefined;
}

export interface SurfaceProbe {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

/**
 * Envoltorio de Rapier: mundo, paso fijo, etiquetado de colliders y consultas
 * geométricas (rayos, proyección de puntos y contactos) usadas por los coches,
 * el balón y la cámara.
 */
export class PhysicsEngine {
  readonly R = RAPIER;
  readonly world: RAPIER.World;
  readonly dt = DT;
  tick = 0;
  private readonly tags = new Map<number, ColliderTag>();
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  static async create(): Promise<PhysicsEngine> {
    await RAPIER.init();
    return new PhysicsEngine();
  }

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 8;
    this.world.integrationParameters.maxCcdSubsteps = 2;
  }

  tag(collider: RAPIER.Collider, tag: ColliderTag): void {
    this.tags.set(collider.handle, tag);
  }

  getTag(collider: RAPIER.Collider): ColliderTag | undefined {
    return this.tags.get(collider.handle);
  }

  isArena(collider: RAPIER.Collider): boolean {
    return this.tags.get(collider.handle)?.kind === 'arena';
  }

  step(): void {
    this.world.step();
    this.tick++;
  }

  raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDist: number,
    excludeBody?: RAPIER.RigidBody,
    predicate?: (c: RAPIER.Collider) => boolean,
  ): RayHit | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const hit = this.world.castRayAndGetNormal(
      this.ray,
      maxDist,
      true,
      undefined,
      undefined,
      undefined,
      excludeBody,
      predicate,
    );
    if (!hit) return null;
    const d = hit.timeOfImpact;
    return {
      distance: d,
      point: new THREE.Vector3(origin.x + dir.x * d, origin.y + dir.y * d, origin.z + dir.z * d),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      collider: hit.collider,
      tag: this.tags.get(hit.collider.handle),
    };
  }

  /** Punto más cercano de la arena (paredes, suelo, porterías) a una posición. */
  probeArena(p: THREE.Vector3, maxDist: number): SurfaceProbe | null {
    const proj = this.world.projectPoint(
      { x: p.x, y: p.y, z: p.z },
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => this.isArena(c),
    );
    if (!proj) return null;
    const point = new THREE.Vector3(proj.point.x, proj.point.y, proj.point.z);
    const delta = new THREE.Vector3().subVectors(p, point);
    const distance = delta.length();
    if (distance > maxDist || distance < 1e-6) return null;
    const normal = delta.multiplyScalar(proj.isInside ? -1 / distance : 1 / distance);
    return { point, normal, distance };
  }

  /**
   * true si los dos colliders se tocan en este paso. Cuenta también los contactos
   * especulativos que el solver ya resolvió (impulso > 0) aunque aún haya hueco,
   * para no perder el primer tick real de la colisión.
   */
  touching(c1: RAPIER.Collider, c2: RAPIER.Collider): boolean {
    let found = false;
    this.world.contactPair(c1, c2, (manifold) => {
      if (found) return;
      const n = manifold.numContacts();
      for (let i = 0; i < n; i++) {
        if (manifold.contactDist(i) <= 0.02 || manifold.contactImpulse(i) > 1e-5) {
          found = true;
          return;
        }
      }
    });
    return found;
  }

  /** Lista de colliders con contacto real contra el collider indicado. */
  contactsOf(c: RAPIER.Collider): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    this.world.contactPairsWith(c, (other) => {
      if (this.touching(c, other)) out.push(other);
    });
    return out;
  }
}
