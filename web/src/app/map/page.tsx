import type { Metadata } from "next";
import { DatabasePage } from "@/components/DatabasePage";

export const metadata: Metadata = { title: "Interactive Map - LOTRO Guides" };

export default function Page() {
  return <DatabasePage id="map" />;
}
