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

/** Clean game-specific markup from extracted text */
function cleanGameText(str) {
  if (!str) return str;
  return str
    .replace(/&#10;/g, '\n')          // XML newline entities → real newlines
    .replace(/\\q/g, '')              // \q quote markers
    .replace(/<rgb=[^>]*>/g, '')      // <rgb=#FF0000> colour tags
    .replace(/<\/rgb>/g, '')          // </rgb> closing tags
    .replace(/&amp;/g, '&');          // double-encoded ampersands
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
    const name = cleanGameText(m[2]);
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
      name: cleanGameText(m[2]),
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
      name: cleanGameText(m[2]),
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
      name: cleanGameText(m[2]),
      alignment: alignMatch ? (alignMatch[1] === '3' ? 'enemy' : 'friendly') : 'unknown',
    };
    if (genusMatch && genusLabels[genusMatch[1]]) mob.genus = genusLabels[genusMatch[1]];
    if (speciesMatch && speciesLabels[speciesMatch[1]]) mob.species = speciesLabels[speciesMatch[1]];

    mobs.push(mob);
  }

  console.log(`    Found ${mobs.length} mobs`);
  return mobs;
}

// ─── Virtues ────────────────────────────────────────────────────────────────
function extractVirtues() {
  console.log('  📦 Extracting virtues...');
  const xml = readXml('virtues.xml');
  if (!xml) return [];

  const re = /<virtue identifier="(\d+)" key="([^"]*)" name="([^"]*)"[^>]*>([\s\S]*?)<\/virtue>/g;
  const virtues = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = cleanGameText(m[3]);
    const body = m[4];

    // Extract active stats
    const stats = [];
    const sr = /<stat name="([^"]*)"/g;
    let s;
    while ((s = sr.exec(body.match(/<activeStats>([\s\S]*?)<\/activeStats>/)?.[1] || '')) !== null) {
      const label = STAT_LABELS[s[1]] || s[1].replace(/_/g, ' ');
      stats.push(label);
    }

    // Extract max tier from xp entries
    let maxTier = 0;
    const xpRe = /tier="(\d+)"/g;
    let xm;
    while ((xm = xpRe.exec(body)) !== null) {
      const tier = parseInt(xm[1]);
      if (tier > maxTier) maxTier = tier;
    }

    virtues.push({ id, name, stats, maxTier });
  }

  console.log(`    Found ${virtues.length} virtues`);
  return virtues;
}

// ─── Sets ───────────────────────────────────────────────────────────────────
function extractSets() {
  console.log('  📦 Extracting sets...');
  const xml = readXml('sets.xml');
  if (!xml) return [];

  const re = /<set id="(\d+)" name="([^"]*)"([^>]*)>([\s\S]*?)<\/set>/g;
  const sets = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = cleanGameText(m[2]).split('\n')[0].trim();
    const attrs = m[3];
    const body = m[4];

    const levelMatch = attrs.match(/level="(\d+)"/);
    const maxLevelMatch = attrs.match(/maxLevel="(\d+)"/);
    const level = levelMatch ? parseInt(levelMatch[1]) : 0;
    const maxLevel = maxLevelMatch ? parseInt(maxLevelMatch[1]) : 0;

    // Extract set pieces
    const pieces = [];
    const pr = /<item id="(\d+)" name="([^"]*)"/g;
    let p;
    while ((p = pr.exec(body)) !== null) {
      pieces.push({ id: p[1], name: cleanGameText(p[2]) });
    }

    // Extract set bonuses
    const bonuses = [];
    const br = /<bonus nbItems="(\d+)">([\s\S]*?)<\/bonus>/g;
    let b;
    while ((b = br.exec(body)) !== null) {
      const count = parseInt(b[1]);
      const bonusBody = b[2];
      const bonusStats = [];
      const bsr = /<stat name="([^"]*)"(?:[^/]*?(?:constant|scaling)="([^"]*)")?/g;
      let bs;
      while ((bs = bsr.exec(bonusBody)) !== null) {
        const label = STAT_LABELS[bs[1]] || bs[1].replace(/_/g, ' ');
        const val = bs[2] && !bs[2].startsWith('1879') ? parseFloat(bs[2]) : null;
        bonusStats.push({ stat: label, value: val });
      }
      if (bonusStats.length) {
        bonuses.push({ count, stats: bonusStats });
      }
    }

    sets.push({ id, name, level, maxLevel, pieces, bonuses });
  }

  console.log(`    Found ${sets.length} sets`);
  return sets;
}

