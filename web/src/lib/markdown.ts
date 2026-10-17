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

type LootStat = { stat?: string; value?: number };
type LootItem = { name?: string; n?: string; slot?: string; level?: number; drop?: string; stats?: LootStat[] };
type LootChest = { label?: string; name?: string; tier?: string; items?: LootItem[] };
type LootBoss = { name?: string; chests?: LootChest[] };
type LootEntry = { label?: string; instanceName?: string; notes?: string; bosses?: LootBoss[] };

function tableRow(piece: string) {
  let row = piece.trim();
  if (!row.startsWith("|")) row = `| ${row}`;
  if (!row.endsWith("|")) row = `${row} |`;
  return row;
}

function expandCollapsedTables(markdown: string) {
  const separator = /(?:\|[ :]*-{3,}[ :]*)+\|/;
  return markdown
    .split("\n")
    .map((line) => {
      const match = separator.exec(line);
      if (!match || match.index == null) return line;
      const before = line.slice(0, match.index).trim();
      const after = line.slice(match.index + match[0].length).trim();
      if (!before && !after) return line;
      const rows = [];
      if (before) rows.push(tableRow(before));
      rows.push(tableRow(match[0]));
      if (after) {
        for (const piece of after.split(" | |")) rows.push(tableRow(piece));
      }
      return rows.join("\n");
    })
    .join("\n");
}

function formatStats(stats: LootStat[] | undefined) {
  return (stats || [])
    .filter((stat) => stat.stat && stat.value)
    .map((stat) => `${stat.stat} ${Number(stat.value).toLocaleString()}`)
    .join(", ");
}

function renderLootEntry(entry: LootEntry, instanceSlug: string) {
  const bosses = entry.bosses || [];
  if (!bosses.length) return "";
  const title = entry.instanceName || entry.label || "Instance loot";
  const heading = instanceSlug
    ? `<p>Drops from <a href="/instances/${escapeHtml(instanceSlug)}">${escapeHtml(title)}</a>.</p>`
    : `<p>${escapeHtml(title)}</p>`;
  const notes = entry.notes ? `<p>${escapeHtml(entry.notes)}</p>` : "";
  const sections = bosses
    .map((boss) => {
      const chests = (boss.chests || [])
        .map((chest) => {
          const items = chest.items || [];
          if (!items.length) return "";
          const chestName = chest.label || chest.name || chest.tier || "Chest";
          const rows = items
            .map((item) => {
              const name = item.name || item.n || "Item";
              const href = `/items?q=${encodeURIComponent(name)}`;
              return `<tr><td><a href="${href}">${escapeHtml(name)}</a></td><td>${escapeHtml(item.slot || "")}</td><td>${item.level || ""}</td><td>${escapeHtml(item.drop || "")}</td><td>${escapeHtml(formatStats(item.stats))}</td></tr>`;
            })
            .join("");
          return `<details class="instance-loot-chest" open><summary>${escapeHtml(boss.name || "Boss")} — ${escapeHtml(chestName)} <span>(${items.length})</span></summary><div class="instance-loot-scroll"><table><thead><tr><th>Item</th><th>Slot</th><th>Level</th><th>Drop</th><th>Stats</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
        })
        .join("");
      return chests;
    })
    .join("");
  return `<div class="instance-loot">${heading}${notes}${sections}</div>`;
}

let curatedLoot: Record<string, LootEntry> | null | undefined;
let instanceLoot: Record<string, LootEntry> | null | undefined;

function curatedLootFile() {
  if (curatedLoot === undefined) {
    curatedLoot = readRepoJson<Record<string, LootEntry>>("content", "instances", "loot-reference.json");
  }
  return curatedLoot;
}

function instanceLootFile() {
  if (instanceLoot === undefined) {
    instanceLoot = readRepoJson<Record<string, LootEntry>>("data", "instance-loot.json");
  }
  return instanceLoot;
}

function lootForGuide(markdown: string, guideSlug: string) {
  const curated = curatedLootFile();
  if (guideSlug && curated?.[guideSlug]?.bosses?.length) {
    return { entry: curated[guideSlug], instanceSlug: "" };
  }
  const match = markdown.match(/instances\/([a-z0-9-]+)/i);
  const instanceSlug = match?.[1] || "";
  if (!instanceSlug) return null;
  const entry = instanceLootFile()?.[instanceSlug];
  if (!entry?.bosses?.length) return null;
  return { entry, instanceSlug };
}

function resolveDataWidgets(html: string, markdown: string, guideSlug: string) {
  return html
    .replace(/<p>\s*(\{\{(?:dpsStatTable|instanceLootReference|consumableTable)[^}]*\}\})\s*<\/p>/gi, "$1")
    .replace(/\{\{dpsStatTable(?::([^}]+))?\}\}/g, (_match, inner: string) => {
      const opts = inner ? parseOptions(inner) : {};
      const heading = opts.heading || "Desired Stat Percentages";
      return `<aside class="alert alert-info"><strong>${escapeHtml(heading)}</strong><p style="margin:8px 0 0;">Stat targets for this guide are edited in Strapi. Open the <a href="/skills">trait builder</a> to check a build against current caps.</p></aside>`;
    })
    .replace(/\{\{instanceLootReference(?::([^}]+))?\}\}/g, (_match, inner: string) => {
      const requested = inner ? parseOptions(inner).instance || inner.trim() : "";
      const chosen =
        requested && /^[a-z0-9-]+$/i.test(requested)
          ? lootForGuide(`instances/${requested}`, "") || lootForGuide(markdown, guideSlug)
          : lootForGuide(markdown, guideSlug);
      const rendered = chosen ? renderLootEntry(chosen.entry, chosen.instanceSlug) : "";
      if (rendered) return rendered;
      return `<aside class="alert alert-info"><strong>Instance loot</strong><p style="margin:8px 0 0;">Loot for this instance has not been imported yet. Browse the <a href="/instances">instance database</a> for boss drops.</p></aside>`;
    })
    .replace(/\{\{consumableTable(?::[^}]+)?\}\}/g, () => {
      return `<aside class="alert alert-info"><strong>Consumables</strong><p style="margin:8px 0 0;">See the <a href="/items?q=consumable">item database</a> for food, scrolls, and other consumables.</p></aside>`;
    });
}

export function renderMarkdown(markdown: string, guideSlug = "") {
  const source = expandCollapsedTables(markdown);
  const html = marked.parse(source, { async: false }) as string;
  return resolveDataWidgets(resolveTraitPlanners(resolveMapEmbeds(html)), source, guideSlug);
}

export function renderBody(body: string, format: "markdown" | "html" = "markdown", guideSlug = "") {
  if (format === "html") return body;
  return renderMarkdown(body, guideSlug);
}
