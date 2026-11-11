import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  return [c, ctx];
}

/** Ruido determinista para que las texturas sean iguales en cada carga. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Césped con franjas de corte. Cada repetición de la textura cubre 12,8 m de
 * campo (dos franjas de 6,4 m).
 */
export function grassTexture(maxAnisotropy: number): THREE.Texture {
  const size = 512;
  const [c, ctx] = canvas(size, size);
  const rand = rng(7);
  for (let half = 0; half < 2; half++) {
    ctx.fillStyle = half === 0 ? '#3f8a3c' : '#357a33';
    ctx.fillRect(0, (half * size) / 2, size, size / 2);
  }
  // Briznas: trazos cortos con variación de tono
  for (let i = 0; i < 26000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const light = 30 + rand() * 22;
    const sat = 38 + rand() * 18;
    ctx.strokeStyle = `hsla(${104 + rand() * 14}, ${sat}%, ${light}%, ${0.35 + rand() * 0.4})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y - 2 - rand() * 3);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

/**
 * Balón: patrón de icosaedro truncado (12 pentágonos oscuros + 20 hexágonos
 * claros) calculado como diagrama de Voronoi sobre la esfera, en proyección
 * equirectangular, con costuras entre paneles.
 */
export function ballTexture(): THREE.Texture {
  const w = 1024;
  const h = 512;
  const [c, ctx] = canvas(w, h);
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.getAttribute('position');
  const pent: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).normalize();
    if (!pent.some((p) => p.distanceToSquared(v) < 1e-4)) pent.push(v);
  }
  const hex: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const d = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    hex.push(a.add(b).add(d).normalize());
  }
  const centers = [...pent.map((p) => ({ p, dark: true })), ...hex.map((p) => ({ p, dark: false }))];
  const img = ctx.createImageData(w, h);
  const dir = new THREE.Vector3();
  for (let y = 0; y < h; y++) {
    const phi = (y / h) * Math.PI;
    for (let x = 0; x < w; x++) {
      const theta = (x / w) * Math.PI * 2;
      // Misma convención que SphereGeometry de Three.js
      dir.set(-Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi));
      let best = -2;
      let second = -2;
      let dark = false;
      for (const c0 of centers) {
        const d = dir.dot(c0.p);
        if (d > best) {
          second = best;
          best = d;
          dark = c0.dark;
        } else if (d > second) second = d;
      }
      const seam = best - second < 0.012;
      const i = (y * w + x) * 4;
      let r: number;
      let g: number;
      let b: number;
      if (seam) [r, g, b] = [70, 76, 88];
      else if (dark) [r, g, b] = [38, 44, 56];
      else [r, g, b] = [236, 238, 242];
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Degradado radial suave para el suelo del garaje. */
export function spotlightTexture(): THREE.Texture {
  const [c, ctx] = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
