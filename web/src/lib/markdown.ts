import fs from "fs";
import path from "path";
import { marked } from "marked";
import { readRepoJson, repoRoot } from "./paths";

const TRAIT_CLASSES = new Set([
  "beorning",
  "brawler",
  "burglar",
  "captain",
  "champion",
  "guardian",
  "hunter",
  "loremaster",
  "mariner",
  "minstrel",
  "runekeeper",
  "warden",
]);

function parseOptions(inner: string) {
  const opts: Record<string, string> = {};
  inner.split(",").forEach((pair) => {
    const eq = pair.indexOf("=");
    if (eq === -1) return;
    opts[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
  });
  return opts;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveMapEmbeds(html: string) {
  return html
    .replace(/<p>\s*(\{\{map:[^}]+\}\})\s*<\/p>/gi, "$1")
    .replace(/\{\{map:([^}]+)\}\}/g, (_match, inner: string) => {
      const opts = parseOptions(inner);
      const first = inner.split(",")[0];
      const eq = first.indexOf("=");
      const type = first.slice(0, eq).trim();
      const id = first.slice(eq + 1).trim();
      const height = opts.height || "450";
      const params = new URLSearchParams({ [type]: id, embed: "1" });
      if (opts.lng) params.set("lng", opts.lng);
      if (opts.lat) params.set("lat", opts.lat);
      return `<div class="lotro-map-embed" style="height:${height}px"><iframe src="/map?${params.toString()}" style="width:100%;height:100%;border:0" loading="lazy" allowfullscreen title="LOTRO Interactive Map"></iframe></div>`;
    });
}

function resolveTraitPlanners(html: string) {
  return html
    .replace(/<p>\s*(\{\{traitPlanner:[^}]+\}\})\s*<\/p>/gi, "$1")
    .replace(/\{\{traitPlanner:([^}]+)\}\}/g, (_match, inner: string) => {
      const opts = parseOptions(inner);
      const cls = (opts.class || "").toLowerCase();
      const buildKey = opts.build || "";
      if (!TRAIT_CLASSES.has(cls) || !buildKey) return "";
      let buildName = opts.title || "";
      let buildDesc = "";
      let blue = 0;
      let red = 0;
      let yellow = 0;
      const buildFile = path.join(repoRoot(), "data", "builds", `${cls}.json`);
      if (fs.existsSync(buildFile)) {
        try {
          const json = JSON.parse(fs.readFileSync(buildFile, "utf8"));
          const def = json.builds?.[buildKey];
          if (def) {
            buildName = buildName || def.name || "";
            buildDesc = def.desc || def.description || "";
            const points = def.points || {};
            for (const [key, value] of Object.entries(points)) {
              const amount = Number(value) || 0;
              if (key.startsWith("b-")) blue += amount;
              else if (key.startsWith("r-")) red += amount;
              else if (key.startsWith("y-")) yellow += amount;
            }
          }
        } catch {
          /* The card still links to the planner when build JSON is unreadable. */
        }
      }
      if (!buildName) {
        buildName = `${cls} ${buildKey}`.replace(/-/g, " ");
      }
      const href = `/skills?class=${encodeURIComponent(cls)}&build=${encodeURIComponent(buildKey)}&level=${encodeURIComponent(opts.level || "160")}`;
      const tags = [
        blue ? `<span style="padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;background:rgba(64,128,192,0.25);color:#7db8e8;">Blue: ${blue}</span>` : "",
        red ? `<span style="padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;background:rgba(192,64,64,0.25);color:#e87d7d;">Red: ${red}</span>` : "",
        yellow ? `<span style="padding:2px 8px;border-radius:3px;font-weight:600;font-size:11px;background:rgba(192,168,64,0.25);color:#e8d87d;">Yellow: ${yellow}</span>` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<div class="trait-planner-embed" style="background:rgba(26,26,46,1);border:1px solid #444;border-radius:8px;padding:18px 22px;margin:1.5rem 0;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
          <i class="fa fa-bookmark" style="color:var(--lotro-gold);font-size:18px;"></i>
          <span style="font-family:'Cinzel',serif;color:#eee;font-size:16px;font-weight:600;">${escapeHtml(buildName)}</span>
        </div>
        ${buildDesc ? `<p style="color:#aaa;font-size:13px;margin:0 0 10px 0;">${escapeHtml(buildDesc)}</p>` : ""}
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">${tags}</div>
        <a href="${href}" style="display:inline-block;background:rgba(201,168,76,0.15);border:1px solid var(--lotro-gold);color:var(--lotro-gold);padding:8px 20px;border-radius:4px;font-size:14px;font-weight:500;text-decoration:none;">
          <i class="fa fa-play"></i> Open in Trait Builder
        </a>
      </div>`;
    });
}

function resolveDataWidgets(html: string) {
  const loot = readRepoJson<Record<string, unknown>>("content", "instances", "loot-reference.json");
  return html
    .replace(/<p>\s*(\{\{(?:dpsStatTable|instanceLootReference|consumableTable)[^}]*\}\})\s*<\/p>/gi, "$1")
    .replace(/\{\{dpsStatTable(?::([^}]+))?\}\}/g, (_match, inner: string) => {
      const opts = inner ? parseOptions(inner) : {};
      const heading = opts.heading || "Desired Stat Percentages";
      return `<aside class="alert alert-info"><strong>${escapeHtml(heading)}</strong><p style="margin:8px 0 0;">Stat targets for this guide are edited in Strapi. Open the <a href="/skills">trait builder</a> to check a build against current caps.</p></aside>`;
    })
    .replace(/\{\{instanceLootReference\}\}/g, () => {
      const count = loot ? Object.keys(loot).length : 0;
      return `<aside class="alert alert-info"><strong>Instance loot</strong><p style="margin:8px 0 0;">Loot tables are loaded from the game database${count ? ` (${count} curated references)` : ""}. Browse the <a href="/instances">instance database</a> for boss drops.</p></aside>`;
    })
    .replace(/\{\{consumableTable(?::[^}]+)?\}\}/g, () => {
      return `<aside class="alert alert-info"><strong>Consumables</strong><p style="margin:8px 0 0;">See the <a href="/items?q=consumable">item database</a> for food, scrolls, and other consumables.</p></aside>`;
    });
}

export function renderMarkdown(markdown: string) {
  const html = marked.parse(markdown, { async: false }) as string;
  return resolveDataWidgets(resolveTraitPlanners(resolveMapEmbeds(html)));
}

export function renderBody(body: string, format: "markdown" | "html" = "markdown") {
  if (format === "html") return body;
  return renderMarkdown(body);
}
