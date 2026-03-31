#!/usr/bin/env node
/**
 * import-lotro-companion-loot.js
 *
 * Reads loot data from the local LotRO Companion data directory and writes
 * content/instances/loot-reference.json with the full per-boss, per-chest
 * item breakdown.
 *
 * Data chain:
 *   containers.xml  →  chest name + filteredTrophyTableId(s)
 *   loots.xml       →  filteredTrophyTable → per-class trophyList
 *                   →  trophyList → treasureGroupProfileId / direct itemId
 *                   →  itemsTable → weighted item entries
 *   items.xml       →  item quality (RARE, INCOMPARABLE, etc.)
 *
 * Usage:
 *   node import-lotro-companion-loot.js
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const COMPANION_DATA = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'OneDrive', 'Documents', 'The Lord of the Rings Online',
  'LotRO Companion', 'app', 'data', 'lore'
);

const OUTPUT = path.join(__dirname, 'content', 'instances', 'loot-reference.json');

// Map of guide slug → { meta, chestPatterns (regex matching chest name → boss + tier) }
const INSTANCE_CONFIG = {
  'abyss-of-mordath-raid-guide': {
    label: 'Lotro Delver Loot - The Abyss of Mordath',
    url: 'https://lotro-delver.com/en/loot/1879358599',
    levelRange: '115',
    groupSize: '12-Player Raid',
    notes: 'Use this loot table to review raid drops, barter targets, and progression rewards before assigning mainspec/offspec priorities.',
    bosses: [
      {
        name: 'The Twins (High Priest & High Priestess)',
        chests: [
          { pattern: "The High Priest's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "The High Priest's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
          { pattern: "The High Priest's Hidden Chest",  label: 'Hidden Chest (Challenge)', tier: 'Challenge' },
        ]
      },
      {
        name: 'Sagróg the Deathless Warden',
        chests: [
          { pattern: "Sagróg's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "Sagróg's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
          { pattern: "Sagróg's Hidden Chest",  label: 'Hidden Chest (Challenge)', tier: 'Challenge' },
        ]
      },
      {
        name: 'Fingar the Greedy',
        chests: [
          { pattern: "Fingar's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "Fingar's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
          { pattern: "Fingar's Hidden Chest",  label: 'Hidden Chest (Challenge)', tier: 'Challenge' },
        ]
      }
    ]
  },
  'court-of-seregost-guide': {
    label: 'Lotro Delver Loot - The Court of Seregost',
    url: 'https://lotro-delver.com/en/loot/1879358600',
    levelRange: '105 - 160',
    groupSize: '3-Player Fellowship',
    notes: 'Useful for checking instance-specific loot, catch-up gear, and whether a repeat run is worth it for your class or alt.',
    bosses: [
      {
        name: 'The Morroval Twins (Gorkasak & Kulgrú)',
        chests: [
          { pattern: "The Twins' Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "The Twins' Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
        ]
      },
      {
        name: 'Dulgabêth the Broken',
        chests: [
          { pattern: "Dulgabêth's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "Dulgabêth's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
        ]
      },
      {
        name: 'Lhaereth the Stained',
        chests: [
          { pattern: "Lhaereth's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "Lhaereth's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
          { pattern: "Lhaereth's Hidden Chest",  label: 'Hidden Chest (Challenge)', tier: 'Challenge' },
        ]
      }
    ]
  },
  'dungeons-of-naerband-guide': {
    label: 'Lotro Delver Loot - The Dungeons of Naerband',
    url: 'https://lotro-delver.com/en/loot/1879358597',
    levelRange: '105 - 160',
    groupSize: '6-Player Fellowship',
    notes: 'Review the loot table here before running Naerband so your group knows which boss drops and reward brackets matter most.',
    bosses: [
      {
        name: 'Gumog the Torturer',
        chests: [
          { pattern: "Gumog's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "Gumog's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
        ]
      },
      {
        name: 'Thraknûl',
        chests: [
          { pattern: "Thraknûl's Silver Chest",  label: 'Silver Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: "Thraknûl's Golden Chest",  label: 'Golden Chest (Tier 2)', tier: 'Tier 2' },
          { pattern: "Thraknûl's Hidden Chest",  label: 'Hidden Chest (Challenge)', tier: 'Challenge' },
        ]
      }
    ]
  },
  'ost-dunhoth-disease-wing-guide': {
    label: 'Lotro Delver Loot - Ost Dunhoth Disease and Poison Wing',
    url: 'https://lotro-delver.com/en/loot/1879264103',
    levelRange: '65 - 160',
    groupSize: '12-Player Raid',
    notes: 'Use the Delver listing to confirm wing-specific rewards and compare whether this wing is worth farming versus other raid targets.',
    bosses: [
      {
        name: 'Corrupted Huorns (Baleleaf & Dourbark)',
        chests: [
          { pattern: 'Ornate Chest - Disease Wing',      label: 'Ornate Chest (Tier 1)', tier: 'Tier 1' },
          { pattern: 'Gold Chest - Disease Wing',         label: 'Gold Chest (Tier 2)', tier: 'Tier 2' },
          { pattern: 'Fancy Gold Chest - Disease Wing',   label: 'Fancy Gold Chest (Challenge)', tier: 'Challenge' },
        ]
      }
    ]
  },
  'tower-of-orthanc-fire-ice-guide': {
    label: 'Lotro Delver Loot - The Tower of Orthanc',
    url: 'https://lotro-delver.com/en/loot/1879221643',
    levelRange: '75',
    groupSize: '12-Player Raid',
    notes: 'The Delver page covers the broader Tower of Orthanc raid loot pool and is the best quick reference before running Fire and Frost.',
    bosses: [
      {
        name: 'Crisiant & Usgarren (Ring of Fire and Frost)',
        chests: [
          // Tower of Orthanc uses generic chest names shared across wings,
          // so we reference by container ID. Wing chests share loot pools.
          { containerId: '1879222034', label: 'Ornate Chest (Tier 1)', tier: 'Tier 1' },
          { containerId: '1879222041', label: 'Gold Chest (Tier 2)', tier: 'Tier 2' },
          { containerId: '1879222033', label: 'Fancy Gold Chest (Challenge)', tier: 'Challenge' },
        ]
      }
    ]
  }
};

// ---------------------------------------------------------------------------
// XML helpers — regex-based parsing (the files use a flat, regular format)
// ---------------------------------------------------------------------------

// Friendly stat name mappings
const STAT_LABELS = {
  MIGHT: 'Might', AGILITY: 'Agility', WILL: 'Will', VITALITY: 'Vitality',
  FATE: 'Fate', MORALE: 'Morale', POWER: 'Power',
  PHYSICAL_MASTERY: 'Physical Mastery', TACTICAL_MASTERY: 'Tactical Mastery',
  PHYSICAL_MITIGATION: 'Physical Mitigation', TACTICAL_MITIGATION: 'Tactical Mitigation',
  CRITICAL_RATING: 'Critical Rating', FINESSE: 'Finesse', RESISTANCE: 'Resistance',
  ICMR: 'In-Combat Morale Regen', OCMR: 'Out-of-Combat Morale Regen',
  ICPR: 'In-Combat Power Regen', OCPR: 'Out-of-Combat Power Regen',
  ARMOUR: 'Armour', BLOCK: 'Block', PARRY: 'Parry', EVADE: 'Evade',
  LIGHT_OF_EARENDIL: 'Light of Eärendil',
  INCOMING_HEALING: 'Incoming Healing', OUTGOING_HEALING: 'Outgoing Healing',
  PHYSICAL_MITIGATION_PERCENTAGE: 'Physical Mitigation %',
  TACTICAL_MITIGATION_PERCENTAGE: 'Tactical Mitigation %',
};

function loadXml(filename) {
  const fp = path.join(COMPANION_DATA, filename);
  console.log(`  Reading ${fp} ...`);
  return fs.readFileSync(fp, 'utf8');
}

/** Build a Map of container ID → { name, filteredTrophyTableIds[], trophyListId } */
function parseContainers(xml) {
  const byId = new Map();
  const byName = new Map(); // name → first container ID with that name
  const re = /<container\s+([^>]+)\/?\s*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const name = attr(attrs, 'name');
    const id = attr(attrs, 'id');
    const ftIds = [];
    for (const key of ['filteredTrophyTableId', 'filteredTrophyTableId2', 'filteredTrophyTableId3']) {
      const v = attr(attrs, key);
      if (v) ftIds.push(v);
    }
    const trophyListId = attr(attrs, 'trophyListId');
    byId.set(id, { name, filteredTrophyTableIds: ftIds, trophyListId });
    if (!byName.has(name)) byName.set(name, id);
  }
  return { byId, byName };
}

