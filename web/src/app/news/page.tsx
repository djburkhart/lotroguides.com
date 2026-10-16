import type { Metadata } from "next";
import { getArticles } from "@/lib/content";
import { Listing } from "@/components/Listing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "News - LOTRO Guides" };

export default async function NewsPage() {
  const articles = (await getArticles()).filter((article) => article.category === "news");
  return <Listing title="News" icon="fa-newspaper-o" articles={articles} />;
}
