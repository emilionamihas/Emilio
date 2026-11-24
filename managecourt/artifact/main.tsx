/**
 * Entrada del build de una sola página (Artifact).
 * Usa exactamente los mismos componentes que la app Next.js.
 */
import { createRoot } from "react-dom/client";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { MasterAgenda } from "@/components/admin/MasterAgenda";
import { BookingPortal } from "@/components/booking/BookingPortal";
import { MyPasses } from "@/components/booking/MyPasses";
import { AppShell } from "@/components/layout/AppShell";
import { THEME_KEY } from "@/components/layout/ThemeToggle";
import { ComplexMap } from "@/components/map/ComplexMap";
import { usePathname } from "./shims/navigation";

const ROUTES: Record<string, () => React.ReactElement> = {
  "/": BookingPortal,
  "/mapa": ComplexMap,
  "/pases": MyPasses,
  "/admin": AdminDashboard,
  "/admin/agenda": MasterAgenda,
};

/** Tema: elección guardada en la app; si no hay, el del visor (data-theme) o el del sistema. */
function syncTheme() {
  const root = document.documentElement;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_KEY);
  } catch {}
  const host = root.getAttribute("data-theme");
  const dark = stored
    ? stored === "dark"
    : host
      ? host === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}
syncTheme();
new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncTheme);

function App() {
  const path = usePathname();
  const Page = ROUTES[path] ?? BookingPortal;
  return (
    <AppShell>
      <Page />
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
