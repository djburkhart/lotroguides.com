/**
 * extract-lore.js
 * Parses LotRO Companion XML data into compact JSON files for the site.
 *
 * Usage:  node scripts/extract-lore.js
 * Input:  LotRO Companion /app/data/lore/ XML files
 * Output: data/lore/*.json  (small, site-ready extracts)
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────
const LORE_DIR = path.join(
  process.env.LOTRO_COMPANION_PATH ||
  'C:/Users/me/OneDrive/Documents/The Lord of the Rings Online/LotRO Companion/app',
  'data', 'lore'
);
const OUT_DIR = path.join(__dirname, '..', 'data', 'lore');

// Friendly stat name mappings
const STAT_LABELS = {
  MIGHT: 'Might',
  AGILITY: 'Agility',
  WILL: 'Will',
  VITALITY: 'Vitality',
  FATE: 'Fate',
  MORALE: 'Morale',
  POWER: 'Power',
  PHYSICAL_MASTERY: 'Physical Mastery',
  TACTICAL_MASTERY: 'Tactical Mastery',
  PHYSICAL_MITIGATION: 'Physical Mitigation',
  TACTICAL_MITIGATION: 'Tactical Mitigation',
  CRITICAL_RATING: 'Critical Rating',
  FINESSE: 'Finesse',
  RESISTANCE: 'Resistance',
  ICMR: 'In-Combat Morale Regen',
  OCMR: 'Out-of-Combat Morale Regen',
  ICPR: 'In-Combat Power Regen',
  OCPR: 'Out-of-Combat Power Regen',
  ARMOUR: 'Armour',
  PHYSICAL_MITIGATION_PERCENTAGE: 'Physical Mitigation %',
  TACTICAL_MITIGATION_PERCENTAGE: 'Tactical Mitigation %',
  Resist_Additional_Resistance_Poison: 'Poison Resistance %',
  Resist_Additional_Resistance_Disease: 'Disease Resistance %',
  Resist_Additional_Resistance_Fear: 'Fear Resistance %',
  Resist_Additional_Resistance_Wound: 'Wound Resistance %',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readXml(filename) {
  const fp = path.join(LORE_DIR, filename);
  if (!fs.existsSync(fp)) { console.warn(`  ⚠ ${filename} not found`); return ''; }
  return fs.readFileSync(fp, 'utf8');
}

function formatStat(name, value) {
  const label = STAT_LABELS[name] || name.replace(/_/g, ' ');
  const num = Math.round(parseFloat(value));
  return { stat: label, value: num };
}

// ─── Consumables ────────────────────────────────────────────────────────────
function extractConsumables() {
  console.log('  📦 Extracting consumables...');
  const xml = readXml('consumables.xml');
  if (!xml) return [];

  const re = /<consumable identifier="(\d+)" name="([^"]*)">([\s\S]*?)<\/consumable>/g;
  const items = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = m[2];
    const body = m[3];
    const stats = [];
    const sr = /<stat name="([^"]*)"[^/]*?constant="([^"]*)"/g;
    let s;
    while ((s = sr.exec(body)) !== null) {
      stats.push(formatStat(s[1], s[2]));
    }

    // Categorize
    let type = 'other';
    const nl = name.toLowerCase();
    if (nl.includes('scroll of') && nl.includes('battle')) type = 'battle-scroll';
    else if (nl.includes('scroll of') && nl.includes('warding')) type = 'warding-scroll';
    else if (nl.includes('token') || nl.includes('edhelharn')) type = 'token';
    else if (nl.includes('caltrops') || nl.includes('shield-spike')) type = 'tactical';
    else if (nl.includes('pot of') || nl.includes('honey')) type = 'trail-food';
    else if (nl.includes('feast')) type = 'feast';
    else if (stats.some(s => ['Might','Agility','Will','Vitality','Fate'].includes(s.stat) && s.value > 50)) type = 'food';
    else if (stats.some(s => s.stat.includes('Morale Regen') || s.stat.includes('Power Regen'))) type = 'food';

    items.push({ id, name, type, stats });
  }

  console.log(`    Found ${items.length} consumables`);
  return items;
}

// ─── Stat Tomes ─────────────────────────────────────────────────────────────
function extractStatTomes() {
  console.log('  📦 Extracting stat tomes...');
  const xml = readXml('statTomes.xml');
  if (!xml) return [];

  const tomes = [];
  const statRe = /<stat id="([^"]*)">([\s\S]*?)<\/stat>/g;
  let sm;
  while ((sm = statRe.exec(xml)) !== null) {
    const statName = sm[1];
    const body = sm[2];
    const tomeRe = /<tome rank="(\d+)"[^>]*>([\s\S]*?)<\/tome>/g;
    let tm;
    while ((tm = tomeRe.exec(body)) !== null) {
      const rank = parseInt(tm[1]);
      const valMatch = tm[2].match(/value="([^"]*)"/);
      if (valMatch) {
        tomes.push({
          stat: STAT_LABELS[statName] || statName,
          rank,
          value: Math.round(parseFloat(valMatch[1])),
        });
      }
    }
  }

  console.log(`    Found ${tomes.length} stat tome ranks`);
  return tomes;
}

// ─── Enhancement Runes ──────────────────────────────────────────────────────
function extractEnhancementRunes() {
  console.log('  📦 Extracting enhancement runes...');
  const xml = readXml('enhancementRunes.xml');
  if (!xml) return [];

  const runes = [];
  const re = /<enhancementRune itemId="(\d+)" name="([^"]*)"([^/]*)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[3];
    const minMatch = attrs.match(/minItemLevel="(\d+)"/);
    const maxMatch = attrs.match(/maxItemLevel="(\d+)"/);
    const incMatch = attrs.match(/levelIncrement="(\d+)"/);
    runes.push({
      id: m[1],
      name: m[2],
      minItemLevel: minMatch ? parseInt(minMatch[1]) : 0,
      maxItemLevel: maxMatch ? parseInt(maxMatch[1]) : 0,
      levelIncrement: incMatch ? parseInt(incMatch[1]) : 1,
    });
  }

  console.log(`    Found ${runes.length} enhancement runes`);
  return runes;
}

// ─── Items (selective — only extract gear/consumables we'd reference) ───────
function extractItems() {
  console.log('  📦 Extracting items (streaming, selective)...');
  const fp = path.join(LORE_DIR, 'items.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ items.xml not found'); return []; }

  const xml = fs.readFileSync(fp, 'utf8');
  // Only extract items with quality LEGENDARY, INCOMPARABLE, or RARE at level >= 100
  const re = /<item key="(\d+)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/item>/g;
  const items = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const attrs = m[3];
    const levelMatch = attrs.match(/level="(\d+)"/);
    const level = levelMatch ? parseInt(levelMatch[1]) : 0;
    const qualityMatch = attrs.match(/quality="([^"]*)"/);
    const quality = qualityMatch ? qualityMatch[1] : '';
    const slotMatch = attrs.match(/slot="([^"]*)"/);
    const categoryMatch = attrs.match(/category="([^"]*)"/);

    // Filter: only high-level notable items to keep size manageable
    if (level < 100) continue;
    if (!['LEGENDARY', 'INCOMPARABLE', 'RARE'].includes(quality)) continue;

    const body = m[4];
    const stats = [];
    const sr = /<stat name="([^"]*)"(?:[^/]*?(?:value|constant)="([^"]*)")?/g;
    let s;
    while ((s = sr.exec(body)) !== null) {
      if (s[2]) stats.push(formatStat(s[1], s[2]));
    }

    items.push({
      id: m[1],
      name: m[2],
      level,
      quality: quality.toLowerCase(),
      slot: slotMatch ? slotMatch[1].replace(/_/g, ' ').toLowerCase() : '',
      category: categoryMatch ? categoryMatch[1].toLowerCase() : '',
      stats,
    });
  }

  console.log(`    Found ${items.length} notable items (level 100+, rare+)`);
  return items;
}

// ─── Enum / Label Resolution ────────────────────────────────────────────────
function loadEnumLabels(enumFile, labelFile) {
  // Parse enum XML: code → key mapping
  const enumXml = readXml(path.join('enums', enumFile));
  if (!enumXml) return {};
  const codeToKey = {};
  const re = /<entry code="(\d+)" name="([^"]*)"/g;
  let m;
  while ((m = re.exec(enumXml)) !== null) {
    codeToKey[m[1]] = m[2];
  }

  // Parse label XML: key → human-readable label
  const labelPath = path.join(LORE_DIR, 'labels', 'en', labelFile);
  if (!fs.existsSync(labelPath)) return {};
  const labelXml = fs.readFileSync(labelPath, 'utf8');
  const keyToLabel = {};
  const lr = /<label key="([^"]*)" value="([^"]*)"/g;
  let lm;
  while ((lm = lr.exec(labelXml)) !== null) {
    keyToLabel[lm[1]] = lm[2];
  }

  // Combine: code → label
  const result = {};
  for (const [code, key] of Object.entries(codeToKey)) {
    if (keyToLabel[key]) result[code] = keyToLabel[key];
  }
  return result;
}

// ─── Mobs ───────────────────────────────────────────────────────────────────
function extractMobs() {
  console.log('  📦 Extracting mobs...');
  const xml = readXml('mobs.xml');
  if (!xml) return [];

  // Load classification labels
  const genusLabels = loadEnumLabels('Genus.xml', 'enum-Genus.xml');
  const speciesLabels = loadEnumLabels('Species.xml', 'enum-Species.xml');

  const re = /<mob id="(\d+)" name="([^"]*)"([^>]*)>/g;
  const mobs = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const attrs = m[3];
    const alignMatch = attrs.match(/alignment="(\d+)"/);
    const genusMatch = attrs.match(/genus="(\d+)"/);
    const speciesMatch = attrs.match(/species="(\d+)"/);

    const mob = {
      id: m[1],
      name: m[2],
      alignment: alignMatch ? (alignMatch[1] === '3' ? 'enemy' : 'friendly') : 'unknown',
    };
    if (genusMatch && genusLabels[genusMatch[1]]) mob.genus = genusLabels[genusMatch[1]];
    if (speciesMatch && speciesLabels[speciesMatch[1]]) mob.species = speciesLabels[speciesMatch[1]];

    mobs.push(mob);
  }

  console.log(`    Found ${mobs.length} mobs`);
  return mobs;
}

// ─── Build Unified Item Index (for auto-linking) ────────────────────────────
function buildItemIndex(consumables, statTomes, enhancementRunes, items, mobs) {
  console.log('  📇 Building item index for auto-linking...');
  const index = {};

  // Add consumables to index
  for (const c of consumables) {
    index[c.name] = { id: c.id, type: 'consumable', subtype: c.type, stats: c.stats };
  }

  // Add notable items
  for (const item of items) {
    if (!index[item.name]) {
      index[item.name] = { id: item.id, type: 'item', quality: item.quality, level: item.level, slot: item.slot, stats: item.stats };
    }
  }

  // Add enemy mobs (bosses, etc.) — only unique names
  const mobCounts = {};
  for (const mob of mobs) {
    if (mob.alignment === 'enemy') {
      mobCounts[mob.name] = (mobCounts[mob.name] || 0) + 1;
    }
  }
  for (const mob of mobs) {
    if (mob.alignment === 'enemy' && !index[mob.name]) {
      const entry = { id: mob.id, type: 'mob' };
      if (mob.genus) entry.genus = mob.genus;
      if (mob.species) entry.species = mob.species;
      index[mob.name] = entry;
    }
  }

  console.log(`    Index contains ${Object.keys(index).length} entries`);
  return index;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('🗃  Extracting LotRO Companion lore data...');
  console.log(`   Source: ${LORE_DIR}`);
  ensureDir(OUT_DIR);

  const consumables = extractConsumables();
  const statTomes = extractStatTomes();
  const enhancementRunes = extractEnhancementRunes();
  const items = extractItems();
  const mobs = extractMobs();
  const itemIndex = buildItemIndex(consumables, statTomes, enhancementRunes, items, mobs);

  // Write individual data files
  fs.writeFileSync(path.join(OUT_DIR, 'consumables.json'), JSON.stringify(consumables, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'stat-tomes.json'), JSON.stringify(statTomes, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'enhancement-runes.json'), JSON.stringify(enhancementRunes, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(items, null, 2));

  // Write the unified item index (used by build.js for auto-linking)
  fs.writeFileSync(path.join(OUT_DIR, 'item-index.json'), JSON.stringify(itemIndex));

  const indexSize = (Buffer.byteLength(JSON.stringify(itemIndex)) / 1024).toFixed(0);
  console.log(`\n✅ Lore extraction complete`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Index size: ${indexSize} KB (${Object.keys(itemIndex).length} entries)`);
}

main();
