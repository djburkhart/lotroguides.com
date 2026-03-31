/**
 * extract-maps.js
 * Parses LotRO Companion map data (maps.xml, links.xml, categories, markers)
 * into compact JSON files for the interactive map page.
 *
 * Usage:  node scripts/extract-maps.js
 * Input:  LotRO Companion /app/data/lore/maps/
 * Output: data/lore/maps-*.json (site-ready extracts)
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ──────────────────────────────────────────────────────────
const COMPANION_ROOT = process.env.LOTRO_COMPANION_PATH ||
  'C:/Users/me/OneDrive/Documents/The Lord of the Rings Online/LotRO Companion/app';
const MAPS_DIR = path.join(COMPANION_ROOT, 'data', 'lore', 'maps');
const OUT_DIR = path.join(__dirname, '..', 'data', 'lore');
const IMG_OUT = path.join(__dirname, '..', 'img', 'maps', 'categories');

// Categories to EXCLUDE (high-volume landscape noise)
const EXCLUDED_CATEGORIES = new Set([
  2,   // Quest (too many, overwhelming)
  39,  // No Icon
  50,  // Crafting Resource
  71,  // Monster
  72,  // Container
  73,  // Item
  77,  // Crop
  78,  // Critter
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Clean game-specific markup/artifacts from extracted text */
function cleanGameText(str) {
  if (!str) return str;
  return str
    .replace(/&#10;|&#x0*0a;/gi, '\n')
    .replace(/\\q/g, '')
    .replace(/<rgb=[^>]*>/gi, '')
    .replace(/<\/rgb>/gi, '')
    .replace(/&amp;amp;/g, '&')
    .replace(/&amp;/g, '&')
    .trim();
}

// ─── Parse maps.xml ─────────────────────────────────────────────────────────
function extractMaps() {
  console.log('  🗺  Extracting maps...');
  const fp = path.join(MAPS_DIR, 'maps', 'maps.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ maps.xml not found'); return []; }

  const xml = fs.readFileSync(fp, 'utf8');
  const re = /<map id="(\d+)" name="([^"]*)" imageId="(\d+)"[^>]*>([\s\S]*?)<\/map>/g;
  const maps = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const id = m[1];
    const name = cleanGameText(m[2]);
    const imageId = m[3];
    const body = m[4];

    // Parse geo
    const factorMatch = body.match(/factor="([^"]*)"/);
    const pointMatch = body.match(/<point longitude="([^"]*)" latitude="([^"]*)"/);
    const minMatch = body.match(/<min longitude="([^"]*)" latitude="([^"]*)"/);
    const maxMatch = body.match(/<max longitude="([^"]*)" latitude="([^"]*)"/);

    if (!minMatch || !maxMatch) continue;

    maps.push({
      id,
      name,
      imageId,
      factor: factorMatch ? parseFloat(factorMatch[1]) : 1,
      origin: pointMatch ? { lng: parseFloat(pointMatch[1]), lat: parseFloat(pointMatch[2]) } : { lng: 0, lat: 0 },
      min: { lng: parseFloat(minMatch[1]), lat: parseFloat(minMatch[2]) },
      max: { lng: parseFloat(maxMatch[1]), lat: parseFloat(maxMatch[2]) },
    });
  }

  console.log(`    Found ${maps.length} maps`);
  return maps;
}

// ─── Parse categories.xml ───────────────────────────────────────────────────
function extractCategories() {
  console.log('  📁 Extracting categories...');
  const fp = path.join(MAPS_DIR, 'categories', 'categories.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ categories.xml not found'); return []; }

  const xml = fs.readFileSync(fp, 'utf8');
  const re = /<category code="(\d+)" name="([^"]*)" icon="([^"]*)"/g;
  const cats = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    cats.push({ code: parseInt(m[1]), name: cleanGameText(m[2]), icon: m[3] });
  }

  console.log(`    Found ${cats.length} categories`);
  return cats;
}

