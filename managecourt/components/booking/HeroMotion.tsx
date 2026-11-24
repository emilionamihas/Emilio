"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { SportIcon } from "@/components/ui/SportIcon";
import { SPORTS, SPORT_ORDER } from "@/lib/sports";

/** Palabra del titular que rota entre deportes, con el color de cada uno. */
export function RotatingSport() {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((n) => (n + 1) % SPORT_ORDER.length), 2200);
    return () => clearInterval(t);
  }, [reduce]);
  const sport = SPORTS[SPORT_ORDER[i]];
  const word = sport.label.toLowerCase();

  return (
    <span className="relative inline-grid overflow-hidden pb-1 align-bottom" aria-live="off">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={sport.id}
          className="col-start-1 row-start-1 inline-flex"
          style={{ color: sport.hex }}
          initial={{ y: "100%", rotateX: -70, opacity: 0 }}
          animate={{ y: "0%", rotateX: 0, opacity: 1 }}
          exit={{ y: "-100%", rotateX: 70, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
        >
          {word.split("").map((ch, k) => (
            <motion.span
              key={k}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.03 * k, type: "spring", stiffness: 420, damping: 24 }}
            >
              {ch}
            </motion.span>
          ))}
          <span>.</span>
        </motion.span>
      </AnimatePresence>
      {/* Subrayado que se estira con cada cambio */}
      <motion.span
        key={`bar-${sport.id}`}
        className="absolute bottom-0 left-0 h-1.5 rounded-full"
        style={{ backgroundColor: sport.hex }}
        initial={{ width: "0%" }}
        animate={{ width: "100%" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </span>
  );
}

/** Íconos deportivos que flotan y una pelota que rebota a lo largo del hero. */
export function HeroAmbient() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const floaters = [
    { sport: "futbol" as const, className: "right-[8%] top-[14%]", size: 44, d: 5.5 },
    { sport: "basquet" as const, className: "right-[30%] top-[8%] hidden sm:block", size: 34, d: 6.5 },
    { sport: "tenis" as const, className: "right-[20%] bottom-[16%] hidden lg:block", size: 30, d: 4.8 },
    { sport: "padel" as const, className: "right-[42%] bottom-[10%] hidden lg:block", size: 38, d: 7 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {floaters.map((f, i) => (
        <motion.div
          key={f.sport}
          className={`absolute ${f.className}`}
          style={{ color: SPORTS[f.sport].hex }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 0.28, scale: 1, y: [0, -14, 0], rotate: [0, i % 2 ? 18 : -18, 0] }}
          transition={{
            opacity: { delay: 0.3 + i * 0.12 },
            scale: { delay: 0.3 + i * 0.12, type: "spring" },
            y: { duration: f.d, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: f.d * 1.4, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          <SportIcon sport={f.sport} size={f.size} />
        </motion.div>
      ))}

      {/* Pelota que cruza el hero rebotando sobre la “línea de fondo” */}
      <div className="absolute inset-x-6 bottom-3 h-px bg-white/10" />
      <motion.div
        className="absolute bottom-3"
        initial={{ left: "-4%" }}
        animate={{ left: ["-4%", "104%"] }}
        transition={{ duration: 7, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
      >
        <motion.span
          className="block h-3.5 w-3.5 rounded-full bg-volt shadow-[0_0_18px_rgba(212,255,58,0.7)]"
          animate={{ y: [0, -46, 0, -28, 0, -14, 0], scaleY: [0.8, 1, 0.8, 1, 0.85, 1, 0.9] }}
          transition={{ duration: 7, repeat: Infinity, repeatDelay: 1.5, ease: "easeOut", times: [0, 0.15, 0.32, 0.47, 0.62, 0.74, 0.86] }}
        />
      </motion.div>
    </div>
  );
}
