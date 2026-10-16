import type { Metadata } from "next";
import { DatabasePage } from "@/components/DatabasePage";

export const metadata: Metadata = { title: "Collections - LOTRO Guides" };

export default function Page() {
  return <DatabasePage id="collections" />;
}
