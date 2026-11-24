import type { Sport } from "@/lib/types";

interface Props {
  sport: Sport | "all";
  className?: string;
  size?: number;
}

/** Íconos deportivos propios (trazo 2px, coherentes con Lucide). */
export function SportIcon({ sport, className, size = 20 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (sport) {
    case "futbol":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1z" />
          <path d="M12 3v4.5M15.6 10.1l4.9-1.6M14.2 14.3l3 4.1M9.8 14.3l-3 4.1M8.4 10.1L3.5 8.5" />
        </svg>
      );
    case "basquet":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18" />
          <path d="M5.6 5.6c2.6 2.6 2.6 10.2 0 12.8M18.4 5.6c-2.6 2.6-2.6 10.2 0 12.8" />
        </svg>
      );
    case "tenis":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M5.2 5.8c3.3 3 3.3 9.4 0 12.4M18.8 5.8c-3.3 3-3.3 9.4 0 12.4" />
        </svg>
      );
    case "padel":
      return (
        <svg {...common}>
          <path d="M14.5 3.5a5.5 5.5 0 0 1 4.5 8.6l-4 4a5.5 5.5 0 0 1-7.8-7.8l4-4a5.5 5.5 0 0 1 3.3-.8z" />
          <path d="M7.2 16.8L3.5 20.5" />
          <circle cx="13" cy="9" r=".6" fill="currentColor" />
          <circle cx="15.5" cy="11.5" r=".6" fill="currentColor" />
          <circle cx="11" cy="12" r=".6" fill="currentColor" />
          <circle cx="20" cy="19" r="1.6" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
        </svg>
      );
  }
}
