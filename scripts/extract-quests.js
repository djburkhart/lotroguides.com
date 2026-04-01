/**
 * extract-quests.js
 * Parses LotRO Companion quest and NPC XML data into compact JSON files.
 *
 * Usage:  node scripts/extract-quests.js
 * Input:  LotRO Companion /app/data/lore/ XML files + labels
 * Output: data/lore/quests.json     — quest database
 *         data/lore/npcs.json       — NPC lookup
 *         data/lore/quest-poi.json  — quest ↔ marker cross-reference
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
const LABELS_DIR = path.join(LORE_DIR, 'labels', 'en');
const ENUMS_DIR = path.join(LORE_DIR, 'enums');

const MARKERS_DIR = path.join(OUT_DIR, 'map-markers');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Marker Index (for resolving mob locations) ─────────────────────────────
function normalizeLookupName(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadMapMarkerIndex() {
  const byDid = {};
  const byLabel = {};
  if (!fs.existsSync(MARKERS_DIR)) return { byDid, byLabel };

  const files = fs.readdirSync(MARKERS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const mapId = path.basename(file, '.json');
    const markers = JSON.parse(fs.readFileSync(path.join(MARKERS_DIR, file), 'utf8'));
    for (const mk of markers) {
      const row = { map: mapId, lng: mk.lng, lat: mk.lat, l: mk.l || '' };
      if (mk.d && !byDid[mk.d]) byDid[mk.d] = row;
      const key = normalizeLookupName(mk.l);
      if (key && !byLabel[key]) byLabel[key] = row;
    }
  }
  return { byDid, byLabel };
}

function findMarkerLocation(markerIndex, did, label) {
  if (did && markerIndex.byDid[did]) return markerIndex.byDid[did];
  const key = normalizeLookupName(label);
  if (key && markerIndex.byLabel[key]) return markerIndex.byLabel[key];
  return null;
}

/** Clean game-specific markup from extracted text */
function cleanGameText(str) {
  if (!str) return str;
  return str
    .replace(/&#10;/g, '\n')          // XML newline entities → real newlines
    .replace(/\\q/g, '')              // \q quote markers
    .replace(/<rgb=[^>]*>/g, '')       // <rgb=#FF0000> colour tags
    .replace(/<\/rgb>/g, '')           // </rgb> closing tags
    .replace(/&amp;/g, '&');           // double-encoded ampersands
}

// ─── Label Resolution ───────────────────────────────────────────────────────

/** Load a generic labels file into a key→value map */
function loadLabels(filename) {
  const fp = path.join(LABELS_DIR, filename);
  if (!fs.existsSync(fp)) { console.warn(`  ⚠ ${filename} not found`); return {}; }
  const xml = fs.readFileSync(fp, 'utf8');
  const map = {};
  const re = /<label key="([^"]*)" value="([^"]*)"/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    map[m[1]] = m[2];
  }
  return map;
}

/** Load enum code→label mapping (enum XML + label XML) */
function loadEnumLabels(enumFile, labelFile) {
  const enumPath = path.join(ENUMS_DIR, enumFile);
  if (!fs.existsSync(enumPath)) return {};
  const enumXml = fs.readFileSync(enumPath, 'utf8');
  const codeToKey = {};
  const re = /<entry code="(\d+)" name="([^"]*)"/g;
  let m;
  while ((m = re.exec(enumXml)) !== null) {
    codeToKey[m[1]] = m[2];
  }

  const labelPath = path.join(LABELS_DIR, labelFile);
  if (!fs.existsSync(labelPath)) return {};
  const labelXml = fs.readFileSync(labelPath, 'utf8');
  const keyToLabel = {};
  const lr = /<label key="([^"]*)" value="([^"]*)"/g;
  let lm;
  while ((lm = lr.exec(labelXml)) !== null) {
    keyToLabel[lm[1]] = lm[2];
  }

  const result = {};
  for (const [code, key] of Object.entries(codeToKey)) {
    if (keyToLabel[key]) result[code] = keyToLabel[key];
  }
  return result;
}

// ─── NPC Extraction ─────────────────────────────────────────────────────────
function extractNPCs() {
  console.log('  📦 Extracting NPCs...');
  const fp = path.join(LORE_DIR, 'NPCs.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ NPCs.xml not found'); return {}; }
  const xml = fs.readFileSync(fp, 'utf8');
  const npcLabels = loadLabels('npc.xml');

  const npcs = {};
  const re = /<NPC id="(\d+)" name="([^"]*)"([^/]*)\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = cleanGameText(m[2]);
    const attrs = m[3];
    const titleMatch = attrs.match(/title="([^"]*)"/);
    let title = '';
    if (titleMatch) {
      const key = titleMatch[1];
      title = cleanGameText(key.startsWith('key:') ? (npcLabels[key] || '') : key);
    }
    npcs[id] = { name, title };
  }
  console.log(`    Found ${Object.keys(npcs).length} NPCs`);
  return npcs;
}

