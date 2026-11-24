"use client";

import { useEffect } from "react";

/** Registra el service worker solo en producción (en desarrollo cachearía código viejo). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ARTIFACT || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
