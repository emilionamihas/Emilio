// Compila ManageCourt a un único HTML autocontenido (CSS y JS en línea),
// listo para publicarse como Artifact. Uso: npm run build:artifact
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "dist-artifact/index.html");

const js = await build({
  entryPoints: [resolve(root, "artifact/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  write: false,
  tsconfig: resolve(root, "tsconfig.json"),
  alias: {
    "next/link": resolve(root, "artifact/shims/link.tsx"),
    "next/navigation": resolve(root, "artifact/shims/navigation.ts"),
  },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_ARTIFACT": '"1"',
  },
  logOverride: { "unsupported-directive": "silent" },
});

const cssSrc = await readFile(resolve(root, "app/globals.css"), "utf8");
const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(cssSrc, {
  from: resolve(root, "app/globals.css"),
});

const script = js.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = `<title>ManageCourt</title>
<meta name="description" content="Reservas y gestión de canchas de Fútbol, Básquet, Tenis y Pádel.">
<style>${css.css}</style>
<div id="root"></div>
<script>${script}</script>
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`dist-artifact/index.html · ${(html.length / 1024).toFixed(0)} KB`);
