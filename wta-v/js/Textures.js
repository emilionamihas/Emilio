import * as THREE from 'three';

/**
 * Texturas procedurales dibujadas en canvas. No hay imágenes externas: todo se genera al arrancar.
 * Cada función devuelve texturas listas para usar (con repetición activada).
 */

export function makeCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  draw(ctx, w, h);
  return c;
}

export function toTexture(canvas, { srgb = true, repeat = true, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Grano: suma ruido aleatorio a cada píxel (rompe el aspecto plano). */
export function addNoise(ctx, w, h, amount = 10, rand = Math.random) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Manchas suaves (humedad, suciedad). */
export function addStains(ctx, w, h, count, color, maxR, rand = Math.random) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = maxR * (0.3 + rand() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Ventana con marco, reflejo del cielo y alféizar. */
function drawWindow(ctx, fc, x, y, w, h, { frame = '#d9d6cf', glassTop = '#5d7488', glassBottom = '#2b3947', panes = 2, sill = true } = {}) {
  ctx.fillStyle = frame;
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, glassTop);
  g.addColorStop(1, glassBottom);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // reflejo diagonal
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(x, y + h * 0.6);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.75, y);
  ctx.lineTo(x, y + h);
  ctx.fill();
  ctx.fillStyle = frame;
  if (panes >= 2) ctx.fillRect(x + w / 2 - 1.5, y, 3, h);
  if (panes >= 4) ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
  if (sill) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - 4, y + h + 3, w + 8, 4);
  }
  if (fc) {
    // mapa emisivo: algunas ventanas iluminadas por la noche
    fc(x, y, w, h);
  }
}

/**
 * Fachadas de edificio. Una "baldosa" cubre tileW × tileH metros.
 * style: 'office' | 'brick' | 'glass' | 'modern'
 */
export function facadeTextures(style, rand = Math.random) {
  const W = 256;
  const H = 512;
  const lit = [];
  const glowFn = (x, y, w, h) => {
    if (rand() < 0.4) lit.push([x, y, w, h, rand() < 0.75 ? '#ffd9a0' : '#cfe6ff']);
  };
  let tileW = 12;
  let tileH = 20;
  const map = makeCanvas(W, H, (ctx) => {
    if (style === 'brick') {
      ctx.fillStyle = '#8a4b36';
      ctx.fillRect(0, 0, W, H);
      // ladrillos
      for (let y = 0; y < H; y += 8) {
        const off = (y / 8) % 2 ? 8 : 0;
        for (let x = -16; x < W; x += 16) {
          const t = 0.85 + rand() * 0.3;
          ctx.fillStyle = `rgb(${138 * t},${75 * t},${54 * t})`;
          ctx.fillRect(x + off + 1, y + 1, 14, 6);
        }
      }
      tileW = 10;
      tileH = 18;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 3; c++) {
          drawWindow(ctx, glowFn, 22 + c * 80, 20 + r * 100, 50, 64, { frame: '#efeae0', panes: 4 });
          ctx.fillStyle = '#b9a58f';
          ctx.fillRect(18 + c * 80, 12 + r * 100, 58, 6); // dintel
        }
      }
    } else if (style === 'glass') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#6f93ad');
      g.addColorStop(0.5, '#3f6178');
      g.addColorStop(1, '#2a4455');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 4; c++) {
          const t = rand() * 0.12;
          ctx.fillStyle = `rgba(255,255,255,${t})`;
          ctx.fillRect(c * 64 + 2, r * 64 + 2, 60, 60);
          glowFn(c * 64 + 4, r * 64 + 6, 56, 50);
        }
      }
      ctx.fillStyle = '#9fb0bd';
      for (let x = 0; x <= W; x += 64) ctx.fillRect(x - 2, 0, 4, H);
      for (let y = 0; y <= H; y += 64) ctx.fillRect(0, y - 3, W, 6);
      tileW = 12;
      tileH = 24;
    } else if (style === 'modern') {
      ctx.fillStyle = '#e4e0d6';
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < 6; r++) {
        const y = 22 + r * 84;
        const g = ctx.createLinearGradient(0, y, 0, y + 46);
        g.addColorStop(0, '#50606c');
        g.addColorStop(1, '#27313a');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, W, 46);
        for (let c = 0; c < 4; c++) {
          glowFn(c * 64 + 4, y + 2, 56, 42);
          ctx.fillStyle = '#c9c5bb';
          ctx.fillRect(c * 64, y, 3, 46);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, y + 46, W, 5);
      }
      // juntas de paneles
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let x = 0; x < W; x += 128) ctx.fillRect(x, 0, 2, H);
      tileW = 12;
      tileH = 18;
    } else {
      // office: hormigón con cuadrícula de ventanas
      ctx.fillStyle = '#b8b3a8';
      ctx.fillRect(0, 0, W, H);
      addStains(ctx, W, H, 12, 'rgba(60,55,50,0.10)', 60, rand);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          drawWindow(ctx, glowFn, 10 + c * 62, 16 + r * 84, 44, 58, { frame: '#8f8b83', panes: 2 });
        }
      }
      tileW = 12;
      tileH = 20;
    }
    addNoise(ctx, W, H, 14, rand);
  });

  const emissive = makeCanvas(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, w, h, c] of lit) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
      // persiana o cortina a medias
      if (rand() < 0.5) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x, y, w, h * (0.2 + rand() * 0.5));
      }
    }
  });
  return { map: toTexture(map), emissive: toTexture(emissive), tileW, tileH };
}

