#!/usr/bin/env node
/**
 * import-lotro-data.js
 *
 * Imports lotro-data-master XML files and enriches the site's intermediate
 * JSON databases in data/lore/.  Run this after extract-lore.js / extract-quests.js
 * to patch in additional data those scripts miss.
 *
 * Enrichments (patch existing data):
 *   1. Mobs   — genus, species, subSpecies labels (fixes enum resolution bug)
 *   2. Sets   — resolves null stat bonus values via progressions.xml
 *   3. Deeds  — adds description text from English labels
 *   4. NPCs   — adds gender field
 *   5. Instances — adds category from instancesTree.xml
 *   6. Quests — adds scope, group size, repeatable, quest arc
 *
 * New databases:
 *   7. Titles   — 3000+ character titles with category
 *   8. Factions — 100+ reputation factions with tier structure
 *   9. Recipes  — 7700+ crafting recipes with ingredients & results
 *  10. XP Table — level-to-XP progression requirements
 *  11. Emotes   — social emote commands
 *  12. Geo Areas — region/territory/area hierarchy
 *
 * Usage:  node scripts/import-lotro-data.js [path-to-lotro-data-master]
 * Env:    LOTRO_DATA_PATH  (alternative to CLI arg)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────
const SRC = process.argv[2]
  || process.env.LOTRO_DATA_PATH
  || path.join('C:', 'Users', 'me', 'Downloads', 'lotro-data-master', 'lotro-data-master');

const LORE = path.join(SRC, 'lore');
const LABELS_EN = path.join(LORE, 'labels', 'en');
const ENUMS = path.join(LORE, 'enums');
const OUT = path.join(__dirname, '..', 'data', 'lore');
const DATA = path.join(__dirname, '..', 'data');

// Friendly stat name mappings (same as extract-lore.js)
const STAT_LABELS = {
  MIGHT: 'Might', AGILITY: 'Agility', WILL: 'Will', VITALITY: 'Vitality',
  FATE: 'Fate', MORALE: 'Morale', POWER: 'Power',
  PHYSICAL_MASTERY: 'Physical Mastery', TACTICAL_MASTERY: 'Tactical Mastery',
  PHYSICAL_MITIGATION: 'Physical Mitigation', TACTICAL_MITIGATION: 'Tactical Mitigation',
  CRITICAL_RATING: 'Critical Rating', FINESSE: 'Finesse', RESISTANCE: 'Resistance',
  ICMR: 'In-Combat Morale Regen', OCMR: 'Out-of-Combat Morale Regen',
  ICPR: 'In-Combat Power Regen', OCPR: 'Out-of-Combat Power Regen',
  ARMOUR: 'Armour',
  PHYSICAL_MITIGATION_PERCENTAGE: 'Physical Mitigation %',
  TACTICAL_MITIGATION_PERCENTAGE: 'Tactical Mitigation %',
  INCOMING_HEALING: 'Incoming Healing Rating',
  INCOMING_HEALING_PERCENTAGE: 'Incoming Healing %',
  OUTGOING_HEALING: 'Outgoing Healing Rating',
  OUTGOING_HEALING_PERCENTAGE: 'Outgoing Healing %',
  CRITICAL_DEFENCE: 'Critical Defence',
  CRITICAL_DEFENCE_PERCENTAGE: 'Critical Defence %',
  BLOCK: 'Block Rating', PARRY: 'Parry Rating', EVADE: 'Evade Rating',
  BLOCK_PERCENTAGE: 'Block %', PARRY_PERCENTAGE: 'Parry %', EVADE_PERCENTAGE: 'Evade %',
  STEALTH_LEVEL: 'Stealth Level', STEALTH_DETECTION: 'Stealth Detection',
  MELEE_DAMAGE_PERCENTAGE: 'Melee Damage',
  RANGED_DAMAGE_PERCENTAGE: 'Ranged Damage',
  TACTICAL_DAMAGE_PERCENTAGE: 'Tactical Damage',
  AUDACITY: 'Audacity',
  DEVASTATE_MELEE_PERCENTAGE: 'Devastate Chance (melee)',
  DEVASTATE_RANGED_PERCENTAGE: 'Devastate Chance (ranged)',
  DEVASTATE_TACTICAL_PERCENTAGE: 'Devastate Chance (tactical)',
  CRIT_DEVASTATE_MAGNITUDE_MELEE_PERCENTAGE: 'Crit/Dev Magnitude (melee)',
  CRIT_DEVASTATE_MAGNITUDE_RANGED_PERCENTAGE: 'Crit/Dev Magnitude (ranged)',
  CRIT_DEVASTATE_MAGNITUDE_TACTICAL_PERCENTAGE: 'Crit/Dev Magnitude (tactical)',
  FINESSE_PERCENTAGE: 'Finesse %',
  RESISTANCE_PERCENTAGE: 'Resistance %',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function readXml(filename) {
  const fp = path.join(LORE, filename);
  if (!fs.existsSync(fp)) { console.warn(`  ⚠ ${filename} not found`); return ''; }
  return fs.readFileSync(fp, 'utf8');
}

function readJson(filepath) {
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function writeJson(filepath, data, pretty) {
  fs.writeFileSync(filepath, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data), 'utf8');
}

function cleanGameText(str) {
  if (!str) return str;
  return str
    .replace(/&#10;/g, '\n')
    .replace(/\\q/g, '')
    .replace(/<rgb=[^>]*>/g, '').replace(/<\/rgb>/g, '')
    .replace(/&amp;/g, '&');
}

/**
 * Build a proper code → human-readable label map from an enum + label file pair.
 * 1. Enum XML:  code="3" → name="key:620756997:171952046"
 * 2. Label XML: key="key:620756997:171952046" → value="Man"
 * Result: { "3": "Man", ... }
 */
