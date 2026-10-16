import type { Metadata } from "next";
import { DatabasePage } from "@/components/DatabasePage";

export const metadata: Metadata = { title: "Virtue Database - LOTRO Guides" };

export default function Page() {
  return <DatabasePage id="virtues" />;
}
