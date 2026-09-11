import { jsPDF } from "jspdf";
import type { SeoReport } from "@/lib/types";

const MARGIN = 14;
const PAGE_WIDTH = 210; // A4 en mm
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;

function addWrappedText(
  doc: jsPDF,
  text: string,
  cursor: { y: number },
  options: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
) {
  const { size = 10, bold = false, color = [30, 30, 30] } = options;
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);

  const lines = doc.splitTextToSize(text, MAX_WIDTH);
  const lineHeight = size * 0.42;

  lines.forEach((line: string) => {
    if (cursor.y > 280) {
      doc.addPage();
      cursor.y = MARGIN;
    }
    doc.text(line, MARGIN, cursor.y);
    cursor.y += lineHeight;
  });
  cursor.y += 2;
}

function addSectionTitle(doc: jsPDF, title: string, cursor: { y: number }) {
  cursor.y += 3;
  if (cursor.y > 270) {
    doc.addPage();
    cursor.y = MARGIN;
  }
  doc.setDrawColor(99, 91, 255);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, cursor.y, PAGE_WIDTH - MARGIN, cursor.y);
  cursor.y += 6;
  addWrappedText(doc, title, cursor, { size: 13, bold: true, color: [76, 29, 149] });
}

/** Genera y dispara la descarga de un PDF con el reporte completo. */
export function exportReportToPdf(url: string, report: SeoReport) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cursor = { y: MARGIN };

  addWrappedText(doc, "Reporte de Diagnóstico SEO & Copywriting", cursor, {
    size: 18,
    bold: true,
    color: [17, 24, 39],
  });
  addWrappedText(doc, url, cursor, { size: 10, color: [107, 114, 128] });
  addWrappedText(
    doc,
    `Generado el ${new Date().toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`,
    cursor,
    { size: 9, color: [107, 114, 128] }
  );

  addSectionTitle(doc, "Puntajes", cursor);
  addWrappedText(doc, `General: ${report.overallScore}/100`, cursor, { bold: true });
  addWrappedText(doc, `SEO: ${report.seoScore}/100`, cursor);
  addWrappedText(doc, `Copywriting: ${report.copywritingScore}/100`, cursor);

  addSectionTitle(doc, "Resumen ejecutivo", cursor);
  addWrappedText(doc, report.summary, cursor);

  addSectionTitle(doc, "Problemas críticos", cursor);
  if (report.criticalIssues.length === 0) {
    addWrappedText(doc, "No se detectaron problemas críticos.", cursor);
  } else {
    report.criticalIssues.forEach((issue) => addWrappedText(doc, `• ${issue}`, cursor));
  }

  addSectionTitle(doc, "Análisis SEO", cursor);
  addWrappedText(doc, `Título: ${report.seoAnalysis.titleStatus}`, cursor, { bold: true });
  addWrappedText(
    doc,
    `Meta description: ${report.seoAnalysis.metaDescriptionStatus}`,
    cursor,
    { bold: true }
  );
  addWrappedText(doc, report.seoAnalysis.headingStructureFeedback, cursor);
  report.seoAnalysis.recommendations.forEach((r) => addWrappedText(doc, `• ${r}`, cursor));

  addSectionTitle(doc, "Análisis de Copywriting", cursor);
  addWrappedText(doc, `Tono: ${report.copywritingAnalysis.tone}`, cursor, { bold: true });
  addWrappedText(doc, `Claridad: ${report.copywritingAnalysis.clarity}`, cursor);
  addWrappedText(doc, `Llamado a la acción: ${report.copywritingAnalysis.callToActionFeedback}`, cursor);
  report.copywritingAnalysis.weakPhrases.forEach((wp) => {
    addWrappedText(doc, `"${wp.original}"`, cursor, { bold: true });
    addWrappedText(doc, wp.reason, cursor);
  });

  addSectionTitle(doc, "Propuestas de reescritura", cursor);
  report.rewrittenProposals.forEach((p) => {
    addWrappedText(doc, p.section, cursor, { bold: true, color: [76, 29, 149] });
    addWrappedText(doc, `Actual: ${p.currentText}`, cursor, { color: [153, 27, 27] });
    addWrappedText(doc, `Optimizado: ${p.optimizedText}`, cursor, { color: [21, 128, 61] });
    addWrappedText(doc, p.improvementReason, cursor, { size: 9, color: [107, 114, 128] });
  });

  const fileSafeHost = url.replace(/^https?:\/\//, "").replace(/[^\w.-]/g, "_");
  doc.save(`reporte-seo-${fileSafeHost}.pdf`);
}
