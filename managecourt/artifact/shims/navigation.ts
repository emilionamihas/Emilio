/**
 * Sustituto de next/navigation para el build de una sola página.
 * El visor solo admite anclas simples (#nombre), así que cada ruta tiene su nombre.
 */
import { useSyncExternalStore } from "react";

const ROUTE_TO_HASH: Record<string, string> = {
  "/": "reservar",
  "/mapa": "mapa",
  "/pases": "pases",
  "/admin": "gestion",
  "/admin/agenda": "agenda",
};
const HASH_TO_ROUTE = Object.fromEntries(Object.entries(ROUTE_TO_HASH).map(([r, h]) => [h, r]));

export function hrefToHash(href: string): string {
  return `#${ROUTE_TO_HASH[href] ?? "reservar"}`;
}

function currentPath(): string {
  const h = typeof location === "undefined" ? "" : location.hash.replace(/^#/, "");
  return HASH_TO_ROUTE[h] ?? "/";
}

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
if (typeof window !== "undefined") window.addEventListener("hashchange", emit);

export function navigate(href: string) {
  const hash = hrefToHash(href);
  if (location.hash !== hash) location.hash = hash;
  emit();
  window.scrollTo({ top: 0 });
}

export function usePathname(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    currentPath,
    () => "/",
  );
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => history.back() };
}
