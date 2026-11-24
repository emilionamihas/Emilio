import { addDays, fromISODate } from "../dates";
import { isNightHour, priceRange } from "../pricing";
import type { Block, Booking, Court, PaymentMethod, PaymentStatus } from "../types";
import { makeId, makePassCode } from "../ids";

/** PRNG determinista para que la demo sea estable dentro del mismo día */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Martín", "Lucía", "Santiago", "Valentina", "Joaquín", "Camila", "Tomás", "Sofía",
  "Facundo", "Florencia", "Nicolás", "Agustina", "Matías", "Julieta", "Lautaro", "Micaela",
  "Bruno", "Carolina", "Ignacio", "Paula", "Gonzalo", "Rocío", "Franco", "Milagros",
];
const LAST = [
  "González", "Rodríguez", "Fernández", "López", "Martínez", "Pérez", "Gómez", "Díaz",
  "Romero", "Sosa", "Álvarez", "Torres", "Ruiz", "Benítez", "Acosta", "Medina",
];
const METHODS: PaymentMethod[] = ["efectivo", "transferencia", "mercadopago", "tarjeta"];

/** Demanda relativa por hora (0-1) */
function demand(hour: number, weekend: boolean): number {
  if (weekend) return hour < 10 ? 0.35 : hour < 13 ? 0.6 : hour < 17 ? 0.5 : 0.75;
  if (hour < 12) return 0.18;
  if (hour < 17) return 0.25;
  if (hour < 19) return 0.5;
  return 0.68;
}

interface SeedResult {
  bookings: Booking[];
  blocks: Block[];
}

export function buildSeed(courts: Court[], today: string, nowHour: number): SeedResult {
  const rand = mulberry32(Number(today.replaceAll("-", "")));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const bookings: Booking[] = [];
  const blocks: Block[] = [];
  const taken = new Set<string>();
  const key = (c: string, d: string, h: number) => `${c}|${d}|${h}`;
  const nowIso = new Date().toISOString();

  // Bloqueos de ejemplo
  const blockDefs: Omit<Block, "id" | "createdAt">[] = [
    { courtId: "bas-2", date: today, startHour: 13, endHour: 16, reason: "maintenance", note: "Pintura de líneas" },
    { courtId: "pad-4", date: today, startHour: 8, endHour: 11, reason: "maintenance", note: "Cambio de cristal lateral" },
    { courtId: "ten-1", date: addDays(today, 2), startHour: 9, endHour: 14, reason: "tournament", note: "Torneo interclubes" },
    { courtId: "ten-2", date: addDays(today, 2), startHour: 9, endHour: 14, reason: "tournament", note: "Torneo interclubes" },
    { courtId: "fut-2", date: addDays(today, 5), startHour: 10, endHour: 18, reason: "tournament", note: "Copa ManageCourt F7" },
  ];
  for (const b of blockDefs) {
    blocks.push({ ...b, id: makeId("blk", rand), createdAt: nowIso });
    for (let h = b.startHour; h < b.endHour; h++) taken.add(key(b.courtId, b.date, h));
  }

  const customer = () => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const phone = `+54 9 11 ${String(Math.floor(rand() * 9000) + 1000)}-${String(Math.floor(rand() * 9000) + 1000)}`;
    return { name, phone };
  };

  const push = (
    court: Court,
    date: string,
    start: number,
    len: number,
    status: Booking["status"],
    createdAt: string,
  ) => {
    const { name, phone } = customer();
    const { total } = priceRange(court, start, start + len);
    const method = pick(METHODS);
    let paymentStatus: PaymentStatus = "unpaid";
    let depositAmount = 0;
    if (status === "confirmed") {
      const r = rand();
      if (date < today || r < 0.45) paymentStatus = "paid";
      else if (r < 0.75) {
        paymentStatus = "deposit";
        depositAmount = Math.round((total * 0.5) / 1000) * 1000;
      }
    }
    bookings.push({
      id: makeId("bkg", rand),
      courtId: court.id,
      date,
      startHour: start,
      endHour: start + len,
      customerName: name,
      phone,
      paymentMethod: method,
      paymentStatus,
      depositAmount,
      amount: total,
      status,
      source: rand() < 0.7 ? "online" : "manual",
      passCode: makePassCode(rand),
      createdAt,
      updatedAt: createdAt,
    });
    for (let h = start; h < start + len; h++) taken.add(key(court.id, date, h));
  };

  // Reservas confirmadas: ayer → +6 días
  for (let offset = -1; offset <= 6; offset++) {
    const date = addDays(today, offset);
    const dow = fromISODate(date).getDay();
    const weekend = dow === 0 || dow === 6;
    for (const court of courts) {
      for (let h = 8; h < 24; h++) {
        if (taken.has(key(court.id, date, h))) continue;
        // Días futuros más lejanos tienen menos reservas cerradas
        const decay = offset <= 0 ? 1 : Math.max(0.35, 1 - offset * 0.12);
        if (rand() > demand(h, weekend) * decay) continue;
        const len = court.sport === "futbol" || h >= 23 || rand() < 0.65 ? 1 : 2;
        if (len === 2 && (h + 1 >= 24 || taken.has(key(court.id, date, h + 1)))) continue;
        const created = new Date(Date.now() - (2 + rand() * 72) * 3_600_000).toISOString();
        push(court, date, h, len, "confirmed", created);
        h += len - 1;
      }
    }
  }

  // Solicitudes pendientes recientes (hoy después de la hora actual, mañana y pasado)
  const pendingTargets: { offset: number; minHour: number }[] = [
    { offset: 0, minHour: Math.max(nowHour + 1, 17) },
    { offset: 0, minHour: Math.max(nowHour + 2, 19) },
    { offset: 1, minHour: 18 },
    { offset: 1, minHour: 20 },
    { offset: 2, minHour: 19 },
  ];
  let minutesAgo = 4;
  for (const t of pendingTargets) {
    const date = addDays(today, t.offset);
    const shuffled = [...courts].sort(() => rand() - 0.5);
    let placed = false;
    for (const court of shuffled) {
      for (let h = t.minHour; h < 24 && !placed; h++) {
        if (taken.has(key(court.id, date, h))) continue;
        const created = new Date(Date.now() - minutesAgo * 60_000).toISOString();
        push(court, date, h, isNightHour(h) && rand() < 0.3 && h < 23 && !taken.has(key(court.id, date, h + 1)) ? 2 : 1, "pending", created);
        placed = true;
      }
      if (placed) break;
    }
    minutesAgo += 7 + Math.floor(rand() * 20);
  }

  return { bookings, blocks };
}
