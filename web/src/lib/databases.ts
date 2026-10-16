import fs from "fs";
import path from "path";
import { repoRoot } from "./paths";

export type DatabaseId =
  | "items"
  | "mobs"
  | "sets"
  | "virtues"
  | "deeds"
  | "quests"
  | "instances"
  | "titles"
  | "factions"
  | "recipes"
  | "collections"
  | "map"
  | "skills";

export type DatabaseConfig = {
  template: string;
  title: string;
  description: string;
  vars: Record<string, string>;
  styles: string[];
  scripts: string[];
  boot: string;
};

const CDN = `var _cdn = window.LOTRO_CDN ? window.LOTRO_CDN.replace(/\\/$/, "") + "/" : "/";`;

function boot(body: string) {
  return `var $ = window.jQuery;
  ${CDN}
  function fail(message) {
    var el = document.querySelector(".heading p");
    if (el) el.textContent = message;
  }
  ${body}`;
}

function loadJson(file: string, assign: string, script: string, init: string) {
  return boot(`$.getJSON(_cdn + "${file}").done(function (data) {
    window.${assign} = data;
    $.getScript("${script}", function () {
      if (window.${init}) window.${init}();
    });
  }).fail(function () { fail("Game data has not been imported yet. Run the data import, then reload this page."); });`);
}