// ─── Deeds ──────────────────────────────────────────────────────────────────
function extractDeeds() {
  console.log('  📦 Extracting deeds...');
  const xml = readXml('deeds.xml');
  if (!xml) return [];

  const re = /<deed id="(\d+)"([^>]*)>([\s\S]*?)<\/deed>/g;
  const deeds = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const attrs = m[2];
    const body = m[3];

    const nameMatch = attrs.match(/name="([^"]*)"/);
    const typeMatch = attrs.match(/type="([^"]*)"/);
    const minLevelMatch = attrs.match(/minLevel="(\d+)"/);
    const levelMatch = attrs.match(/level="(\d+)"/);
    const classMatch = attrs.match(/requiredClass="([^"]*)"/);

    const name = nameMatch ? cleanGameText(nameMatch[1]) : '';
    const type = typeMatch ? typeMatch[1] : '';
    if (!name) continue;

    // Categorize deed type into friendly labels
    let category;
    switch (type) {
      case 'EXPLORER': category = 'Exploration'; break;
      case 'SLAYER': category = 'Slayer'; break;
      case 'LORE': category = 'Lore'; break;
      case 'REPUTATION': category = 'Reputation'; break;
      case 'CLASS': category = 'Class'; break;
      case 'RACE': category = 'Race'; break;
      case 'EVENT': case 'WORLD_EVENT_CONDITION': category = 'Event'; break;
      default: category = 'Other'; break;
    }

    // Extract rewards
    const rewards = [];
    const lpMatch = body.match(/<lotroPoints quantity="(\d+)"/);
    if (lpMatch) rewards.push({ type: 'LP', value: parseInt(lpMatch[1]) });
    const titleMatch = body.match(/<title id="\d+" name="([^"]*)"/);
    if (titleMatch) rewards.push({ type: 'Title', value: cleanGameText(titleMatch[1]) });
    const virtueMatch = body.match(/<virtue id="(\d+)"[^>]*name="([^"]*)"/);
    if (virtueMatch) rewards.push({ type: 'Virtue', value: cleanGameText(virtueMatch[2]) });
    const repMatches = [...body.matchAll(/<reputationItem[^>]*faction="([^"]*)"[^>]*amount="([^"]*)"/g)];
    for (const rm of repMatches) {
      rewards.push({ type: 'Reputation', value: `${rm[1]} +${rm[2]}` });
    }
    const vxpMatch = body.match(/<virtueXP quantity="(\d+)"/);
    if (vxpMatch) rewards.push({ type: 'VirtueXP', value: parseInt(vxpMatch[1]) });
    const xpMatch = body.match(/<XP quantity="(\d+)"/);
    if (xpMatch) rewards.push({ type: 'XP', value: parseInt(xpMatch[1]) });
    const objMatches = [...body.matchAll(/<object id="[^"]*" name="([^"]*)" quantity="(\d+)"/g)];
    for (const om of objMatches) {
      rewards.push({ type: 'Item', value: `${cleanGameText(om[1])} x${om[2]}` });
    }

    // Extract objectives
    const objectives = [];

    // Monster kills — named mobs (mobId + mobName on <monsterDied>)
    const namedMobs = [...body.matchAll(/<monsterDied[^>]*mobId="(\d+)"[^>]*mobName="([^"]*)"/g)];
    for (const mk of namedMobs) {
      objectives.push({ type: 'kill', mobId: mk[1], mobName: cleanGameText(mk[2]) });
    }

    // Monster kills — generic (count + monsterSelection with landName)
    const genericMobs = [...body.matchAll(/<monsterDied[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/monsterDied>/g)];
    for (const gm of genericMobs) {
      const obj = { type: 'kill', count: parseInt(gm[1]) };
      const zoneMatch = gm[2].match(/landName="([^"]*)"/);
      if (zoneMatch) obj.zone = zoneMatch[1];
      objectives.push(obj);
    }

    // Quest/deed completions (achievableId = specific quest or deed)
    const questCompletes = [...body.matchAll(/<questComplete[^>]*achievableId="(\d+)"[^>]*/g)];
    for (const qc of questCompletes) {
      objectives.push({ type: 'complete', achievableId: qc[1] });
    }

    // Quest category completions (complete N quests of a type)
    const catCompletes = [...body.matchAll(/<questComplete[^>]*questCategory="(\d+)"[^>]*count="(\d+)"[^>]*/g)];
    for (const cc of catCompletes) {
      objectives.push({ type: 'questCount', count: parseInt(cc[2]) });
    }

    // Landmark discovery
    const landmarks = [...body.matchAll(/<landmarkDetection[^>]*landmarkName="([^"]*)"/g)];
    for (const lm of landmarks) {
      objectives.push({ type: 'landmark', name: cleanGameText(lm[1]) });
    }

    // Item collection
    const items = [...body.matchAll(/<inventoryItem[^>]*itemName="([^"]*)"/g)];
    for (const it of items) {
      objectives.push({ type: 'item', name: cleanGameText(it[1]) });
    }

    // Item usage at locations
    const itemsUsed = [...body.matchAll(/<itemUsed[^>]*itemName="([^"]*)"/g)];
    for (const iu of itemsUsed) {
      objectives.push({ type: 'useItem', name: cleanGameText(iu[1]) });
    }

    // NPC interactions
    const npcs = [...body.matchAll(/<npcTalk[^>]*npcName="([^"]*)"/g)];
    for (const np of npcs) {
      objectives.push({ type: 'npc', name: cleanGameText(np[1]) });
    }

    // Skill usage
    const skills = [...body.matchAll(/<skillUsed[^>]*count="(\d+)"[^>]*/g)];
    for (const sk of skills) {
      objectives.push({ type: 'skill', count: parseInt(sk[1]) });
    }

    // Emote usage
    const emotes = [...body.matchAll(/<emote[^>]*command="([^"]*)"[^>]*count="(\d+)"[^>]*/g)];
    for (const em of emotes) {
      objectives.push({ type: 'emote', name: em[1], count: parseInt(em[2]) });
    }

    // Enter detection (explore areas)
    const enters = [...body.matchAll(/<enterDetection[^>]*/g)];
    if (enters.length) {
      objectives.push({ type: 'explore', count: enters.length });
    }

    // Reputation / faction level
    const factions = [...body.matchAll(/<factionLevel[^>]*faction="([^"]*)"[^>]*tier="(\d+)"[^>]*/g)];
    for (const fl of factions) {
      objectives.push({ type: 'faction', name: fl[1], tier: parseInt(fl[2]) });
    }

    const deed = {
      id,
      name,
      type: category,
      level: levelMatch ? parseInt(levelMatch[1]) : (minLevelMatch ? parseInt(minLevelMatch[1]) : 0),
      rewards,
    };
    if (classMatch) deed.requiredClass = classMatch[1];
    if (objectives.length) deed.objectives = objectives;

    deeds.push(deed);
  }

  console.log(`    Found ${deeds.length} deeds`);
  return deeds;
}

