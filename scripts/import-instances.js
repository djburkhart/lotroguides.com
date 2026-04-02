/**
 * Import instance data from Refridgerraiders' Instance Info spreadsheet
 * and produce data/instances-db.json for the site.
 *
 * Usage:  node import-instances.js "C:\Projects\Refridgerraiders Instance Info.xlsx"
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2] || path.join('C:\\Projects', 'Refridgerraiders Instance Info.xlsx');
if (!fs.existsSync(inputFile)) {
  console.error('File not found:', inputFile);
  process.exit(1);
}

const wb = XLSX.readFile(inputFile);

// Sheets to skip (non-instance sheets)
const SKIP_SHEETS = new Set(['Table of Contents', 'GuideFAQ', 'KoH RTs', 'RTs', 'Nazguls', 'OG RTs']);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function parseGroupType(size) {
  const n = parseInt(size, 10);
  if (n === 3) return '3-Player';
  if (n === 6) return '6-Player';
  if (n === 12) return '12-Player Raid';
  if (n === 24) return '24-Player Raid';
  return size + '-Player';
}

function extractMobs(data) {
  const mobs = [];
  let currentMob = null;

  for (let i = 5; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    // Mob header row: col[0] has the mob name, col[1] has its ID (numeric),
    // col[2] has "Hints: ..." or startup effects text
    if (
      row[0] &&
      typeof row[0] === 'string' &&
      row[0].trim() &&
      row[1] &&
      typeof row[2] === 'string' &&
      /^Hints:|^Startup/.test(row[2])
    ) {
      if (currentMob) mobs.push(currentMob);
      currentMob = {
        name: row[0].trim(),
        id: String(row[1]),
        abilities: [],
      };
    }
    // Ability rows: col[0] has ability name, col[1] has ID (numeric)
    else if (
      currentMob &&
      row[0] &&
      typeof row[0] === 'string' &&
      row[0].trim() &&
      row[1] &&
      typeof row[1] === 'number'
    ) {
      currentMob.abilities.push({
        name: row[0].trim(),
        id: String(row[1]),
      });
    }
  }
  if (currentMob) mobs.push(currentMob);

  return mobs;
}

function extractInstanceInfo(data) {
  const info = {};

  // Row 3: Instance name + ID
  if (data[3]) {
    const nameVal = data[3][1];
    if (nameVal && typeof nameVal === 'string') {
      info.name = nameVal.replace(/^Instance:\s*/, '').trim();
    }
    if (data[3][8]) {
      info.id = String(data[3][8]);
    }
  }

  // Row 4: Group size
  if (data[4] && data[4][1]) {
    const gsVal = typeof data[4][1] === 'string'
      ? data[4][1].replace(/^Group size:\s*/, '').trim()
      : String(data[4][1]);
    info.groupSize = gsVal;
    info.groupType = parseGroupType(gsVal);
  }

  // Row 5: Tiers
  if (data[5] && data[5][1]) {
    const tierVal = typeof data[5][1] === 'string'
      ? data[5][1].replace(/^Tiers:\s*/, '').trim()
      : String(data[5][1]);
    info.tiers = parseInt(tierVal, 10) || 1;
  }

  // Row 6: Scaling info
  if (data[6] && data[6][1] && typeof data[6][1] === 'string') {
    info.scaling = data[6][1].replace(/^Scaling:\s*/, '').trim();
  }

  return info;
}

// ─── Build the database ──────────────────────────────────────────────────
const instances = [];
const seenSlugs = new Set();

wb.SheetNames.forEach(sheetName => {
  if (SKIP_SHEETS.has(sheetName)) return;

  const ws = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // Must have at least 5 rows and look like an instance sheet
  if (data.length < 5) return;
  if (!data[3] || !data[3][1]) return;
  const nameCheck = typeof data[3][1] === 'string' ? data[3][1] : '';
  if (!nameCheck.startsWith('Instance:') && !data[3][8]) return;

  const info = extractInstanceInfo(data);
  if (!info.name) return;

  const mobs = extractMobs(data);

  let slug = slugify(info.name);
  if (seenSlugs.has(slug)) slug = slug + '-' + slugify(sheetName);
  seenSlugs.add(slug);

  instances.push({
    id: info.id || '',
    slug,
    name: info.name,
    sheetName,
    groupSize: info.groupSize || '',
    groupType: info.groupType || '',
    tiers: info.tiers || 1,
    scaling: info.scaling || '',
    mobCount: mobs.length,
    mobs: mobs.map(m => ({
      name: m.name,
      id: m.id,
      abilityCount: m.abilities.length,
      abilities: m.abilities.map(a => ({ name: a.name, id: a.id })),
    })),
  });
});

// Sort alphabetically
instances.sort((a, b) => a.name.localeCompare(b.name));

// Write the output
const outDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'instances-db.json');
fs.writeFileSync(outPath, JSON.stringify(instances, null, 2));

console.log(`✓ Wrote ${instances.length} instances to ${outPath}`);
console.log(`  Group sizes: ${[...new Set(instances.map(i => i.groupType))].sort().join(', ')}`);
console.log(`  Total mobs extracted: ${instances.reduce((s, i) => s + i.mobCount, 0)}`);
