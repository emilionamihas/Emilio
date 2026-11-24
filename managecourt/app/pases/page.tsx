import type { Metadata } from "next";
import { MyPasses } from "@/components/booking/MyPasses";

export const metadata: Metadata = { title: "Mis pases" };

export default function PassesPage() {
  return <MyPasses />;
}
