"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useIsDesktop, useMounted } from "@/lib/hooks";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Banda de color superior (color del deporte) */
  accent?: string;
  className?: string;
}

/**
 * Drawer deslizable desde abajo en móvil (arrastrar para cerrar)
 * y modal centrado en escritorio.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, accent, className }: SheetProps) {
  const isDesktop = useIsDesktop();
  const titleId = useId();
  const mounted = useMounted();
  const dragControls = useDragControls();
  const startDrag = (e: React.PointerEvent) => {
    if (!isDesktop) dragControls.start(e);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
          <motion.div
            className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-2xl",
              "rounded-t-[1.75rem] lg:max-h-[86vh] lg:max-w-xl lg:rounded-[1.75rem]",
              className,
            )}
            initial={isDesktop ? { opacity: 0, scale: 0.94, y: 16 } : { y: "100%" }}
            animate={isDesktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={isDesktop ? { opacity: 0, scale: 0.96, y: 10 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag={isDesktop ? false : "y"}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            {accent && <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: accent }} />}
            {!isDesktop && (
              <div
                className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5"
                aria-hidden="true"
                onPointerDown={startDrag}
              >
                <span className="h-1.5 w-11 rounded-full bg-line" />
              </div>
            )}
            {(title || subtitle) && (
              <div
                className="flex shrink-0 touch-none items-start justify-between gap-4 px-5 pb-3 pt-2 lg:touch-auto lg:px-6 lg:pt-5"
                onPointerDown={startDrag}
              >
                <div className="min-w-0">
                  {title && (
                    <h2 id={titleId} className="font-display text-xl font-black tracking-tight">
                      {title}
                    </h2>
                  )}
                  {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
                </div>
                <button
                  onClick={onClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition hover:text-fg"
                  aria-label="Cerrar"
                >
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 lg:px-6">
              {children}
            </div>
            {footer && <div className="shrink-0 border-t border-line bg-surface px-5 py-4 pb-safe lg:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
