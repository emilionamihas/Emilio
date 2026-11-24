# ManageCourt

PWA para reservar y gestionar un complejo deportivo con canchas de Fútbol, Básquet, Tenis y Pádel.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Framer Motion · Lucide · Zustand.

## Cómo correrlo

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # compilación de producción (incluye chequeo de TypeScript)
npm run start
```

## Qué hay

| Ruta            | Vista                                                                                   |
| --------------- | --------------------------------------------------------------------------------------- |
| `/`             | Portal de reservas: filtros por deporte y techado/superficie, fecha, tarjetas de cancha |
| `/mapa`         | Croquis interactivo del complejo con control horario                                    |
| `/pases`        | Pases digitales con QR solicitados desde este dispositivo                               |
| `/admin`        | Bandeja de solicitudes por aprobar, métricas del día y próximos turnos                  |
| `/admin/agenda` | Agenda maestra multi-cancha: reservas manuales, mover, cancelar, bloquear, cobrar       |

Para ver el circuito completo, abrí `/` en una pestaña y `/admin` en otra. La solicitud aparece en la bandeja al instante, y cuando la aprobás el pase del cliente pasa a "Verificado".

## Arquitectura

```
app/                 rutas (server components que montan vistas cliente)
components/
  brand/             logotipo
  layout/            AppShell, Sidebar (escritorio), BottomTabBar (móvil), StoreGate, tema, service worker
  ui/                Sheet (drawer/modal), Button, AnimatedNumber, PulseDot, Confetti, Toaster…
  booking/           SportTabs, filtros, DateStrip, CourtCard, SlotPicker, BookingSheet, DigitalPass
  map/               ComplexMap
  admin/             PendingInbox, RequestCard, DayMetrics, UpcomingToday, MasterAgenda, AgendaSheet
lib/
  types.ts           modelo de dominio
  store.ts           estado global (Zustand + persist) y todas las mutaciones
  slots.ts           reglas: conflictos, estado de turnos, ocupación
  pricing.ts         tarifa diurna / nocturna (desde las 19:00)
  data/              canchas y generador de datos de prueba
supabase/schema.sql  tablas espejo de los tipos, con restricción anti-solapamiento
public/              manifest.json, sw.js, íconos
```

## Límites actuales (modo demo)

- Los datos viven en `localStorage`. La sincronización "en vivo" funciona entre pestañas del mismo navegador, no entre dispositivos.
- `/admin` no tiene autenticación.
- El QR codifica el pase pero nadie lo valida todavía.

## Paso a Supabase

1. Ejecutar `supabase/schema.sql`.
2. Reemplazar el cuerpo de cada acción de `lib/store.ts` por la llamada correspondiente (`insert`/`update`), manteniendo su firma.
3. En `components/layout/StoreGate.tsx`, cambiar el listener de `storage` por una suscripción de Supabase Realtime a `bookings` y `blocks`.
4. Proteger `/admin` con Supabase Auth y políticas RLS.