function resolveEnumLabels(enumFile, labelFile) {
  // Read enum XML
  const enumFp = path.join(ENUMS, enumFile);
  if (!fs.existsSync(enumFp)) return {};
  const enumXml = fs.readFileSync(enumFp, 'utf8');

  // Build code → key map
  const codeToKey = {};
  const enumRe = /<entry code="(\d+)" name="([^"]*)"/g;
  let m;
  while ((m = enumRe.exec(enumXml)) !== null) {
    codeToKey[m[1]] = m[2];
  }

  // Read labels
  const labelFp = path.join(LABELS_EN, labelFile);
  if (!fs.existsSync(labelFp)) return {};
  const labelXml = fs.readFileSync(labelFp, 'utf8');

  // Build key → value map
  const keyToVal = {};
  const labelRe = /<label key="([^"]*)" value="([^"]*)"/g;
  while ((m = labelRe.exec(labelXml)) !== null) {
    keyToVal[m[1]] = m[2];
  }

  // Combine: code → value
  const result = {};
  for (const [code, key] of Object.entries(codeToKey)) {
    if (keyToVal[key]) result[code] = keyToVal[key];
  }
  return result;
}

/**
 * Load a labels file and return key → value map.
 */
function loadLabels(filename) {
  const fp = path.join(LABELS_EN, filename);
  if (!fs.existsSync(fp)) return {};
  const xml = fs.readFileSync(fp, 'utf8');
  const map = {};
  const re = /<label key="([^"]*)" value="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

// ─── Progressions (stat scaling resolution) ─────────────────────────────────
let progressionMap = null;

function loadProgressions() {
  if (progressionMap) return progressionMap;
  console.log('  📈 Loading progressions...');
  const xml = readXml('progressions.xml');
  if (!xml) { progressionMap = {}; return progressionMap; }
  progressionMap = {};

  // Linear interpolation progressions
  const linRe = /<linearInterpolationProgression identifier="(\d+)" nbPoints="\d+">(.*?)<\/linearInterpolationProgression>/gs;
  let lm;
  while ((lm = linRe.exec(xml)) !== null) {
    const id = lm[1];
    const body = lm[2];
    const points = [];
    const pr = /x="([^"]+)" y="([^"]+)"/g;
    let p;
    while ((p = pr.exec(body)) !== null) {
      points.push({ x: parseFloat(p[1]), y: parseFloat(p[2]) });
    }
    if (points.length) progressionMap[id] = { type: 'linear', points };
  }

  // Array progressions
  const arrRe = /<arrayProgression identifier="(\d+)" nbPoints="\d+">(.*?)<\/arrayProgression>/gs;
  let am;
  while ((am = arrRe.exec(xml)) !== null) {
    const id = am[1];
    const body = am[2];
    const values = [];
    const vr = /y="([^"]+)"/g;
    let v;
    while ((v = vr.exec(body)) !== null) {
      values.push(parseFloat(v[1]));
    }
    if (values.length) progressionMap[id] = { type: 'array', values };
  }

  console.log(`    Loaded ${Object.keys(progressionMap).length} progressions`);
  return progressionMap;
}