/** Build indexes from loots.xml */
function parseLootsFile(xml) {
  // itemsTable id → [ { itemId, name, weight } ]
  const itemsTables = new Map();
  // trophyList id → [ { dropFrequency, itemId?, name?, treasureGroupProfileId? } ]
  const trophyLists = new Map();
  // filteredTrophyTable id → [ { trophyListId, requiredClass } ]
  const filteredTables = new Map();

  // --- itemsTable ---
  const itRe = /<itemsTable\s+id="(\d+)">([\s\S]*?)<\/itemsTable>/g;
  let m;
  while ((m = itRe.exec(xml)) !== null) {
    const tableId = m[1];
    const body = m[2];
    const entries = [];
    const entryRe = /<itemsTableEntry\s+([^>]+)\/?\s*>/g;
    let em;
    while ((em = entryRe.exec(body)) !== null) {
      entries.push({
        weight: Number(attr(em[1], 'weight')) || 1,
        itemId: attr(em[1], 'itemId'),
        name: attr(em[1], 'name'),
      });
    }
    itemsTables.set(tableId, entries);
  }

  // --- trophyList ---
  const tlRe = /<trophyList\s+id="(\d+)">([\s\S]*?)<\/trophyList>/g;
  while ((m = tlRe.exec(xml)) !== null) {
    const listId = m[1];
    const body = m[2];
    const entries = [];
    const entryRe = /<trophyListEntry\s+([^>]+)\/?\s*>/g;
    let em;
    while ((em = entryRe.exec(body)) !== null) {
      entries.push({
        dropFrequency: parseFloat(attr(em[1], 'dropFrequency')) || 0,
        itemId: attr(em[1], 'itemId'),
        name: attr(em[1], 'name'),
        treasureGroupProfileId: attr(em[1], 'treasureGroupProfileId'),
      });
    }
    trophyLists.set(listId, entries);
  }

  // --- filteredTrophyTable ---
  const ftRe = /<filteredTrophyTable\s+id="(\d+)">([\s\S]*?)<\/filteredTrophyTable>/g;
  while ((m = ftRe.exec(xml)) !== null) {
    const tableId = m[1];
    const body = m[2];
    const entries = [];
    const entryRe = /<filteredTrophyTableEntry\s+([^>]+)\/?\s*>/g;
    let em;
    while ((em = entryRe.exec(body)) !== null) {
      entries.push({
        trophyListId: attr(em[1], 'trophyListId'),
        requiredClass: attr(em[1], 'requiredClass'),
      });
    }
    filteredTables.set(tableId, entries);
  }

  return { itemsTables, trophyLists, filteredTables };
}

