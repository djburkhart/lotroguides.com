#!/usr/bin/env node
/**
 * Import collections data from lotro-data XML.
 *
 * Sources:
 *   - lore/collections.xml        → collections with elements + reward titles
 *   - lore/skills.xml             → mount/pet skill metadata (iconId, sourceDescription key, description key)
 *   - lore/labels/en/skills.xml   → English text for sourceDescription & description keys
 *   - lore/enums/MountType.xml    → mount type enum (horse, goat, elk, etc.)
 *
 * Output: data/collections-db.json
 *   { collections: [...], items: [...] }
 */
const fs = require('fs');
const path = require('path');

const LORE = path.resolve(__dirname, '..', '..', '..', 'Users', 'me', 'Downloads',
  'lotro-data-master', 'lotro-data-master', 'lore');
const OUT  = path.resolve(__dirname, '..', 'data', 'collections-db.json');

/* ── Helpers ──────────────────────────────────────────────────────────── */

function attr(xml, name) {
  const re = new RegExp(name + '="([^"]*)"');
  const m = xml.match(re);
  return m ? m[1] : '';
}

/* ── Labels loader ────────────────────────────────────────────────────── */

function loadLabels(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const map = {};
  const re = /<label\s+key="([^"]+)"\s+value="([^"]*)"/g;
  let m;
  while ((m = re.exec(txt))) {
    map[m[1]] = m[2];
  }
  return map;
}

/* ── Mount type enum loader ───────────────────────────────────────────── */

function loadMountTypes(enumPath, labelsMap) {
  const txt = fs.readFileSync(enumPath, 'utf8');
  const map = {};
  const re = /<entry\s+code="(\d+)"\s+name="([^"]*)"\s*\/>/g;
  let m;
  while ((m = re.exec(txt))) {
    const code = m[1];
    const nameOrKey = m[2];
    // Name may be a label key or a plain string
    map[code] = labelsMap[nameOrKey] || nameOrKey.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return map;
}

/* ── Skills loader (mounts + pets) — returns full metadata ────────────── */

function loadAllSkills(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const list = [];
  // Match <mount ...> or <pet ...>
  const re = /<(mount|pet)\s+identifier="(\d+)"([^>]*)>/g;
  let m;
  while ((m = re.exec(txt))) {
    const type = m[1];
    const id = m[2];
    const attrs = 'identifier="' + id + '"' + m[3];
    const entry = {
      id,
      name: attr(attrs, 'name'),
      type,
      iconId: attr(attrs, 'iconId'),
      sourceDescKey: attr(attrs, 'sourceDescription'),
      descKey: attr(attrs, 'description'),
    };
    if (type === 'mount') {
      entry.mountType = attr(attrs, 'mountType');
      entry.speed = attr(attrs, 'speed');
      entry.morale = attr(attrs, 'morale');
      entry.tall = attr(attrs, 'tall') === 'true';
      entry.peerId = attr(attrs, 'peerId');
    }
    list.push(entry);
  }
  return list;
}

/* ── Parse collections.xml ───────────────────────────────────────────── */

function parseCollections(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const collections = [];

  // Split into <collection ...>...</collection> blocks
  const blockRe = /<collection\s+([^>]+)>([\s\S]*?)<\/collection>/g;
  let bm;
  while ((bm = blockRe.exec(txt))) {
    const headerAttrs = bm[1];
    const body = bm[2];

    const id = attr('<x ' + headerAttrs, 'identifier');
    const name = attr('<x ' + headerAttrs, 'name');
    const category = parseInt(attr('<x ' + headerAttrs, 'category'), 10);
    const requiredRace = attr('<x ' + headerAttrs, 'requiredRace');

    // Parse elements
    const elements = [];
    const elRe = /<element\s+id="(\d+)"\s+name="([^"]*)"\s*\/>/g;
    let em;
    while ((em = elRe.exec(body))) {
      elements.push({ id: em[1], name: em[2] });
    }

    // Parse reward titles
    const rewards = [];
    const rwRe = /<title\s+id="(\d+)"\s+name="([^"]*)"\s*\/>/g;
    let rm;
    while ((rm = rwRe.exec(body))) {
      rewards.push({ id: rm[1], name: rm[2] });
    }

    collections.push({
      id, name, category,
      requiredRace: requiredRace || null,
      elements,
      rewards
    });
  }

  return collections;
}

/* ── Main ─────────────────────────────────────────────────────────────── */

console.log('Importing collections from:', LORE);
console.log('Output:', OUT);
console.log();