function resolveProgression(scalingId, level) {
  const prog = loadProgressions()[scalingId];
  if (!prog || !level) return null;

  if (prog.type === 'array') {
    const idx = Math.min(Math.max(level - 1, 0), prog.values.length - 1);
    return prog.values[idx];
  }

  if (prog.type === 'linear') {
    const pts = prog.points;
    if (level <= pts[0].x) return pts[0].y;
    if (level >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 0; i < pts.length - 1; i++) {
      if (level >= pts[i].x && level <= pts[i + 1].x) {
        const t = (level - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 1: MOBS — genus, species, subSpecies labels
// ═════════════════════════════════════════════════════════════════════════════
function enrichMobs() {
  console.log('\n🐉 Enriching mobs...');
  const xml = readXml('mobs.xml');
  if (!xml) return;

  // Resolve all enum labels properly (code → human-readable)
  const genusLabels = resolveEnumLabels('Genus.xml', 'enum-Genus.xml');
  const speciesLabels = resolveEnumLabels('Species.xml', 'enum-Species.xml');
  const subSpeciesLabels = resolveEnumLabels('SubSpecies.xml', 'enum-SubSpecies.xml');
  const divisionLabels = resolveEnumLabels('MobDivision.xml', 'enum-MobDivision.xml');

  console.log(`    Genus labels: ${Object.keys(genusLabels).length}`);
  console.log(`    Species labels: ${Object.keys(speciesLabels).length}`);
  console.log(`    SubSpecies labels: ${Object.keys(subSpeciesLabels).length}`);

  // Parse all mobs from XML
  const re = /<mob id="(\d+)" name="([^"]*)"([^>]*)>/g;
  const mobMap = {};
  let m, total = 0;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = cleanGameText(m[2]);
    const attrs = m[3];
    total++;

    const alignMatch = attrs.match(/alignment="(\d+)"/);
    const genusMatch = attrs.match(/genus="(\d+)"/);
    const speciesMatch = attrs.match(/species="(\d+)"/);
    const subSpeciesMatch = attrs.match(/subSpecies="(\d+)"/);
    const divisionMatch = attrs.match(/division="(\d+)"/);

    const mob = { id, name };
    if (alignMatch) mob.alignment = alignMatch[1] === '3' ? 'enemy' : 'friendly';
    if (genusMatch && genusLabels[genusMatch[1]]) mob.genus = genusLabels[genusMatch[1]];
    if (speciesMatch && speciesLabels[speciesMatch[1]]) mob.species = speciesLabels[speciesMatch[1]];
    if (subSpeciesMatch && subSpeciesLabels[subSpeciesMatch[1]]) mob.subSpecies = subSpeciesLabels[subSpeciesMatch[1]];

    mobMap[id] = mob;
  }

  console.log(`    Parsed ${total} mobs from XML`);

  // Update item-index.json — patch mob entries with genus/species
  const indexPath = path.join(OUT, 'item-index.json');
  if (fs.existsSync(indexPath)) {
    const index = readJson(indexPath);
    let patched = 0;
    for (const [name, entry] of Object.entries(index)) {
      if (entry.type !== 'mob') continue;
      const mob = mobMap[entry.id];
      if (!mob) continue;
      if (mob.genus && !entry.genus) { entry.genus = mob.genus; patched++; }
      if (mob.species) entry.species = mob.species;
      if (mob.subSpecies) entry.subSpecies = mob.subSpecies;
    }
    writeJson(indexPath, index);
    console.log(`    ✓ Patched ${patched} mob entries in item-index.json with genus/species`);
  }

  // Also write a full mobs lookup for potential future use
  const enemies = Object.values(mobMap).filter(m => m.alignment === 'enemy');
  console.log(`    ${enemies.length} enemy mobs, ${total - enemies.length} friendly`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 2: SETS — resolve null stat bonus values via progressions
// ═════════════════════════════════════════════════════════════════════════════
function enrichSets() {
  console.log('\n🛡️  Enriching sets...');
  const setsPath = path.join(OUT, 'sets.json');
  const sets = readJson(setsPath);
  if (!sets) { console.log('    ⚠ No sets.json found'); return; }

  // Re-parse sets.xml from lotro-data to get scaling references
  const xml = readXml('sets.xml');
  if (!xml) return;

  loadProgressions();

  const re = /<set id="(\d+)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/set>/g;
  const scalingMap = {}; // setId → { bonusIdx → [{ stat, scalingId }] }
  let m;

  while ((m = re.exec(xml)) !== null) {
    const setId = m[1];
    const attrs = m[3];
    const body = m[4];
    const levelMatch = attrs.match(/level="(\d+)"/);
    const maxLevelMatch = attrs.match(/maxLevel="(\d+)"/);
    const level = maxLevelMatch ? parseInt(maxLevelMatch[1]) : (levelMatch ? parseInt(levelMatch[1]) : 0);

    // Parse bonuses with scaling references
    const br = /<bonus nbItems="(\d+)">([\s\S]*?)<\/bonus>/g;
    let bi = 0, b;
    const bonusData = [];

    while ((b = br.exec(body)) !== null) {
      const count = parseInt(b[1]);
      const bonusBody = b[2];
      const stats = [];

      const sr = /<stat name="([^"]*)"([^/]*)\//g;
      let s;
      while ((s = sr.exec(bonusBody)) !== null) {
        const statName = s[1];
        const attrStr = s[2];
        const label = STAT_LABELS[statName] || statName.replace(/_/g, ' ');

        // Try constant first, then scaling
        const constMatch = attrStr.match(/constant="([^"]+)"/);
        const scalingMatch = attrStr.match(/scaling="([^"]+)"/);
        const valueMatch = attrStr.match(/value="([^"]+)"/);

        let value = null;
        if (constMatch) {
          value = parseFloat(constMatch[1]);
        } else if (valueMatch && !valueMatch[1].startsWith('1879')) {
          value = parseFloat(valueMatch[1]);
        } else if (scalingMatch && level) {
          const resolved = resolveProgression(scalingMatch[1], level);
          if (resolved !== null) value = resolved;
        }

        stats.push({ stat: label, value });
      }

      bonusData.push({ count, stats });
      bi++;
    }

    if (bonusData.length) scalingMap[setId] = { level, bonuses: bonusData };
  }

  // Patch sets.json
  let resolvedCount = 0, totalNull = 0;
  for (const set of sets) {
    const data = scalingMap[set.id];
    if (!data || !set.bonuses) continue;

    for (let i = 0; i < set.bonuses.length; i++) {
      const existing = set.bonuses[i];
      const fresh = data.bonuses[i];
      if (!fresh || !existing) continue;

      for (let j = 0; j < existing.stats.length; j++) {
        const existStat = existing.stats[j];
        if (existStat.value !== null) continue; // Already has a value
        totalNull++;

        // Find matching stat in fresh parse
        const freshStat = fresh.stats[j];
        if (freshStat && freshStat.value !== null) {
          existStat.value = Math.round(freshStat.value * 100) / 100;
          resolvedCount++;
        }
      }
    }
  }

  writeJson(setsPath, sets, true);
  console.log(`    ✓ Resolved ${resolvedCount}/${totalNull} null stat values in sets.json`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 3: DEEDS — add description text
// ═════════════════════════════════════════════════════════════════════════════
function enrichDeeds() {
  console.log('\n📜 Enriching deeds...');
  const deedsPath = path.join(OUT, 'deeds.json');
  const deeds = readJson(deedsPath);
  if (!deeds) { console.log('    ⚠ No deeds.json found'); return; }

  // Load deed labels for description resolution
  const deedLabels = loadLabels('deeds.xml');
  console.log(`    Loaded ${Object.keys(deedLabels).length} deed labels`);

  // Parse deeds.xml for descriptions
  const xml = readXml('deeds.xml');
  if (!xml) return;

  const descMap = {};
  const re = /<deed id="(\d+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const attrs = m[2];
    const descMatch = attrs.match(/description="([^"]*)"/);
    if (descMatch) {
      const key = descMatch[1];
      const raw = key.startsWith('key:') ? (deedLabels[key] || '') : key;
      if (raw) {
        const clean = cleanGameText(raw)
          .replace(/\$\{[^}]+\}/g, 'you')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean.length > 3) {
          descMap[id] = clean.length > 300 ? clean.substring(0, 300) + '…' : clean;
        }
      }
    }
  }

  console.log(`    Found ${Object.keys(descMap).length} deed descriptions`);

  // Patch deeds
  let added = 0;
  const deedById = {};
  for (const d of deeds) deedById[d.id] = d;

  for (const [id, desc] of Object.entries(descMap)) {
    if (deedById[id] && !deedById[id].description) {
      deedById[id].description = desc;
      added++;
    }
  }

  writeJson(deedsPath, deeds, false);
  console.log(`    ✓ Added ${added} descriptions to deeds.json`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 4: NPCS — add gender
// ═════════════════════════════════════════════════════════════════════════════
function enrichNpcs() {
  console.log('\n👤 Enriching NPCs...');
  const npcsPath = path.join(OUT, 'npcs.json');
  const npcs = readJson(npcsPath);
  if (!npcs) { console.log('    ⚠ No npcs.json found'); return; }

  // Parse NPCs.xml for gender
  const xml = readXml('NPCs.xml');
  if (!xml) return;

  const re = /<NPC id="(\d+)" name="([^"]*)"([^/]*)\/>/g;
  let m, added = 0;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const attrs = m[3];
    const genderMatch = attrs.match(/gender="([^"]*)"/);

    if (genderMatch && npcs[id]) {
      const g = genderMatch[1];
      if (g === 'MALE' || g === 'FEMALE') {
        npcs[id].g = g[0]; // 'M' or 'F'
        added++;
      }
    }
  }

  writeJson(npcsPath, npcs, false);
  console.log(`    ✓ Added gender to ${added} NPCs`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 5: INSTANCES — add category from instancesTree.xml
// ═════════════════════════════════════════════════════════════════════════════
function enrichInstances() {
  console.log('\n🏰 Enriching instances...');
  const instancesPath = path.join(DATA, 'instances-db.json');
  const instances = readJson(instancesPath);
  if (!instances) { console.log('    ⚠ No instances-db.json found'); return; }

  // Parse instancesTree.xml
  const xml = readXml('instancesTree.xml');
  if (!xml) return;

  // Build instanceId → category map
  const catMap = {};
  const catRe = /<category name="([^"]*)">([\s\S]*?)<\/category>/g;
  let cm;
  while ((cm = catRe.exec(xml)) !== null) {
    const category = cm[1];
    const body = cm[2];
    const instRe = /<instance id="(\d+)"/g;
    let im;
    while ((im = instRe.exec(body)) !== null) {
      catMap[im[1]] = category;
    }
  }

  console.log(`    Instance categories: ${Object.keys(catMap).length} entries`);

  // Also parse privateEncounters.xml for instance scaling/level data
  const peXml = readXml('privateEncounters.xml');
  const peMap = {};
  if (peXml) {
    const peRe = /<privateEncounter id="(\d+)"([^>]*)>/g;
    let pm;
    while ((pm = peRe.exec(peXml)) !== null) {
      const id = pm[1];
      const attrs = pm[2];
      const maxSize = attrs.match(/maxSize="(\d+)"/);
      const minLevel = attrs.match(/minLevel="(\d+)"/);
      const maxLevel = attrs.match(/maxLevel="(\d+)"/);
      const entry = {};
      if (maxSize) entry.maxSize = parseInt(maxSize[1]);
      if (minLevel) entry.minLevel = parseInt(minLevel[1]);
      if (maxLevel) entry.maxLevel = parseInt(maxLevel[1]);
      if (Object.keys(entry).length) peMap[id] = entry;
    }
  }

  // Patch instances
  let enriched = 0;
  for (const inst of instances) {
    const cat = catMap[inst.id];
    if (cat && !inst.category) {
      inst.category = cat;
      enriched++;
    }

    // Try to add level range from private encounters
    const pe = peMap[inst.id];
    if (pe) {
      if (pe.minLevel && !inst.minLevel) inst.minLevel = pe.minLevel;
      if (pe.maxLevel && !inst.maxLevel) inst.maxLevel = pe.maxLevel;
    }
  }

  writeJson(instancesPath, instances, true);
  console.log(`    ✓ Added category to ${enriched} instances`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 6: QUESTS — add missing quest chain/scope/group data
// ═════════════════════════════════════════════════════════════════════════════
function enrichQuests() {
  console.log('\n📝 Enriching quests...');
  const questsPath = path.join(OUT, 'quests.json');
  const quests = readJson(questsPath);
  if (!quests) { console.log('    ⚠ No quests.json found'); return; }

  // Parse quests.xml for additional fields
  const xml = readXml('quests.xml');
  if (!xml) return;

  const questLabels = loadLabels('quests.xml');

  // Build a map of existing quests by ID
  const questById = {};
  for (const q of quests) questById[q.id] = q;

  // Scan quests.xml for fields we may not have
  const re = /<quest ([^>]*)>([\s\S]*?)<\/quest>/g;
  let m;
  let addedScope = 0, addedGroup = 0, addedRep = 0, addedArc = 0;

  // Load scope labels
  const scopeLabels = resolveEnumLabels('QuestScope.xml', 'enum-QuestScope.xml');

  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const idMatch = attrs.match(/id="(\d+)"/);
    if (!idMatch) continue;

    const q = questById[idMatch[1]];
    if (!q) continue;

    // Add scope if missing
    if (!q.sc) {
      const scopeMatch = attrs.match(/scope="(\d+)"/);
      if (scopeMatch && scopeLabels[scopeMatch[1]]) {
        q.sc = scopeLabels[scopeMatch[1]];
        addedScope++;
      }
    }

    // Add group size if missing
    if (!q.grp) {
      const sizeMatch = attrs.match(/size="(\d+)"/);
      if (sizeMatch) {
        const s = parseInt(sizeMatch[1]);
        if (s === 2) { q.grp = 'Small Fellowship'; addedGroup++; }
        else if (s === 3) { q.grp = 'Fellowship'; addedGroup++; }
        else if (s === 4) { q.grp = 'Raid'; addedGroup++; }
      }
    }

    // Add repeatable flag if missing
    if (!q.rep && attrs.includes('repeatable="true"')) {
      q.rep = 1;
      addedRep++;
    }

    // Add quest arc if missing
    if (!q.arc) {
      const arcMatch = attrs.match(/questArc="([^"]*)"/);
      if (arcMatch) {
        const key = arcMatch[1];
        const label = key.startsWith('key:') ? (questLabels[key] || '') : key;
        if (label) { q.arc = cleanGameText(label); addedArc++; }
      }
    }
  }

  writeJson(questsPath, quests, false);
  console.log(`    ✓ Added: ${addedScope} scopes, ${addedGroup} group sizes, ${addedRep} repeatable flags, ${addedArc} quest arcs`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 7: TITLES — full title database
// ═════════════════════════════════════════════════════════════════════════════
function importTitles() {
  console.log('\n🏅 Importing titles...');
  const xml = readXml('titles.xml');
  if (!xml) return;

  // Load title labels for description resolution
  const titleLabels = loadLabels('titles.xml');
  console.log(`    Loaded ${Object.keys(titleLabels).length} title labels`);

  const titles = [];
  const re = /<title id="(\d+)" name="([^"]*)"([^/]*)\/?>/g;
  let m;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = m[2];
    const attrs = m[3];

    const catMatch = attrs.match(/category="([^"]*)"/);
    const descMatch = attrs.match(/description="([^"]*)"/);
    const exclMatch = attrs.match(/exclusionGroup="([^"]*)"/);
    const prioMatch = attrs.match(/priority="(\d+)"/);
    const iconMatch = attrs.match(/icon="(\d+)"/);

    const title = { id, n: name };
    if (catMatch) title.cat = catMatch[1];
    if (iconMatch) title.ic = iconMatch[1];

    // Resolve description
    if (descMatch) {
      const key = descMatch[1];
      const raw = key.startsWith('key:') ? (titleLabels[key] || '') : key;
      if (raw) {
        const clean = cleanGameText(raw).replace(/\s+/g, ' ').trim();
        if (clean.length > 3) title.desc = clean;
      }
    }

    if (exclMatch) title.grp = exclMatch[1];
    if (prioMatch) title.pri = parseInt(prioMatch[1]);

    titles.push(title);
  }

  // Sort by category then name
  titles.sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.n.localeCompare(b.n));

  writeJson(path.join(OUT, 'titles.json'), titles, false);
  console.log(`    ✓ Exported ${titles.length} titles to titles.json`);

  // Stats
  const cats = {};
  for (const t of titles) cats[t.cat || 'Unknown'] = (cats[t.cat || 'Unknown'] || 0) + 1;
  const top5 = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`    Categories: ${top5.map(e => `${e[0]} (${e[1]})`).join(', ')}...`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 8: FACTIONS — reputation system