/** Planta baja comercial: escaparates iluminados, puertas y rótulo. 12 m de ancho × 4,5 m de alto. */
export function storefrontTextures(rand = Math.random) {
  const W = 512;
  const H = 192;
  const signColors = ['#b71c1c', '#0d47a1', '#1b5e20', '#4a148c', '#e65100', '#263238', '#006064'];
  const shops = [];
  const map = makeCanvas(W, H, (ctx) => {
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2; i++) {
      const x0 = i * 256;
      const sign = signColors[Math.floor(rand() * signColors.length)];
      shops.push(x0);
      ctx.fillStyle = sign;
      ctx.fillRect(x0 + 8, 10, 240, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 6; k++) ctx.fillRect(x0 + 40 + k * 28, 22, 18, 10);
      const g = ctx.createLinearGradient(0, 52, 0, H);
      g.addColorStop(0, '#6c7f8e');
      g.addColorStop(1, '#2a333b');
      ctx.fillStyle = g;
      ctx.fillRect(x0 + 10, 52, 236, 132);
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(x0 + 10, 52, 236, 4);
      ctx.fillRect(x0 + 126, 52, 4, 132);
      // puerta
      ctx.fillStyle = '#20262b';
      ctx.fillRect(x0 + 150, 80, 60, 104);
      ctx.fillStyle = '#b0b0b0';
      ctx.fillRect(x0 + 200, 128, 4, 18);
    }
    addNoise(ctx, W, H, 10, rand);
  });
  const emissive = makeCanvas(W, H, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    for (const x0 of shops) {
      ctx.fillStyle = '#ffe6b8';
      ctx.fillRect(x0 + 12, 58, 112, 124);
      ctx.fillRect(x0 + 132, 58, 16, 124);
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 6; k++) ctx.fillRect(x0 + 40 + k * 28, 22, 18, 10);
    }
  });
  return { map: toTexture(map), emissive: toTexture(emissive) };
}

/** Piedra de sillería (bancos). */
export function stoneTexture(rand = Math.random, base = [214, 204, 186]) {
  return toTexture(
    makeCanvas(256, 256, (ctx, W, H) => {
      ctx.fillStyle = `rgb(${base.join(',')})`;
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 32) {
        const off = (y / 32) % 2 ? 32 : 0;
        for (let x = -64; x < W; x += 64) {
          const t = 0.92 + rand() * 0.14;
          ctx.fillStyle = `rgb(${base[0] * t},${base[1] * t},${base[2] * t})`;
          ctx.fillRect(x + off + 1, y + 1, 62, 30);
        }
      }
      addNoise(ctx, W, H, 12, rand);
    })
  );
}

