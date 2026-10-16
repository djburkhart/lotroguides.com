#!/usr/bin/env node
/**
 * download-lotro-data.js
 *
 * Clones (or updates) the LotroCompanion game data repos from GitHub so that
 * the other import/extract scripts can run without a local LotRO Companion
 * app installation.
 *
 * Repos downloaded:
 *   LotroCompanion/lotro-data  → .tmp/lotro-data/
 *
 * Usage:  node scripts/download-lotro-data.js
 * Env:    LOTRO_DATA_PATH   override destination for lotro-data clone
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const REPOS = [
  {
    name: 'lotro-data',
    url:  'https://github.com/LotroCompanion/lotro-data.git',
    dest: process.env.LOTRO_DATA_PATH ||
          path.join(PROJECT_ROOT, '.tmp', 'lotro-data'),
  },
];

// ─── Git helpers ────────────────────────────────────────────────────────────

function git(repoDir, ...args) {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 300_000,
  }).trim();
}

function ensureRepo({ name, url, dest }) {
  if (!fs.existsSync(path.join(dest, '.git'))) {
    console.log(`  Cloning ${url} → ${dest} …`);
    fs.mkdirSync(dest, { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', url, dest], {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 300_000,
    });
    console.log(`  ✓ Cloned ${name}`);
    return { updated: true };
  }

  // Already cloned — fetch latest
  const beforeHash = git(dest, 'rev-parse', 'HEAD');
  process.stdout.write(`  Fetching ${name} (current: ${beforeHash.slice(0, 10)}) … `);

  git(dest, 'fetch', '--depth', '1', 'origin', 'master');
  const remoteHash = git(dest, 'rev-parse', 'origin/master');

  if (beforeHash === remoteHash) {
    console.log('up-to-date ✓');
    return { updated: false };
  }

  git(dest, 'reset', '--hard', 'origin/master');
  const afterHash = git(dest, 'rev-parse', 'HEAD');
  console.log(`updated → ${afterHash.slice(0, 10)} ✓`);
  return { updated: true };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('📥 Downloading LotroCompanion game data from GitHub…\n');

  for (const repo of REPOS) {
    try {
      ensureRepo(repo);
    } catch (err) {
      console.error(`\n  ✗ Failed to clone/update ${repo.name}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\nDone. Set LOTRO_DATA_PATH to override the default .tmp/lotro-data location.');
}

main();
