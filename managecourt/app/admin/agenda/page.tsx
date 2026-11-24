import type { Metadata } from "next";
import { MasterAgenda } from "@/components/admin/MasterAgenda";

export const metadata: Metadata = { title: "Agenda maestra" };

export default function AgendaPage() {
  return <MasterAgenda />;
}
