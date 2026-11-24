"use client";

import { motion } from "framer-motion";
import { Banknote, CircleDollarSign, Flag, Hourglass, Lock, Plus, Wrench } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DateStrip } from "@/components/booking/DateStrip";
import { SportTabs, type SportFilter } from "@/components/booking/SportTabs";
import { Button } from "@/components/ui/Button";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { HOURS, OPEN_HOUR, formatHour, friendlyDate, isPastSlot, todayISO } from "@/lib/dates";
import { useMediaQuery, useNow } from "@/lib/hooks";
import { NIGHT_FROM_HOUR, formatMoneyShort } from "@/lib/pricing";
import { isActive } from "@/lib/slots";
import { PAYMENT_STATUS_LABEL, SPORTS } from "@/lib/sports";
import { useStore } from "@/lib/store";
import type { Block, Booking, Court } from "@/lib/types";
import { AgendaSheet, type AgendaTarget } from "./AgendaSheet";

const COL_W = 84;
const ROW_H = 64;
const NAME_W_DESKTOP = 168;
const NAME_W_MOBILE = 112;

type Cell =
  | { type: "booking"; start: number; span: number; booking: Booking }
  | { type: "block"; start: number; span: number; block: Block }
  | { type: "empty"; start: number; span: 1 };

function buildRow(court: Court, date: string, bookings: Booking[], blocks: Block[]): Cell[] {
  const cells: Cell[] = [];
  const bks = bookings.filter((b) => b.courtId === court.id && b.date === date && isActive(b));
  const blk = blocks.filter((k) => k.courtId === court.id && k.date === date);
  let h = OPEN_HOUR;
  while (h < 24) {
    const k = blk.find((x) => x.startHour <= h && h < x.endHour);
    if (k) {
      const span = Math.min(k.endHour, 24) - h;
      cells.push({ type: "block", start: h, span, block: k });
      h += span;
      continue;
    }
    const b = bks.find((x) => x.startHour <= h && h < x.endHour);
    if (b) {
      const span = b.endHour - h;
      cells.push({ type: "booking", start: h, span, booking: b });
      h += span;
      continue;
    }
    cells.push({ type: "empty", start: h, span: 1 });
    h++;
  }
  return cells;
}

