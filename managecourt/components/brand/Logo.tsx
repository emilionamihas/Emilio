import { cn } from "@/lib/cn";

/** Ícono de marca: cancha con pelota en movimiento y las 4 franjas deportivas */
export function LogoMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="16" fill="#0f1529" />
      {/* Franjas deportivas */}
      <rect x="8" y="50" width="12" height="5" rx="2.5" fill="#10b981" />
      <rect x="22" y="50" width="12" height="5" rx="2.5" fill="#f97316" />
      <rect x="36" y="50" width="9" height="5" rx="2.5" fill="#c6e83a" />
      <rect x="47" y="50" width="9" height="5" rx="2.5" fill="#2563eb" />
      {/* Cancha */}
      <rect x="10" y="12" width="44" height="30" rx="4" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2.5" />
      <line x1="32" y1="12" x2="32" y2="42" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2.5" />
      <circle cx="32" cy="27" r="6" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="2.5" />
      {/* Pelota volt */}
      <circle cx="46" cy="20" r="5.5" fill="#d4ff3a" />
      <path d="M36 23 h4 M34 27 h5" stroke="#d4ff3a" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.7" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={compact ? 32 : 38} />
      <span className="leading-none">
        <span className="block font-display text-[1.15rem] font-black italic tracking-tight">
          Manage<span className="text-futbol">Court</span>
        </span>
        {!compact && (
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
            Complejo deportivo
          </span>
        )}
      </span>
    </span>
  );
}
