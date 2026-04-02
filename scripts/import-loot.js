#!/usr/bin/env node
/**
 * Import missing instance loot data from lotro-delver.com
 * and LotRO Companion XML data.
 *
 * Usage: node scripts/import-loot.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LC_LORE = path.join(
  'C:', 'Users', 'me', 'OneDrive', 'Documents',
  'The Lord of the Rings Online', 'PluginData',
  'LotRO Companion', 'app', 'data', 'lore'
);

// ── Helpers ──────────────────────────────────────────────────────

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Parse lotro-delver RSC payload ──────────────────────────────

function parseLootGroups(chunk) {
  // Each loot_group: {ftt_conditions: null|{min_level,max_level}, items:[...]}
  const groups = [];
  const groupRe = /ftt_conditions\\":(null|\{[^}]*\}),\\"items\\":\[/g;
  let gMatch;
  while ((gMatch = groupRe.exec(chunk)) !== null) {
    let conditions = null;
    if (gMatch[1] !== 'null') {
      const minMatch = gMatch[1].match(/min_level\\":(\d+)/);
      const maxMatch = gMatch[1].match(/max_level\\":(\d+)/);
      if (minMatch && maxMatch) {
        conditions = { minLevel: +minMatch[1], maxLevel: +maxMatch[1] };
      }
    }

    // Find items in this group (until next ftt_conditions or end of chunk)
    const startIdx = gMatch.index + gMatch[0].length;
    const nextGroup = chunk.indexOf('ftt_conditions', startIdx);
    const endIdx = nextGroup > 0 ? nextGroup : chunk.length;
    const itemChunk = chunk.substring(startIdx, endIdx);

    const items = [];
    const itemRe = /\\"itemId\\":\\"(\d+)\\",\\"name\\":\\"([^\\]+)\\",\\"icon\\":\\"[^\\]*\\",\\"quality\\":\\"([^\\]+)\\",\\"itemClass\\":\\"([^\\]+)\\"/g;
    let iMatch;
    while ((iMatch = itemRe.exec(itemChunk)) !== null) {
      items.push({
        itemId: iMatch[1],
        name: iMatch[2],
        quality: iMatch[3],
        itemClass: iMatch[4]
      });
    }
    groups.push({ conditions, items });
  }
  return groups;
}

function parseDelverPage(html, instanceName) {
  const containers = [];

  const containerRe = /container_name\\":\\"([^\\]+)\\",\\"loot_groups\\":\[/g;
  let match;
  while ((match = containerRe.exec(html)) !== null) {
    const containerName = match[1];
    const startIdx = match.index + match[0].length;
    const nextContainer = html.indexOf('container_name', startIdx);
    const searchEnd = nextContainer > 0 ? nextContainer : startIdx + 100000;
    const chunk = html.substring(startIdx, searchEnd);

    const groups = parseLootGroups(chunk);

    // Keep base loot (null conditions) + endgame-level groups with items
    const baseLoot = groups.filter(g => !g.conditions);
    const levelGroups = groups.filter(g => g.conditions && g.items.length > 0);

    // Find the highest max-level among groups WITH items
    let highestLevel = 0;
    for (const g of levelGroups) {
      if (g.conditions.maxLevel > highestLevel) highestLevel = g.conditions.maxLevel;
    }

    // Take all groups within 20 levels of the highest (captures class-specific endgame groups)
    const endgameGroups = levelGroups.filter(
      g => g.conditions.maxLevel >= highestLevel - 20
    );

    // Merge items: base + best level group, dedup by itemId
    const seen = new Set();
    const items = [];
    const allGroups = [...baseLoot, ...endgameGroups];
    for (const g of allGroups) {
      for (const item of g.items) {
        if (seen.has(item.itemId)) continue;
        seen.add(item.itemId);
        items.push(item);
      }
    }

    containers.push({ name: containerName, items });
  }

  return containers;
}

// Map quality to drop rarity
function qualityToDrop(quality) {
  switch (quality) {
    case 'Common': return null; // skip junk
    case 'Uncommon': return 'Common';
    case 'Rare': return 'Uncommon';
    case 'Incomparable': return 'Uncommon';
    case 'Epic': return 'Rare';
    case 'Legendary': return 'Rare';
    default: return 'Uncommon';
  }
}

// Map itemClass to equipment slot
function classToSlot(itemClass) {
  const map = {
    'Head': 'head', 'Shoulders': 'shoulder', 'Chest': 'chest',
    'Legs': 'legs', 'Hands': 'hand', 'Feet': 'feet',
    'Back': 'back', 'Shield': 'off-hand', 'Heavy Shield': 'off-hand',
    'Warden\'s Shield': 'off-hand', 'Heavy Armour': 'chest',
    'Medium Armour': 'chest', 'Light Armour': 'chest',
    'Cloak': 'back', 'Gloves': 'hand', 'Boots': 'feet',
    'Leggings': 'legs', 'Helm': 'head', 'Hat': 'head',
    'Gauntlets': 'hand',
    // Jewelry slots — kept generic
    'Jewelry': null, 'Ring': 'ring', 'Earring': 'ear',
    'Bracelet': 'wrist', 'Necklace': 'neck', 'Pocket': 'pocket',
    // Weapons
    'Sword': 'main-hand', 'Axe': 'main-hand', 'Club': 'main-hand',
    'Mace': 'main-hand', 'Dagger': 'main-hand', 'Spear': 'main-hand',
    'Halberd': 'main-hand', 'Staff': 'main-hand', 'Bow': 'ranged',
    'Crossbow': 'ranged', 'Javelin': 'ranged',
    'Two-handed Sword': 'main-hand', 'Two-handed Axe': 'main-hand',
    'Two-handed Club': 'main-hand', 'Two-handed Hammer': 'main-hand',
  };
  return map[itemClass] || null;
}

function buildLootEntry(instanceName, instanceId, containers) {
  // Consolidate containers with the same name (different tiers of same chest)
  const consolidated = new Map();
  for (const c of containers) {
    if (consolidated.has(c.name)) {
      const existing = consolidated.get(c.name);
      const seen = new Set(existing.items.map(i => i.itemId));
      for (const item of c.items) {
        if (!seen.has(item.itemId)) {
          seen.add(item.itemId);
          existing.items.push(item);
        }
      }
    } else {
      consolidated.set(c.name, { name: c.name, items: [...c.items] });
    }
  }

  const bosses = [];
  let idx = 0;
  for (const c of consolidated.values()) {
    if (!c.items.length) continue;
    idx++;

    const label = consolidated.size === 1
      ? c.name
      : `${c.name} ${idx}`;

    const items = [];
    for (const item of c.items) {
      const drop = qualityToDrop(item.quality);
      if (!drop) continue; // skip Common/junk items

      // Skip certain non-equipment items
      if (item.itemClass === 'Component' || item.itemClass === 'Barter') {
        // Include currency/barter tokens (they're useful info)
        items.push({ name: item.name, drop });
        continue;
      }

      const entry = { name: item.name, drop };
      const slot = classToSlot(item.itemClass);
      if (slot) entry.slot = slot;
      items.push(entry);
    }

    if (items.length) {
      bosses.push({
        name: label,
        mobName: label,
        chests: [{
          label,
          tier: label,
          items
        }]
      });
    }
  }

  return {
    instanceName,
    instanceId: String(instanceId),
    bosses
  };
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const instancesDb = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'instances-db.json'), 'utf-8'));
  const instanceLoot = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'instance-loot.json'), 'utf-8'));

  const existingSlugs = new Set(Object.keys(instanceLoot));
  const missing = instancesDb.filter(i => !existingSlugs.has(i.slug));

  console.log(`Total instances: ${instancesDb.length}`);
  console.log(`Have loot: ${existingSlugs.size}`);
  console.log(`Missing loot: ${missing.length}`);
  console.log('');

  let added = 0;
  let failed = 0;
  let skipped = 0;

  for (const inst of missing) {
    const url = `https://lotro-delver.com/en/loot/${inst.id}`;
    process.stdout.write(`  ${inst.name} (${inst.id})... `);

    try {
      const html = await fetchPage(url);
      const containers = parseDelverPage(html, inst.name);

      if (!containers.length) {
        console.log('no containers found, skipping');
        skipped++;
        continue;
      }

      const totalItems = containers.reduce((s, c) => s + c.items.length, 0);
      if (totalItems === 0) {
        console.log('no items found, skipping');
        skipped++;
        continue;
      }

      const entry = buildLootEntry(inst.name, inst.id, containers);
      if (!entry.bosses.length) {
        console.log('no valid bosses after filtering, skipping');
        skipped++;
        continue;
      }

      instanceLoot[inst.slug] = entry;
      console.log(`✓ ${containers.length} chests, ${totalItems} items`);
      added++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }

    // Rate limit: 250ms between requests
    await sleep(250);
  }

  // Sort keys alphabetically (matching existing file style)
  const sorted = {};
  for (const key of Object.keys(instanceLoot).sort()) {
    sorted[key] = instanceLoot[key];
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'instance-loot.json'),
    JSON.stringify(sorted, null, 2) + '\n'
  );

  console.log('');
  console.log(`Done: ${added} added, ${skipped} skipped, ${failed} failed`);
  console.log(`Total instances with loot: ${Object.keys(sorted).length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
