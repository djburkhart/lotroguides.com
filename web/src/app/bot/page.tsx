import type { Metadata } from "next";
import fs from "fs";
import path from "path";
import { repoRoot } from "@/lib/paths";

export const metadata: Metadata = { title: "Discord Bot - LOTRO Guides" };

export default function BotPage() {
  const html = fs
    .readFileSync(path.join(repoRoot(), "templates", "bot-content.html"), "utf8")
    .replaceAll("{{discordAppId}}", process.env.DISCORD_APP_ID || "")
    .replaceAll('href="./"', 'href="/"');
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
