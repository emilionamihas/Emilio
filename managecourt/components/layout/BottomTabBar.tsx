"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RollingCount } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/cn";
import { NAV, isActivePath } from "./nav";
import { usePendingCount } from "./usePendingCount";

export function BottomTabBar() {
  const pathname = usePathname();
  const pending = usePendingCount();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 pb-safe backdrop-blur-xl lg:hidden"
      aria-label="Navegación principal"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 px-2 pt-1.5">
        {NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <motion.li key={item.href} whileTap={{ scale: 0.86 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
              <Link
                href={item.href}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-colors",
                  active ? "text-fg" : "text-muted",
                )}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="tab-active"
                    className="absolute inset-x-1.5 inset-y-0.5 rounded-2xl bg-surface-2"
                    transition={{ type: "spring", stiffness: 480, damping: 36 }}
                  />
                )}
                <motion.span
                  className="relative"
                  animate={active ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                  {item.href === "/admin" && pending > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pending px-1 text-[10px] font-bold text-ink ring-2 ring-surface">
                      <RollingCount value={pending} />
                    </span>
                  )}
                </motion.span>
                <span className="relative">{item.label}</span>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}
