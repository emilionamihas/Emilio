import { AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreGauge } from "@/components/seo/score-gauge";
import { SeoAnalysisCard } from "@/components/seo/seo-analysis-card";
import { CopywritingAnalysisCard } from "@/components/seo/copywriting-analysis-card";
import { RewrittenProposalsCard } from "@/components/seo/rewritten-proposals-card";
import { ExportPdfButton } from "@/components/seo/export-pdf-button";
import { formatHostname } from "@/lib/utils";
import type { AnalyzeResponseBody } from "@/lib/types";

export function ReportView({ result }: { result: AnalyzeResponseBody }) {
  const { url, report } = result;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-xl">Reporte de {formatHostname(url)}</CardTitle>
            <p className="mt-1 break-all text-sm text-muted-foreground">{url}</p>
          </div>
          <ExportPdfButton url={url} report={report} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <ScoreGauge score={report.overallScore} label="Score general" />
            <ScoreGauge score={report.seoScore} label="SEO" />
            <ScoreGauge score={report.copywritingScore} label="Copywriting" />
          </div>

          <p className="mt-6 rounded-lg bg-muted p-4 text-sm leading-relaxed text-foreground">
            {report.summary}
          </p>

          {report.criticalIssues.length > 0 && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertCircle className="h-4 w-4" />
                Problemas críticos
              </h3>
              <ul className="space-y-1.5">
                {report.criticalIssues.map((issue, i) => (
                  <li key={i} className="text-sm text-foreground">
                    • {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SeoAnalysisCard analysis={report.seoAnalysis} />
        <CopywritingAnalysisCard analysis={report.copywritingAnalysis} />
      </div>

      <RewrittenProposalsCard proposals={report.rewrittenProposals} />
    </div>
  );
}