export const DATABASES: Record<DatabaseId, DatabaseConfig> = {
  items: {
    template: "items-content.html",
    title: "Content Database - LOTRO Guides",
    description: "Search items from the LotRO Companion database.",
    vars: { itemCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js", "/js/items-db.js"],
    boot: boot(`$.getJSON(_cdn + "data/items-db-manifest.json").done(function (manifest) {
      $.getJSON(_cdn + "data/items-db-0.json").done(function (firstChunk) {
        window.LOTRO_ITEMS_DB = firstChunk;
        if (window.LOTRO_ITEMS_INIT) window.LOTRO_ITEMS_INIT();
        if (manifest.totalChunks > 1 && window.LOTRO_ITEMS_ADD_CHUNK) {
          var loaded = 1;
          (function loadNext(i) {
            if (i >= manifest.totalChunks) return;
            $.getJSON(_cdn + "data/items-db-" + i + ".json").done(function (chunk) {
              loaded++;
              window.LOTRO_ITEMS_ADD_CHUNK(chunk, loaded, manifest.totalChunks);
              loadNext(i + 1);
            });
          })(1);
        }
      });
    }).fail(function () { fail("Item data has not been imported yet. Run the data import, then reload this page."); });`),
  },
  mobs: {
    template: "mobs-content.html",
    title: "Mob Database - LOTRO Guides",
    description: "Browse enemies from the LotRO Companion database.",
    vars: { mobCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: boot(`$.when($.getJSON(_cdn + "data/mobs-db.json"), $.getJSON(_cdn + "data/mob-overlay.json")).done(function (mobsRes, overlayRes) {
      window.LOTRO_MOBS_DB = mobsRes[0];
      window.LOTRO_MOB_OVERLAY = overlayRes[0] || {};
      $.getScript("/js/mobs-db.js", function () { if (window.LOTRO_MOBS_INIT) window.LOTRO_MOBS_INIT(); });
    }).fail(function () { fail("Mob data has not been imported yet. Run the data import, then reload this page."); });`),
  },
  sets: {
    template: "sets-content.html",
    title: "Set Database - LOTRO Guides",
    description: "Browse armour and weapon sets.",
    vars: { setCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/sets-db.json", "LOTRO_SETS_DB", "/js/sets-db.js", "LOTRO_SETS_INIT"),
  },
  virtues: {
    template: "virtues-content.html",
    title: "Virtue Database - LOTRO Guides",
    description: "Browse LOTRO virtues.",
    vars: { virtueCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/virtues-db.json", "LOTRO_VIRTUES_DB", "/js/virtues-db.js", "LOTRO_VIRTUES_INIT"),
  },
  deeds: {
    template: "deeds-content.html",
    title: "Deed Database - LOTRO Guides",
    description: "Search deeds by type, level, and reward.",
    vars: { deedCount: "the", regionOptions: "" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: boot(`$.when($.getJSON(_cdn + "data/deeds-db.json"), $.getJSON(_cdn + "data/deed-overlay-index.json"), $.getJSON(_cdn + "data/icon-map.json")).done(function (deedsRes, overlayRes, iconRes) {
      window.LOTRO_DEEDS_DB = deedsRes[0];
      window.LOTRO_DEED_OVERLAY = overlayRes[0] || {};
      window.LOTRO_ICON_MAP = iconRes[0] || {};
      $.getScript("/js/deeds-db.js", function () { if (window.LOTRO_DEEDS_INIT) window.LOTRO_DEEDS_INIT(); });
    }).fail(function () { fail("Deed data has not been imported yet. Run the data import, then reload this page."); });`),
  },
  quests: {
    template: "quests-content.html",
    title: "Quest Database - LOTRO Guides",
    description: "Search quests by name, category, and level.",
    vars: { questCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: boot(`$.when($.getJSON(_cdn + "data/icon-map.json"), $.getJSON(_cdn + "data/quest-overlay-index.json")).done(function (iconRes, overlayRes) {
      window.LOTRO_ICON_MAP = iconRes[0] || {};
      window.LOTRO_QUEST_OVERLAY = overlayRes[0] || {};
      $.getScript("/js/quests-db.js", function () { if (window.LOTRO_QUESTS_INIT) window.LOTRO_QUESTS_INIT(); });
    }).fail(function () {
      $.getScript("/js/quests-db.js", function () { if (window.LOTRO_QUESTS_INIT) window.LOTRO_QUESTS_INIT(); });
    });`),
  },
  instances: {
    template: "instances-content.html",
    title: "Instance Database - LOTRO Guides",
    description: "Browse LOTRO instances, raids, and boss data.",
    vars: { instanceCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/instances-db-listing.json", "LOTRO_INSTANCES_DB", "/js/instances-db.js", "LOTRO_INSTANCES_INIT"),
  },
  titles: {
    template: "titles-content.html",
    title: "Title Database - LOTRO Guides",
    description: "Browse character titles.",
    vars: { titleCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/titles-db.json", "LOTRO_TITLES_DB", "/js/titles-db.js", "LOTRO_TITLES_INIT"),
  },
  factions: {
    template: "factions-content.html",
    title: "Reputation Factions - LOTRO Guides",
    description: "Browse reputation factions and LOTRO Point rewards.",
    vars: { factionCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/factions-db.json", "LOTRO_FACTIONS_DB", "/js/factions-db.js", "LOTRO_FACTIONS_INIT"),
  },
  recipes: {
    template: "recipes-content.html",
    title: "Recipe Database - LOTRO Guides",
    description: "Browse crafting recipes.",
    vars: { recipeCount: "the", professionCount: "every" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/recipes-db.json", "LOTRO_RECIPES_DB", "/js/recipes-db.js", "LOTRO_RECIPES_INIT"),
  },
  collections: {
    template: "collections-content.html",
    title: "Collections - LOTRO Guides",
    description: "Browse mount and pet collections.",
    vars: { collectionCount: "the", itemCount: "the" },
    styles: ["/plugins/datatables/datatables.min.css"],
    scripts: ["/plugins/datatables/datatables.min.js"],
    boot: loadJson("data/collections-db.json", "LOTRO_COLLECTIONS_DB", "/js/collections-db.js", "LOTRO_COLLECTIONS_INIT"),
  },
  map: {
    template: "map-content.html",
    title: "Interactive Map - LOTRO Guides",
    description: "Explore Middle-earth with quest, deed, and landmark markers.",
    vars: {},
    styles: [
      "/plugins/leaflet/leaflet.css",
      "/plugins/leaflet/MarkerCluster.css",
      "/plugins/leaflet/MarkerCluster.Default.css",
    ],
    scripts: [
      "/plugins/leaflet/leaflet.js",
      "/plugins/leaflet/leaflet.markercluster.js",
      "/js/lotro-map.js",
    ],
    boot: boot(`if (window.LOTRO_MAP_INIT) window.LOTRO_MAP_INIT();`),
  },
  skills: {
    template: "skills-content.html",
    title: "Skills & Trait Builder - LOTRO Guides",
    description: "Plan trait builds for every LOTRO class.",
    vars: {},
    styles: [],
    scripts: [],
    boot: "",
  },
};

const SOCKET_TO_CLASS: Record<number, string[]> = {
  6: ["beorning"],
  7: ["brawler", "champion"],
  8: ["burglar"],
  9: ["captain"],
  10: ["champion", "brawler"],
  11: ["guardian"],
  12: ["hunter"],
  13: ["lore-master"],
  14: ["minstrel"],
  15: ["rune-keeper"],
  16: ["warden"],
  21: ["mariner"],
};

export function skillsTemplateVars() {
  let traceriesData = "{}";
  const traceriesPath = path.join(repoRoot(), "data", "lore", "traceries.json");
  if (fs.existsSync(traceriesPath)) {
    const raw = JSON.parse(fs.readFileSync(traceriesPath, "utf8")) as Array<{
      st: string;
      n: string;
      max: number;
      sc: number;
    }>;
    const byKey = new Map<string, (typeof raw)[number]>();
    for (const entry of raw) {
      const key = `${entry.st}|${entry.n}`;
      const current = byKey.get(key);
      if (!current || entry.max > current.max) byKey.set(key, entry);
    }
    const groups: Record<string, { n: string; sc: number }[]> = {};
    for (const entry of byKey.values()) {
      if (!groups[entry.st]) groups[entry.st] = [];
      groups[entry.st].push({ n: entry.n, sc: entry.sc });
    }
    for (const group of Object.values(groups)) group.sort((a, b) => a.n.localeCompare(b.n));
    traceriesData = JSON.stringify({ groups, classMap: SOCKET_TO_CLASS });
  }

  const guideBuilds: unknown[] = [];
  const buildsDir = path.join(repoRoot(), "data", "builds");
  if (fs.existsSync(buildsDir)) {
    for (const file of fs.readdirSync(buildsDir).filter((name) => name.endsWith(".json"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(buildsDir, file), "utf8"));
        const cls = data.class || file.replace(".json", "");
        for (const [key, build] of Object.entries<any>(data.builds || {})) {
          if (!build?.points || !Object.keys(build.points).length) continue;
          guideBuilds.push({
            id: `guide_${cls}_${key}`,
            name: build.name || key,
            class: cls,
            build: key,
            level: build.level || 160,
            points: build.points,
            desc: build.desc || build.description || "",
            guide: true,
            likes: 0,
            createdAt: 0,
          });
        }
      } catch {
        /* Skip a single unreadable build file. */
      }
    }
  }

  return {
    assets: ".",
    editorAllowedEmails: process.env.EDITOR_ALLOWED_EMAILS || "",
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    guideBuilds: JSON.stringify(guideBuilds),
    traceriesData,
  };
}
