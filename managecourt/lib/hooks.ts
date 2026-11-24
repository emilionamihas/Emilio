"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Reloj compartido que se actualiza cada 30 s.
 * Usar solo dentro de <StoreGate> (que no renderiza en el servidor), así la hora
 * del servidor nunca se compara con la del cliente.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Media query segura para SSR (en el servidor siempre devuelve false). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");

const noopSubscribe = () => () => {};

/** true solo en el cliente, tras la hidratación */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
