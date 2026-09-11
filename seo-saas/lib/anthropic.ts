import Anthropic from "@anthropic-ai/sdk";
import { seoReportSchema, type ScrapedContent, type SeoReport } from "@/lib/types";

export const ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta la variable de entorno ANTHROPIC_API_KEY. Definila en .env.local."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

const JSON_SCHEMA_DESCRIPTION = `{
  "overallScore": number (0-100),
  "seoScore": number (0-100),
  "copywritingScore": number (0-100),
  "summary": "string",
  "criticalIssues": ["string"],
  "seoAnalysis": {
    "titleStatus": "optimal | warning | critical",
    "metaDescriptionStatus": "optimal | warning | critical",
    "headingStructureFeedback": "string",
    "recommendations": ["string"]
  },
  "copywritingAnalysis": {
    "tone": "string",
    "clarity": "string",
    "callToActionFeedback": "string",
    "weakPhrases": [{ "original": "string", "reason": "string" }]
  },
  "rewrittenProposals": [
    {
      "section": "string (ej: Hero H1, CTA Principal, Meta Description)",
      "currentText": "string",
      "optimizedText": "string",
      "improvementReason": "string"
    }
  ]
}`;

function buildPrompt(scraped: ScrapedContent): string {
  const headingsBlock = scraped.headings
    .map((h) => `${h.level.toUpperCase()}: ${h.text}`)
    .join("\n") || "(no se encontraron encabezados H1/H2/H3)";

  const imagesWithoutAlt = scraped.images.filter((img) => !img.alt).length;

  const keywordsBlock = scraped.topKeywords
    .slice(0, 10)
    .map((k) => `${k.word} (${k.count}x, ${k.density}%)`)
    .join(", ") || "(sin datos suficientes)";

  return `Sos un consultor Senior de SEO On-Page y Copywriting persuasivo. Analizá el siguiente contenido extraído de una página web real y devolvé ÚNICAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin backticks, que cumpla EXACTAMENTE este esquema:

${JSON_SCHEMA_DESCRIPTION}

Reglas importantes:
- Todos los campos son obligatorios. No omitas ninguno.
- "titleStatus" y "metaDescriptionStatus" deben ser exactamente "optimal", "warning" o "critical".
- "criticalIssues" debe listar solo los problemas más urgentes (máximo 5).
- "weakPhrases" debe señalar frases débiles, genéricas o poco persuasivas encontradas en el contenido real (máximo 5).
- "rewrittenProposals" debe incluir entre 3 y 6 propuestas de reescritura concretas, usando texto real extraído del sitio en "currentText" (o el título/meta description si no hay mejor candidato), y una versión optimizada en "optimizedText".
- Los scores deben reflejar un juicio profesional realista, no valores genéricos como 50 o 100.
- Todo el contenido de texto debe estar en español neutro, tono profesional y directo, sin relleno.
- Respondé SOLO con el JSON. Nada de explicaciones antes o después.

--- DATOS EXTRAÍDOS DEL SITIO ---
URL: ${scraped.url}
Título (<title>): ${scraped.title ?? "(ausente)"}
Meta description: ${scraped.metaDescription ?? "(ausente)"}
URL canónica: ${scraped.canonicalUrl ?? "(ausente)"}
Cantidad de palabras del cuerpo: ${scraped.wordCount}
Imágenes sin atributo alt: ${imagesWithoutAlt} de ${scraped.images.length}
Palabras clave más frecuentes: ${keywordsBlock}

Estructura de encabezados:
${headingsBlock}

Texto principal (limpio de menús, scripts y estilos, truncado):
"""
${scraped.bodyText.slice(0, 8000)}
"""
--- FIN DE LOS DATOS ---`;
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1];

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Claude no devolvió un objeto JSON reconocible.");
  }
  return trimmed.slice(start, end + 1);
}

/**
 * Envía el contenido scrapeado a Claude y devuelve un reporte validado
 * contra `seoReportSchema`. Lanza si la respuesta no cumple el esquema.
 */
export async function generateSeoReport(scraped: ScrapedContent): Promise<SeoReport> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    temperature: 0.4,
    system:
      "Sos un motor de análisis que responde EXCLUSIVAMENTE con JSON válido, sin comentarios ni texto fuera del objeto JSON.",
    messages: [{ role: "user", content: buildPrompt(scraped) }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude no devolvió contenido de texto.");
  }

  const jsonString = extractJsonBlock(textBlock.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("La respuesta de Claude no es un JSON válido.");
  }

  const result = seoReportSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `El JSON de Claude no cumple el esquema esperado: ${result.error.message}`
    );
  }

  return result.data;
}
