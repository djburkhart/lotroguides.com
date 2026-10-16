import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArticle, getRelated } from "@/lib/content";
import { ArticleView } from "@/components/ArticleView";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle("guide", slug);
  if (!article) return { title: "Guide not found" };
  return { title: `${article.title} - LOTRO Guides`, description: article.excerpt };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle("guide", slug);
  if (!article) notFound();
  const related = await getRelated(article);
  return <ArticleView article={article} related={related} />;
}
