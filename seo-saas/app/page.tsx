"use client";

import { useState } from "react";
import { Sparkles, Gauge, PenLine, Wand2 } from "lucide-react";
import { UrlAnalyzerForm } from "@/components/seo/url-analyzer-form";
import { ReportView } from "@/components/seo/report-view";
import { ReportSkeleton } from "@/components/seo/report-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import type { AnalyzeResponseBody } from "@/lib/types";

const FEATURES = [
  {
    icon: Gauge,
    title: "Diagnóstico SEO On-Page",
    description: "Título, meta description, encabezados e imágenes, evaluados en segundos.",
  },
  {
    icon: PenLine,
    title: "Calidad del copywriting",
    description: "Tono, claridad y fuerza del llamado a la acción de tu contenido.",
  },
  {
    icon: Wand2,
    title: "Reescrituras con IA",
    description: "Propuestas concretas de textos optimizados, listas para usar.",
  },
];

export default function HomePage() {
  const [result, setResult] = useState<AnalyzeResponseBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Potenciado por Claude (Anthropic)
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Diagnóstico SEO y Copywriting con IA
        </h1>
        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          Pegá la URL de cualquier sitio y obtené un reporte visual con problemas críticos,
          recomendaciones y textos reescritos, en menos de un minuto.
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-2xl">
        <UrlAnalyzerForm
          onStart={() => {
            setLoading(true);
            setResult(null);
            setErrorMessage(null);
          }}
          onResult={(data) => {
            setResult(data);
            setLoading(false);
          }}
          onError={(message) => {
            setLoading(false);
            setErrorMessage(message);
          }}
        />
      </div>

      {errorMessage && !loading && (
        <div className="mx-auto mt-6 max-w-2xl rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {!result && !loading && !errorMessage && (
        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="pt-6">
                <feature.icon className="mb-3 h-6 w-6 text-primary" />
                <h3 className="mb-1 text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading && (
        <div className="mt-10">
          <ReportSkeleton />
        </div>
      )}

      {result && !loading && (
        <div className="mt-10">
          <ReportView result={result} />
        </div>
      )}
    </main>
  );
}
