import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPage } from "@/lib/content";
import { PageView } from "@/components/PageView";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("privacy");
  return { title: `${page?.title || "Privacy Policy"} - LOTRO Guides` };
}

export default async function PrivacyPage() {
  const page = await getPage("privacy");
  if (!page) notFound();
  return <PageView page={page} />;
}
