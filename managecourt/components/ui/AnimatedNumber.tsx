"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

interface Props {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

/** Número que interpola suavemente al cambiar (contadores, métricas). */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)), className }: Props) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Contador tipo “odómetro” para badges: el dígito entra desde arriba */
export function RollingCount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-grid", overflow: "hidden" }}>
      <motion.span
        key={value}
        initial={{ y: "-100%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 26 }}
        style={{ gridArea: "1 / 1" }}
      >
        {value}
      </motion.span>
    </span>
  );
}
