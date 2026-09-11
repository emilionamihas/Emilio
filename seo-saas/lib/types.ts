import { z } from "zod";

/**
 * Esquema estricto que Claude debe devolver al analizar una URL.
 * Se usa tanto para construir el prompt (le mostramos el JSON esperado)
 * como para validar la respuesta antes de confiar en ella.
 */
export const statusEnum = z.enum(["optimal", "warning", "critical"]);
export type Status = z.infer<typeof statusEnum>;

export const weakPhraseSchema = z.object({
  original: z.string(),
  reason: z.string(),
});

export const rewrittenProposalSchema = z.object({
  section: z.string(),
  currentText: z.string(),
  optimizedText: z.string(),
  improvementReason: z.string(),
});

export const seoAnalysisSchema = z.object({
  titleStatus: statusEnum,
  metaDescriptionStatus: statusEnum,
  headingStructureFeedback: z.string(),
  recommendations: z.array(z.string()),
});

export const copywritingAnalysisSchema = z.object({
  tone: z.string(),
  clarity: z.string(),
  callToActionFeedback: z.string(),
  weakPhrases: z.array(weakPhraseSchema),
});

export const seoReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  seoScore: z.number().min(0).max(100),
  copywritingScore: z.number().min(0).max(100),
  summary: z.string(),
  criticalIssues: z.array(z.string()),
  seoAnalysis: seoAnalysisSchema,
  copywritingAnalysis: copywritingAnalysisSchema,
  rewrittenProposals: z.array(rewrittenProposalSchema),
});

export type SeoReport = z.infer<typeof seoReportSchema>;
export type SeoAnalysis = z.infer<typeof seoAnalysisSchema>;
export type CopywritingAnalysis = z.infer<typeof copywritingAnalysisSchema>;
export type RewrittenProposal = z.infer<typeof rewrittenProposalSchema>;
export type WeakPhrase = z.infer<typeof weakPhraseSchema>;

/** Resultado crudo que produce el scraper antes de pasar por Claude. */
export interface HeadingNode {
  level: "h1" | "h2" | "h3";
  text: string;
}

export interface ImageAlt {
  src: string;
  alt: string | null;
}

export interface ScrapedContent {
  url: string;
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: HeadingNode[];
  bodyText: string;
  images: ImageAlt[];
  wordCount: number;
  topKeywords: { word: string; count: number; density: number }[];
}

export interface AnalyzeRequestBody {
  url: string;
}

export interface AnalyzeResponseBody {
  url: string;
  scraped: ScrapedContent;
  report: SeoReport;
}
