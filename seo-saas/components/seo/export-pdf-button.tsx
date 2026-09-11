"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportReportToPdf } from "@/lib/pdf";
import type { SeoReport } from "@/lib/types";

export function ExportPdfButton({ url, report }: { url: string; report: SeoReport }) {
  return (
    <Button variant="outline" onClick={() => exportReportToPdf(url, report)}>
      <Download />
      Descargar PDF
    </Button>
  );
}
