#!/usr/bin/env node
/**
 * Convert basemap PNG images from lotro-maps-db to optimized WebP.
 *
 * Usage:
 *   node scripts/convert-basemaps.js [--source <path>] [--all]
 *
 * Options:
 *   --source <path>  Path to lotro-maps-db/maps directory
 *                    (default: ../lotro-maps-db/maps relative to project root)
 *   --all            Convert all maps, not just those with markers
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.resolve(PROJECT_ROOT, '..', 'lotro-maps-db', 'maps');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'img', 'maps', 'basemaps');
const MARKERS_DIR = path.join(PROJECT_ROOT, 'data', 'lore', 'map-markers');
const INDEX_FILE = path.join(PROJECT_ROOT, 'data', 'lore', 'maps-index.json');

// WebP quality settings
const WEBP_QUALITY = 75;
const CONCURRENCY = 8;

function parseArgs() {
  const args = process.argv.slice(2);
  let source = DEFAULT_SOURCE;
  let all = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) {
      source = path.resolve(args[++i]);
    } else if (args[i] === '--all') {
      all = true;
    }
  }

  return { source, all };
}

async function main() {
  const { source, all } = parseArgs();

  // Validate source
  if (!fs.existsSync(source)) {
    console.error(`Source directory not found: ${source}`);
    console.error('Clone the repo first: git clone --depth 1 https://github.com/LotroCompanion/lotro-maps-db.git');
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Get all map IDs from the index (every map we know about)
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const indexIds = new Set(index.map(m => String(m.id)));

  // Get all source PNGs available
  const allSourcePngs = fs.readdirSync(source)
    .filter(f => f.endsWith('.png'))
    .map(f => f.replace('.png', ''));
  const sourceSet = new Set(allSourcePngs);

  // Convert all maps from our index that have a source PNG
  // (includes region overviews, dungeons, etc. even without markers)
  const toConvert = all
    ? allSourcePngs
    : allSourcePngs.filter(id => indexIds.has(id));

  console.log(`Source: ${source}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Maps to convert: ${toConvert.length}`);
  console.log(`WebP quality: ${WEBP_QUALITY}`);
  console.log('');

  let converted = 0;
  let skipped = 0;
  let failed = 0;
  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  // Process in batches
  for (let i = 0; i < toConvert.length; i += CONCURRENCY) {
    const batch = toConvert.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (id) => {
      const inputPath = path.join(source, id + '.png');
      const outputPath = path.join(OUTPUT_DIR, id + '.webp');

      // Skip if already converted and newer than source
      if (fs.existsSync(outputPath)) {
        const srcStat = fs.statSync(inputPath);
        const outStat = fs.statSync(outputPath);
        if (outStat.mtimeMs > srcStat.mtimeMs) {
          skipped++;
          return;
        }
      }

      try {
        const inputSize = fs.statSync(inputPath).size;
        await sharp(inputPath)
          .webp({ quality: WEBP_QUALITY })
          .toFile(outputPath);

        const outputSize = fs.statSync(outputPath).size;
        totalInputBytes += inputSize;
        totalOutputBytes += outputSize;
        converted++;
      } catch (err) {
        console.error(`  FAIL: ${id}.png — ${err.message}`);
        failed++;
      }
    });
    await Promise.all(promises);

    // Progress
    const done = Math.min(i + CONCURRENCY, toConvert.length);
    process.stdout.write(`\r  Progress: ${done}/${toConvert.length} (${converted} converted, ${skipped} skipped)`);
  }

  console.log('');
  console.log('');
  console.log('=== Conversion Complete ===');
  console.log(`  Converted: ${converted}`);
  console.log(`  Skipped (up-to-date): ${skipped}`);
  console.log(`  Failed: ${failed}`);

  if (converted > 0) {
    const inputMB = (totalInputBytes / (1024 * 1024)).toFixed(1);
    const outputMB = (totalOutputBytes / (1024 * 1024)).toFixed(1);
    const ratio = ((totalOutputBytes / totalInputBytes) * 100).toFixed(1);
    console.log(`  Input size: ${inputMB} MB`);
    console.log(`  Output size: ${outputMB} MB`);
    console.log(`  Compression ratio: ${ratio}%`);
  }

  // Count total output directory size
  const outputFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.webp'));
  const totalSize = outputFiles.reduce((sum, f) => sum + fs.statSync(path.join(OUTPUT_DIR, f)).size, 0);
  console.log(`  Total basemaps directory: ${(totalSize / (1024 * 1024)).toFixed(1)} MB (${outputFiles.length} files)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
