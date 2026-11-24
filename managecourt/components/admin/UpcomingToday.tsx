"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { formatRange, todayISO } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { formatMoney } from "@/lib/pricing";
import { amountDue } from "@/lib/slots";
import { PAYMENT_STATUS_LABEL, SPORTS } from "@/lib/sports";
import { useStore } from "@/lib/store";
import type { PaymentStatus } from "@/lib/types";

export const PAY_CHIP: Record<PaymentStatus, string> = {
  paid: "bg-futbol/15 text-futbol-deep dark:text-futbol",
  deposit: "bg-padel/15 text-padel-deep dark:text-padel",
  unpaid: "bg-pending/15 text-[#b45309] dark:text-pending",
};

/** Lista de turnos confirmados del día, con estado de cobro */
export function UpcomingToday({ date }: { date: string }) {
  const now = useNow();
  const courts = useStore((s) => s.courts);
  const bookings = useStore((s) => s.bookings);
  const isToday = date === todayISO();

  const list = useMemo(
    () =>
      bookings
        .filter((b) => b.date === date && b.status === "confirmed" && (!isToday || b.endHour > now.getHours()))
        .sort((a, b) => a.startHour - b.startHour)
        .slice(0, 10),
    [bookings, date, isToday, now],
  );

  return (
    <section className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="font-display text-lg font-black tracking-tight">{isToday ? "Próximos turnos" : "Turnos del día"}</h3>
      {list.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">Sin turnos confirmados.</p>
      ) : (
        <motion.ul
          className="mt-3 divide-y divide-line"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.04 } } }}
        >
          {list.map((b) => {
            const court = courts.find((c) => c.id === b.courtId);
            if (!court) return null;
            const t = SPORTS[court.sport];
            const live = isToday && now.getHours() >= b.startHour && now.getHours() < b.endHour;
            return (
              <motion.li
                key={b.id}
                variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0 } }}
                className="flex items-center gap-3 py-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: t.hex, color: t.onHex }}>
                  <SportIcon sport={court.sport} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {b.customerName}
                    {live && <span className="ml-2 rounded-full bg-futbol px-1.5 py-0.5 text-[10px] font-bold text-white">EN JUEGO</span>}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {formatRange(b.startHour, b.endHour)} · {court.name}
                  </p>
                </div>
                <div className="text-right">
                  <span className={cn("rounded-lg px-2 py-0.5 text-[10px] font-bold", PAY_CHIP[b.paymentStatus])}>
                    {PAYMENT_STATUS_LABEL[b.paymentStatus]}
                  </span>
                  {amountDue(b) > 0 && <p className="mt-0.5 text-[11px] text-muted">Saldo {formatMoney(amountDue(b))}</p>}
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </section>
  );
}