/** Build item quality map from items.xml (id → { quality, level, slot, scaling, stats[] }) */
function parseItemDetails(xml, progressions) {
  const map = new Map();
  const re = /<item\s+key="(\d+)"\s+name="([^"]*)"([^>]*)>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const attrs = m[3];
    const body = m[4];
    const quality = (attr(attrs, 'quality') || 'common').toLowerCase();
    const level = parseInt(attr(attrs, 'level')) || 0;
    const slot = (attr(attrs, 'slot') || '').replace(/_/g, ' ').toLowerCase();
    const itemScaling = attr(attrs, 'scaling'); // item-level scaling (player level)

    // Parse stats from the body
    const stats = [];
    const sr = /<stat\s+name="([^"]*)"(?:\s+(?:constant="([^"]*)"|scaling="([^"]*)"))/g;
    let s;
    while ((s = sr.exec(body)) !== null) {
      const statName = s[1];
      if (s[2]) {
        // Constant stat
        stats.push({ stat: STAT_LABELS[statName] || statName, value: Math.round(parseFloat(s[2])) });
      } else if (s[3] && progressions) {
        // Scaling stat — resolve at item level
        const value = interpolateProgression(progressions.get(s[3]), level);
        if (value !== null) {
          stats.push({ stat: STAT_LABELS[statName] || statName, value });
        }
      }
    }

    map.set(id, { quality, level, slot, scaling: !!itemScaling, stats });
  }
  return map;
}