// ─── Quest Extraction ───────────────────────────────────────────────────────
function extractQuests(npcMap) {
  console.log('  📦 Extracting quests...');
  const fp = path.join(LORE_DIR, 'quests.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ quests.xml not found'); return []; }
  const xml = fs.readFileSync(fp, 'utf8');

  // Load labels
  const questLabels = loadLabels('quests.xml');
  const categoryLabels = loadEnumLabels('QuestCategory.xml', 'enum-QuestCategory.xml');
  const scopeLabels = loadEnumLabels('QuestScope.xml', 'enum-QuestScope.xml');

  function resolveLabel(key) {
    if (!key) return '';
    const raw = key.startsWith('key:') ? (questLabels[key] || '') : (questLabels[key] || key);
    return cleanGameText(raw);
  }

  // Parse quests
  const questRe = /<quest ([^>]*)>([\s\S]*?)<\/quest>/g;
  const quests = [];
  let qm;

  while ((qm = questRe.exec(xml)) !== null) {
    const attrs = qm[1];
    const body = qm[2];

    const idMatch = attrs.match(/id="(\d+)"/);
    const nameMatch = attrs.match(/ name="([^"]*)"/);
    const catMatch = attrs.match(/category="(\d+)"/);
    const levelMatch = attrs.match(/level="(\d+)"/);
    const arcMatch = attrs.match(/questArc="([^"]*)"/);
    const descMatch = attrs.match(/description="([^"]*)"/);
    const scopeMatch = attrs.match(/scope="(\d+)"/);
    const sizeMatch = attrs.match(/size="(\d+)"/);
    const repeatMatch = attrs.match(/repeatable="true"/);
    const instMatch = attrs.match(/instanced="true"/);

    if (!idMatch || !nameMatch) continue;

    const id = idMatch[1];
    const name = cleanGameText(nameMatch[1]);
    const level = levelMatch ? parseInt(levelMatch[1]) : 0;
    const category = catMatch ? (categoryLabels[catMatch[1]] || catMatch[1]) : '';

    const quest = { id, name, level, category };

    // Quest arc
    if (arcMatch) {
      const arc = resolveLabel(arcMatch[1]);
      if (arc) quest.arc = arc;
    }

    // Description (keep brief — first sentence only)
    if (descMatch) {
      const desc = resolveLabel(descMatch[1]);
      if (desc) {
        // Strip ${PLAYER} tokens, trim to first 200 chars
        const clean = desc.replace(/\$\{[^}]+\}/g, 'you').replace(/\s+/g, ' ').trim();
        quest.description = clean.length > 200 ? clean.substring(0, 200) + '…' : clean;
      }
    }

    // Scope
    if (scopeMatch && scopeLabels[scopeMatch[1]]) {
      quest.scope = scopeLabels[scopeMatch[1]];
    }

    // Flags
    if (sizeMatch) {
      const s = parseInt(sizeMatch[1]);
      if (s === 2) quest.group = 'Small Fellowship';
      else if (s === 3) quest.group = 'Fellowship';
      else if (s === 4) quest.group = 'Raid';
    }
    if (repeatMatch) quest.repeatable = true;
    if (instMatch) quest.instanced = true;

    // Bestower NPC
    const bestowerMatch = body.match(/<bestower npcId="(\d+)" npcName="([^"]*)"/);
    if (bestowerMatch) {
      quest.bestower = { id: bestowerMatch[1], name: bestowerMatch[2] };
    }

    // Map associations
    const maps = [];
    const mapRe = /<map mapId="(\d+)"\/>/g;
    let mm;
    while ((mm = mapRe.exec(body)) !== null) {
      maps.push(mm[1]);
    }
    if (maps.length) quest.maps = maps;

    // Objectives — extract coordinates and NPCs
    const objectives = [];
    const objRe = /<objective index="(\d+)"([^>]*)>([\s\S]*?)<\/objective>/g;
    let om;
    while ((om = objRe.exec(body)) !== null) {
      const idx = parseInt(om[1]);
      const objAttrs = om[2];
      const objBody = om[3];

      const textMatch = objAttrs.match(/text="([^"]*)"/);
      const objText = textMatch ? resolveLabel(textMatch[1]) : '';

      const obj = { index: idx };
      if (objText) {
        const cleanText = objText.replace(/\$\{[^}]+\}/g, 'you').replace(/\s+/g, ' ').trim();
        obj.text = cleanText.length > 150 ? cleanText.substring(0, 150) + '…' : cleanText;
      }

      // Collect all points (coordinate locations)
      const points = [];
      const pointRe = /<point(?:\s[^>]*)?\slongitude="([^"]*)" latitude="([^"]*)"/g;
      let pm;
      while ((pm = pointRe.exec(objBody)) !== null) {
        const lng = parseFloat(pm[1]);
        const lat = parseFloat(pm[2]);
        if (!isNaN(lng) && !isNaN(lat)) {
          const pt = { lng, lat };
          const miMatch = pm[0].match(/mapIndex="(\d+)"/);
          if (miMatch) pt.mi = parseInt(miMatch[1], 10);
          points.push(pt);
        }
      }
      if (points.length) obj.points = points;

      // Collect NPC references
      const npcIds = new Set();
      const npcRe = /npcId="(\d+)"/g;
      let nm;
      while ((nm = npcRe.exec(objBody)) !== null) {
        npcIds.add(nm[1]);
      }
      if (npcIds.size) {
        obj.npcs = [...npcIds].map(nid => {
          const npc = npcMap[nid];
          return npc ? { id: nid, name: npc.name } : { id: nid };
        });
      }

      // Monster targets — capture kill count and mob identifiers
      const monsterRe = /<monsterDied[^>]*>/g;
      let mdm;
      const mobs = [];
      while ((mdm = monsterRe.exec(objBody)) !== null) {
        const tag = mdm[0];
        const cntMatch = tag.match(/count="(\d+)"/);
        const midMatch = tag.match(/mobId="(\d+)"/);
        const mnMatch = tag.match(/mobName="([^"]*)"/);
        const mob = {};
        if (cntMatch) mob.count = parseInt(cntMatch[1]);
        if (midMatch) mob.id = midMatch[1];
        if (mnMatch) mob.name = mnMatch[2];
        mobs.push(mob);
      }
      if (mobs.length) {
        obj.killCount = mobs[0].count || 1;
        obj.mobs = mobs;
      }

      objectives.push(obj);
    }
    if (objectives.length) quest.objectives = objectives;

    // Prerequisites
    const prereqs = [];
    const preRe = /<prerequisite id="(\d+)" name="([^"]*)"/g;
    let prm;
    while ((prm = preRe.exec(body)) !== null) {
      prereqs.push({ id: prm[1], name: prm[2] });
    }
    if (prereqs.length) quest.prerequisites = prereqs;

    // Next quest
    const nextMatch = body.match(/<nextQuest id="(\d+)" name="([^"]*)"/);
    if (nextMatch) {
      quest.nextQuest = { id: nextMatch[1], name: nextMatch[2] };
    }

    // Rewards
    const rewardsMatch = body.match(/<rewards>([\s\S]*?)<\/rewards>/);
    if (rewardsMatch) {
      const rBody = rewardsMatch[1];
      const rewards = {};

      const moneyMatch = rBody.match(/<money gold="(\d+)" silver="(\d+)" copper="(\d+)"\/>/);
      if (moneyMatch) {
        const g = parseInt(moneyMatch[1]);
        const s = parseInt(moneyMatch[2]);
        const c = parseInt(moneyMatch[3]);
        if (g || s || c) {
          const parts = [];
          if (g) parts.push(g + 'g');
          if (s) parts.push(s + 's');
          if (c) parts.push(c + 'c');
          rewards.money = parts.join(' ');
        }
      }

      const xpMatch = rBody.match(/<XP quantity="(\d+)"\/>/);
      if (xpMatch) rewards.xp = parseInt(xpMatch[1]);

      const itemRewards = [];
      const itemRe = /<object id="(\d+)" name="([^"]*)"/g;
      let im;
      while ((im = itemRe.exec(rBody)) !== null) {
        itemRewards.push({ id: im[1], name: cleanGameText(im[2]) });
      }
      if (itemRewards.length) rewards.items = itemRewards;

      if (Object.keys(rewards).length) quest.rewards = rewards;
    }

    quests.push(quest);
  }

  console.log(`    Found ${quests.length} quests`);
  return quests;
}

