"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "success" | "danger" | "whatsapp";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white dark:bg-white dark:text-ink shadow-[0_8px_20px_-10px_rgb(11_16_32/0.6)]",
  secondary: "bg-surface-2 text-fg border border-line",
  ghost: "text-fg hover:bg-surface-2",
  success: "bg-futbol text-white shadow-[0_8px_20px_-10px_rgb(16_185_129/0.8)]",
  danger: "bg-transparent text-blocked border border-blocked/40 hover:bg-blocked/10",
  whatsapp: "bg-[#25d366] text-[#073b1d]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-xl",
  md: "h-11 px-4 text-sm gap-2 rounded-2xl",
  lg: "h-13 px-6 text-base gap-2 rounded-2xl",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  children?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-padel focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
