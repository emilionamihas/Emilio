"use client";

import { motion } from "framer-motion";

const STRIPES = [
  { color: "#10b981", w: 12, x: 8 },
  { color: "#f97316", w: 12, x: 22 },
  { color: "#c6e83a", w: 9, x: 36 },
  { color: "#2563eb", w: 9, x: 47 },
];

/** Intro de marca: el logo se arma, la pelota rebota y entran las franjas de cada deporte. */
export function Splash() {
  return (
    <motion.div
      key="splash"
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-ink text-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.06, filter: "blur(6px)" }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      aria-label="Cargando ManageCourt"
      role="status"
    >
      <div className="court-lines absolute inset-0 opacity-60" aria-hidden="true" />
      <motion.svg
        width={112}
        height={112}
        viewBox="0 0 64 64"
        className="relative"
        initial={{ scale: 0.4, rotate: -14, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 14 }}
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="16" fill="#151d36" />
        <motion.rect
          x="10" y="12" width="44" height="30" rx="4" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.5"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.15 }}
        />
        <motion.line
          x1="32" y1="12" x2="32" y2="42" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.5"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, delay: 0.5 }}
        />
        <motion.circle
          cx="32" cy="27" r="6" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.5"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.6 }}
        />
        {STRIPES.map((s, i) => (
          <motion.rect
            key={s.color}
            x={s.x} y="50" width={s.w} height="5" rx="2.5" fill={s.color}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            style={{ transformOrigin: `${s.x}px 52px` }}
            transition={{ delay: 0.55 + i * 0.08, type: "spring", stiffness: 300, damping: 20 }}
          />
        ))}
        {/* Pelota: cae, rebota y se acomoda en su lugar */}
        <motion.circle
          r="5.5"
          fill="#d4ff3a"
          initial={{ cx: 10, cy: -8 }}
          animate={{ cx: [10, 22, 34, 46], cy: [-8, 36, 14, 20] }}
          transition={{ duration: 0.9, delay: 0.25, ease: "easeOut", times: [0, 0.45, 0.75, 1] }}
        />
      </motion.svg>

      <div className="relative mt-6 flex overflow-hidden font-display text-3xl font-black italic tracking-tight">
        {"ManageCourt".split("").map((ch, i) => (
          <motion.span
            key={i}
            className={i >= 6 ? "text-futbol" : undefined}
            initial={{ y: "110%" }}
            animate={{ y: "0%" }}
            transition={{ delay: 0.45 + i * 0.035, type: "spring", stiffness: 380, damping: 26 }}
          >
            {ch}
          </motion.span>
        ))}
      </div>
      <motion.p
        className="relative mt-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9 }}
      >
        Fútbol · Básquet · Tenis · Pádel
      </motion.p>
    </motion.div>
  );
}