// ─── Build Quest ↔ POI Cross-Reference ──────────────────────────────────────
function buildQuestPOI(quests, npcMap) {
  console.log('  🔗 Building quest ↔ POI cross-reference...');

  // NPC DID → quest associations (for map popup enrichment)
  // Maps NPC DID to list of {questId, questName, role}
  const npcQuests = {};

  // Map ID → quest associations (for map quest overlay)
  const mapQuests = {};

  for (const q of quests) {
    // Bestower NPC
    if (q.bestower) {
      const nid = q.bestower.id;
      if (!npcQuests[nid]) npcQuests[nid] = [];
      npcQuests[nid].push({ id: q.id, n: q.name, r: 'bestower' });
    }

    // Map associations
    if (q.maps) {
      for (const mid of q.maps) {
        if (!mapQuests[mid]) mapQuests[mid] = [];
        mapQuests[mid].push({ id: q.id, n: q.name, lv: q.level });
      }
    }

    // Objective NPCs
    if (q.objectives) {
      for (const obj of q.objectives) {
        if (obj.npcs) {
          for (const npc of obj.npcs) {
            if (!npcQuests[npc.id]) npcQuests[npc.id] = [];
            // Avoid duplicates
            const existing = npcQuests[npc.id];
            if (!existing.some(e => e.id === q.id && e.r === 'objective')) {
              existing.push({ id: q.id, n: q.name, r: 'objective' });
            }
          }
        }
      }
    }
  }

  // Trim: only NPCs with quest associations
  const npcCount = Object.keys(npcQuests).length;
  const mapCount = Object.keys(mapQuests).length;

  console.log(`    ${npcCount} NPCs have quest associations`);
  console.log(`    ${mapCount} maps have quest associations`);

  return { npcQuests, mapQuests };
}

