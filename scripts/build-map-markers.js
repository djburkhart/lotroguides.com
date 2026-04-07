#!/usr/bin/env node
/**
 * build-map-markers.js
 *
 * Reads all LotRO Companion marker XML files and produces per-DID JSON files
 * under data/lore/markers/{did}.json for the mapdata DO function.
 *
 * Each marker in the XML has: id, label, category, did, parentZoneId, longitude, latitude
 *
 * Categories extracted:
 *   71  = Monster (mob spawns)         → used by mob overlay
 *   70  = NPC (quest bestowers, etc.)  → used by quest overlay enrichment
 *   73  = Item (quest objectives)      → used by quest/deed enrichment
 *   74  = Landmark (deed objectives)   → used by deed enrichment
 *
 * Output per DID: data/lore/markers/{did}.json
 *   { "n": "Wolf", "cat": 71, "pts": [ { "map": "268437678", "lng": -64.4, "lat": -34.4 }, ... ] }
 *
 * Also outputs a lightweight lookup index for the DO function:
 *   data/lore/markers-index.json  — { "<did>": { "n": "...", "cat": 71 } }
 *
 * Usage:
 *   node scripts/build-map-markers.js
 *   node scripts/build-map-markers.js --markers-dir "C:\path\to\markers"
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Default LotRO Companion marker directory
const DEFAULT_MARKERS_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'OneDrive', 'Documents', 'The Lord of the Rings Online',
  'LotRO Companion', 'app', 'data', 'lore', 'maps', 'markers'
);

// Categories we care about for map overlays
const WANTED_CATS = new Set([70, 71, 73, 74]);

// Max spawn points per map per DID (keeps files small for generic mobs like "Wolf")
const MAX_PTS_PER_MAP = 25;

function parseArgs() {
  const args = process.argv.slice(2);
  let markersDir = DEFAULT_MARKERS_DIR;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--markers-dir' && args[i + 1]) {
      markersDir = args[++i];
    }
  }
  return { markersDir };
}

/**
 * Parse a single marker XML file and extract relevant markers.
 * Uses regex instead of a full XML parser to avoid dependencies.
 */
function parseMarkerFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const markers = [];

  const re = /<marker\s+([^>]+)\/>/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const attrs = match[1];

    const catMatch = attrs.match(/category="(\d+)"/);
    if (!catMatch) continue;
    const cat = parseInt(catMatch[1], 10);
    if (!WANTED_CATS.has(cat)) continue;

    const didMatch = attrs.match(/did="(\d+)"/);
    const lngMatch = attrs.match(/longitude="([^"]+)"/);
    const latMatch = attrs.match(/latitude="([^"]+)"/);
    const zoneMatch = attrs.match(/parentZoneId="(\d+)"/);
    const labelMatch = attrs.match(/label="([^"]+)"/);

    if (!didMatch || !lngMatch || !latMatch || !zoneMatch) continue;

    markers.push({
      did: didMatch[1],
      cat: cat,
      label: labelMatch ? decodeXmlEntities(labelMatch[1]) : '',
      map: zoneMatch[1],
      lng: parseFloat(lngMatch[1]),
      lat: parseFloat(latMatch[1]),
    });
  }

  return markers;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function main() {
  const { markersDir } = parseArgs();

  if (!fs.existsSync(markersDir)) {
    console.error('Markers directory not found:', markersDir);
    console.error('Use --markers-dir to specify the path');
    process.exit(1);
  }

  const files = fs.readdirSync(markersDir).filter(f => f.endsWith('.xml'));
  console.log('Found', files.length, 'marker XML files in', markersDir);

  // Phase 1: Collect all markers into memory index
  // DID → { n, cat, byMap: { mapId → [{lng, lat}] } }
  const index = {};
  let totalMarkers = 0;

  for (let i = 0; i < files.length; i++) {
    if (i % 50 === 0) {
      process.stdout.write('\r  Reading: ' + (i + 1) + '/' + files.length);
    }
    const filePath = path.join(markersDir, files[i]);
    const markers = parseMarkerFile(filePath);
    totalMarkers += markers.length;

    for (const m of markers) {
      if (!index[m.did]) {
        index[m.did] = { n: m.label, cat: m.cat, byMap: {} };
      }
      if (!index[m.did].byMap[m.map]) {
        index[m.did].byMap[m.map] = [];
      }
      const mapPts = index[m.did].byMap[m.map];
      // Deduplicate within 0.01 units
      const isDupe = mapPts.some(p =>
        Math.abs(p.lng - m.lng) < 0.01 && Math.abs(p.lat - m.lat) < 0.01
      );
      if (!isDupe) {
        mapPts.push({ lng: round(m.lng), lat: round(m.lat) });
      }
    }
  }
  process.stdout.write('\n');
  console.log('Total raw markers scanned:', totalMarkers);
  console.log('Unique DIDs collected:', Object.keys(index).length);

  // Phase 2: Write per-DID files and a lightweight lookup index
  const outDir = path.join(__dirname, '..', 'data', 'lore', 'markers');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const lookupIndex = {};
  let filesWritten = 0;
  let totalPts = 0;
  const catCounts = {};

  const dids = Object.keys(index);
  for (let i = 0; i < dids.length; i++) {
    if (i % 5000 === 0) {
      process.stdout.write('\r  Writing: ' + (i + 1) + '/' + dids.length);
    }
    const did = dids[i];
    const entry = index[did];
    const cat = entry.cat;
    catCounts[cat] = (catCounts[cat] || 0) + 1;

    // Flatten byMap → pts array, capping per map
    const pts = [];
    for (const [mapId, mapPts] of Object.entries(entry.byMap)) {
      const capped = mapPts.slice(0, MAX_PTS_PER_MAP);
      for (const p of capped) {
        pts.push({ map: mapId, lng: p.lng, lat: p.lat });
        totalPts++;
      }
    }

    // Write individual DID file
    const didFile = { n: entry.n, cat: cat, pts: pts };
    fs.writeFileSync(path.join(outDir, did + '.json'), JSON.stringify(didFile));
    filesWritten++;

    // Add to lightweight index (no pts, just name + cat)
    lookupIndex[did] = { n: entry.n, cat: cat };
  }
  process.stdout.write('\n');

  // Write lookup index
  const indexPath = path.join(__dirname, '..', 'data', 'lore', 'markers-index.json');
  const indexJson = JSON.stringify(lookupIndex);
  fs.writeFileSync(indexPath, indexJson);

  // Stats
  const CAT_NAMES = { 70: 'NPC', 71: 'Monster', 73: 'Item', 74: 'Landmark' };
  console.log('\nResults:');
  console.log('  Per-DID files written:', filesWritten, 'to', outDir);
  console.log('  Total points (capped):', totalPts);
  console.log('  Lookup index:', indexPath, '(' + (indexJson.length / 1024).toFixed(0) + ' KB)');
  for (const [cat, count] of Object.entries(catCounts)) {
    console.log('    Category', cat, '(' + (CAT_NAMES[cat] || '?') + '):', count, 'DIDs');
  }
}

main();
