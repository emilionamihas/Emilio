"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Banknote, Landmark, Moon, QrCode, Smartphone, Sun, Ticket } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatedCheck, Confetti } from "@/components/ui/Celebration";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { addDays, formatRange, friendlyDate, todayISO } from "@/lib/dates";
import { useNow } from "@/lib/hooks";
import { formatMoney, priceRange } from "@/lib/pricing";
import { getDaySlots } from "@/lib/slots";
import { PAYMENT_METHOD_LABEL, SPORTS, SURFACE_LABEL } from "@/lib/sports";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Booking, Court, PaymentMethod } from "@/lib/types";
import { DateStrip } from "./DateStrip";
import { DigitalPass } from "./DigitalPass";
import { SlotPicker, type Range } from "./SlotPicker";

type Step = "slots" | "form" | "done";

const METHODS: { id: PaymentMethod; icon: React.ReactNode }[] = [
  { id: "yape", icon: <Smartphone size={18} /> },
  { id: "plin", icon: <QrCode size={18} /> },
  { id: "transferencia", icon: <Landmark size={18} /> },
  { id: "efectivo", icon: <Banknote size={18} /> },
];

interface Props {
  court: Court | null;
  date: string;
  onClose: () => void;
}

export function BookingSheet({ court, date, onClose }: Props) {
  return (
    <Sheet
      open={!!court}
      onClose={onClose}
      accent={court ? SPORTS[court.sport].hex : undefined}
      title={court?.name}
      subtitle={court ? `${SPORTS[court.sport].label} · ${court.format} · ${SURFACE_LABEL[court.surface]}` : undefined}
    >
      {court && <BookingFlow key={court.id} court={court} initialDate={date} onClose={onClose} />}
    </Sheet>
  );
}