// ─── Compact Client Data ────────────────────────────────────────────────────
function buildClientData(quests) {
  console.log('  📦 Building compact client-side quest data...');

  // Compact fields: id, n(ame), lv(level), cat(egory), arc, desc(ription),
  // b(estower name), grp(group size), rep(eatable), inst(anced), sc(ope)
  // rw(rewards), pre(reqs), nxt(nextQuest)
  return quests.map(q => {
    const row = { id: q.id, n: q.name };
    if (q.level) row.lv = q.level;
    if (q.category) row.cat = q.category;
    if (q.arc) row.arc = q.arc;
    if (q.description) row.desc = q.description;
    if (q.bestower) row.b = q.bestower.name;
    if (q.group) row.grp = q.group;
    if (q.repeatable) row.rep = 1;
    if (q.instanced) row.inst = 1;
    if (q.scope) row.sc = q.scope;

    // Compact rewards
    if (q.rewards) {
      const rw = {};
      if (q.rewards.money) rw.m = q.rewards.money;
      if (q.rewards.xp) rw.xp = q.rewards.xp;
      if (q.rewards.items) rw.it = q.rewards.items.map(i => ({ id: i.id, n: i.name }));
      if (Object.keys(rw).length) row.rw = rw;
    }

    // Quest chain links
    if (q.prerequisites && q.prerequisites.length) {
      row.pre = q.prerequisites.map(p => ({ id: p.id, n: p.name }));
    }
    if (q.nextQuest) {
      row.nxt = { id: q.nextQuest.id, n: q.nextQuest.name };
    }

    // Maps (for linking to interactive map)
    if (q.maps) row.maps = q.maps;

    return row;
  });
}

