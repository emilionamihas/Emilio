"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

const COLORS = ["#10b981", "#f97316", "#c6e83a", "#2563eb", "#d4ff3a"];

/** Check animado con trazo progresivo */
export function AnimatedCheck({ color = "#10b981", size = 88 }: { color?: string; size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 88 88"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      aria-hidden="true"
    >
      <motion.circle
        cx="44"
        cy="44"
        r="38"
        fill={color}
        fillOpacity={0.14}
        stroke={color}
        strokeWidth="5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      />
      <motion.path
        d="M27 45.5l11.5 11.5L62 33"
        fill="none"
        stroke={color}
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.4, duration: 0.45, ease: [0.65, 0, 0.35, 1] }}
      />
    </motion.svg>
  );
}

/** Confeti sutil: ~28 piezas que salen del centro y caen. */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const parts = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const angle = (i / pieces) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 90 + ((i * 37) % 70);
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist * 0.7 - 30,
          rotate: ((i * 53) % 360) - 180,
          color: COLORS[i % COLORS.length],
          w: i % 2 ? 6 : 9,
          h: i % 2 ? 10 : 5,
          delay: (i % 6) * 0.02,
        };
      }),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-visible" aria-hidden="true">
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-[2px]"
          style={{ width: p.w, height: p.h, backgroundColor: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
          animate={{
            x: p.x,
            y: [0, p.y, p.y + 120],
            opacity: [1, 1, 0],
            rotate: p.rotate * 3,
            scale: 1,
          }}
          transition={{ duration: 1.6, delay: 0.25 + p.delay, ease: [0.16, 1, 0.3, 1], times: [0, 0.4, 1] }}
        />
      ))}
    </div>
  );
}
