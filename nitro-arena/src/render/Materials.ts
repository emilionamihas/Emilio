import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type QualityLevel = 'realista' | 'rendimiento';

/**
 * Fábrica de materiales según la calidad gráfica.
 *  - realista: PBR (MeshStandard/Physical), sombreado suave y reflejos de entorno.
 *  - rendimiento: Lambert con sombreado plano (Low-Poly), sin mapa de entorno.
 */
export class Materials {
  constructor(readonly quality: QualityLevel) {}

  get realistic(): boolean {
    return this.quality === 'realista';
  }

  /** Pintura de carrocería con barniz (clearcoat) en modo realista. */
  paint(color: THREE.ColorRepresentation): THREE.Material {
    if (!this.realistic) return new THREE.MeshLambertMaterial({ color, flatShading: true });
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.45,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    });
  }

  glass(): THREE.Material {
    if (!this.realistic) return new THREE.MeshLambertMaterial({ color: 0x0e1622, emissive: 0x0a1a33, flatShading: true });
    return new THREE.MeshPhysicalMaterial({ color: 0x1b2638, metalness: 0.35, roughness: 0.06, clearcoat: 1, envMapIntensity: 2.2 });
  }

  rubber(): THREE.Material {
    if (!this.realistic) return new THREE.MeshLambertMaterial({ color: 0x15171c, flatShading: true });
    return new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.92, metalness: 0 });
  }

  metal(color: THREE.ColorRepresentation = 0xb8bec9): THREE.Material {
    if (!this.realistic) return new THREE.MeshLambertMaterial({ color, flatShading: true });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.22, metalness: 1 });
  }

  plastic(color: THREE.ColorRepresentation): THREE.Material {
    if (!this.realistic) return new THREE.MeshLambertMaterial({ color, flatShading: true });
    return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
  }

  light(color: THREE.ColorRepresentation, intensity = 2): THREE.Material {
    if (!this.realistic) return new THREE.MeshBasicMaterial({ color });
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
  }

  /** Material genérico con color por vértice (arena). */
  surface(params: { vertexColors?: boolean; map?: THREE.Texture | null; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number }): THREE.Material {
    const { vertexColors = true, map = null, roughness = 0.9, metalness = 0, transparent = false, opacity = 1 } = params;
    if (!this.realistic) {
      return new THREE.MeshLambertMaterial({ vertexColors, map, flatShading: true, transparent, opacity, depthWrite: !transparent });
    }
    return new THREE.MeshStandardMaterial({ vertexColors, map, roughness, metalness, transparent, opacity, depthWrite: !transparent });
  }
}

/** Mapa de entorno para reflejos (solo calidad realista). */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}
