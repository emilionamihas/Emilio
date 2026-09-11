import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { scrapeUrl } from "@/lib/scraper";
import { generateSeoReport } from "@/lib/anthropic";
import type { AnalyzeResponseBody } from "@/lib/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  url: z.string().min(3, "Ingresá una URL."),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la solicitud debe ser JSON válido." },
      { status: 400 }
    );
  }

  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues[0]?.message ?? "URL inválida." },
      { status: 400 }
    );
  }

  try {
    const scraped = await scrapeUrl(parsedBody.data.url);
    const report = await generateSeoReport(scraped);

    // Persistimos el reporte si hay un usuario autenticado; si Supabase no
    // está configurado o falla, no bloqueamos la respuesta al usuario.
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("reports").insert({
          user_id: user.id,
          url: scraped.url,
          overall_score: report.overallScore,
          seo_score: report.seoScore,
          copywriting_score: report.copywritingScore,
          report,
        });
      }
    } catch (persistError) {
      console.error("[analyze] No se pudo guardar el reporte en Supabase:", persistError);
    }

    const responseBody: AnalyzeResponseBody = {
      url: scraped.url,
      scraped,
      report,
    };

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    console.error("[analyze] Error analizando la URL:", error);
    const message =
      error instanceof Error ? error.message : "Ocurrió un error inesperado.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
