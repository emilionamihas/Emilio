"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, Hourglass, Info } from "lucide-react";
import { useToast, type ToastTone } from "@/lib/toast";

const TONE: Record<ToastTone, { icon: React.ReactNode; color: string }> = {
  success: { icon: <CircleCheck size={18} />, color: "#10b981" },
  error: { icon: <CircleAlert size={18} />, color: "#e11d48" },
  info: { icon: <Info size={18} />, color: "#2563eb" },
  pending: { icon: <Hourglass size={18} />, color: "#f59e0b" },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-3 z-[80] flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:left-auto lg:right-6 lg:top-auto lg:items-end"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3.5 text-left shadow-xl backdrop-blur"
          >
            <span className="mt-0.5" style={{ color: TONE[t.tone].color }}>
              {TONE[t.tone].icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t.title}</span>
              {t.description && <span className="mt-0.5 block text-xs text-muted">{t.description}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
