import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CopywritingAnalysis } from "@/lib/types";

export function CopywritingAnalysisCard({ analysis }: { analysis: CopywritingAnalysis }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Análisis de Copywriting</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Tono</h4>
            <p className="mt-1 text-sm">{analysis.tone}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Claridad</h4>
            <p className="mt-1 text-sm">{analysis.clarity}</p>
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-sm font-semibold text-foreground">Llamado a la acción</h4>
          <p className="text-sm text-muted-foreground">{analysis.callToActionFeedback}</p>
        </div>

        {analysis.weakPhrases.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-foreground">Frases débiles detectadas</h4>
            <ul className="space-y-3">
              {analysis.weakPhrases.map((phrase, i) => (
                <li key={i} className="rounded-lg bg-muted p-3">
                  <p className="text-sm font-medium italic text-foreground">
                    &ldquo;{phrase.original}&rdquo;
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{phrase.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