/** Parse progressions.xml into Map of id → [{x, y}] */
function parseProgressions(xml) {
  const map = new Map();
  const re = /<linearInterpolationProgression\s+identifier="(\d+)"\s+nbPoints="\d+">([\s\S]*?)<\/linearInterpolationProgression>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const body = m[2];
    const points = [];
    const pr = /<point\s+x="([^"]*)"\s+y="([^"]*)"\s*\/>/g;
    let p;
    while ((p = pr.exec(body)) !== null) {
      points.push({ x: parseFloat(p[1]), y: parseFloat(p[2]) });
    }
    map.set(id, points);
  }
  return map;
}

/** Linear interpolation on a progression curve at a given level */
function interpolateProgression(points, level) {
  if (!points || !points.length) return null;
  if (level <= points[0].x) return Math.round(points[0].y);
  if (level >= points[points.length - 1].x) return Math.round(points[points.length - 1].y);
  for (let i = 0; i < points.length - 1; i++) {
    if (level >= points[i].x && level <= points[i + 1].x) {
      const t = (level - points[i].x) / (points[i + 1].x - points[i].x);
      return Math.round(points[i].y + t * (points[i + 1].y - points[i].y));
    }
  }
  return null;
}

function attr(str, name) {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = str.match(re);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Filters — skip generic / uninteresting items
// ---------------------------------------------------------------------------
const SKIP_PATTERNS = [
  /^Enhancement Rune/i,
  /^Scroll of/i,
  /^Relic Removal Scroll/i,
  /^Heritage Rune/i,
  /^Star-lit Crystal/i,
  /^Anfalas Star-lit Crystal/i,
  /^Ithilien Essence/i,
  /^Sealed .+Tracery/i,
  /^Tracery, Lvl/i,
  /^Legendary Rings$/i,
  /^Lesser Abyssal Essences$/i,
  /^Decorated Coffer of Ancient Script$/i,
];

function shouldSkip(name) {
  return SKIP_PATTERNS.some(re => re.test(name));
}

// ---------------------------------------------------------------------------
// Loot resolution
// ---------------------------------------------------------------------------

/**
 * Given a container (chest), resolve ALL unique items across every class
 * variant. Calculates effective per-item drop rates accounting for table
 * weights. Returns array of { name, itemId, drop, quality, stats, level, slot, scaling }.
 */
function resolveChestItems(container, loots, itemDetails) {
  const { filteredTables, trophyLists, itemsTables } = loots;
  const seen = new Map(); // itemId → { name, maxDrop, quality, stats, level, slot, scaling }

  function addItem(itemId, name, effectiveDrop) {
    if (!itemId || !name) return;
    if (shouldSkip(name)) return;
    const existing = seen.get(itemId);
    if (!existing || effectiveDrop > existing.maxDrop) {
      const detail = itemDetails.get(itemId);
      const quality = detail ? detail.quality : 'common';
      seen.set(itemId, {
        name, maxDrop: effectiveDrop, quality,
        stats: detail ? detail.stats : [],
        level: detail ? detail.level : 0,
        slot: detail ? detail.slot : '',
        scaling: detail ? detail.scaling : false,
      });
    }
  }

  function resolveTrophyList(listId) {
    const entries = trophyLists.get(listId);
    if (!entries) return;
    for (const entry of entries) {
      if (entry.itemId) {
        // Direct item drop — dropFrequency is the actual chance
        addItem(entry.itemId, entry.name, entry.dropFrequency);
      }
      if (entry.treasureGroupProfileId) {
        // Points to an itemsTable — dropFrequency is the chance the table
        // rolls, then each item's weight determines which one you get.
        const tableEntries = itemsTables.get(entry.treasureGroupProfileId);
        if (tableEntries) {
          const totalWeight = tableEntries.reduce((s, e) => s + e.weight, 0);
          for (const te of tableEntries) {
            const effective = entry.dropFrequency * (te.weight / totalWeight);
            addItem(te.itemId, te.name, effective);
          }
        }
      }
    }
  }

  // Only process the primary filteredTrophyTable (index 0) — this contains
  // the capped-level raid-specific gear. Secondary/tertiary tables hold
  // level-scaled generic drops that don't belong in raid guides.
  const primaryFtId = container.filteredTrophyTableIds[0];
  if (primaryFtId) {
    const ftEntries = filteredTables.get(primaryFtId);
    if (ftEntries) {
      for (const fte of ftEntries) {
        resolveTrophyList(fte.trophyListId);
      }
    }
  }

  // Also process the direct trophyListId if present (shared/generic loot)
  if (container.trophyListId) {
    resolveTrophyList(container.trophyListId);
  }

  // Convert to array, sorted by drop frequency desc then name
  const items = [];
  for (const [itemId, data] of seen) {
    const item = {
      name: data.name,
      itemId,
      drop: dropLabel(data.maxDrop),
      quality: data.quality,
    };
    if (data.stats && data.stats.length) item.stats = data.stats;
    if (data.level) item.level = data.level;
    if (data.slot) item.slot = data.slot;
    if (data.scaling) item.scaling = true;
    items.push(item);
  }
  items.sort((a, b) => {
    const order = { 'Guaranteed': 0, 'Common': 1, 'Uncommon': 2, 'Rare': 3 };
    const ao = order[a.drop] ?? 4;
    const bo = order[b.drop] ?? 4;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });
  return items;
}

function dropLabel(freq) {
  if (freq >= 0.5) return 'Guaranteed';
  if (freq >= 0.15) return 'Common';
  if (freq >= 0.03) return 'Uncommon';
  return 'Rare';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('LotRO Companion Loot Importer');
  console.log('=============================\n');

  // Load XML files
  const containersXml = loadXml('containers.xml');
  const lootsXml = loadXml('loots.xml');
  const itemsXml = loadXml('items.xml');
  const progressionsXml = loadXml('progressions.xml');

  console.log('\nParsing containers...');
  const containers = parseContainers(containersXml);
  console.log(`  Found ${containers.byId.size} containers`);

  console.log('Parsing loots (this may take a moment)...');
  const loots = parseLootsFile(lootsXml);
  console.log(`  ${loots.itemsTables.size} itemsTables, ${loots.trophyLists.size} trophyLists, ${loots.filteredTables.size} filteredTrophyTables`);

  console.log('Parsing progressions...');
  const progressions = parseProgressions(progressionsXml);
  console.log(`  ${progressions.size} progression curves`);

  console.log('Parsing item details (stats, slots, scaling)...');
  const itemDetails = parseItemDetails(itemsXml, progressions);
  console.log(`  ${itemDetails.size} items indexed\n`);

  // Build output
  const output = {};

  for (const [slug, config] of Object.entries(INSTANCE_CONFIG)) {
    console.log(`\n=== ${config.label} ===`);
    const entry = {
      label: config.label,
      url: config.url,
      levelRange: config.levelRange,
      groupSize: config.groupSize,
      notes: config.notes,
      bosses: [],
    };

    for (const bossConfig of config.bosses) {
      const boss = {
        name: bossConfig.name,
        chests: [],
      };

      for (const chestConfig of bossConfig.chests) {
        // Look up container by ID first, then fall back to name match
        let container;
        let chestLabel;
        if (chestConfig.containerId) {
          container = containers.byId.get(chestConfig.containerId);
          chestLabel = container ? container.name : chestConfig.containerId;
        } else {
          const id = containers.byName.get(chestConfig.pattern);
          container = id ? containers.byId.get(id) : undefined;
          chestLabel = chestConfig.pattern;
        }
        if (!container) {
          console.log(`  WARNING: Chest not found: "${chestLabel}"`);
          boss.chests.push({
            label: chestConfig.label,
            tier: chestConfig.tier,
            items: [],
          });
          continue;
        }

        const items = resolveChestItems(container, loots, itemDetails);
        console.log(`  ${chestLabel}: ${items.length} items`);

        boss.chests.push({
          label: chestConfig.label,
          tier: chestConfig.tier,
          items: items.map(i => {
            const out = { name: i.name, drop: i.drop };
            if (i.stats && i.stats.length) out.stats = i.stats;
            if (i.level) out.level = i.level;
            if (i.slot) out.slot = i.slot;
            if (i.scaling) out.scaling = true;
            return out;
          }),
        });
      }

      entry.bosses.push(boss);
    }

    output[slug] = entry;
  }

  // Write output
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote ${OUTPUT}`);

  // Summary
  let totalItems = 0;
  for (const entry of Object.values(output)) {
    for (const boss of entry.bosses) {
      for (const chest of boss.chests) {
        totalItems += chest.items.length;
      }
    }
  }
  console.log(`Total: ${Object.keys(output).length} instances, ${totalItems} item entries`);
}

main();
