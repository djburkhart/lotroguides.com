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
  // Class build definitions (used at build time by Skills page + editor trait planner)
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

async function main() {
  if (!CDN_URL) {
    console.log('⚠ DO_CDN_URL not set — skipping CDN data download (using local files).');
    return;
  }

  const root = path.join(__dirname, '..');
  console.log(`Downloading source data from ${CDN_URL} …`);

  let downloaded = 0;
  let skipped = 0;

  for (const file of FILES) {
    const localPath = path.join(root, file);
    const url = `${CDN_URL}/${file}`;

    // Skip if file already exists locally (dev machine)
    if (fs.existsSync(localPath)) {
      console.log(`  ✓ ${file} (exists locally)`);
      skipped++;
      continue;
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
      console.error(`  Build will continue without ${file} — instance pages may be skipped.`);
    }
  }

  console.log(`Done: ${downloaded} downloaded, ${skipped} already local.`);

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