// ═════════════════════════════════════════════════════════════════════════════
function importFactions() {
  console.log('\n⭐ Importing factions...');
  const xml = readXml('factions.xml');
  if (!xml) return;

  // Load faction labels for description resolution
  const factionLabels = loadLabels('factions.xml');
  console.log(`    Loaded ${Object.keys(factionLabels).length} faction labels`);

  // Load tier name labels (these use key: format)
  // Tier names are in the faction levels via name="key:..." attributes
  // But we can also just use the key values directly
  const allLabels = {};
  // Scan for all key: references and try to resolve them
  const keys = new Set();
  const keyRe = /name="(key:[^"]*)"/g;
  let km;
  while ((km = keyRe.exec(xml)) !== null) keys.add(km[1]);
  // Load all label files that might contain tier names
  const factLabels = loadLabels('factions.xml');
  Object.assign(allLabels, factLabels);
  // Also try enum labels for tier names
  const enumLabels = loadLabels('enum-ReputationFaction.xml');
  Object.assign(allLabels, enumLabels);

  // Tier key → readable name mapping (fallback)
  const TIER_NAMES = {
    ENEMY: 'Enemy', OUTSIDER: 'Outsider', NEUTRAL: 'Neutral',
    ACQUAINTANCE: 'Acquaintance', FRIEND: 'Friend', ALLY: 'Ally',
    KINDRED: 'Kindred', CELEBRATED: 'Celebrated', RESPECTED: 'Respected',
    HONOURED: 'Honoured',
  };

  const factions = [];
  const factionRe = /<faction id="(\d+)"([^>]*)>([\s\S]*?)<\/faction>/g;
  let m;

  while ((m = factionRe.exec(xml)) !== null) {
    const id = m[1];
    const attrs = m[2];
    const body = m[3];

    const nameMatch = attrs.match(/name="([^"]*)"/);
    const catMatch = attrs.match(/category="([^"]*)"/);
    const descMatch = attrs.match(/description="([^"]*)"/);
    const lowestMatch = attrs.match(/lowestTier="(\d+)"/);
    const initialMatch = attrs.match(/initialTier="(\d+)"/);
    const highestMatch = attrs.match(/highestTier="(\d+)"/);

    const faction = {
      id,
      n: nameMatch ? nameMatch[1] : id,
    };
    if (catMatch) faction.cat = catMatch[1];

    // Resolve description
    if (descMatch) {
      const key = descMatch[1];
      const raw = key.startsWith('key:') ? (factionLabels[key] || '') : key;
      if (raw) {
        const clean = cleanGameText(raw).replace(/\s+/g, ' ').trim();
        if (clean.length > 3) faction.desc = clean;
      }
    }

    if (initialMatch) faction.init = parseInt(initialMatch[1]);

    // Parse tiers
    const tiers = [];
    const tierRe = /<level tier="(\d+)"(?:\s+key="([^"]*)")?\s+name="([^"]*)"([^/]*)\/?>/g;
    let t;
    while ((t = tierRe.exec(body)) !== null) {
      const tierNum = parseInt(t[1]);
      const tierKey = t[2] || '';       // may be absent
      const tierName = t[3];            // name="key:..." label reference
      const tierAttrs = t[4];

      const repMatch = tierAttrs.match(/requiredReputation="(\d+)"/);
      const lpMatch = tierAttrs.match(/lotroPoints="(\d+)"/);
      const deedMatch = tierAttrs.match(/deedKey="([^"]*)"/);

      const tier = {
        t: tierNum,
        k: tierKey,
        n: tierKey
          ? (TIER_NAMES[tierKey] || tierKey)
          : (allLabels[tierName] || TIER_NAMES[tierName] || tierName),
        rep: repMatch ? parseInt(repMatch[1]) : 0,
      };
      if (lpMatch && parseInt(lpMatch[1]) > 0) tier.lp = parseInt(lpMatch[1]);
      if (deedMatch) tier.deed = decodeURIComponent(deedMatch[1]).replace(/_/g, ' ');

      tiers.push(tier);
    }

    if (tiers.length) faction.tiers = tiers;
    factions.push(faction);
  }

  // Sort by category then name
  factions.sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || a.n.localeCompare(b.n));

  writeJson(path.join(OUT, 'factions.json'), factions, false);
  console.log(`    ✓ Exported ${factions.length} factions to factions.json`);

  const cats = {};
  for (const f of factions) cats[f.cat || 'Unknown'] = (cats[f.cat || 'Unknown'] || 0) + 1;
  console.log(`    Categories: ${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(e => `${e[0]} (${e[1]})`).join(', ')}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 9: RECIPES + CRAFTING — full crafting system
// ═════════════════════════════════════════════════════════════════════════════
function importRecipes() {
  console.log('\n🔨 Importing recipes & crafting...');

  // ── Parse crafting.xml for profession + tier structure ──────────────────
  const craftXml = readXml('crafting.xml');
  const craftLabels = loadLabels('crafting.xml');

  // Profession enum labels
  const professions = {};
  if (craftXml) {
    const profRe = /<profession identifier="(\d+)" key="([^"]*)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/profession>/g;
    let pm;
    while ((pm = profRe.exec(craftXml)) !== null) {
      const profId = pm[1];
      const profKey = pm[2];
      const profName = pm[3];
      const profBody = pm[5];

      const tiers = [];
      const tierRe = /<professionTier identifier="(\d+)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/professionTier>/g;
      let tm;
      while ((tm = tierRe.exec(profBody)) !== null) {
        const tierId = parseInt(tm[1]);
        const tierName = tm[2];
        const tierBody = tm[4];

        // XP requirements
        const profMatch = tierBody.match(/<proficiency[^>]*xp="(\d+)"/);
        const mastMatch = tierBody.match(/<mastery[^>]*xp="(\d+)"/);

        // Recipe IDs in this tier
        const recipeIds = [];
        const rr = /<recipe id="(\d+)"/g;
        let rm;
        while ((rm = rr.exec(tierBody)) !== null) recipeIds.push(rm[1]);

        tiers.push({
          t: tierId,
          n: tierName,
          profXp: profMatch ? parseInt(profMatch[1]) : 0,
          mastXp: mastMatch ? parseInt(mastMatch[1]) : 0,
          recipes: recipeIds.length,
        });
      }

      professions[profKey] = { id: profId, n: profName, tiers };
    }
    console.log(`    Professions: ${Object.keys(professions).map(k => professions[k].n).join(', ')}`);
  }

  // ── Parse recipes.xml ──────────────────────────────────────────────────
  const recipeXml = readXml('recipes.xml');
  if (!recipeXml) return;

  // Load recipe category labels
  const catLabels = resolveEnumLabels('CraftingUICategory.xml', 'enum-CraftingUICategory.xml');

  const recipes = [];
  // Match each recipe block (may be self-closing or have children)
  const recipeRe = /<recipe id="(\d+)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/recipe>/g;
  let m;

  while ((m = recipeRe.exec(recipeXml)) !== null) {
    const id = m[1];
    const name = m[2];
    const attrs = m[3];
    const body = m[4];

    const profMatch = attrs.match(/profession="([^"]*)"/);
    const tierMatch = attrs.match(/tier="(\d+)"/);
    const catMatch = attrs.match(/category="(\d+)"/);
    const xpMatch = attrs.match(/xp="(\d+)"/);
    const guildMatch = attrs.match(/guild="true"/);
    const singleUseMatch = attrs.match(/singleUse="true"/);
    const critMatch = body.match(/baseCriticalChance="(\d+)"/);
    const cooldownMatch = attrs.match(/cooldown="(\d+)"/);

    const recipe = {
      id,
      n: name,
      prof: profMatch ? profMatch[1] : null,
      tier: tierMatch ? parseInt(tierMatch[1]) : 0,
    };

    if (catMatch && catLabels[catMatch[1]]) recipe.cat = catLabels[catMatch[1]];
    else if (catMatch) recipe.catId = parseInt(catMatch[1]);
    if (xpMatch) recipe.xp = parseInt(xpMatch[1]);
    if (critMatch) recipe.crit = parseInt(critMatch[1]);
    if (guildMatch) recipe.guild = true;
    if (singleUseMatch) recipe.single = true;
    if (cooldownMatch) recipe.cd = parseInt(cooldownMatch[1]);

    // Parse ingredients
    const ingredients = [];
    const ingRe = /<ingredient([^>]*)>\s*<ingredientItem itemId="(\d+)" name="([^"]*)"([^/]*)\/?>\s*<\/ingredient>/g;
    let ig;
    while ((ig = ingRe.exec(body)) !== null) {
      const ingAttrs = ig[1];
      const qtyMatch = ingAttrs.match(/quantity="(\d+)"/);
      const optMatch = ingAttrs.match(/optional="true"/);
      const critBonusMatch = ingAttrs.match(/criticalChanceBonus="(\d+)"/);

      const ing = { id: ig[2], n: ig[3] };
      if (qtyMatch) ing.qty = parseInt(qtyMatch[1]);
      if (optMatch) ing.opt = true;
      if (critBonusMatch) ing.critBonus = parseInt(critBonusMatch[1]);
      ingredients.push(ing);
    }
    if (ingredients.length) recipe.ing = ingredients;

    // Parse results
    const results = [];
    const resRe = /<result([^>]*)>\s*<resultItem itemId="(\d+)" name="([^"]*)"([^/]*)\/?>\s*<\/result>/g;
    let rr;
    while ((rr = resRe.exec(body)) !== null) {
      const resAttrs = rr[1];
      const qtyMatch = resAttrs.match(/quantity="(\d+)"/);
      const critMatch2 = resAttrs.match(/critical="true"/);

      const res = { id: rr[2], n: rr[3] };
      if (qtyMatch) res.qty = parseInt(qtyMatch[1]);
      if (critMatch2) res.crit = true;
      results.push(res);
    }
    if (results.length) recipe.res = results;

    // Parse recipe scroll item
    const scrollMatch = body.match(/<scrollItem itemId="(\d+)" name="([^"]*)"/);
    if (scrollMatch) recipe.scroll = { id: scrollMatch[1], n: scrollMatch[2] };

    recipes.push(recipe);
  }

  // Write data
  writeJson(path.join(OUT, 'recipes.json'), recipes, false);
  writeJson(path.join(OUT, 'professions.json'), professions, true);

  console.log(`    ✓ Exported ${recipes.length} recipes to recipes.json`);
  console.log(`    ✓ Exported ${Object.keys(professions).length} professions to professions.json`);

  // Stats
  const byProf = {};
  for (const r of recipes) byProf[r.prof || 'Unknown'] = (byProf[r.prof || 'Unknown'] || 0) + 1;
  console.log(`    By profession: ${Object.entries(byProf).sort((a, b) => b[1] - a[1]).map(e => `${e[0]} (${e[1]})`).join(', ')}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 10: XP TABLE — level progression requirements
// ═════════════════════════════════════════════════════════════════════════════
function importXpTable() {
  console.log('\n📊 Importing XP table...');
  const xml = readXml('xp.xml');
  if (!xml) return;

  const table = [];
  const re = /<entry level="(\d+)" value="(\d+)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    table.push({ lv: parseInt(m[1]), xp: parseInt(m[2]) });
  }
  table.sort((a, b) => a.lv - b.lv);

  // Add XP required per level (delta)
  for (let i = 1; i < table.length; i++) {
    table[i].req = table[i].xp - table[i - 1].xp;
  }
  if (table.length) table[0].req = 0;

  writeJson(path.join(OUT, 'xp-table.json'), table, true);
  console.log(`    ✓ Exported ${table.length} levels (max: ${table[table.length - 1]?.lv}, total XP: ${table[table.length - 1]?.xp?.toLocaleString()})`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 11: EMOTES — social emote list
// ═════════════════════════════════════════════════════════════════════════════
function importEmotes() {
  console.log('\n🎭 Importing emotes...');
  const xml = readXml('emotes.xml');
  if (!xml) return;

  const emotes = [];
  const re = /<emote id="(\d+)"([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[2];
    const cmdMatch = attrs.match(/command="([^"]*)"/);
    const autoMatch = attrs.match(/auto="([^"]*)"/);
    const iconMatch = attrs.match(/icon="([^"]*)"/);

    if (cmdMatch) {
      const emote = { id: m[1], n: cmdMatch[1] };
      if (iconMatch) emote.ic = iconMatch[1];
      if (autoMatch && autoMatch[1] === 'true') emote.auto = true;
      emotes.push(emote);
    }
  }

  emotes.sort((a, b) => a.n.localeCompare(b.n));
  writeJson(path.join(OUT, 'emotes.json'), emotes, false);
  console.log(`    ✓ Exported ${emotes.length} emotes`);
}

