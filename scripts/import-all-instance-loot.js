#!/usr/bin/env node
/**
 * import-all-instance-loot.js
 *
 * Automatically discovers and resolves loot data for ALL instances in the
 * database by cross-referencing mob names with chest containers from LotRO
 * Companion data.
 *
 * For each boss mob in an instance, finds matching "BossName's Chest - Tier X"
 * containers and resolves the loot tables to produce per-boss, per-tier item
 * lists with computed drop rates.
 *
 * Output: data/instance-loot.json  (keyed by instance slug)
 *
 * Usage:
 *   node import-all-instance-loot.js
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

const INSTANCES_DB = path.join(__dirname, '..', 'data', 'instances-db.json');
const OUTPUT = path.join(__dirname, '..', 'data', 'instance-loot.json');

// Stat label mappings (reused from import-lotro-companion-loot.js)
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

// Items to skip (generic/uninteresting)
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
// XML helpers
// ---------------------------------------------------------------------------
function loadXml(filename) {
  const fp = path.join(COMPANION_DATA, filename);
  return fs.readFileSync(fp, 'utf8');
}

function attr(str, name) {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = str.match(re);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Parsers (same as import-lotro-companion-loot.js)
// ---------------------------------------------------------------------------
function parseContainers(xml) {
  const byId = new Map();
  const byName = new Map();
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
    const treasureListId = attr(attrs, 'treasureListId');
    byId.set(id, { name, filteredTrophyTableIds: ftIds, trophyListId, treasureListId });
    if (!byName.has(name)) byName.set(name, id);
  }
  return { byId, byName };
}

function parseLootsFile(xml) {
  const itemsTables = new Map();
  const trophyLists = new Map();
  const filteredTables = new Map();

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
    const itemScaling = attr(attrs, 'scaling');

    const stats = [];
    const sr = /<stat\s+name="([^"]*)"(?:\s+(?:constant="([^"]*)"|scaling="([^"]*)"))/g;
    let s;
    while ((s = sr.exec(body)) !== null) {
      const statName = s[1];
      if (s[2]) {
        stats.push({ stat: STAT_LABELS[statName] || statName, value: Math.round(parseFloat(s[2])) });
      } else if (s[3] && progressions) {
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

// ---------------------------------------------------------------------------
// Loot resolution
// ---------------------------------------------------------------------------
function resolveChestItems(container, loots, itemDetails) {
  const { filteredTables, trophyLists, itemsTables } = loots;
  const seen = new Map();

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
        addItem(entry.itemId, entry.name, entry.dropFrequency);
      }
      if (entry.treasureGroupProfileId) {
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

  // Process primary filteredTrophyTable
  const primaryFtId = container.filteredTrophyTableIds[0];
  if (primaryFtId) {
    const ftEntries = filteredTables.get(primaryFtId);
    if (ftEntries) {
      for (const fte of ftEntries) {
        resolveTrophyList(fte.trophyListId);
      }
    }
  }

  // Also process direct trophyListId if present
  if (container.trophyListId) {
    resolveTrophyList(container.trophyListId);
  }

  const items = [];
  for (const [itemId, data] of seen) {
    const item = { name: data.name, drop: dropLabel(data.maxDrop) };
    if (data.stats && data.stats.length) item.stats = data.stats;
    if (data.level) item.level = data.level;
    if (data.slot) item.slot = data.slot;
    if (data.scaling) item.scaling = true;
    items.push(item);
  }
  items.sort((a, b) => {
    const order = { 'Guaranteed': 0, 'Common': 1, 'Uncommon': 2, 'Rare': 3 };
    return (order[a.drop] ?? 4) - (order[b.drop] ?? 4) || a.name.localeCompare(b.name);
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
// Chest-to-boss matching
// ---------------------------------------------------------------------------

/** Normalize a string for comparison (strip accents, lowercase, decode XML entities) */
function norm(s) {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/\s*-\s*/g, ' ')   // "Gast - Nûl" → "Gast Nûl"
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// Loot container types the importer recognizes
const LOOT_TYPES = '(?:Golden |Silver |Mithril |Hidden )?(?:Chest|Hoard|Tribute|Filth|Armaments|Spoils|Reward|(?:Tiny |Tinier )?Trinket Box)';
const LOOT_RE = new RegExp(`^(${LOOT_TYPES})(?:\\s*-\\s*(.+))?$`, 'i');

