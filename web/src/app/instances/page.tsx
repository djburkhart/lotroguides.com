import type { Metadata } from "next";
import { DatabasePage } from "@/components/DatabasePage";

export const metadata: Metadata = { title: "Instance Database - LOTRO Guides" };

export default function Page() {
  return <DatabasePage id="instances" />;
}
