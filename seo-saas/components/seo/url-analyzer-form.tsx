"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { AnalyzeResponseBody } from "@/lib/types";

interface UrlAnalyzerFormProps {
  onResult: (result: AnalyzeResponseBody) => void;
  onStart?: () => void;
}

export function UrlAnalyzerForm({ onResult, onStart }: UrlAnalyzerFormProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    onStart?.();

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "No se pudo analizar la URL.");
      }

      onResult(data as AnalyzeResponseBody);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al analizar el sitio",
        description:
          error instanceof Error ? error.message : "Ocurrió un error inesperado.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          inputMode="url"
          placeholder="https://tusitio.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="h-11 pl-9 text-base"
          disabled={loading}
          required
        />
      </div>
      <Button type="submit" size="lg" disabled={loading} className="h-11">
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            Analizando...
          </>
        ) : (
          <>
            <Search />
            Analizar sitio
          </>
        )}
      </Button>
    </form>
  );
}