// Boss names to exclude from index (generic class/role containers, not instance bosses)
const BOSS_BLACKLIST = new Set([
  'hunter', 'guardian', 'captain', 'champion', 'minstrel', 'lore-master',
  'rune-keeper', 'warden', 'burglar', 'beorning', 'brawler', 'corsair',
  'castellan',  // generic NPC title, matched wrong in Gwathrenost
]);

/**
 * Build an index of boss-name → chest containers.
 * Extracts boss name prefix from multiple patterns:
 *   "Boss's Chest - Tier N"          (singular possessive)
 *   "Boss's Personal Chest - Tier N" (extra words before type)
 *   "Bosses' Chest - Tier N"         (plural possessive)
 *   "Chest of Boss - Tier N"         (reversed / generic)
 * Returns Map<normalizedBossName, { displayName, chests: Map<tierLabel, containerId> }>
 */
function buildBossChestIndex(containers) {
  const index = new Map(); // norm(bossName) → { displayName, chests: Map<tierLabel, container> }

  function addEntry(bossDisplay, chestType, tierSuffix, id, container) {
    const bossKey = norm(bossDisplay);
    if (BOSS_BLACKLIST.has(bossKey)) return; // skip generic class/role containers
    let tierLabel;
    if (tierSuffix) {
      tierLabel = `${chestType} - ${tierSuffix}`;
    } else {
      tierLabel = chestType;
    }
    if (!index.has(bossKey)) {
      index.set(bossKey, { displayName: bossDisplay, chests: new Map() });
    }
    const entry = index.get(bossKey);
    if (!entry.chests.has(tierLabel)) {
      entry.chests.set(tierLabel, { containerId: id, container, tierLabel });
    }
  }

  for (const [id, container] of containers.byId) {
    const name = container.name;
    if (!name) continue;

    // Pattern 1: "Boss's [Modifier] Chest - Tier N" (singular possessive)
    // Also handles "Boss's Personal Chest", "Boss's Golden Chest", etc.
    // Tier separator requires spaces around dash to avoid splitting "Pahór-korat" etc.
    const pm1 = name.match(/^(.+?)(?:'s|&apos;s)\s+((?:\w+\s+)*?(?:Golden |Silver |Mithril |Hidden )?(?:Chest|Hoard|Tribute|Filth|Armaments|Spoils|Reward|(?:Tiny |Tinier )?Trinket Box)(?:\s+-\s+(.+))?)$/i);
    if (pm1) {
      const bossDisplay = pm1[1].trim().replace(/&amp;/g, '&');
      const fullType = pm1[2];
      const tierSuffix = pm1[3] ? pm1[3].trim() : '';
      const chestType = fullType.replace(/\s+-\s+.*$/, '').trim();
      addEntry(bossDisplay, chestType, tierSuffix, id, container);
      continue;
    }

    // Pattern 2: "Bosses' Chest - Tier N" (plural possessive)
    const pm2 = name.match(/^(.+?)s'\s+((?:Golden |Silver |Mithril |Hidden )?(?:Chest|Hoard|Tribute|Filth|Armaments|Spoils|Reward|(?:Tiny |Tinier )?Trinket Box)(?:\s+-\s+(.+))?)$/i);
    if (pm2) {
      const bossDisplay = pm2[1].trim().replace(/&amp;/g, '&') + 's';
      const fullType = pm2[2];
      const tierSuffix = pm2[3] ? pm2[3].trim() : '';
      const chestType = fullType.replace(/\s+-\s+.*$/, '').trim();
      addEntry(bossDisplay, chestType, tierSuffix, id, container);
      continue;
    }

    // Pattern 3: "Chest of Boss - Tier N" (reversed/generic)
    const pm3 = name.match(/^((?:Golden |Silver |Mithril |Hidden )?(?:Chest|Hoard|Armaments|Spoils|Reward|(?:Tiny |Tinier )?Trinket Box))\s+of\s+(?:the\s+)?(.+?)(?:\s+-\s+(.+))?$/i);
    if (pm3) {
      const chestType = pm3[1].trim();
      const bossDisplay = pm3[2].trim().replace(/&amp;/g, '&');
      const tierSuffix = pm3[3] ? pm3[3].trim() : '';
      addEntry(bossDisplay, chestType, tierSuffix, id, container);
      continue;
    }
  }

  return index;
}

/**
 * For a given mob name, find matching boss chest entry.
 * Uses strict matching: the mob name must start with, contain, or equal the boss prefix.
 * Avoids false positives like "Grog" matching "Sagróg".
 */
function findBossChests(mobName, bossIndex) {
  const mobNorm = norm(mobName);
  const mobWords = mobNorm.split(/[\s,]+/);
  const mobFirstWord = mobWords[0];
  const mobLastWord = mobWords[mobWords.length - 1];

  // Collect all candidates, then pick the best (most chests)
  const candidates = [];

  // 1. Exact match
  if (bossIndex.has(mobNorm)) return bossIndex.get(mobNorm);

  // 2. Mob name starts with boss prefix (e.g., "Loknashra the Dark" starts with "Loknashra")
  for (const [bossKey, entry] of bossIndex) {
    if (mobNorm.startsWith(bossKey + ' ') || mobNorm.startsWith(bossKey + ',')) {
      candidates.push(entry);
    }
  }

  // 3. Boss key starts with mob name (e.g., mob "Loknashra" matches boss "loknashra the green")
  //    Only when mob name is at least 5 chars and matches a full word boundary
  if (mobNorm.length >= 5) {
    for (const [bossKey, entry] of bossIndex) {
      if (bossKey.startsWith(mobNorm + ' ') || bossKey.startsWith(mobNorm + ',')) {
        candidates.push(entry);
      }
    }
  }

  // 4. Try last word of mob name for titled mobs (e.g., "Castellan Obáshurz" → "Obáshurz")
  //    Requires exact match of boss key to the last word
  if (mobWords.length > 1 && mobLastWord.length >= 5 && mobLastWord !== mobFirstWord) {
    for (const [bossKey, entry] of bossIndex) {
      if (bossKey === mobLastWord) {
        candidates.push(entry);
      }
    }
  }

  if (candidates.length === 0) return null;
  // Prefer the candidate with the most chest tiers (avoids "Castellan's Chest" over "Obáshurz's Chest")
  candidates.sort((a, b) => b.chests.size - a.chests.size);
  return candidates[0];
}

// ---------------------------------------------------------------------------
// Manual container → instance slug mappings for chests that can't be
// auto-matched by mob name (e.g., no mob in the instance DB).
// ---------------------------------------------------------------------------
const MANUAL_CHEST_MAPPINGS = {
  // Gwathrenost: Grand Cultivator Oganuin is not a mob in the DB
  'grand cultivator oganuin': 'gwathrenost-the-witch-kings-citadel',
  // Goblin-town: mob "Ashûrz the Great Goblin" doesn't match "Obáshurz"
  'obashurz': 'goblin-town-throne-room',
  // Askâd-mazal: mob is "The Shadowed King" but chest is "The King's Chest"
  'the king': 'ask-d-mazal-the-chamber-of-shadows',
  // Dahâl Huliz: Arena chests don't match any mob names
  'arena champion': 'dah-l-huliz-the-arena',
  'arena veteran': 'dah-l-huliz-the-arena',
  'arena neophyte': 'dah-l-huliz-the-arena',
  // Kôth Rau: "The Twins" is a boss concept, no matching mob in DB
  'the twins': 'k-th-rau-the-wailing-hold',
  // Tûl Zakana: Pahór-korat not listed as a mob in instances DB
  'pahor korat': 't-l-zakana-the-well-of-forgetting',
  // Depths of Kidzul-kâlah: "Chest of Dwarf Treasure" and "The Maid's Reward"
  'dwarf treasure': 'the-depths-of-kidzul-k-lah',
  'the maid': 'the-depths-of-kidzul-k-lah',
  // Dun Shûma: mob names differ from chest names
  'the lady of the pride': 'dun-sh-ma-the-kings-fortress',
  'the serpent caller': 'dun-sh-ma-the-kings-fortress',
  'the weaponmaster': 'dun-sh-ma-the-kings-fortress',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('All-Instance Loot Importer');
  console.log('=========================\n');

  // Load instance database
  if (!fs.existsSync(INSTANCES_DB)) {
    console.error('No instances-db.json found. Run: node import-instances.js first');
    process.exit(1);
  }
  const instances = JSON.parse(fs.readFileSync(INSTANCES_DB, 'utf8'));
  console.log(`Loaded ${instances.length} instances from database\n`);

  // Load LotRO Companion XML data
  console.log('Loading LotRO Companion data...');
  const containersXml = loadXml('containers.xml');
  const lootsXml = loadXml('loots.xml');
  const itemsXml = loadXml('items.xml');
  const progressionsXml = loadXml('progressions.xml');

  console.log('Parsing containers...');
  const containers = parseContainers(containersXml);
  console.log(`  ${containers.byId.size} containers`);

  console.log('Parsing loots...');
  const loots = parseLootsFile(lootsXml);
  console.log(`  ${loots.itemsTables.size} itemsTables, ${loots.trophyLists.size} trophyLists, ${loots.filteredTables.size} filteredTrophyTables`);

  console.log('Parsing progressions...');
  const progressions = parseProgressions(progressionsXml);
  console.log(`  ${progressions.size} progression curves`);

  console.log('Parsing item details...');
  const itemDetails = parseItemDetails(itemsXml, progressions);
  console.log(`  ${itemDetails.size} items indexed\n`);

  // Build boss chest index
  const bossIndex = buildBossChestIndex(containers);
  console.log(`Boss chest index: ${bossIndex.size} unique boss names\n`);

  // Build slug lookup for instances
  const slugMap = new Map();
  for (const inst of instances) slugMap.set(inst.slug, inst);

  // Helper: resolve a boss entry into chests array
  function resolveBoss(match, mobName) {
    const chests = [];
    for (const [tierLabel, chestInfo] of match.chests) {
      const items = resolveChestItems(chestInfo.container, loots, itemDetails);
      if (items.length === 0) continue;
      chests.push({ label: tierLabel, tier: tierLabel, items });
    }
    if (chests.length === 0) return null;

    const tierOrder = ['solo', 'tier 1', 'tier 2', 'tier 3', 'tier 4', 'tier 5', 'challenge'];
    chests.sort((a, b) => {
      const ai = tierOrder.findIndex(t => a.label.toLowerCase().includes(t));
      const bi = tierOrder.findIndex(t => b.label.toLowerCase().includes(t));
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    return { name: match.displayName, mobName, chests };
  }

  // Process each instance
  const output = {};
  let instancesWithLoot = 0;
  let totalBosses = 0;
  let totalItems = 0;

  for (const inst of instances) {
    const bosses = [];
    const matchedBossKeys = new Set(); // Avoid duplicate boss entries

    for (const mob of inst.mobs) {
      const match = findBossChests(mob.name, bossIndex);
      if (!match) continue;

      const bossKey = norm(match.displayName);
      if (matchedBossKeys.has(bossKey)) continue; // Already processed this boss
      matchedBossKeys.add(bossKey);

      const boss = resolveBoss(match, mob.name);
      if (boss) bosses.push(boss);
    }

    if (bosses.length > 0) {
      output[inst.slug] = {
        instanceName: inst.name,
        instanceId: inst.id,
        bosses,
      };
      instancesWithLoot++;
      totalBosses += bosses.length;
      const bossItemCount = bosses.reduce((s, b) => s + b.chests.reduce((s2, c) => s2 + c.items.length, 0), 0);
      totalItems += bossItemCount;
      console.log(`✓ ${inst.name}: ${bosses.length} bosses, ${bossItemCount} item entries`);
    }
  }

  // Process manual chest → slug mappings for chests with no matching mob
  for (const [bossKey, slug] of Object.entries(MANUAL_CHEST_MAPPINGS)) {
    const match = bossIndex.get(bossKey);
    if (!match) continue;
    const inst = slugMap.get(slug);
    if (!inst) { console.warn(`⚠ Manual mapping: no instance "${slug}"`); continue; }

    const boss = resolveBoss(match, '(manual)');
    if (!boss) continue;

    if (!output[slug]) {
      output[slug] = { instanceName: inst.name, instanceId: inst.id, bosses: [] };
      instancesWithLoot++;
    }
    // Skip if already matched by mob name
    const existingKeys = new Set(output[slug].bosses.map(b => norm(b.name)));
    if (existingKeys.has(bossKey)) continue;

    output[slug].bosses.push(boss);
    totalBosses++;
    const bossItemCount = boss.chests.reduce((s, c) => s + c.items.length, 0);
    totalItems += bossItemCount;
    console.log(`✓ ${inst.name} (manual): +${match.displayName}, ${bossItemCount} items`);
  }

  // Write output
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote ${OUTPUT}`);
  console.log(`\nSummary:`);
  console.log(`  Instances with loot: ${instancesWithLoot} / ${instances.length}`);
  console.log(`  Total bosses: ${totalBosses}`);
  console.log(`  Total item entries: ${totalItems}`);
}

main();
