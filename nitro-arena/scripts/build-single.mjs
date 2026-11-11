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
let style = readFileSync(join(assets, css), 'utf8');

// Los @import deben ir al principio de la hoja de estilos
const imports = [];
style = style.replace(/@import\s+url\([^)]*\)[^;]*;/g, (m) => {
  imports.push(m);
  return '';
});

// Marcado del <body> de index.html sin la etiqueta <script> del módulo
const page = readFileSync(join('dist', 'index.html'), 'utf8');
const body = page
  .slice(page.indexOf('<body>') + 6, page.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const html = `<title>Nitro Arena</title>
<style>
${imports.join('\n')}
${style}
</style>
${body}
<script type="module">
${script}
</script>
`;
writeFileSync(join('dist', 'nitro-arena.html'), html);
console.log(`dist/nitro-arena.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