// ─── Build Unified Item Index (for auto-linking) ────────────────────────────
function buildItemIndex(consumables, statTomes, enhancementRunes, items, mobs, virtues, sets, deeds) {
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

  // Add virtues
  for (const v of virtues) {
    if (!index[v.name]) {
      index[v.name] = { id: v.id, type: 'virtue', stats: v.stats.map(s => ({ stat: s, value: 0 })) };
    }
  }

  // Add sets (8+ char names only)
  for (const s of sets) {
    if (s.name.length >= 8 && !index[s.name]) {
      index[s.name] = { id: s.id, type: 'set', level: s.level };
    }
  }

  // Add deeds (8+ char names only)
  for (const d of deeds) {
    if (d.name.length >= 8 && !index[d.name]) {
      index[d.name] = { id: d.id, type: 'deed', deedType: d.type };
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
  const virtues = extractVirtues();
  const sets = extractSets();
  const deeds = extractDeeds();
  const itemIndex = buildItemIndex(consumables, statTomes, enhancementRunes, items, mobs, virtues, sets, deeds);

  // Write individual data files
  fs.writeFileSync(path.join(OUT_DIR, 'consumables.json'), JSON.stringify(consumables, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'stat-tomes.json'), JSON.stringify(statTomes, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'enhancement-runes.json'), JSON.stringify(enhancementRunes, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(items, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'virtues.json'), JSON.stringify(virtues, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'sets.json'), JSON.stringify(sets, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'deeds.json'), JSON.stringify(deeds, null, 2));

  // Write the unified item index (used by build.js for auto-linking)
  fs.writeFileSync(path.join(OUT_DIR, 'item-index.json'), JSON.stringify(itemIndex));

  const indexSize = (Buffer.byteLength(JSON.stringify(itemIndex)) / 1024).toFixed(0);
  console.log(`\n✅ Lore extraction complete`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Index size: ${indexSize} KB (${Object.keys(itemIndex).length} entries)`);
}

main();
