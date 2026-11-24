"use client";

import { useEffect, useRef } from "react";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { STORE_STORAGE_KEY, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

/**
 * 1. Hidrata el store desde localStorage después del montaje (sin desajustes SSR).
 * 2. Carga datos de prueba la primera vez.
 * 3. Sincroniza pestañas: una solicitud hecha en la vista cliente aparece al instante
 *    en el panel abierto en otra pestaña. Con Supabase, esto lo reemplaza Realtime.
 */
export function StoreGate({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  const knownPending = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(useStore.persist.rehydrate()).then(() => {
      if (cancelled) return;
      useStore.getState().seedIfEmpty();
      knownPending.current = new Set(
        useStore.getState().bookings.filter((b) => b.status === "pending").map((b) => b.id),
      );
      useStore.getState().setHydrated();
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORE_STORAGE_KEY) return;
      Promise.resolve(useStore.persist.rehydrate()).then(() => {
        const state = useStore.getState();
        const pending = state.bookings.filter((b) => b.status === "pending");
        const known = knownPending.current ?? new Set<string>();
        const fresh = pending.filter((b) => !known.has(b.id));
        for (const b of fresh) {
          const court = state.courts.find((c) => c.id === b.courtId);
          toast({
            tone: "pending",
            title: "Nueva solicitud de reserva",
            description: `${b.customerName} · ${court?.name ?? ""}`,
          });
        }
        knownPending.current = new Set(pending.map((b) => b.id));
      });
    };
    window.addEventListener("storage", onStorage);

    // Mantiene el registro de pendientes conocidos para cambios hechos en esta pestaña
    const unsub = useStore.subscribe((s) => {
      if (!knownPending.current) return;
      for (const b of s.bookings) if (b.status === "pending") knownPending.current.add(b.id);
    });

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      unsub();
    };
  }, []);

  if (!hydrated) return <PageSkeleton />;
  return <>{children}</>;
}
