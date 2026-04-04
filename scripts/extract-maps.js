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
const { execSync } = require('child_process');

// ─── Configuration ──────────────────────────────────────────────────────────
const COMPANION_ROOT = process.env.LOTRO_COMPANION_PATH ||
  'C:/Users/me/OneDrive/Documents/The Lord of the Rings Online/LotRO Companion/app';
const BASEMAPS_DIR = process.env.LOTRO_BASEMAPS_PATH ||
  path.resolve(__dirname, '..', '..', 'lotro-maps-db', 'maps');
const MAPS_DIR = path.join(COMPANION_ROOT, 'data', 'lore', 'maps');
const LORE_DIR = path.join(COMPANION_ROOT, 'data', 'lore');
const LIB_DIR = path.join(COMPANION_ROOT, 'lib');
const OUT_DIR = path.join(__dirname, '..', 'data', 'lore');
const IMG_OUT = path.join(__dirname, '..', 'img', 'maps', 'categories');
const AREA_ICONS_OUT = path.join(__dirname, '..', 'img', 'maps', 'areas');

// High-volume categories extracted to separate per-map files (lazy-loaded in frontend).
// These each contain 50K–1.8M markers and would bloat the default marker payload.
const HEAVY_CATEGORIES = new Set([
  50,  // Crafting Resource (~635K markers)
  71,  // Monster (~1.8M markers)
  72,  // Container (~238K markers)
  77,  // Crop (~773K markers)
  78,  // Critter (~756K markers)
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

// ─── Read basemap image dimensions from PNG headers ─────────────────────────
function enrichWithImageDimensions(maps) {
  if (!fs.existsSync(BASEMAPS_DIR)) {
    console.log('  ⚠ Basemaps directory not found, skipping image dimensions');
    return;
  }
  console.log('  📐 Reading basemap image dimensions...');
  let found = 0;
  for (const map of maps) {
    const png = path.join(BASEMAPS_DIR, `${map.id}.png`);
    if (!fs.existsSync(png)) continue;
    // PNG IHDR: width at bytes 16-19, height at bytes 20-23 (big-endian uint32)
    const buf = Buffer.alloc(24);
    const fd = fs.openSync(png, 'r');
    fs.readSync(fd, buf, 0, 24, 0);
    fs.closeSync(fd);
    map.w = buf.readUInt32BE(16);
    map.h = buf.readUInt32BE(20);
    found++;
  }
  console.log(`    ${found}/${maps.length} maps have basemap dimensions`);
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
  const heavyMarkers = [];

  for (const file of files) {
    const xml = fs.readFileSync(path.join(markersDir, file), 'utf8');
    const re = /<marker id="(\d+)" label="([^"]*)" category="(\d+)"(?:\s+did="(\d+)")?\s+parentZoneId="(\d+)" longitude="([^"]*)" latitude="([^"]*)"/g;
    let m;

    while ((m = re.exec(xml)) !== null) {
      const cat = parseInt(m[3]);
      const marker = {
        id: m[1],
        l: cleanGameText(m[2]), // label
        c: cat,              // category code
        d: m[4] || '',       // did (data id, for cross-linking)
        z: m[5],             // parentZoneId
        lng: parseFloat(m[6]),
        lat: parseFloat(m[7]),
      };
      if (HEAVY_CATEGORIES.has(cat)) {
        heavyMarkers.push(marker);
      } else {
        allMarkers.push(marker);
      }
      totalMarkers++;
    }
  }

  console.log(`    Found ${totalMarkers} markers (${allMarkers.length} standard, ${heavyMarkers.length} heavy) from ${files.length} files`);
  return { standard: allMarkers, heavy: heavyMarkers };
}

// ─── Parse parchmentMaps.xml to build area → map lookup ─────────────────────
function buildAreaToMapLookup() {
  console.log('  📋 Building area → map lookup from parchmentMaps.xml...');
  const fp = path.join(LORE_DIR, 'parchmentMaps.xml');
  if (!fs.existsSync(fp)) { console.warn('  ⚠ parchmentMaps.xml not found'); return {}; }

  const xml = fs.readFileSync(fp, 'utf8');
  const areaToMap = {};
  // Match only parchmentMap elements with opening+closing tags (not self-closing "/>" ones).
  // Self-closing entries (e.g. overview maps like Eriador, Rhovanion) have no child areas,
  // but the old regex would consume the next sibling's </parchmentMap> as its closing tag,
  // misattributing areas from the following map to the self-closing parent.
  const mapRe = /<parchmentMap id="(\d+)"[^>]*[^/]>([\s\S]*?)<\/parchmentMap>/g;
  let m;

  while ((m = mapRe.exec(xml)) !== null) {
    const mapId = m[1];
    const body = m[2];
    const areas = [...body.matchAll(/<area id="(\d+)"/g)];
    for (const a of areas) {
      areaToMap[a[1]] = mapId;
    }
  }

  console.log(`    ${Object.keys(areaToMap).length} areas mapped to parchment maps`);
  return areaToMap;
}

