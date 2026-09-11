import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Copy Optimizer | Diagnóstico SEO & Copywriting con IA",
  description:
    "Analizá cualquier sitio web y obtené un diagnóstico de SEO On-Page, copywriting y propuestas de reescritura generadas por IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