export function marbleTexture(rand = Math.random, dark = false) {
  return toTexture(
    makeCanvas(512, 512, (ctx, W, H) => {
      const tile = 128;
      for (let y = 0; y < H; y += tile) {
        for (let x = 0; x < W; x += tile) {
          const alt = ((x + y) / tile) % 2 === 0;
          ctx.fillStyle = dark ? (alt ? '#2d2d33' : '#d8d4cc') : alt ? '#e9e5dd' : '#d2cdc2';
          ctx.fillRect(x, y, tile, tile);
          // vetas
          ctx.strokeStyle = alt && dark ? 'rgba(255,255,255,0.12)' : 'rgba(90,85,80,0.18)';
          ctx.lineWidth = 1.5;
          for (let v = 0; v < 3; v++) {
            ctx.beginPath();
            let px = x + rand() * tile;
            let py = y;
            ctx.moveTo(px, py);
            while (py < y + tile) {
              px += (rand() - 0.5) * 14;
              py += 8;
              ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k <= W; k += tile) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k, H);
        ctx.moveTo(0, k);
        ctx.lineTo(W, k);
        ctx.stroke();
      }
      addNoise(ctx, W, H, 6, rand);
    })
  );
}

export function woodFloorTexture(rand = Math.random) {
  return toTexture(
    makeCanvas(512, 512, (ctx, W, H) => {
      const plank = 32;
      for (let y = 0; y < H; y += plank) {
        let x = -rand() * 200;
        while (x < W) {
          const len = 120 + rand() * 180;
          const t = 0.85 + rand() * 0.25;
          ctx.fillStyle = `rgb(${150 * t},${104 * t},${66 * t})`;
          ctx.fillRect(x, y, len, plank);
          ctx.strokeStyle = 'rgba(60,35,15,0.25)';
          for (let g = 0; g < 5; g++) {
            ctx.beginPath();
            const gy = y + 4 + rand() * (plank - 8);
            ctx.moveTo(x, gy);
            ctx.bezierCurveTo(x + len * 0.3, gy + (rand() - 0.5) * 6, x + len * 0.6, gy + (rand() - 0.5) * 6, x + len, gy);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, y, 2, plank);
          x += len;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, y, W, 2);
      }
      addNoise(ctx, W, H, 8, rand);
    })
  );
}

export function tileFloorTexture(rand = Math.random, a = '#dcdad4', b = '#c9c6be') {
  return toTexture(
    makeCanvas(256, 256, (ctx, W, H) => {
      const t = 64;
      for (let y = 0; y < H; y += t) {
        for (let x = 0; x < W; x += t) {
          ctx.fillStyle = ((x + y) / t) % 2 === 0 ? a : b;
          ctx.fillRect(x, y, t, t);
        }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k <= W; k += t) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k, H);
        ctx.moveTo(0, k);
        ctx.lineTo(W, k);
        ctx.stroke();
      }
      addStains(ctx, W, H, 6, 'rgba(0,0,0,0.05)', 40, rand);
      addNoise(ctx, W, H, 8, rand);
    })
  );
}

export function wallTexture(color = '#d9d2c5', rand = Math.random) {
  return toTexture(
    makeCanvas(256, 256, (ctx, W, H) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      addStains(ctx, W, H, 8, 'rgba(0,0,0,0.035)', 70, rand);
      addNoise(ctx, W, H, 6, rand);
    })
  );
}

export function carpetTexture(color = '#7a2e2e', rand = Math.random) {
  return toTexture(
    makeCanvas(256, 256, (ctx, W, H) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,220,160,0.35)';
      ctx.lineWidth = 6;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 30, W - 60, H - 60);
      addNoise(ctx, W, H, 20, rand);
    })
  );
}

/** Estantería de tienda: filas de productos de colores. */
export function shelfTexture(rand = Math.random) {
  return toTexture(
    makeCanvas(256, 256, (ctx, W, H) => {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, W, H);
      const colors = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#ffffff', '#6d4c41', '#00acc1'];
      for (let row = 0; row < 4; row++) {
        const y = row * 64;
        ctx.fillStyle = '#9e9e9e';
        ctx.fillRect(0, y + 58, W, 6);
        let x = 2;
        while (x < W) {
          const w = 10 + rand() * 18;
          const h = 26 + rand() * 26;
          ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
          ctx.fillRect(x, y + 58 - h, w - 2, h);
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(x + 2, y + 58 - h + 6, w - 6, 5);
          x += w;
        }
      }
      addNoise(ctx, W, H, 8, rand);
    }),
    { repeat: true }
  );
}

/** Texto sobre fondo (rótulos). */
export function signTexture(text, bg = '#111', fg = '#fff', { w = 512, h = 128, font = 'Anton, Impact, "Arial Black", sans-serif', border = true } = {}) {
  return toTexture(
    makeCanvas(w, h, (ctx) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (border) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 5;
        ctx.strokeRect(8, 8, w - 16, h - 16);
      }
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = h * 0.55;
      ctx.font = `${size}px ${font}`;
      while (ctx.measureText(text).width > w * 0.9 && size > 12) {
        size -= 3;
        ctx.font = `${size}px ${font}`;
      }
      ctx.fillText(text, w / 2, h * 0.54);
    }),
    { repeat: false }
  );
}