// ─── Assign markers to maps using authoritative zone/area lookup ─────────────
function assignMarkersToMaps(maps, markers, areaToMap) {
  console.log('  🔄 Assigning markers to maps...');

  const mapById = Object.fromEntries(maps.map(m => [m.id, m]));

  // Build a bounding box index from maps — sorted by factor (highest first = most specific)
  const sortedMaps = [...maps].sort((a, b) => b.factor - a.factor);

  const mapMarkers = {}; // mapId → Set of marker indices

  let directMatch = 0, areaMatch = 0, bboxFallback = 0, unassigned = 0;

  for (let i = 0; i < markers.length; i++) {
    const mk = markers[i];

    // 1. Direct map match — parentZoneId IS a map (inner/instance maps)
    if (mk.z && mapById[mk.z]) {
      if (!mapMarkers[mk.z]) mapMarkers[mk.z] = new Set();
      mapMarkers[mk.z].add(i);
      directMatch++;
      continue;
    }

    // 2. Area→map lookup — parentZoneId is an area within a parchment map
    if (mk.z && areaToMap[mk.z]) {
      const targetMap = areaToMap[mk.z];
      if (!mapMarkers[targetMap]) mapMarkers[targetMap] = new Set();
      mapMarkers[targetMap].add(i);
      areaMatch++;
      continue;
    }

    // 3. Bounding box fallback — for markers with no zone/area mapping
    let found = false;
    for (const map of sortedMaps) {
      if (map.factor <= 2) continue; // skip overview maps
      if (mk.lng >= map.min.lng && mk.lng <= map.max.lng &&
          mk.lat >= map.min.lat && mk.lat <= map.max.lat) {
        if (!mapMarkers[map.id]) mapMarkers[map.id] = new Set();
        mapMarkers[map.id].add(i);
        bboxFallback++;
        found = true;
        break;
      }
    }
    if (!found) unassigned++;
  }

  console.log(`    Direct map match: ${directMatch}, Area→map: ${areaMatch}, BBox fallback: ${bboxFallback}, Unassigned: ${unassigned}`);

  // Pass 2: for region maps (low factor), aggregate markers from child maps.
  // parchmentMaps.xml defines parent→child hierarchy via parentMapId.
  // Use that to bubble markers from child maps up to their parent region.
  const REGION_MAX_FACTOR = 65;
  const OVERVIEW_MAX_FACTOR = 2;
  const regionMaps = maps.filter(m => m.factor > OVERVIEW_MAX_FACTOR && m.factor <= REGION_MAX_FACTOR);

  // Build parchment parent→children hierarchy
  const pmFp = path.join(LORE_DIR, 'parchmentMaps.xml');
  const pmChildren = {}; // parentMapId → [childMapId, ...]
  if (fs.existsSync(pmFp)) {
    const pmXml = fs.readFileSync(pmFp, 'utf8');
    const childRe = /<parchmentMap id="(\d+)"[^>]*parentMapId="(\d+)"/g;
    let cm;
    while ((cm = childRe.exec(pmXml)) !== null) {
      const childId = cm[1], parentId = cm[2];
      if (!pmChildren[parentId]) pmChildren[parentId] = [];
      pmChildren[parentId].push(childId);
    }
  }

  // Recursively collect all descendant map IDs
  function getDescendants(mapId) {
    const result = [];
    const children = pmChildren[mapId] || [];
    for (const child of children) {
      result.push(child);
      result.push(...getDescendants(child));
    }
    return result;
  }

  for (const region of regionMaps) {
    const descendants = getDescendants(region.id);
    if (descendants.length === 0) continue;

    const collected = mapMarkers[region.id] ? new Set(mapMarkers[region.id]) : new Set();
    for (const descId of descendants) {
      const childMarkers = mapMarkers[descId];
      if (!childMarkers) continue;
      for (const idx of childMarkers) {
        const mk = markers[idx];
        if (!mk) continue;
        // Only include markers that fall within region bounds
        if (mk.lng >= region.min.lng && mk.lng <= region.max.lng &&
            mk.lat >= region.min.lat && mk.lat <= region.max.lat) {
          collected.add(idx);
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

  // Prefer repo categories directory, fall back to Companion
  const repoCatDir = path.join(BASEMAPS_DIR, '..', 'categories');
  const companionCatDir = path.join(MAPS_DIR, 'categories');

  let copied = 0;
  for (const cat of categories) {
    const dest = path.join(IMG_OUT, `${cat.icon}.png`);
    const repoSrc = path.join(repoCatDir, `${cat.icon}.png`);
    const compSrc = path.join(companionCatDir, `${cat.icon}.png`);
    const src = fs.existsSync(repoSrc) ? repoSrc : compSrc;
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      copied++;
    }
  }
  console.log(`    Copied ${copied} category icons`);
}

// ─── Extract area icons & build map→icon lookup ─────────────────────────────
function extractAreaIcons(maps) {
  console.log('  🏔  Extracting area icons...');

  // Parse geoAreas.xml for area → iconId
  const geoPath = path.join(LORE_DIR, 'geoAreas.xml');
  if (!fs.existsSync(geoPath)) {
    console.warn('  ⚠ geoAreas.xml not found');
    return {};
  }
  const geoXml = fs.readFileSync(geoPath, 'utf8');
  const areaIconById = {};
  const areaMatches = [...geoXml.matchAll(/<area id="(\d+)"[^>]*iconId="(\d+)"/g)];
  for (const m of areaMatches) areaIconById[m[1]] = m[2];

  // Parse parchmentMaps.xml for map → first area's icon
  const pmPath = path.join(LORE_DIR, 'parchmentMaps.xml');
  if (!fs.existsSync(pmPath)) {
    console.warn('  ⚠ parchmentMaps.xml not found');
    return {};
  }
  const pmXml = fs.readFileSync(pmPath, 'utf8');
  const mapIconMap = {};
  const mapRe = /<parchmentMap id="(\d+)"[^>]*>([\s\S]*?)<\/parchmentMap>/g;
  let mm;
  while ((mm = mapRe.exec(pmXml)) !== null) {
    const mapId = mm[1];
    const body = mm[2];
    const areas = [...body.matchAll(/<area id="(\d+)"/g)];
    for (const a of areas) {
      if (areaIconById[a[1]]) {
        mapIconMap[mapId] = areaIconById[a[1]];
        break;
      }
    }
  }

  // Collect unique icon IDs
  const iconIds = new Set(Object.values(mapIconMap));
  console.log(`    ${Object.keys(mapIconMap).length} maps mapped to ${iconIds.size} unique area icons`);

  // Extract PNGs from areaIcons.zip
  const zipPath = path.join(LIB_DIR, 'areaIcons.zip');
  if (!fs.existsSync(zipPath)) {
    console.warn('  ⚠ areaIcons.zip not found');
    return mapIconMap;
  }

  ensureDir(AREA_ICONS_OUT);
  const tmpDir = path.join(__dirname, '..', '.tmp');
  ensureDir(tmpDir);

  const idFile = path.join(tmpDir, 'ids-areaIcons.txt');
  fs.writeFileSync(idFile, [...iconIds].join('\n'));

  const scriptFile = path.join(tmpDir, 'extract-areaIcons.ps1');
  const script = `
Add-Type -Assembly System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')
$ids = @{}
Get-Content '${idFile.replace(/'/g, "''")}' | ForEach-Object { $ids[$_.Trim() + '.png'] = $true }
$count = 0
foreach ($entry in $zip.Entries) {
  if ($entry.Length -eq 0) { continue }
  if (-not $ids.ContainsKey($entry.Name)) { continue }
  $dest = Join-Path '${AREA_ICONS_OUT.replace(/'/g, "''")}' $entry.Name
  if (-not (Test-Path $dest)) {
    $stream = $entry.Open()
    $file = [System.IO.File]::Create($dest)
    $stream.CopyTo($file)
    $file.Close()
    $stream.Close()
    $count++
  }
}
$zip.Dispose()
Write-Output $count
`;
  fs.writeFileSync(scriptFile, script);

  try {
    const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`, {
      encoding: 'utf8',
      timeout: 60000,
    }).trim();
    console.log(`    Extracted ${result} new area icon PNGs`);
  } catch (e) {
    console.error(`  ✗ Failed to extract area icons: ${e.message}`);
  }

  try { fs.unlinkSync(idFile); fs.unlinkSync(scriptFile); } catch (_) {}

  return mapIconMap;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  console.log('🗺  Extracting LotRO Companion map data...');
  console.log(`   Source: ${MAPS_DIR}`);
  ensureDir(OUT_DIR);

  const maps = extractMaps();
  const categories = extractCategories();
  const links = extractLinks();

  // Inject synthetic links for underground/interior regions not linked from overviews.
  // Moria is accessed via the Gates/Walls of Moria but has no direct link from Eriador.
  const ERIADOR_ID = '268437557';
  const MORIA_ID = '268442355';
  if (!links.some(l => l.from === ERIADOR_ID && l.to === MORIA_ID)) {
    links.push({ from: ERIADOR_ID, to: MORIA_ID, label: 'To: Moria', lng: 938, lat: -468 });
    console.log('  ➕ Injected synthetic link: Eriador → Moria');
  }

  const areaToMap = buildAreaToMapLookup();
  const { standard: markers, heavy: heavyMarkers } = extractMarkers();
  const mapMarkers = assignMarkersToMaps(maps, markers, areaToMap);
  const heavyMapMarkers = assignMarkersToMaps(maps, heavyMarkers, areaToMap);
  const mapById = Object.fromEntries(maps.map(m => [m.id, m]));
  const majorMapIds = getMajorMaps(maps, mapMarkers, links);

  // Copy category icon PNGs to site assets
  copyCategoryIcons(categories);

  // Extract area icons and build mapId → iconId lookup
  const mapIconMap = extractAreaIcons(maps);

  // Enrich maps with basemap image dimensions (w, h)
  enrichWithImageDimensions(maps);

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

  // Write map area icon lookup (mapId → iconId)
  fs.writeFileSync(
    path.join(OUT_DIR, 'maps-area-icons.json'),
    JSON.stringify(mapIconMap)
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

  // Helper: dedupe and write markers for a given assignment map.
  // maxPerMap: skip maps that exceed this marker count after dedup (0 = no limit).
  function writeMarkerFiles(outDir, assignment, markerArray, maxPerMap) {
    ensureDir(outDir);
    // Clean stale files
    for (const file of fs.readdirSync(outDir)) {
      if (file.endsWith('.json')) fs.unlinkSync(path.join(outDir, file));
    }
    let written = 0, deduped = 0, oob = 0, capped = 0;
    for (const [mapId, indices] of Object.entries(assignment)) {
      const mapDef = mapById[mapId];
      const raw = indices
        .map(i => markerArray[i])
        .filter(m => m && (!mapDef || (
          m.lng >= mapDef.min.lng && m.lng <= mapDef.max.lng &&
          m.lat >= mapDef.min.lat && m.lat <= mapDef.max.lat
        )));
      oob += indices.length - raw.length;
      const seen = new Set();
      const unique = [];
      for (const m of raw) {
        const normLabel = (m.l || '').trim().toLowerCase();
        const key = m.c + '|' + normLabel + '|' + m.lng.toFixed(2) + '|' + m.lat.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(m);
      }
      deduped += raw.length - unique.length;
      if (maxPerMap && unique.length > maxPerMap) {
        capped++;
        continue;
      }
      if (unique.length > 0) {
        fs.writeFileSync(path.join(outDir, `${mapId}.json`), JSON.stringify(unique));
        written++;
      }
    }
    return { written, deduped, oob, capped };
  }

  // Standard markers (loaded with the map)
  const stdResult = writeMarkerFiles(markerOutDir, mapMarkers, markers, 0);

  // Heavy-category markers (lazy-loaded on demand).
  // Cap at 5000 markers per map to keep file sizes practical for web delivery.
  // Maps exceeding the cap (large open-world zones with millions of monster/crop/critter
  // spawns) are omitted — these are only practically viewable in desktop LotRO Companion.
  const HEAVY_CAP = 5000;
  const heavyOutDir = path.join(OUT_DIR, 'map-markers-heavy');
  const heavyResult = writeMarkerFiles(heavyOutDir, heavyMapMarkers, heavyMarkers, HEAVY_CAP);

  // Write a manifest with summary info
  const manifest = {
    totalMaps: maps.length,
    totalMarkers: markers.length + heavyMarkers.length,
    totalCategories: categories.length,
    totalLinks: links.length,
    mapsWithMarkers: stdResult.written,
    mapsWithHeavyMarkers: heavyResult.written,
    heavyCategories: [...HEAVY_CATEGORIES],
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
  console.log(`   Maps: ${maps.length}, Markers: ${markers.length + heavyMarkers.length}, Links: ${links.length}`);
  console.log(`   Standard marker files: ${stdResult.written} (deduped: ${stdResult.deduped}, OOB: ${stdResult.oob})`);
  console.log(`   Heavy marker files: ${heavyResult.written} (deduped: ${heavyResult.deduped}, OOB: ${heavyResult.oob}, capped: ${heavyResult.capped})`);
  console.log(`   Major maps: ${majorMapIds.size}`);
  console.log(`   Core data size: ${totalSize.toFixed(0)} KB`);
}

main();
