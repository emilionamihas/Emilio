// Genera dist/nitro-arena.html: un único HTML autocontenido (JS, CSS y WASM de
// Rapier incrustados) apto para publicarse como página estática o artifact.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = join('dist', 'assets');
const files = readdirSync(assets);
const js = files.find((f) => f.endsWith('.js'));
const css = files.find((f) => f.endsWith('.css'));
if (!js || !css) throw new Error('Ejecuta primero "vite build".');

const script = readFileSync(join(assets, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(assets, css), 'utf8');

const html = `<title>Nitro Arena</title>
<style>
:root { color-scheme: dark; background: #0b0f18; }
${style}
</style>
<div id="app">
  <canvas id="game-canvas"></canvas>
  <div id="ui-root"></div>
  <div id="loading">Cargando motor de físicas…</div>
</div>
<script type="module">
${script}
</script>
`;
writeFileSync(join('dist', 'nitro-arena.html'), html);
console.log(`dist/nitro-arena.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