// ═════════════════════════════════════════════════════════════════════════════
// ENRICHMENT 12: GEO AREAS — region/territory hierarchy for map & quests
// ═════════════════════════════════════════════════════════════════════════════
function importGeoAreas() {
  console.log('\n🗺️  Importing geographic areas...');
  const xml = readXml('geoAreas.xml');
  if (!xml) return;

  const regions = [];
  const territories = [];

  // Parse regions
  const regRe = /<region id="(\d+)"[^>]*name="([^"]*)"/g;
  let m;
  while ((m = regRe.exec(xml)) !== null) {
    regions.push({ id: m[1], n: m[2] });
  }

  // Parse territories (with parent)
  const terRe = /<territory id="(\d+)" name="([^"]*)" parentId="(\d+)"/g;
  while ((m = terRe.exec(xml)) !== null) {
    territories.push({ id: m[1], n: m[2], region: m[3] });
  }

  // Parse areas (nested inside territories in full data)
  const areas = [];
  const areaRe = /<area id="(\d+)" name="([^"]*)" parentId="(\d+)"/g;
  while ((m = areaRe.exec(xml)) !== null) {
    areas.push({ id: m[1], n: m[2], territory: m[3] });
  }

  // Build lookup: region id → name
  const regionById = {};
  for (const r of regions) regionById[r.id] = r.n;

  // Attach region name to territories
  for (const t of territories) {
    t.rn = regionById[t.region] || t.region;
  }

  const geoData = { regions, territories, areas };
  writeJson(path.join(OUT, 'geo-areas.json'), geoData, true);
  console.log(`    ✓ Exported ${regions.length} regions, ${territories.length} territories, ${areas.length} areas`);
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
function main() {
  console.log('📥 Importing lotro-data-master...');
  console.log(`   Source: ${SRC}`);

  if (!fs.existsSync(LORE)) {
    console.error(`   ❌ ${LORE} not found. Check the path.`);
    process.exit(1);
  }

  // Existing enrichments (patch existing data)
  enrichMobs();
  enrichSets();
  enrichDeeds();
  enrichNpcs();
  enrichInstances();
  enrichQuests();

  // New data imports (create new databases)
  importTitles();
  importFactions();
  importRecipes();
  importXpTable();
  importEmotes();
  importGeoAreas();

  console.log('\n✅ Import complete. Run `node build.js` to rebuild the site.');
}

main();
