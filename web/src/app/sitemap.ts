import type { MetadataRoute } from "next";
import { getArticles } from "@/lib/content";
import { siteUrl } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const articles = await getArticles();
  const staticPaths = [
    "",
    "/guides",
    "/news",
    "/items",
    "/mobs",
    "/sets",
    "/virtues",
    "/deeds",
    "/quests",
    "/instances",
    "/titles",
    "/factions",
    "/recipes",
    "/collections",
    "/map",
    "/skills",
    "/characters",
    "/media",
    "/about",
    "/bot",
    "/privacy",
    "/terms",
  ];
  return [
    ...staticPaths.map((path) => ({ url: `${base}${path || "/"}` })),
    ...articles.map((article) => ({
      url: `${base}/${article.category === "guide" ? "guides" : "news"}/${article.slug}`,
      lastModified: article.publishedOn || undefined,
    })),
  ];
}
