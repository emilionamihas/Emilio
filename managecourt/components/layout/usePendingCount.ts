"use client";

import { useStore } from "@/lib/store";

export function usePendingCount(): number {
  return useStore((s) => s.bookings.reduce((n, b) => (b.status === "pending" ? n + 1 : n), 0));
}
