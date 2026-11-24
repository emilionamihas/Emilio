"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { RollingCount } from "@/components/ui/AnimatedNumber";
import { cn } from "@/lib/cn";
import { usePendingCount } from "./usePendingCount";
import { NAV, isActivePath } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

export function Sidebar() {
  const pathname = usePathname();
  const pending = usePendingCount();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
      <div className="px-6 pb-6 pt-7">
        <Link href="/" aria-label="ManageCourt, inicio">
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 space-y-6 px-3">
        {(["cliente", "gestor"] as const).map((group) => (
          <div key={group}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              {group === "cliente" ? "Jugadores" : "Administración"}
            </p>
            <ul className="space-y-1">
              {NAV.filter((n) => n.group === group).map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-colors",
                        active ? "text-white dark:text-ink" : "text-muted hover:text-fg",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute inset-0 rounded-2xl bg-ink dark:bg-white"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <Icon size={19} className="relative" />
                      <span className="relative flex-1">{item.label}</span>
                      {item.href === "/admin" && pending > 0 && (
                        <span className="relative grid h-6 min-w-6 place-items-center rounded-full bg-pending px-1.5 text-xs font-bold text-ink">
                          <RollingCount value={pending} />
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="m-3 space-y-3 rounded-3xl bg-ink p-4 text-white court-lines">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Horario</p>
        <p className="font-display text-lg font-black leading-tight">08:00 – 00:00</p>
        <p className="text-xs text-white/60">Iluminación y tarifa nocturna desde las 19:00</p>
        <ThemeToggle className="w-full justify-center bg-white/10 text-white hover:bg-white/15" withLabel />
      </div>
    </aside>
  );
}
