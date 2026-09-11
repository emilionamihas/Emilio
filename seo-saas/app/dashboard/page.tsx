import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSearch } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { scoreTone, formatHostname } from "@/lib/utils";
import type { SeoReport } from "@/lib/types";

interface ReportRow {
  id: string;
  url: string;
  overall_score: number;
  seo_score: number;
  copywriting_score: number;
  created_at: string;
  report: SeoReport;
}

const TONE_BADGE = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
} as const;

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: reports } = await supabase
    .from("reports")
    .select("id, url, overall_score, seo_score, copywriting_score, created_at, report")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<ReportRow[]>();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tu historial de reportes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sesión iniciada como {user.email}
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          Nuevo análisis
        </Link>
      </div>

      {!reports || reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FileSearch className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Todavía no analizaste ningún sitio. Volvé al inicio para generar tu primer reporte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {formatHostname(row.url)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{row.url}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleDateString("es-ES", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Badge variant={TONE_BADGE[scoreTone(row.overall_score)]}>
                    General {row.overall_score}
                  </Badge>
                  <Badge variant={TONE_BADGE[scoreTone(row.seo_score)]}>
                    SEO {row.seo_score}
                  </Badge>
                  <Badge variant={TONE_BADGE[scoreTone(row.copywriting_score)]}>
                    Copy {row.copywriting_score}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
