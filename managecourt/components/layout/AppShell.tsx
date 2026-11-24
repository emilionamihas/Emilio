"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/Logo";
import { Toaster } from "@/components/ui/Toaster";
import { BottomTabBar } from "./BottomTabBar";
import { Sidebar } from "./Sidebar";
import { StoreGate } from "./StoreGate";
import { ThemeToggle } from "./ThemeToggle";
import { ServiceWorker } from "./ServiceWorker";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <Sidebar />

      {/* Cabecera móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2" aria-label="ManageCourt, inicio">
          <LogoMark size={30} />
          <span className="font-display text-[1.05rem] font-black italic tracking-tight">
            Manage<span className="text-futbol">Court</span>
          </span>
        </Link>
        <ThemeToggle className="text-muted hover:bg-surface-2" />
      </header>

      <main className="min-h-dvh pb-28 lg:pb-12 lg:pl-64">
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-10 lg:pt-8">
          <StoreGate>
            {/* Solo transición de entrada: en App Router una salida mostraría ya el contenido nuevo */}
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </StoreGate>
        </div>
      </main>

      <BottomTabBar />
      <Toaster />
      <ServiceWorker />
    </>
  );
}
