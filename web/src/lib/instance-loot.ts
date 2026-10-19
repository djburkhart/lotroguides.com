import { readRepoJson } from "./paths";

export type LootStat = { stat?: string; value?: number };
export type LootItem = {
  name?: string;
  n?: string;
  drop?: string;
  level?: number;
  slot?: string;
  stats?: LootStat[];
};
export type LootChest = {
  name?: string;
  label?: string;
  tier?: string | number;
  items?: LootItem[];
};
export type LootBoss = { name?: string; chests?: LootChest[] };

type LoreItem = { name?: string; icon?: string; quality?: string };

const GENERIC_CONTAINER =
  /^(?:backpack|satchel|strongbox|wooden chest|small chest|small fancy chest|fancy wood chest|fancy gold chest|gold chest|silver chest|mithril chest|ornate chest|wood chest|chest|crate|barrel|mossy chest|ancient chest)(?: \d+)?$/i;

const PUBLIC_CDN = "https://lotroguides.atl1.cdn.digitaloceanspaces.com";

let iconsByName: Map<string, { icon?: string; quality?: string }> | undefined;

function itemIcons() {
  if (iconsByName) return iconsByName;
  const items = readRepoJson<LoreItem[]>("data", "lore", "items.json") || [];
  iconsByName = new Map();
  for (const item of items) {
    if (item.name) iconsByName.set(item.name, { icon: item.icon, quality: item.quality });
  }
  return iconsByName;
}

export function isGenericContainer(name: string) {
  return GENERIC_CONTAINER.test(name.trim());
}

export function lootIconUrl(iconId: string) {
  const fromEnv = (process.env.DO_CDN_URL || "").trim().replace(/\/$/, "");
  return `${fromEnv || PUBLIC_CDN}/img/icons/items/${iconId}.png`;
}

const TIER_WORDS = ["Thin", "Brilliant", "Padded", "Heavy", "Light", "Medium", "Hardened"];

export function lookupLootItem(name: string) {
  const icons = itemIcons();
  const exact = icons.get(name);
  if (exact?.icon) return exact;
  let current = name;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const word of TIER_WORDS) {
      const next = current.replace(new RegExp(`\\b${word}\\b\\s*`, "g"), "").replace(/\s{2,}/g, " ").trim();
      if (next === current) continue;
      current = next;
      changed = true;
      const match = icons.get(current);
      if (match?.icon) return match;
    }
    if (!changed) break;
  }
  return exact;
}

export function visibleChests(boss: LootBoss) {
  if (isGenericContainer(boss.name || "")) return [];
  return (boss.chests || []).filter((chest) => !isGenericContainer(chest.label || chest.name || ""));
}
