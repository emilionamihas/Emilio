"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Car, Coffee, DoorOpen, Hourglass, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { BookingSheet } from "@/components/booking/BookingSheet";
import { LIVE_META } from "@/components/booking/CourtCard";
import { DateStrip } from "@/components/booking/DateStrip";
import { Button } from "@/components/ui/Button";
import { PulseDot } from "@/components/ui/PulseDot";
import { SportIcon } from "@/components/ui/SportIcon";
import { cn } from "@/lib/cn";
import { CLOSE_HOUR, OPEN_HOUR, formatHour, formatRange, todayISO } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { formatMoney, hourPrice, isNightHour } from "@/lib/pricing";
import { courtStatusAt, getDaySlots, type LiveStatus } from "@/lib/slots";
import { SPORTS, SURFACE_LABEL } from "@/lib/sports";
import { useStore } from "@/lib/store";
import type { Court } from "@/lib/types";

export function ComplexMap() {
  const now = useNow();
  const today = todayISO();
  const courts = useStore((s) => s.courts);
  const bookings = useStore((s) => s.bookings);
  const blocks = useStore((s) => s.blocks);

  const clampHour = (h: number) => Math.min(Math.max(h, OPEN_HOUR), CLOSE_HOUR - 1);
  const [date, setDate] = useState(today);
  const [hour, setHour] = useState(() => clampHour(now.getHours()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [booking, setBooking] = useState<Court | null>(null);

  const statuses = useMemo(
    () => new Map(courts.map((c) => [c.id, courtStatusAt(c, date, hour, bookings, blocks)])),
    [courts, date, hour, bookings, blocks],
  );
  const summary = useMemo(() => {
    const out: Record<LiveStatus, number> = { free: 0, playing: 0, pending: 0, maintenance: 0, closed: 0 };
    statuses.forEach((s) => out[s.status]++);
    return out;
  }, [statuses]);

  const selected = courts.find((c) => c.id === selectedId) ?? null;
  const isLive = date === today && hour === now.getHours();

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-black tracking-tight">Mapa del complejo</h1>
          <p className="text-sm text-muted">Tocá una cancha para ver su estado y reservarla.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["free", "playing", "pending", "maintenance"] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold">
              <PulseDot color={LIVE_META[s].color} pulse={s === "free" || s === "pending"} className="h-2 w-2" />
              {s === "free" ? "Libre" : LIVE_META[s].label}
              <span className="tabular-nums text-muted">{summary[s]}</span>
            </span>
          ))}
        </div>
      </header>

      <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
        <DateStrip value={date} onChange={setDate} today={today} id="map-date" />
        <div className="flex items-center gap-3">
          <CalendarClock size={18} className="shrink-0 text-muted" />
          <input
            type="range"
            min={OPEN_HOUR}
            max={CLOSE_HOUR - 1}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="h-2 w-full cursor-pointer accent-[#2563eb]"
            aria-label="Hora a visualizar"
          />
          <span className="shrink-0 whitespace-nowrap text-right font-display text-lg font-black tabular-nums">
            {formatHour(hour)}
            <span className="text-xs font-semibold text-muted"> a {formatHour(hour + 1)}</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="flex items-center gap-1.5">
            {isLive ? <><PulseDot color="#10b981" className="h-2 w-2" /> En vivo</> : "Vista programada"}
            {isNightHour(hour) && " · Iluminación encendida"}
          </span>
          {!isLive && date === today && (
            <button className="font-semibold text-padel" onClick={() => setHour(clampHour(now.getHours()))}>
              Volver a ahora
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Croquis */}
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[580px] overflow-hidden rounded-3xl border border-line bg-[#e7efe4] dark:bg-[#0d1a14]">
            <svg viewBox="0 0 1000 640" className="block h-auto w-full" role="img" aria-label="Croquis del complejo deportivo">
              <defs>
                <pattern id="hatch-red" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="10" height="10" fill="#e11d48" fillOpacity="0.25" />
                  <line x1="0" y1="0" x2="0" y2="10" stroke="#e11d48" strokeWidth="4" strokeOpacity="0.6" />
                </pattern>
                <pattern id="hatch-gray" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#0b1020" strokeWidth="3" strokeOpacity="0.25" />
                </pattern>
                <filter id="court-shadow" x="-10%" y="-10%" width="120%" height="130%">
                  <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity="0.18" />
                </filter>
              </defs>

              {/* Caminos */}
              <g fill="currentColor" className="text-white/70 dark:text-white/5">
                <rect x="370" y="20" width="12" height="500" rx="6" />
                <rect x="640" y="20" width="12" height="500" rx="6" />
                <rect x="20" y="512" width="960" height="14" rx="7" />
                <rect x="470" y="512" width="60" height="110" />
              </g>

              {/* Instalaciones */}
              <Facility x={660} y={262} w={315} h={110} label="Club House" sub="Vestuarios · Bar · Recepción" icon={<Coffee size={22} />} />
              <Facility x={660} y={390} w={315} h={110} label="Estacionamiento" sub="60 lugares · Bicicletero" icon={<Car size={22} />} />
              <g>
                <rect x="400" y="560" width="200" height="56" rx="16" className="fill-ink dark:fill-white" />
                <foreignObject x="400" y="560" width="200" height="56">
                  <div className="flex h-full items-center justify-center gap-2 text-sm font-bold text-white dark:text-ink">
                    <DoorOpen size={18} /> Acceso principal
                  </div>
                </foreignObject>
              </g>

              {courts.map((court) => (
                <MapCourt
                  key={court.id}
                  court={court}
                  status={statuses.get(court.id)?.status ?? "free"}
                  selected={court.id === selectedId}
                  onSelect={() => setSelectedId(court.id === selectedId ? null : court.id)}
                />
              ))}
            </svg>
          </div>
        </div>

        {/* Panel de detalle */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <AnimatePresence mode="wait">
            {selected ? (
              <CourtDetail
                key={selected.id}
                court={selected}
                date={date}
                hour={hour}
                info={statuses.get(selected.id)!}
                onBook={() => setBooking(selected)}
              />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-3xl border border-dashed border-line p-6 text-center text-sm text-muted"
              >
                <p className="font-semibold text-fg">Seleccioná una cancha</p>
                <p className="mt-1">Mové el control horario para ver la ocupación en otro momento del día.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <BookingSheet court={booking} date={date} onClose={() => setBooking(null)} />
    </div>
  );
}

function CourtDetail({
  court,
  date: d,
  hour: h,
  info,
  onBook,
}: {
  court: Court;
  date: string;
  hour: number;
  info: ReturnType<typeof courtStatusAt>;
  onBook: () => void;
}) {
  const now = useNow();
  const bookings = useStore((s) => s.bookings);
  const blocks = useStore((s) => s.blocks);
  const theme = SPORTS[court.sport];
  const slots = getDaySlots(court, d, bookings, blocks, now);
  const nextFree = slots.filter((s) => s.state === "available").slice(0, 6);
  const meta = LIVE_META[info.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="overflow-hidden rounded-3xl border border-line bg-surface"
    >
      <div className={cn("bg-gradient-to-br p-5 text-white", theme.gradient)}>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-90">
          <SportIcon sport={court.sport} size={14} /> {theme.label} · {court.format}
        </p>
        <p className="mt-1 font-display text-2xl font-black">{court.name}</p>
        <p className="text-xs opacity-80">
          {SURFACE_LABEL[court.surface]} · {court.covered ? "Techada" : "Aire libre"}
        </p>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-3">
          <span className="flex items-center gap-2 text-sm font-bold">
            <PulseDot color={meta.color} pulse={meta.pulse} />
            {info.status === "free" ? "Libre" : meta.label} a las {formatHour(h)}
          </span>
          <span className="text-sm font-semibold text-muted">{formatMoney(hourPrice(court, h))}</span>
        </div>
        {info.booking && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Hourglass size={15} /> Ocupada {formatRange(info.booking.startHour, info.booking.endHour)}
          </p>
        )}
        {info.block && (
          <p className="flex items-center gap-2 text-sm text-blocked">
            <Wrench size={15} /> {info.block.note} ({formatRange(info.block.startHour, info.block.endHour)})
          </p>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Próximos turnos libres</p>
          {nextFree.length ? (
            <div className="flex flex-wrap gap-1.5">
              {nextFree.map((s) => (
                <span key={s.hour} className={cn("rounded-xl px-2.5 py-1.5 text-xs font-bold", theme.bgSoft, theme.textDeep)}>
                  {formatHour(s.hour)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Sin turnos libres este día.</p>
          )}
        </div>
        <Button className="w-full" size="lg" onClick={onBook} disabled={!nextFree.length}>
          Reservar {court.name}
        </Button>
      </div>
    </motion.div>
  );
}

function Facility({ x, y, w, h, label, sub, icon }: { x: number; y: number; w: number; h: number; label: string; sub: string; icon: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="18" className="fill-white/80 stroke-black/5 dark:fill-white/5 dark:stroke-white/10" strokeWidth="2" />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div className="flex h-full items-center gap-3 px-5 text-ink dark:text-white/80">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink/5 dark:bg-white/10">{icon}</span>
          <span>
            <span className="block text-base font-bold">{label}</span>
            <span className="block text-xs opacity-60">{sub}</span>
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

function MapCourt({
  court,
  status,
  selected,
  onSelect,
}: {
  court: Court;
  status: LiveStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  const { x, y, w, h } = court.map;
  const theme = SPORTS[court.sport];
  const vertical = h > w;
  const L = vertical ? h : w;
  const W = vertical ? w : h;
  const transform = vertical ? `translate(${x + w} ${y}) rotate(90)` : `translate(${x} ${y})`;
  const dim = status === "playing" || status === "closed";
  const cx = x + w / 2;
  const cy = y + h / 2;

  return (
    <motion.g
      role="button"
      tabIndex={0}
      aria-label={`${court.name}: ${LIVE_META[status].label}`}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className="cursor-pointer outline-none"
      style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: "view-box" }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      animate={{ scale: selected ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 24 }}
    >
      <rect x={x} y={y} width={w} height={h} rx="10" fill={theme.hex} filter="url(#court-shadow)" />
      <motion.rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="10"
        fill="#0b1020"
        initial={false}
        animate={{ opacity: dim ? 0.45 : 0 }}
        transition={{ duration: 0.4 }}
      />
      <g transform={transform} fill="none" stroke="white" strokeOpacity="0.75" strokeWidth="2">
        <Markings sport={court.sport} L={L} W={W} />
      </g>
      {status === "playing" && <rect x={x} y={y} width={w} height={h} rx="10" fill="url(#hatch-gray)" />}
      {status === "maintenance" && <rect x={x} y={y} width={w} height={h} rx="10" fill="url(#hatch-red)" />}
      {status === "pending" && (
        <motion.rect
          x={x - 3}
          y={y - 3}
          width={w + 6}
          height={h + 6}
          rx="12"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="5"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      {status === "playing" && <Players x={x} y={y} w={w} h={h} />}
      {selected && (
        <motion.rect
          layoutId="map-selected"
          x={x - 6}
          y={y - 6}
          width={w + 12}
          height={h + 12}
          rx="14"
          fill="none"
          className="stroke-ink dark:stroke-white"
          strokeWidth="3"
          strokeDasharray="8 6"
        />
      )}
      {/* Etiqueta */}
      <g>
        <rect
          x={cx - Math.min(w - 12, 120) / 2}
          y={y + h - 30}
          width={Math.min(w - 12, 120)}
          height={22}
          rx="11"
          fill="#0b1020"
          fillOpacity="0.78"
        />
        <text x={cx} y={y + h - 15} textAnchor="middle" fill="white" fontSize={w < 120 ? 11 : 12} fontWeight="700">
          {w < 120 ? court.name.split(" · ")[0].replace("Cancha ", "C") : court.name}
        </text>
        <circle cx={x + 16} cy={y + 16} r="6" fill={LIVE_META[status].color} stroke="white" strokeWidth="2" />
      </g>
    </motion.g>
  );
}

/** Jugadores animados (puntos) cuando la cancha está en juego */
function Players({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const pts = [
    [0.25, 0.35], [0.3, 0.65], [0.7, 0.4], [0.72, 0.62],
  ];
  return (
    <g>
      {pts.map(([px, py], i) => (
        <motion.circle
          key={i}
          r="4.5"
          fill="white"
          initial={{ cx: x + w * px, cy: y + h * py }}
          animate={{
            cx: [x + w * px, x + w * (px + (i % 2 ? 0.06 : -0.05)), x + w * px],
            cy: [y + h * py, y + h * (py + (i % 2 ? -0.08 : 0.07)), y + h * py],
          }}
          transition={{ duration: 2.2 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </g>
  );
}

function Markings({ sport, L, W }: { sport: Court["sport"]; L: number; W: number }) {
  const p = 8;
  switch (sport) {
    case "futbol":
      return (
        <>
          <rect x={p} y={p} width={L - 2 * p} height={W - 2 * p} rx="4" />
          <line x1={L / 2} y1={p} x2={L / 2} y2={W - p} />
          <circle cx={L / 2} cy={W / 2} r={W * 0.16} />
          <rect x={p} y={W * 0.28} width={L * 0.12} height={W * 0.44} />
          <rect x={L - p - L * 0.12} y={W * 0.28} width={L * 0.12} height={W * 0.44} />
        </>
      );
    case "basquet":
      return (
        <>
          <rect x={p} y={p} width={L - 2 * p} height={W - 2 * p} rx="4" />
          <line x1={L / 2} y1={p} x2={L / 2} y2={W - p} />
          <circle cx={L / 2} cy={W / 2} r={W * 0.13} />
          <path d={`M${p} ${W * 0.18} h${L * 0.1} a${W * 0.32} ${W * 0.32} 0 0 1 0 ${W * 0.64} h-${L * 0.1}`} />
          <path d={`M${L - p} ${W * 0.18} h-${L * 0.1} a${W * 0.32} ${W * 0.32} 0 0 0 0 ${W * 0.64} h${L * 0.1}`} />
        </>
      );
    case "tenis":
      return (
        <>
          <rect x={p} y={p} width={L - 2 * p} height={W - 2 * p} />
          <line x1={p} y1={W * 0.2} x2={L - p} y2={W * 0.2} />
          <line x1={p} y1={W * 0.8} x2={L - p} y2={W * 0.8} />
          <line x1={L / 2} y1={2} x2={L / 2} y2={W - 2} strokeWidth="3" />
          <line x1={L * 0.27} y1={W * 0.2} x2={L * 0.27} y2={W * 0.8} />
          <line x1={L * 0.73} y1={W * 0.2} x2={L * 0.73} y2={W * 0.8} />
          <line x1={L * 0.27} y1={W / 2} x2={L * 0.73} y2={W / 2} />
        </>
      );
    case "padel":
      return (
        <>
          <rect x={p / 2} y={p / 2} width={L - p} height={W - p} rx="3" strokeWidth="3" strokeOpacity="0.5" />
          <line x1={L / 2} y1={2} x2={L / 2} y2={W - 2} strokeWidth="3" />
          <line x1={L * 0.2} y1={p} x2={L * 0.2} y2={W - p} />
          <line x1={L * 0.8} y1={p} x2={L * 0.8} y2={W - p} />
          <line x1={L * 0.2} y1={W / 2} x2={L * 0.8} y2={W / 2} />
        </>
      );
  }
}
