# SEO Copy Optimizer

SaaS de diagnóstico y optimización de SEO On-Page y Copywriting. El usuario ingresa la URL de
cualquier sitio web y la app la scrapea, la envía a Claude (Anthropic) y devuelve un reporte
visual con scores, problemas críticos y propuestas de reescritura.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS** + componentes estilo **shadcn/ui** (Card, Button, Input, Progress, Tabs,
  Badge, Toast, Dialog...) construidos sobre Radix UI
- **Lucide React** para iconos
- **Cheerio** para el scraping y parseo de HTML
- **`@anthropic-ai/sdk`** consumiendo `claude-3-5-sonnet-20241022`
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) para auth (magic link) y persistencia
  del historial de reportes
- **jsPDF** para exportar el reporte a PDF

## Estructura

```
app/
  page.tsx                 Landing + formulario de análisis + reporte
  api/analyze/route.ts      Endpoint que scrapea la URL y llama a Claude
  auth/login/page.tsx        Login por magic link
  auth/callback/route.ts     Intercambio de código de Supabase por sesión
  dashboard/page.tsx         Historial de reportes del usuario autenticado
components/
  ui/                       Componentes base estilo shadcn/ui
  seo/                      Componentes de dominio (formulario, gauges, cards, export PDF)
lib/
  scraper.ts                Scraper de HTML con Cheerio
  anthropic.ts              Prompt + llamada a Claude + validación con Zod
  pdf.ts                    Generación del PDF del reporte
  types.ts                  Esquema Zod del reporte SEO
  supabase/                 Clientes de Supabase (browser, server, middleware)
supabase/schema.sql          DDL de la tabla `reports` con RLS
```

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` a `.env.local` y completar:

   - `ANTHROPIC_API_KEY`: clave de la API de Anthropic.
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: proyecto de Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: opcional, para tareas administrativas server-side.

3. En el proyecto de Supabase, ejecutar `supabase/schema.sql` en el SQL Editor para crear la
   tabla `reports` con Row Level Security.

4. Levantar el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   La app queda disponible en `http://localhost:3000`.

## Flujo de análisis

1. El usuario pega una URL en el formulario de la home.
2. `POST /api/analyze` scrapea el HTML (`lib/scraper.ts`): título, meta description, URL
   canónica, H1/H2/H3, texto principal limpio de nav/scripts/estilos, `alt` de imágenes y
   densidad de palabras clave.
3. El contenido extraído se envía a Claude (`lib/anthropic.ts`) con un prompt que exige una
   respuesta JSON estricta, validada con Zod contra `SeoReport`.
4. Si hay una sesión de Supabase activa, el reporte se guarda en la tabla `reports`.
5. El frontend renderiza el reporte (scores circulares, problemas críticos, análisis SEO y de
   copywriting, propuestas de reescritura) y permite exportarlo a PDF.

## Notas

- El scraper limita el texto enviado a Claude (~8000 caracteres) para controlar el uso de
  tokens; ajustar `bodyText.slice()` en `lib/scraper.ts` según necesidad.
- El endpoint corre en runtime `nodejs` (no Edge) porque Cheerio y el SDK de Anthropic requieren
  APIs de Node.
- Sin `ANTHROPIC_API_KEY` configurada, `/api/analyze` responde con error 502 explicando la
  variable faltante.
