"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowRightLeft, Check, Flag, MessageCircle, Trash2, Unlock, Wrench, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SportIcon } from "@/components/ui/SportIcon";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { CLOSE_HOUR, HOURS, formatHour, formatRange, friendlyDate, todayISO } from "@/lib/dates";
import { formatMoney, priceRange } from "@/lib/pricing";
import { amountDue } from "@/lib/slots";
import { BOOKING_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, SPORTS } from "@/lib/sports";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { BlockReason, Court, PaymentMethod, PaymentStatus } from "@/lib/types";
import { bookingMessage, whatsappUrl } from "@/lib/whatsapp";

export type AgendaTarget =
  | { kind: "create"; courtId: string; date: string; hour: number; mode?: "booking" | "block" }
  | { kind: "booking"; id: string }
  | { kind: "block"; id: string };

interface Props {
  target: AgendaTarget | null;
  onClose: () => void;
}

export function AgendaSheet({ target, onClose }: Props) {
  const courts = useStore((s) => s.courts);
  const booking = useStore((s) => (target?.kind === "booking" ? s.bookings.find((b) => b.id === target.id) : undefined));
  const block = useStore((s) => (target?.kind === "block" ? s.blocks.find((b) => b.id === target.id) : undefined));

  const courtId = target?.kind === "create" ? target.courtId : booking?.courtId ?? block?.courtId;
  const court = courts.find((c) => c.id === courtId);

  const title =
    target?.kind === "create" ? "Nuevo en agenda" : target?.kind === "booking" ? booking?.customerName : block?.reason === "tournament" ? "Torneo" : "Mantenimiento";

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      title={title}
      subtitle={court ? `${SPORTS[court.sport].label} · ${court.name}` : undefined}
      accent={court ? SPORTS[court.sport].hex : undefined}
    >
      {target?.kind === "create" && <CreateForm key={`${target.courtId}-${target.date}-${target.hour}`} initial={target} onDone={onClose} />}
      {target?.kind === "booking" && booking && court && <BookingDetail key={booking.id} bookingId={booking.id} court={court} onDone={onClose} />}
      {target?.kind === "block" && block && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-blocked/10 p-4">
            <p className="flex items-center gap-2 font-semibold text-blocked">
              {block.reason === "tournament" ? <Flag size={17} /> : <Wrench size={17} />}
              {block.note || (block.reason === "tournament" ? "Torneo" : "Mantenimiento")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {capitalize(friendlyDate(block.date, todayISO()))} · {formatRange(block.startHour, block.endHour)}
            </p>
          </div>
          <Button
            variant="danger"
            className="w-full"
            onClick={() => {
              useStore.getState().removeBlock(block.id);
              toast({ tone: "success", title: "Horario liberado" });
              onClose();
            }}
          >
            <Unlock size={17} /> Liberar horario
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/* ───────────────────────── Crear reserva manual / bloqueo ───────────────────────── */

function CreateForm({ initial, onDone }: { initial: Extract<AgendaTarget, { kind: "create" }>; onDone: () => void }) {
  const courts = useStore((s) => s.courts);
  const [mode, setMode] = useState<"booking" | "block">(initial.mode ?? "booking");
  const [courtId, setCourtId] = useState(initial.courtId);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.hour);
  const [end, setEnd] = useState(Math.min(initial.hour + 1, CLOSE_HOUR));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("yape");
  const [payStatus, setPayStatus] = useState<PaymentStatus>("unpaid");
  const [deposit, setDeposit] = useState<number | "">("");
  const [reason, setReason] = useState<BlockReason>("maintenance");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const court = courts.find((c) => c.id === courtId) as Court;
  const price = priceRange(court, start, end);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res =
      mode === "booking"
        ? useStore.getState().createManualBooking({
            courtId,
            date,
            startHour: start,
            endHour: end,
            customerName: name,
            phone,
            paymentMethod: method,
            paymentStatus: payStatus,
            depositAmount: deposit === "" ? undefined : deposit,
          })
        : useStore.getState().addBlock({
            courtId,
            date,
            startHour: start,
            endHour: end,
            reason,
            note: note.trim() || (reason === "maintenance" ? "Mantenimiento" : "Torneo"),
          });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast({ tone: "success", title: mode === "booking" ? "Reserva creada" : "Horario bloqueado" });
    onDone();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Segmented
        id="create-mode"
        value={mode}
        onChange={(v) => setMode(v)}
        options={[
          { id: "booking", label: "Reserva manual" },
          { id: "block", label: "Bloquear horario" },
        ]}
      />

      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Cancha" className="col-span-2">
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)} className={inputCls}>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {SPORTS[c.sport].label} · {c.name}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Fecha" className="col-span-2">
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
        </Labeled>
        <Labeled label="Desde">
          <select
            value={start}
            onChange={(e) => {
              const v = Number(e.target.value);
              setStart(v);
              if (end <= v) setEnd(v + 1);
            }}
            className={inputCls}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Hasta">
          <select value={end} onChange={(e) => setEnd(Number(e.target.value))} className={inputCls}>
            {HOURS.map((h) => h + 1)
              .filter((h) => h > start && (mode === "block" || h - start <= 3))
              .map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
          </select>
        </Labeled>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {mode === "booking" ? (
          <motion.div key="b" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Cliente" className="col-span-2 sm:col-span-1">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" className={inputCls} />
              </Labeled>
              <Labeled label="WhatsApp" className="col-span-2 sm:col-span-1">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+51 9…" className={inputCls} />
              </Labeled>
              <Labeled label="Método de pago" className="col-span-2">
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Labeled>
            </div>
            <PaymentEditor status={payStatus} onStatus={setPayStatus} deposit={deposit} onDeposit={setDeposit} total={price.total} id="create-pay" />
            <div className="flex items-center justify-between rounded-2xl bg-surface-2 p-3 text-sm">
              <span className="text-muted">
                {price.dayHours} h diurna · {price.nightHours} h nocturna
              </span>
              <span className="font-display text-lg font-black">{formatMoney(price.total)}</span>
            </div>
          </motion.div>
        ) : (
          <motion.div key="k" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
            <Segmented
              id="block-reason"
              value={reason}
              onChange={setReason}
              options={[
                { id: "maintenance", label: "Mantenimiento", icon: <Wrench size={15} /> },
                { id: "tournament", label: "Torneo", icon: <Flag size={15} /> },
              ]}
            />
            <Labeled label="Detalle">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Cambio de red, Torneo de verano…" className={inputCls} />
            </Labeled>
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorMsg error={error} />

      <Button type="submit" size="lg" className="w-full">
        {mode === "booking" ? (
          <>
            <Check size={18} /> Confirmar reserva
          </>
        ) : (
          <>
            <Wrench size={18} /> Bloquear {formatRange(start, end)}
          </>
        )}
      </Button>
    </form>
  );
}

/* ───────────────────────── Detalle de reserva ───────────────────────── */

function BookingDetail({ bookingId, court, onDone }: { bookingId: string; court: Court; onDone: () => void }) {
  const courts = useStore((s) => s.courts);
  const booking = useStore((s) => s.bookings.find((b) => b.id === bookingId));
  const [payStatus, setPayStatus] = useState<PaymentStatus>(booking?.paymentStatus ?? "unpaid");
  const [deposit, setDeposit] = useState<number | "">(booking?.depositAmount || "");
  const [moveOpen, setMoveOpen] = useState(false);
  const [mvCourt, setMvCourt] = useState(booking?.courtId ?? court.id);
  const [mvDate, setMvDate] = useState(booking?.date ?? todayISO());
  const [mvStart, setMvStart] = useState(booking?.startHour ?? 8);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!booking) return null;
  const theme = SPORTS[court.sport];
  const len = booking.endHour - booking.startHour;
  const active = booking.status === "pending" || booking.status === "confirmed";

  const run = (fn: () => { ok: boolean; error?: string }, success: string, close = false) => {
    setError(null);
    const r = fn();
    if (!r.ok) setError(r.error ?? "No se pudo completar la acción.");
    else {
      toast({ tone: "success", title: success });
      if (close) onDone();
    }
  };

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl p-4", theme.bgSoft)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider", theme.textDeep)}>
              <SportIcon sport={court.sport} size={14} /> {capitalize(friendlyDate(booking.date, todayISO()))}
            </p>
            <p className="font-display text-xl font-black">{formatRange(booking.startHour, booking.endHour)}</p>
            <p className="text-xs text-muted">
              {booking.phone || "Sin teléfono"} · {PAYMENT_METHOD_LABEL[booking.paymentMethod]} · {booking.source === "online" ? "Online" : "Manual"}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-black">{formatMoney(booking.amount)}</p>
            <span
              className={cn(
                "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                booking.status === "pending" && "bg-pending text-ink",
                booking.status === "confirmed" && "bg-futbol text-white",
                !active && "bg-booked text-white",
              )}
            >
              {BOOKING_STATUS_LABEL[booking.status]}
            </span>
          </div>
        </div>
        <p className="mt-2 font-mono text-xs tracking-wider text-muted">Pase {booking.passCode}</p>
      </div>

      {booking.phone && (
        <a
          href={whatsappUrl(booking.phone, bookingMessage(booking, court))}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#25d366] text-sm font-bold text-[#073b1d]"
        >
          <MessageCircle size={18} /> Escribir por WhatsApp
        </a>
      )}

      {booking.status === "pending" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="danger" onClick={() => run(() => useStore.getState().rejectBooking(booking.id), "Solicitud rechazada", true)}>
            <X size={17} /> Rechazar
          </Button>
          <Button variant="success" onClick={() => run(() => useStore.getState().approveBooking(booking.id), "Reserva aprobada")}>
            <Check size={17} /> Aprobar
          </Button>
        </div>
      )}

      {active && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Estado de pago</p>
            <PaymentEditor status={payStatus} onStatus={setPayStatus} deposit={deposit} onDeposit={setDeposit} total={booking.amount} id="detail-pay" />
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Saldo actual: {formatMoney(amountDue(booking))}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={payStatus === booking.paymentStatus && (payStatus !== "deposit" || deposit === booking.depositAmount)}
                onClick={() =>
                  run(
                    () => useStore.getState().setPaymentStatus(booking.id, payStatus, deposit === "" ? undefined : deposit),
                    "Pago actualizado",
                  )
                }
              >
                Guardar pago
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-line">
            <button
              type="button"
              onClick={() => setMoveOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold"
              aria-expanded={moveOpen}
            >
              <span className="flex items-center gap-2">
                <ArrowRightLeft size={16} /> Mover reserva
              </span>
              <motion.span animate={{ rotate: moveOpen ? 45 : 0 }} className="text-lg leading-none text-muted">
                +
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {moveOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                    <Labeled label="Cancha" className="col-span-2">
                      <select value={mvCourt} onChange={(e) => setMvCourt(e.target.value)} className={inputCls}>
                        {courts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {SPORTS[c.sport].label} · {c.name}
                          </option>
                        ))}
                      </select>
                    </Labeled>
                    <Labeled label="Fecha">
                      <input type="date" value={mvDate} onChange={(e) => e.target.value && setMvDate(e.target.value)} className={inputCls} />
                    </Labeled>
                    <Labeled label={`Inicio (${len} h)`}>
                      <select value={mvStart} onChange={(e) => setMvStart(Number(e.target.value))} className={inputCls}>
                        {HOURS.filter((h) => h + len <= CLOSE_HOUR).map((h) => (
                          <option key={h} value={h}>
                            {formatHour(h)}
                          </option>
                        ))}
                      </select>
                    </Labeled>
                    <Button
                      className="col-span-2"
                      onClick={() =>
                        run(() => useStore.getState().moveBooking(booking.id, { courtId: mvCourt, date: mvDate, startHour: mvStart }), "Reserva movida", true)
                      }
                    >
                      <ArrowRightLeft size={16} /> Mover a {formatRange(mvStart, mvStart + len)}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ErrorMsg error={error} />

          {booking.status === "confirmed" && (
            <AnimatePresence mode="wait" initial={false}>
              {confirmCancel ? (
                <motion.div key="c" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                    Volver
                  </Button>
                  <Button
                    className="bg-blocked text-white dark:bg-blocked dark:text-white"
                    onClick={() => run(() => useStore.getState().cancelBooking(booking.id), "Reserva cancelada · horario liberado", true)}
                  >
                    <Trash2 size={16} /> Sí, cancelar
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Button variant="danger" className="w-full" onClick={() => setConfirmCancel(true)}>
                    <Trash2 size={16} /> Cancelar reserva
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Piezas compartidas ───────────────────────── */

const inputCls =
  "h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none transition focus:border-padel focus:bg-surface";

function Labeled({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <LayoutGroup id={id}>
      <div className="flex rounded-2xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={cn(
              "relative flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold transition-colors sm:text-sm",
              value === o.id ? "text-fg" : "text-muted",
            )}
          >
            {value === o.id && (
              <motion.span layoutId="seg" className="absolute inset-0 rounded-xl bg-surface shadow-sm" transition={{ type: "spring", stiffness: 480, damping: 34 }} />
            )}
            {o.icon && <span className="relative">{o.icon}</span>}
            <span className="relative">{o.label}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}

function PaymentEditor({
  id,
  status,
  onStatus,
  deposit,
  onDeposit,
  total,
}: {
  id: string;
  status: PaymentStatus;
  onStatus: (s: PaymentStatus) => void;
  deposit: number | "";
  onDeposit: (n: number | "") => void;
  total: number;
}) {
  return (
    <div className="space-y-2">
      <Segmented
        id={id}
        value={status}
        onChange={onStatus}
        options={(["paid", "deposit", "unpaid"] as const).map((s) => ({ id: s, label: PAYMENT_STATUS_LABEL[s] }))}
      />
      <AnimatePresence initial={false}>
        {status === "deposit" && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Labeled label={`Monto del adelanto (sugerido ${formatMoney(Math.round(total / 2))})`}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={total}
                step={10}
                value={deposit}
                placeholder={String(Math.round(total / 2))}
                onChange={(e) => onDeposit(e.target.value === "" ? "" : Math.max(0, Math.min(total, Number(e.target.value))))}
                className={inputCls}
              />
            </Labeled>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorMsg({ error }: { error: string | null }) {
  return (
    <AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -3, 0] }}
          exit={{ opacity: 0, height: 0 }}
          role="alert"
          className="rounded-xl bg-blocked/10 px-3 py-2 text-sm font-semibold text-blocked"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
