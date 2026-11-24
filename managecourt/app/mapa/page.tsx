import type { Metadata } from "next";
import { ComplexMap } from "@/components/map/ComplexMap";

export const metadata: Metadata = { title: "Mapa del complejo" };

export default function MapPage() {
  return <ComplexMap />;
}