// 1. Load labels first (needed for mount type enum)
console.log('Loading labels/en/skills.xml...');
const labels = loadLabels(path.join(LORE, 'labels', 'en', 'skills.xml'));
console.log('  Loaded ' + Object.keys(labels).length + ' skill labels');

// Also load mount-type specific labels
const mtLabels = loadLabels(path.join(LORE, 'labels', 'en', 'enum-MountType.xml'));
Object.assign(labels, mtLabels);

// 2. Load mount type enum
const mountTypes = loadMountTypes(path.join(LORE, 'enums', 'MountType.xml'), labels);
console.log('Mount types:', mountTypes);

// 3. Load ALL mount/pet skills
console.log('Loading skills.xml...');
const allSkills = loadAllSkills(path.join(LORE, 'skills.xml'));
console.log('  Loaded ' + allSkills.length + ' mount/pet skills');

// Build skill map by id
const skillMap = {};
allSkills.forEach(s => { skillMap[s.id] = s; });

// 4. Parse collections
const collections = parseCollections(path.join(LORE, 'collections.xml'));
console.log('Parsed ' + collections.length + ' collections');

// Track which skill IDs belong to a collection
const inCollection = new Set();
collections.forEach(c => c.elements.forEach(e => inCollection.add(e.id)));

// 5. Enrich collections
const CATEGORIES = { 1: 'Mounts', 2: 'Pets' };
let foundSrc = 0, missingSrc = 0, foundDesc = 0;

function resolveSkill(id, name) {
  const skill = skillMap[id];
  const out = { id, n: name || (skill ? skill.name : id) };

  if (skill) {
    if (skill.iconId) out.ic = skill.iconId;

    if (skill.sourceDescKey) {
      const txt = labels[skill.sourceDescKey];
      if (txt) { out.src = txt; foundSrc++; }
      else { missingSrc++; }
    } else { missingSrc++; }

    if (skill.descKey) {
      const txt = labels[skill.descKey];
      if (txt) { out.desc = txt; foundDesc++; }
    }
  } else {
    missingSrc++;
  }

  return out;
}

const resultCollections = collections.map(col => {
  const enrichedElements = col.elements.map(el => resolveSkill(el.id, el.name));

  const entry = {
    id: col.id,
    n: col.name,
    cat: CATEGORIES[col.category] || 'Other',
    el: enrichedElements
  };

  if (col.requiredRace) entry.race = col.requiredRace;
  if (col.rewards.length) {
    entry.rw = col.rewards.map(r => ({ id: r.id, n: r.name }));
  }

  return entry;
});

// 6. Build individual items (all mounts/pets including uncollected)
const items = allSkills.map(skill => {
  const out = {
    id: skill.id,
    n: skill.name,
    cat: skill.type === 'mount' ? 'Mounts' : 'Pets',
    ic: skill.iconId || undefined,
    col: inCollection.has(skill.id) ? 1 : undefined, // 1 = part of a collection
  };

  // Source description
  if (skill.sourceDescKey) {
    const txt = labels[skill.sourceDescKey];
    if (txt) out.src = txt;
  }

  // Description
  if (skill.descKey) {
    const txt = labels[skill.descKey];
    if (txt) out.desc = txt;
  }

  // Mount-specific
  if (skill.type === 'mount') {
    if (skill.speed) out.spd = parseFloat(skill.speed);
    if (skill.morale) out.mor = parseInt(skill.morale, 10);
    if (skill.mountType && mountTypes[skill.mountType]) {
      out.mt = mountTypes[skill.mountType];
    }
    if (skill.tall) out.tall = true;
  }

  return out;
});

// Sort items: by category (Mounts first), then alphabetically
items.sort((a, b) => {
  if (a.cat !== b.cat) return a.cat === 'Mounts' ? -1 : 1;
  return a.n.localeCompare(b.n);
});

// 7. Write output
const output = {
  collections: resultCollections,
  items: items
};
fs.writeFileSync(OUT, JSON.stringify(output));

console.log();
console.log('Collections: ' + resultCollections.length);
console.log('Collection elements with source: ' + foundSrc + ' / ' + (foundSrc + missingSrc));
console.log('Collection elements with desc: ' + foundDesc);
console.log('Total individual items: ' + items.length);
console.log('  Mounts: ' + items.filter(i => i.cat === 'Mounts').length);
console.log('  Pets: ' + items.filter(i => i.cat === 'Pets').length);
console.log('  In a collection: ' + items.filter(i => i.col).length);
console.log('  With source: ' + items.filter(i => i.src).length);
console.log('  With description: ' + items.filter(i => i.desc).length);
console.log();
const bytes = fs.statSync(OUT).size;
console.log('Output: ' + OUT + ' (' + (bytes / 1024).toFixed(1) + ' KB)');