// ─── Parse links.xml ────────────────────────────────────────────────────────
function extractLinks() {
  console.log('  🔗 Extracting links...');
  const fp = path.join(MAPS_DIR, 'links.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ links.xml not found'); return []; }

  const xml = fs.readFileSync(fp, 'utf8');
  const re = /<link parentId="(\d+)" contentLayerId="(\d+)" target="(\d+)" label="([^"]*)" from="([^"]*)"/g;
  const links = [];
  let m;

  while ((m = re.exec(xml)) !== null) {
    const coords = m[5].split('/');
    links.push({
      from: m[1],       // parent map id
      to: m[3],         // target map id
      label: cleanGameText(m[4]),
      lng: parseFloat(coords[0]),
      lat: parseFloat(coords[1]),
    });
  }

  console.log(`    Found ${links.length} links`);
  return links;
}

// ─── Parse all marker XML files ─────────────────────────────────────────────
function extractMarkers() {
  console.log('  📍 Extracting markers...');
  const markersDir = path.join(MAPS_DIR, 'markers');
  if (!fs.existsSync(markersDir)) { console.warn('  ⚠ markers/ not found'); return []; }

  const files = fs.readdirSync(markersDir).filter(f => f.endsWith('.xml'));
  let totalMarkers = 0;
  const allMarkers = [];

  for (const file of files) {
    const xml = fs.readFileSync(path.join(markersDir, file), 'utf8');
    const re = /<marker id="(\d+)" label="([^"]*)" category="(\d+)"(?:\s+did="(\d+)")?\s+parentZoneId="(\d+)" longitude="([^"]*)" latitude="([^"]*)"/g;
    let m;

    while ((m = re.exec(xml)) !== null) {
      const cat = parseInt(m[3]);
      if (EXCLUDED_CATEGORIES.has(cat)) continue;
      allMarkers.push({
        id: m[1],
        l: cleanGameText(m[2]), // label
        c: cat,              // category code
        d: m[4] || '',       // did (data id, for cross-linking)
        z: m[5],             // parentZoneId
        lng: parseFloat(m[6]),
        lat: parseFloat(m[7]),
      });
      totalMarkers++;
    }
  }

  console.log(`    Found ${totalMarkers} markers from ${files.length} files`);
  return allMarkers;
}

// ─── Assign markers to maps by bounding box ─────────────────────────────────
function assignMarkersToMaps(maps, markers) {
  console.log('  🔄 Assigning markers to maps...');

  const mapById = Object.fromEntries(maps.map(m => [m.id, m]));

  // Build a bounding box index from maps — sorted by factor (highest first = most specific)
  const sortedMaps = [...maps].sort((a, b) => b.factor - a.factor);

  // Region-level maps (factor ≤ 65) should aggregate markers from children.
  // Overview maps (factor ≤ 2) are excluded — they show navigation links only.
  const REGION_MAX_FACTOR = 65;
  const OVERVIEW_MAX_FACTOR = 2;

  // Pass 1: assign each marker to its most specific map (highest factor)
  const mapMarkers = {}; // mapId → Set of marker indices

  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];

    // Prefer explicit parent zone mapping from source data.
    // This is the authoritative layer for most POIs and prevents overlap
    // between similarly bounded sibling/parent maps.
    if (mk.z && mapById[mk.z]) {
      if (!mapMarkers[mk.z]) mapMarkers[mk.z] = new Set();
      mapMarkers[mk.z].add(i);
      continue;
    }

    for (const map of sortedMaps) {
      if (mk.lng >= map.min.lng && mk.lng <= map.max.lng &&
          mk.lat >= map.min.lat && mk.lat <= map.max.lat) {
        if (!mapMarkers[map.id]) mapMarkers[map.id] = new Set();
        mapMarkers[map.id].add(i);
        break; // most specific map only for pass 1
      }
    }
  }

  // Pass 2: for region maps, aggregate markers from contained child maps.
  // This keeps whole-zone views (e.g. Evendim/Bree-land) representative even
  // when the region has some native POIs of its own.
  const regionMaps = maps.filter(m => m.factor > OVERVIEW_MAX_FACTOR && m.factor <= REGION_MAX_FACTOR);
  for (const region of regionMaps) {
    // Find all higher-factor maps that are spatially contained within this region.
    // This lets parent area maps (e.g. Bree-land) surface POIs from their children.
    const collected = mapMarkers[region.id] ? new Set(mapMarkers[region.id]) : new Set();
    for (const child of sortedMaps) {
      if (child.factor <= region.factor) continue; // only look at more specific maps

      if (child.min.lng >= region.min.lng && child.max.lng <= region.max.lng &&
          child.min.lat >= region.min.lat && child.max.lat <= region.max.lat) {
        const childMarkers = mapMarkers[child.id];
        if (childMarkers) {
          for (const idx of childMarkers) {
            const mk = markers[idx];
            if (!mk) continue;
            if (mk.lng < region.min.lng || mk.lng > region.max.lng ||
                mk.lat < region.min.lat || mk.lat > region.max.lat) {
              continue;
            }
            collected.add(idx);
          }
        }
      }
    }

    if (collected.size > 0) mapMarkers[region.id] = collected;
  }

  // Convert Sets to Arrays for output
  const result = {};
  for (const [mapId, indices] of Object.entries(mapMarkers)) {
    result[mapId] = [...indices];
  }

  const assignedCount = Object.values(result).reduce((sum, arr) => sum + arr.length, 0);
  const mapCount = Object.keys(result).length;
  console.log(`    Assigned ${assignedCount} markers across ${mapCount} maps`);

  return result;
}

