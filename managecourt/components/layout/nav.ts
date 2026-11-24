import { CalendarRange, LayoutDashboard, Map, Ticket, Trophy } from "lucide-react";

export const NAV = [
  { href: "/", label: "Reservar", icon: Trophy, group: "cliente" },
  { href: "/mapa", label: "Mapa", icon: Map, group: "cliente" },
  { href: "/pases", label: "Mis pases", icon: Ticket, group: "cliente" },
  { href: "/admin", label: "Gestión", icon: LayoutDashboard, group: "gestor" },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarRange, group: "gestor" },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}
