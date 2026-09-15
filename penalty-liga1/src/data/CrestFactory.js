// Genera escudos ORIGINALES por código (forma de escudo + iniciales del club).
// Deliberadamente no reproduce ningún logo oficial: es un diseño propio
// parametrizado por los colores del equipo, pensado para evitar problemas
// de marca registrada. Si en el futuro se consigue licencia oficial, estos
// texturas se pueden reemplazar por imágenes reales sin tocar el resto del código
// (basta con generar una textura con la misma key en PreloadScene).

const SIZE = 128;

export function generateCrestTexture(scene, team) {
  const key = `crest_${team.id}`;
  const baseKey = `${key}_base`;
  if (scene.textures.exists(key)) return key;

  const g = scene.add.graphics();
  const w = SIZE;
  const h = SIZE;
  const cx = w / 2;

  // Forma de escudo (pentágono con base curva)
  g.fillStyle(team.colors.primary, 1);
  g.beginPath();
  g.moveTo(cx, 4);
  g.lineTo(w - 6, 26);
  g.lineTo(w - 6, h * 0.55);
  g.lineTo(cx, h - 4);
  g.lineTo(6, h * 0.55);
  g.lineTo(6, 26);
  g.closePath();
  g.fillPath();

  // Franja diagonal secundaria
  g.fillStyle(team.colors.secondary, 1);
  g.beginPath();
  g.moveTo(6, h * 0.42);
  g.lineTo(w - 6, h * 0.3);
  g.lineTo(w - 6, h * 0.46);
  g.lineTo(6, h * 0.58);
  g.closePath();
  g.fillPath();

  // Borde
  g.lineStyle(4, 0x1a1a1a, 0.85);
  g.beginPath();
  g.moveTo(cx, 4);
  g.lineTo(w - 6, 26);
  g.lineTo(w - 6, h * 0.55);
  g.lineTo(cx, h - 4);
  g.lineTo(6, h * 0.55);
  g.lineTo(6, 26);
  g.closePath();
  g.strokePath();

  g.generateTexture(baseKey, w, h);
  g.destroy();

  // Iniciales como texto sobre un contenedor aparte (se combina en un RenderTexture)
  const rt = scene.add.renderTexture(0, 0, w, h);
  rt.draw(baseKey, 0, 0);
  const label = scene.add.text(cx, h * 0.5, team.shortName, {
    fontFamily: 'Arial Black, Arial, sans-serif',
    fontSize: '30px',
    color: contrastColor(team.colors.primary),
    fontStyle: 'bold'
  }).setOrigin(0.5);
  rt.draw(label, cx, h * 0.5);
  rt.saveTexture(key);
  label.destroy();
  rt.destroy();
  scene.textures.remove(baseKey);

  return key;
}

function contrastColor(hexInt) {
  const r = (hexInt >> 16) & 0xff;
  const gg = (hexInt >> 8) & 0xff;
  const b = hexInt & 0xff;
  const luminance = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

export function generateAllCrests(scene, teams) {
  teams.forEach((t) => generateCrestTexture(scene, t));
}