// ─── Determine major maps for navigation ────────────────────────────────────
function getMajorMaps(maps, mapMarkers, links) {
  // Major maps: those linked from Middle-earth or Eriador overview,
  // or with significant marker counts. These are the top-level region maps.
  const middleEarthId = '268437554';
  const eriadorId = '268437557';

  // Maps directly linked from overview maps
  const linkedFromOverview = new Set();
  for (const link of links) {
    if (link.from === middleEarthId || link.from === eriadorId) {
      linkedFromOverview.add(link.to);
    }
  }

  // Add the overview maps themselves
  linkedFromOverview.add(middleEarthId);
  linkedFromOverview.add(eriadorId);

  // Also include any map with 50+ markers
  for (const [mapId, indices] of Object.entries(mapMarkers)) {
    if (indices.length >= 50) {
      linkedFromOverview.add(mapId);
    }
  }

  return linkedFromOverview;
}

// ─── Copy category icon PNGs ────────────────────────────────────────────────
function copyCategoryIcons(categories) {
  console.log('  🎨 Copying category icons...');
  ensureDir(IMG_OUT);

  let copied = 0;
  for (const cat of categories) {
    const src = path.join(MAPS_DIR, 'categories', `${cat.icon}.png`);
    const dest = path.join(IMG_OUT, `${cat.icon}.png`);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copied++;
    }
  }
  console.log(`    Copied ${copied} category icons`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('🗺  Extracting LotRO Companion map data...');
  console.log(`   Source: ${MAPS_DIR}`);
  ensureDir(OUT_DIR);

  const maps = extractMaps();
  const categories = extractCategories();
  const links = extractLinks();
  const markers = extractMarkers();
  const mapMarkers = assignMarkersToMaps(maps, markers);
  const mapById = Object.fromEntries(maps.map(m => [m.id, m]));
  const majorMapIds = getMajorMaps(maps, mapMarkers, links);

  // Copy category icon PNGs to site assets
  copyCategoryIcons(categories);

  // Write maps data (all maps with geo info)
  fs.writeFileSync(
    path.join(OUT_DIR, 'maps-index.json'),
    JSON.stringify(maps)
  );

  // Write categories
  fs.writeFileSync(
    path.join(OUT_DIR, 'maps-categories.json'),
    JSON.stringify(categories)
  );

  // Write links
  fs.writeFileSync(
    path.join(OUT_DIR, 'maps-links.json'),
    JSON.stringify(links)
  );

  // Write per-map marker files (only for maps with markers)
  const markerOutDir = path.join(OUT_DIR, 'map-markers');
  ensureDir(markerOutDir);

  // Remove stale marker files so maps no longer assigned markers don't keep old POIs.
  for (const file of fs.readdirSync(markerOutDir)) {
    if (file.endsWith('.json')) {
      fs.unlinkSync(path.join(markerOutDir, file));
    }
  }

  let writtenMaps = 0;
  let totalDeduped = 0;
  let totalOutOfBoundsFiltered = 0;
  for (const [mapId, indices] of Object.entries(mapMarkers)) {
    const mapDef = mapById[mapId];
    const raw = indices
      .map(i => markers[i])
      .filter(m => m && (!mapDef || (
        m.lng >= mapDef.min.lng && m.lng <= mapDef.max.lng &&
        m.lat >= mapDef.min.lat && m.lat <= mapDef.max.lat
      )));
    totalOutOfBoundsFiltered += indices.length - raw.length;
    // Deduplicate exact duplicate POIs emitted under different marker ids.
    const seen = new Set();
    const deduped = [];
    for (const m of raw) {
      const normLabel = (m.l || '').trim().toLowerCase();
      const key = m.c + '|' + normLabel + '|' + m.lng.toFixed(2) + '|' + m.lat.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(m);
    }
    totalDeduped += raw.length - deduped.length;
    fs.writeFileSync(
      path.join(markerOutDir, `${mapId}.json`),
      JSON.stringify(deduped)
    );
    writtenMaps++;
  }

  // Write a manifest with summary info
  const manifest = {
    totalMaps: maps.length,
    totalMarkers: markers.length,
    totalCategories: categories.length,
    totalLinks: links.length,
    mapsWithMarkers: writtenMaps,
    majorMapIds: [...majorMapIds],
  };
  fs.writeFileSync(
    path.join(OUT_DIR, 'maps-manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  const totalSize = (
    Buffer.byteLength(JSON.stringify(maps)) +
    Buffer.byteLength(JSON.stringify(categories)) +
    Buffer.byteLength(JSON.stringify(links))
  ) / 1024;

  console.log(`\n✅ Map extraction complete`);
  console.log(`   Output: ${OUT_DIR}`);
  console.log(`   Maps: ${maps.length}, Markers: ${markers.length}, Links: ${links.length}`);
  console.log(`   Per-map marker files: ${writtenMaps}`);
  console.log(`   Duplicate markers removed: ${totalDeduped}`);
  console.log(`   Out-of-bounds markers filtered: ${totalOutOfBoundsFiltered}`);
  console.log(`   Major maps: ${majorMapIds.size}`);
  console.log(`   Core data size: ${totalSize.toFixed(0)} KB`);
}

main();
