import type { Metadata } from "next";
import { getArticles } from "@/lib/content";
import { Listing } from "@/components/Listing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Guides - LOTRO Guides" };

export default async function GuidesPage() {
  const articles = (await getArticles()).filter((article) => article.category === "guide");
  return <Listing title="Guides" icon="fa-book" articles={articles} />;
}
