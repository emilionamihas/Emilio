import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RewrittenProposal } from "@/lib/types";

export function RewrittenProposalsCard({ proposals }: { proposals: RewrittenProposal[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Propuestas de reescritura generadas por IA</CardTitle>
        <CardDescription>
          Textos reescritos automáticamente a partir del contenido real del sitio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {proposals.map((proposal, i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <Badge variant="secondary" className="mb-3">
              {proposal.section}
            </Badge>

            <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-destructive">Actual</p>
                <p className="text-sm text-foreground">{proposal.currentText}</p>
              </div>

              <ArrowRight className="mt-3 hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />

              <div className="rounded-md border border-success/30 bg-success/5 p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-success">Optimizado</p>
                <p className="text-sm text-foreground">{proposal.optimizedText}</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{proposal.improvementReason}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
