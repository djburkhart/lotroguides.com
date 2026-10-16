import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/lib/content";
import { PageView } from "@/components/PageView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("terms");
  return { title: `${page?.title || "Terms of Service"} - LOTRO Guides` };
}

export default async function TermsPage() {
  const page = await getPage("terms");
  if (!page) notFound();
  return <PageView page={page} />;
}
