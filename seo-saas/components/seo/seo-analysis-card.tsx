import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/seo/status-badge";
import type { SeoAnalysis } from "@/lib/types";

export function SeoAnalysisCard({ analysis }: { analysis: SeoAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis SEO On-Page</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Título (&lt;title&gt;)</span>
            <StatusBadge status={analysis.titleStatus} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Meta description</span>
            <StatusBadge status={analysis.metaDescriptionStatus} />
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-sm font-semibold text-foreground">
            Estructura de encabezados
          </h4>
          <p className="text-sm text-muted-foreground">{analysis.headingStructureFeedback}</p>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Recomendaciones</h4>
          <ul className="space-y-2">
            {analysis.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {rec}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
