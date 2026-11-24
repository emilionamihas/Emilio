import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata: Metadata = { title: "Gestión" };

export default function AdminPage() {
  return <AdminDashboard />;
}