// ─── Quest Overlay Data (objectives with coordinates) ───────────────────────
function buildQuestOverlay(quests, markerIndex) {
  console.log('  🗺️  Building quest overlay data...');

  // For each quest that has objectives with points, create overlay entry
  const overlay = {};
  let count = 0;
  let killZones = 0;

  for (const q of quests) {
    if (!q.objectives) continue;
    const questMaps = q.maps || [];

    const steps = [];
    for (const obj of q.objectives) {
      // Resolve points from objective or fall back to mob marker locations
      let points = obj.points;
      if ((!points || !points.length) && obj.mobs) {
        // Try to find mob locations via marker index
        for (const mob of obj.mobs) {
          if (!mob.id && !mob.name) continue;
          const loc = findMarkerLocation(markerIndex, mob.id, mob.name);
          if (loc) {
            points = [{ lng: loc.lng, lat: loc.lat }];
            // Infer map index from the location
            const mapIdx = questMaps.indexOf(loc.map);
            if (mapIdx >= 0) points[0].mi = mapIdx;
            else if (loc.map) {
              // Add map to questMaps if not there
              points[0].mi = questMaps.length;
              questMaps.push(loc.map);
            }
            break;
          }
        }
      }

      if (!points || !points.length) continue;
      const step = {
        i: obj.index,
        pts: points.map(p => {
          const entry = [p.lng, p.lat];
          // Resolve mapIndex to actual map ID
          const mi = p.mi || 0;
          if (questMaps[mi]) entry.push(questMaps[mi]);
          return entry;
        }),
      };
      if (obj.text) step.t = obj.text;

      // Mark kill-zone steps with mob info for area highlighting
      if (obj.killCount && obj.mobs) {
        step.kz = { c: obj.killCount };
        const names = obj.mobs.filter(m => m.name).map(m => m.name);
        if (names.length) step.kz.n = names.join(', ');
        killZones++;
      }

      steps.push(step);
    }

    if (steps.length) {
      overlay[q.id] = {
        n: q.name,
        lv: q.level,
        maps: q.maps || [],
        steps
      };
      count++;
    }
  }

  console.log(`    ${count} quests have plottable objectives`);
  console.log(`    ${killZones} kill-zone objectives tagged`);
  return overlay;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('🗃  Extracting quest & NPC data...');
  console.log(`   Source: ${LORE_DIR}`);
  ensureDir(OUT_DIR);

  // Extract NPCs
  const npcMap = extractNPCs();

  // Extract quests
  const quests = extractQuests(npcMap);

  // Build cross-reference
  const { npcQuests, mapQuests } = buildQuestPOI(quests, npcMap);

  // Build client-side data
  const clientQuests = buildClientData(quests);

  // Build quest overlay data (objectives with coordinates + kill zones)
  const markerIndex = loadMapMarkerIndex();
  const questOverlay = buildQuestOverlay(quests, markerIndex);

  // Write output files
  fs.writeFileSync(path.join(OUT_DIR, 'quests.json'), JSON.stringify(clientQuests));
  const qSize = (Buffer.byteLength(JSON.stringify(clientQuests)) / 1024 / 1024).toFixed(1);
  console.log(`   → quests.json: ${qSize} MB (${clientQuests.length} quests)`);

  // NPC lookup (compact: id → {n, t})
  const clientNpcs = {};
  for (const [id, npc] of Object.entries(npcMap)) {
    const entry = { n: npc.name };
    if (npc.title) entry.t = npc.title;
    clientNpcs[id] = entry;
  }
  fs.writeFileSync(path.join(OUT_DIR, 'npcs.json'), JSON.stringify(clientNpcs));
  const nSize = (Buffer.byteLength(JSON.stringify(clientNpcs)) / 1024).toFixed(0);
  console.log(`   → npcs.json: ${nSize} KB (${Object.keys(clientNpcs).length} NPCs)`);

  // Quest ↔ POI cross-reference (for map popup enrichment)
  fs.writeFileSync(path.join(OUT_DIR, 'quest-poi.json'), JSON.stringify(npcQuests));
  const pSize = (Buffer.byteLength(JSON.stringify(npcQuests)) / 1024).toFixed(0);
  console.log(`   → quest-poi.json: ${pSize} KB (NPC → quest associations)`);

  // Map → quest index
  fs.writeFileSync(path.join(OUT_DIR, 'map-quests.json'), JSON.stringify(mapQuests));
  const mSize = (Buffer.byteLength(JSON.stringify(mapQuests)) / 1024).toFixed(0);
  console.log(`   → map-quests.json: ${mSize} KB (map → quest associations)`);

  // Quest overlay data (objectives with coordinates)
  fs.writeFileSync(path.join(OUT_DIR, 'quest-overlay.json'), JSON.stringify(questOverlay));
  const oSize = (Buffer.byteLength(JSON.stringify(questOverlay)) / 1024 / 1024).toFixed(1);
  console.log(`   → quest-overlay.json: ${oSize} MB (plottable objectives)`);

  console.log('\n✅ Quest extraction complete');
}

main();
