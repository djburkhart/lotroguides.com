#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   Download CDN Data — Fetch source data files from CDN before building.
   These files are too large for git and are maintained via sync:cdn.

   Usage:  node scripts/download-cdn-data.js
   Required env var: DO_CDN_URL
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

const CDN_URL = (process.env.DO_CDN_URL || '').replace(/\/$/, '');

// Files to download: CDN key → local path (relative to project root)
const FILES = [
  'data/instances-db.json',
  'data/instance-loot.json',
  // Class build definitions (Skills page and trait-planner shortcode)
  'data/builds/beorning.json',
  'data/builds/brawler.json',
  'data/builds/burglar.json',
  'data/builds/captain.json',
  'data/builds/champion.json',
  'data/builds/guardian.json',
  'data/builds/hunter.json',
  'data/builds/lore-master.json',
  'data/builds/mariner.json',
  'data/builds/minstrel.json',
  'data/builds/rune-keeper.json',
  'data/builds/warden.json',
  // Collections (mounts & pets)
  'data/collections-db.json',
  'data/collections-items-db.json',
  // Searchable databases. Item shards are added from the manifest below.
  'data/items-db-manifest.json',
  'data/mobs-db.json',
  'data/mob-overlay.json',
  'data/sets-db.json',
  'data/virtues-db.json',
  'data/deeds-db.json',
  'data/deed-overlay-index.json',
  'data/deed-index.json',
  'data/icon-map.json',
  'data/quest-overlay-index.json',
  'data/quests-db.json',
  'data/instances-db-listing.json',
  'data/titles-db.json',
  'data/factions-db.json',
  'data/recipes-db.json',
  'data/quest-poi.json',
  'data/quest-overlay.json',
  'data/quest-index.json',
  'data/deed-overlay.json',
  'data/map-quests.json',
  'data/instance-videos.json',
  'data/npcs.json',
];

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Overlay CDN-edited articles onto local git content.
 *
 * The editor uploads markdown files to CDN at content/{category}/{slug}.md.
 * sync-cdn never touches content/, so any .md at that CDN path was explicitly
 * uploaded via the editor and should take priority over the git version.
 *
 * Flow:
 *   1. Fetch editor-manifest.json from CDN to get the list of known articles
 *   2. For each article, try to fetch content/{category}/{slug}.md from CDN
 *   3. If found (editor-modified), write it locally so the build uses it
 *   4. If 404 (never editor-uploaded), skip — the git version is correct
 */
async function overlayCdnEditorContent(root) {
  console.log('\nChecking CDN for editor-modified articles…');

  let manifest;
  try {
    const buf = await download(`${CDN_URL}/data/editor-manifest.json`);
    manifest = JSON.parse(buf.toString('utf8'));
    if (!Array.isArray(manifest)) manifest = [];
  } catch (err) {
    console.log('  ⚠ Could not fetch editor manifest from CDN — skipping overlay.');
    return;
  }

  if (!manifest.length) {
    console.log('  (empty manifest)');
    return;
  }

  let overlaid = 0;
  let skipped = 0;

  for (const entry of manifest) {
    const { category, slug } = entry;
    if (!category || !slug) continue;

    // Only allow known content subdirectories
    if (category !== 'guides' && category !== 'news') continue;

    const cdnKey = `content/${category}/${slug}.md`;
    const localPath = path.join(root, cdnKey);

    try {
      const buf = await download(`${CDN_URL}/${cdnKey}`);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buf);
      console.log(`  ↓ ${cdnKey} (CDN → local)`);
      overlaid++;
    } catch (err) {
      // 404 = article was never uploaded via editor; use git version
      skipped++;
    }
  }

  console.log(`  Editor overlay: ${overlaid} articles from CDN, ${skipped} using git version.`);
}

async function main() {
  if (!CDN_URL) {
    console.log('⚠ DO_CDN_URL not set — skipping CDN data download (using local files).');
    return;
  }

  const root = path.join(__dirname, '..');
  console.log(`Downloading source data from ${CDN_URL} …`);

  let downloaded = 0;
  let skipped = 0;

  async function downloadFile(file) {
    const localPath = path.join(root, file);
    const url = `${CDN_URL}/${file}`;

    // Skip if file already exists locally (dev machine)
    if (fs.existsSync(localPath)) {
      console.log(`  ✓ ${file} (exists locally)`);
      skipped++;
      return;
    }

    try {
      process.stdout.write(`  ↓ ${file} … `);
      const buf = await download(url);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, buf);
      console.log(`ok (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
      downloaded++;
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      console.error(`  Build will continue without ${file}.`);
    }
  }

  for (const file of FILES) {
    await downloadFile(file);
  }

  const manifestPath = path.join(root, 'data', 'items-db-manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const totalChunks = Number(manifest.totalChunks) || 0;
      for (let i = 0; i < totalChunks; i++) {
        await downloadFile(`data/items-db-${i}.json`);
      }
    } catch (err) {
      console.error(`  ⚠ Could not read the items manifest: ${err.message}`);
    }
  }

  console.log(`Done: ${downloaded} downloaded, ${skipped} already local.`);

  // ── Overlay CDN-edited articles onto git content ────────────────────────
  // Articles edited via the editor are uploaded to CDN at content/{category}/{slug}.md.
  // Since sync-cdn doesn't sync content/, any .md at that CDN path was editor-uploaded
  // and should take priority over the git version during builds.
  await overlayCdnEditorContent(root);

  // ── Download and extract data/lore/ bundle ──────────────────────────────
  const loreDir = path.join(root, 'data', 'lore');
  if (fs.existsSync(path.join(loreDir, 'item-index.json'))) {
    console.log('  ✓ data/lore/ (exists locally)');
  } else {
    const bundleUrl = `${CDN_URL}/data-lore-bundle.json.gz`;
    try {
      process.stdout.write('  ↓ data-lore-bundle.json.gz … ');
      const gzBuf = await download(bundleUrl);
      const json = zlib.gunzipSync(gzBuf).toString('utf8');
      const bundle = JSON.parse(json);
      const keys = Object.keys(bundle);
      console.log(`ok (${keys.length} files)`);

      for (const key of keys) {
        const dest = path.join(root, 'data', key);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, bundle[key], 'utf8');
      }
      console.log(`  ✓ Extracted ${keys.length} lore files to data/lore/`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      console.error('  Build will continue without lore data — item/mob/quest pages may be empty.');
    }
  }
}

main().catch(err => {
  console.error('CDN download failed:', err.message);
  // Non-fatal — build can proceed without these files (instances will be skipped)
  process.exit(0);
});
