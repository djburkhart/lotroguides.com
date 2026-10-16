import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/lib/content";
import { PageView } from "@/components/PageView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("about");
  return { title: `${page?.title || "About"} - LOTRO Guides` };
}

export default async function AboutPage() {
  const page = await getPage("about");
  if (!page) notFound();
  return <PageView page={page} />;
}