function BookingFlow({ court, initialDate, onClose }: { court: Court; initialDate: string; onClose: () => void }) {
  const theme = SPORTS[court.sport];
  const now = useNow();
  const today = todayISO();
  const bookings = useStore((s) => s.bookings);
  const blocks = useStore((s) => s.blocks);
  const requestBooking = useStore((s) => s.requestBooking);

  const [date, setDate] = useState(() => {
    for (let i = 0; i < 14; i++) {
      const d = addDays(initialDate, i);
      if (getDaySlots(court, d, bookings, blocks, now).some((s) => s.state === "available")) return d;
    }
    return initialDate;
  });
  const [range, setRange] = useState<Range | null>(null);
  const [step, setStep] = useState<Step>("slots");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("yape");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Booking | null>(null);

  const slots = useMemo(() => getDaySlots(court, date, bookings, blocks, now), [court, date, bookings, blocks, now]);
  const price = range ? priceRange(court, range.start, range.end) : null;

  // Si otro usuario toma el horario mientras elegimos, limpiamos la selección
  useEffect(() => {
    if (!range || step === "done") return;
    const stillFree = slots.filter((s) => s.hour >= range.start && s.hour < range.end).every((s) => s.state === "available");
    if (!stillFree) {
      setRange(null);
      setStep("slots");
      toast({ tone: "error", title: "Ese horario acaba de ocuparse", description: "Elige otro turno disponible." });
    }
  }, [slots, range, step]);

  // Se lee del store para que el pase cambie en vivo cuando el gestor aprueba
  const liveBooking = useStore((s) => (created ? s.bookings.find((b) => b.id === created.id) ?? created : null));

  const phoneDigits = phone.replace(/\D/g, "");
  const formValid = name.trim().length >= 3 && phoneDigits.length >= 8;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!range) return;
    if (!formValid) {
      setError("Completa tu nombre y un WhatsApp válido.");
      return;
    }
    const res = requestBooking({
      courtId: court.id,
      date,
      startHour: range.start,
      endHour: range.end,
      customerName: name.trim(),
      phone: phone.trim(),
      paymentMethod: method,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated(res.data);
    setStep("done");
  };

  const slide = {
    initial: { opacity: 0, x: 28 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -28 },
    transition: { duration: 0.22, ease: "easeOut" as const },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === "slots" && (
        <motion.div key="slots" {...slide} className="space-y-4">
          <DateStrip value={date} onChange={(d) => { setDate(d); setRange(null); }} today={today} id="sheet-date" />

          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><Sun size={14} /> Diurna {formatMoney(court.dayRate)}/h</span>
            <span className="h-4 w-px bg-line" />
            <span className="flex items-center gap-1.5"><Moon size={14} /> Nocturna {formatMoney(court.nightRate)}/h</span>
          </div>

          <SlotPicker slots={slots} range={range} onChange={setRange} accent={theme.hex} accentOn={theme.onHex} />

          <div className="sticky bottom-0 -mx-5 border-t border-line bg-surface/95 px-5 pb-1 pt-3 backdrop-blur lg:-mx-6 lg:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p
                    key={range ? `${range.start}-${range.end}` : "none"}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="text-xs text-muted"
                  >
                    {range ? `${formatRange(range.start, range.end)} · ${range.end - range.start} h` : "Toca un horario (hasta 3 h seguidas)"}
                  </motion.p>
                </AnimatePresence>
                <p className="font-display text-2xl font-black">
                  <AnimatedNumber value={price?.total ?? 0} format={formatMoney} />
                </p>
                {price && price.nightHours > 0 && price.dayHours > 0 && (
                  <p className="text-[11px] text-muted">
                    {price.dayHours} h diurna + {price.nightHours} h nocturna
                  </p>
                )}
              </div>
              <Button size="lg" disabled={!range} onClick={() => { setError(null); setStep("form"); }}>
                Continuar
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {step === "form" && range && price && (
        <motion.form key="form" {...slide} onSubmit={submit} className="space-y-4" noValidate>
          <button type="button" onClick={() => setStep("slots")} className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg">
            <ArrowLeft size={16} /> Cambiar horario
          </button>

          <div className={cn("flex items-center justify-between rounded-2xl p-4", theme.bgSoft)}>
            <div>
              <p className={cn("text-xs font-semibold uppercase tracking-wider", theme.textDeep)}>{capitalize(friendlyDate(date, today))}</p>
              <p className="font-display text-lg font-black">{formatRange(range.start, range.end)}</p>
            </div>
            <p className="font-display text-xl font-black">{formatMoney(price.total)}</p>
          </div>

          <Field label="Nombre y apellido">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Ej. Lucía Quispe"
              className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base outline-none transition focus:border-padel focus:bg-surface"
            />
          </Field>
          <Field label="Teléfono / WhatsApp">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+51 987 654 321"
              className="h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base outline-none transition focus:border-padel focus:bg-surface"
            />
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Método de pago</legend>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => {
                const active = method === m.id;
                return (
                  <motion.button
                    key={m.id}
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setMethod(m.id)}
                    aria-pressed={active}
                    className={cn(
                      "relative flex h-14 items-center gap-2.5 rounded-2xl border px-3 text-left text-sm font-semibold transition-colors",
                      active ? "border-fg" : "border-line text-muted",
                    )}
                  >
                    {active && (
                      <motion.span layoutId="method-ring" className="absolute inset-0 rounded-2xl bg-surface-2" transition={{ type: "spring", stiffness: 500, damping: 36 }} />
                    )}
                    <span className="relative">{m.icon}</span>
                    <span className="relative leading-tight">{PAYMENT_METHOD_LABEL[m.id]}</span>
                  </motion.button>
                );
              })}
            </div>
          </fieldset>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto", x: [0, -6, 6, -3, 0] }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl bg-blocked/10 px-3 py-2 text-sm font-semibold text-blocked"
                role="alert"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <p className="text-xs text-muted">
            Tu horario queda <strong className="text-pending">pendiente de aprobación</strong> hasta que el complejo lo confirme por WhatsApp.
          </p>

          <Button type="submit" size="lg" className="w-full">
            Solicitar reserva · {formatMoney(price.total)}
          </Button>
        </motion.form>
      )}

      {step === "done" && liveBooking && (
        <motion.div key="done" {...slide} className="space-y-5 pb-2">
          <div className="relative flex flex-col items-center pt-2 text-center">
            <Confetti />
            <AnimatedCheck color={theme.hex === "#c6e83a" ? "#65a30d" : theme.hex} />
            <motion.h3
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-3 font-display text-2xl font-black"
            >
              ¡Solicitud enviada!
            </motion.h3>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="mt-1 max-w-xs text-sm text-muted">
              Te avisaremos por WhatsApp apenas el complejo apruebe tu reserva.
            </motion.p>
          </div>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, type: "spring", stiffness: 200, damping: 22 }}>
            <DigitalPass booking={liveBooking} court={court} flip />
          </motion.div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onClose}>Listo</Button>
            <Link href="/pases" onClick={onClose} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white dark:bg-white dark:text-ink">
              <Ticket size={16} /> Mis pases
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