export function MasterAgenda() {
  const now = useNow();
  const today = todayISO();
  const courts = useStore((s) => s.courts);
  const bookings = useStore((s) => s.bookings);
  const blocks = useStore((s) => s.blocks);
  const [date, setDate] = useState(today);
  const [sport, setSport] = useState<SportFilter>("all");
  const [target, setTarget] = useState<AgendaTarget | null>(null);
  const NAME_W = useMediaQuery("(min-width: 640px)") ? NAME_W_DESKTOP : NAME_W_MOBILE;
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => courts.filter((c) => sport === "all" || c.sport === sport), [courts, sport]);
  const rows = useMemo(
    () => visible.map((c) => ({ court: c, cells: buildRow(c, date, bookings, blocks) })),
    [visible, date, bookings, blocks],
  );
  const isToday = date === today;
  const nowOffset = isToday ? (now.getHours() - OPEN_HOUR + now.getMinutes() / 60) * COL_W : -1;
  const totalW = NAME_W + HOURS.length * COL_W;

  // Al abrir el día de hoy, desplaza la grilla para que la hora actual quede a la vista
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = isToday ? Math.max(0, nowOffset - COL_W * 1.5) : (18 - OPEN_HOUR) * COL_W - COL_W * 4;
    el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const dayStats = useMemo(() => {
    const day = bookings.filter((b) => b.date === date && visible.some((c) => c.id === b.courtId));
    return {
      confirmed: day.filter((b) => b.status === "confirmed").length,
      pending: day.filter((b) => b.status === "pending").length,
      blocks: blocks.filter((k) => k.date === date && visible.some((c) => c.id === k.courtId)).length,
    };
  }, [bookings, blocks, date, visible]);

  const firstCourt = visible[0] ?? courts[0];
  const defaultHour = isToday ? Math.min(Math.max(now.getHours() + 1, OPEN_HOUR), 23) : 18;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Panel del gestor</p>
          <h1 className="font-display text-3xl font-black tracking-tight">Agenda maestra</h1>
          <p className="text-sm text-muted">
            {capitalize(friendlyDate(date, today))} · {dayStats.confirmed} reservas · {dayStats.pending} pendientes · {dayStats.blocks} bloqueos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setTarget({ kind: "create", courtId: firstCourt.id, date, hour: defaultHour, mode: "block" })}>
            <Wrench size={16} /> Bloquear
          </Button>
          <Button onClick={() => setTarget({ kind: "create", courtId: firstCourt.id, date, hour: defaultHour })}>
            <Plus size={17} /> Nueva reserva
          </Button>
        </div>
      </header>

      <div className="space-y-3">
        <SportTabs value={sport} onChange={setSport} id="agenda-sport" />
        <DateStrip value={date} onChange={setDate} today={today} back={7} days={21} id="agenda-date" />
      </div>

      {/* Leyenda */}
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-futbol" /> Confirmada (color del deporte)</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-pending" /> Pendiente de aprobación</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-blocked/70" /> Mantenimiento / Torneo</li>
        <li className="flex items-center gap-1.5"><Banknote size={13} /> Pagado · <CircleDollarSign size={13} /> Seña · <Hourglass size={13} /> Pendiente en cancha</li>
      </ul>

      {/* Grilla multi-cancha */}
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div ref={scrollRef} className="no-scrollbar overflow-x-auto">
          <div className="relative" style={{ width: totalW }}>
            {/* Encabezado de horas */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
              <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted" style={{ width: NAME_W }}>
                Cancha
              </div>
              {HOURS.map((h) => (
                <div
                  key={h}
                  className={cn(
                    "shrink-0 border-r border-line/60 py-3 text-center text-xs font-bold tabular-nums",
                    isToday && h === now.getHours() ? "text-futbol" : "text-muted",
                    h >= NIGHT_FROM_HOUR && "bg-ink/[0.03] dark:bg-white/[0.03]",
                  )}
                  style={{ width: COL_W }}
                >
                  {formatHour(h)}
                </div>
              ))}
            </div>

            {/* Filas */}
            <motion.div
              key={`${date}-${sport}`}
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.035 } } }}
            >
              {rows.map(({ court, cells }) => {
                const t = SPORTS[court.sport];
                return (
                  <motion.div
                    key={court.id}
                    variants={{ hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0 } }}
                    className="flex border-b border-line last:border-b-0"
                    style={{ height: ROW_H }}
                  >
                    <div
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-line bg-surface px-3"
                      style={{ width: NAME_W, boxShadow: `inset 4px 0 0 ${t.hex}` }}
                    >
                      <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-lg sm:grid" style={{ backgroundColor: t.hex, color: t.onHex }}>
                        <SportIcon sport={court.sport} size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-bold sm:text-sm">{court.name}</span>
                        <span className="hidden truncate text-[11px] text-muted sm:block">{court.format}</span>
                      </span>
                    </div>

                    {cells.map((cell) => {
                      const width = cell.span * COL_W;
                      if (cell.type === "empty") {
                        const past = isPastSlot(date, cell.start, now);
                        return (
                          <button
                            key={`e-${cell.start}`}
                            type="button"
                            onClick={() => setTarget({ kind: "create", courtId: court.id, date, hour: cell.start })}
                            className={cn(
                              "group relative shrink-0 border-r border-line/50 transition-colors",
                              past ? "bg-surface-2/50" : "hover:bg-surface-2",
                              cell.start >= NIGHT_FROM_HOUR && !past && "bg-ink/[0.02] dark:bg-white/[0.02]",
                            )}
                            style={{ width }}
                            aria-label={`Crear en ${court.name} a las ${formatHour(cell.start)}`}
                          >
                            <Plus size={16} className="mx-auto text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        );
                      }
                      if (cell.type === "block") {
                        const k = cell.block;
                        return (
                          <div key={k.id + cell.start} className="shrink-0 p-1" style={{ width }}>
                            <motion.button
                              layout
                              whileHover={{ y: -2 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setTarget({ kind: "block", id: k.id })}
                              className="flex h-full w-full items-center gap-2 overflow-hidden rounded-xl border border-blocked/40 px-2.5 text-left text-xs font-bold text-blocked"
                              style={{ backgroundImage: "repeating-linear-gradient(135deg, rgb(225 29 72 / 0.12) 0 8px, transparent 8px 16px)" }}
                            >
                              {k.reason === "tournament" ? <Flag size={14} className="shrink-0" /> : <Wrench size={14} className="shrink-0" />}
                              <span className="truncate">{k.note}</span>
                            </motion.button>
                          </div>
                        );
                      }
                      const b = cell.booking;
                      const pending = b.status === "pending";
                      return (
                        <div key={b.id} className="shrink-0 p-1" style={{ width }}>
                          <motion.button
                            layoutId={`agenda-${b.id}`}
                            whileHover={{ y: -2, boxShadow: "0 10px 24px -12px rgb(11 16 32 / 0.5)" }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setTarget({ kind: "booking", id: b.id })}
                            className={cn(
                              "relative flex h-full w-full flex-col justify-center overflow-hidden rounded-xl px-2.5 text-left",
                              pending ? "border-2 border-dashed border-pending bg-pending/15 text-fg" : "",
                            )}
                            style={pending ? undefined : { backgroundColor: t.hex, color: t.onHex }}
                          >
                            {pending && (
                              <motion.span
                                className="absolute inset-0 bg-pending/20"
                                animate={{ opacity: [0.15, 0.7, 0.15] }}
                                transition={{ duration: 1.8, repeat: Infinity }}
                              />
                            )}
                            <span className="relative flex items-center gap-1 truncate text-xs font-bold">
                              {pending ? <Hourglass size={12} /> : <PayIcon status={b.paymentStatus} />}
                              <span className="truncate">{b.customerName}</span>
                            </span>
                            <span className="relative truncate text-[10px] font-semibold opacity-80">
                              {pending ? "Por aprobar" : PAYMENT_STATUS_LABEL[b.paymentStatus]} · {formatMoneyShort(b.amount)}
                            </span>
                          </motion.button>
                        </div>
                      );
                    })}
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Línea de hora actual */}
            {isToday && nowOffset >= 0 && nowOffset <= HOURS.length * COL_W && (
              <div className="pointer-events-none absolute bottom-0 top-0 z-[5]" style={{ left: NAME_W + nowOffset }}>
                <motion.div
                  className="absolute -left-[5px] top-[40px] h-2.5 w-2.5 rounded-full bg-futbol"
                  animate={{ scale: [1, 1.5, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
                <div className="h-full w-0.5 bg-futbol" />
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Lock size={13} /> Tocá un hueco para crear una reserva o un bloqueo; tocá una reserva para cobrar, moverla o cancelarla.
      </p>

      <AgendaSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function PayIcon({ status }: { status: Booking["paymentStatus"] }) {
  if (status === "paid") return <Banknote size={12} className="shrink-0" />;
  if (status === "deposit") return <CircleDollarSign size={12} className="shrink-0" />;
  return <Hourglass size={12} className="shrink-0" />;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
