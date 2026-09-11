import * as cheerio from "cheerio";
import type { HeadingNode, ImageAlt, ScrapedContent } from "@/lib/types";

const STOPWORDS = new Set([
  // Español
  "el", "la", "los", "las", "de", "del", "en", "y", "a", "que", "un", "una",
  "unos", "unas", "es", "son", "por", "para", "con", "su", "sus", "se", "lo",
  "al", "como", "más", "pero", "sus", "le", "ya", "o", "este", "esta", "estos",
  "estas", "nos", "sin", "sobre", "también", "muy", "hay", "fue", "ser", "tu",
  // Inglés
  "the", "and", "for", "with", "that", "this", "from", "your", "are", "was",
  "have", "has", "not", "you", "all", "can", "will", "our", "but", "its",
]);

/** Etiquetas cuyo contenido nunca aporta al texto principal de la página. */
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "form",
  "iframe",
  "[role=navigation]",
  "[aria-hidden=true]",
];

function isValidHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function extractTopKeywords(text: string, limit = 15) {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos para contar variantes juntas
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const total = words.length || 1;
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({
      word,
      count,
      density: Number(((count / total) * 100).toFixed(2)),
    }));
}

/**
 * Descarga y analiza el HTML de una URL: metadatos, encabezados,
 * texto principal (sin nav/scripts/estilos) e imágenes sin `alt`.
 */
export async function scrapeUrl(rawUrl: string): Promise<ScrapedContent> {
  const url = normalizeUrl(rawUrl);
  if (!isValidHttpUrl(url)) {
    throw new Error("La URL ingresada no es válida.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let html: string;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SEOCopyOptimizerBot/1.0; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(
        `El sitio respondió con estado ${response.status} (${response.statusText}).`
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error("La URL no devuelve contenido HTML analizable.");
    }

    html = await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("El sitio tardó demasiado en responder (timeout de 15s).");
    }
    throw error instanceof Error
      ? error
      : new Error("No se pudo descargar el contenido de la URL.");
  } finally {
    clearTimeout(timeout);
  }

  const $ = cheerio.load(html);

  const title = $("head > title").first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;
  const canonicalUrl = $('link[rel="canonical"]').attr("href")?.trim() || null;

  const headings: HeadingNode[] = [];
  $("h1, h2, h3").each((_, el) => {
    const level = $(el).prop("tagName")?.toLowerCase() as HeadingNode["level"];
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text) headings.push({ level, text });
  });

  const images: ImageAlt[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
    const alt = $(el).attr("alt");
    if (src) {
      images.push({ src, alt: alt && alt.trim().length > 0 ? alt.trim() : null });
    }
  });

  // Clona el DOM y limpia ruido antes de extraer el texto "de lectura".
  const $body = cheerio.load(html);
  NOISE_SELECTORS.forEach((selector) => $body(selector).remove());
  const bodyText = $body("body")
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const wordCount = bodyText.length > 0 ? bodyText.split(/\s+/).length : 0;
  const topKeywords = extractTopKeywords(bodyText);

  return {
    url,
    title,
    metaDescription,
    canonicalUrl,
    headings,
    bodyText: bodyText.slice(0, 12_000), // margen de tokens para el prompt
    images,
    wordCount,
    topKeywords,
  };
}
