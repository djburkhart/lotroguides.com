#!/usr/bin/env node
/**
 * sync-maps.js
 * Pull the latest lotro-maps-db basemap images from GitHub and re-extract
 * Companion map data so our site stays in sync with both sources.
 *
 * Usage:
 *   node scripts/sync-maps.js [--repo <path>] [--skip-extract] [--skip-basemaps]
 *
 * Options:
 *   --repo <path>       Path to local lotro-maps-db clone
 *                        (default: ../lotro-maps-db relative to project root)
 *   --skip-extract      Skip re-extracting Companion map data (JSON/markers)
 *   --skip-basemaps     Skip basemap PNG → WebP conversion
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPO = path.resolve(PROJECT_ROOT, '..', 'lotro-maps-db');
const BASEMAPS_DIR = path.join(PROJECT_ROOT, 'img', 'maps', 'basemaps');
const MAPS_INDEX = path.join(PROJECT_ROOT, 'data', 'lore', 'maps-index.json');
const REPO_URL = 'https://github.com/LotroCompanion/lotro-maps-db.git';

// ─── Helpers ────────────────────────────────────────────────────────────────

function git(repoDir, ...args) {
  return execFileSync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    timeout: 120_000,
  }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  let repo = DEFAULT_REPO;
  let skipExtract = false;
  let skipBasemaps = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--repo' && args[i + 1]) {
      repo = path.resolve(args[++i]);
    } else if (args[i] === '--skip-extract') {
      skipExtract = true;
    } else if (args[i] === '--skip-basemaps') {
      skipBasemaps = true;
    }
  }

  return { repo, skipExtract, skipBasemaps };
}

// ─── Step 1: Ensure and update the lotro-maps-db clone ─────────────────────

function ensureRepo(repoDir) {
  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    console.log(`  Cloning ${REPO_URL} ...`);
    fs.mkdirSync(repoDir, { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', REPO_URL, repoDir], {
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 300_000,
    });
    return { cloned: true, updatedFiles: [] };
  }

  // Already cloned — fetch and pull
  const beforeHash = git(repoDir, 'rev-parse', 'HEAD');
  console.log(`  Current commit: ${beforeHash.slice(0, 10)}`);

  console.log('  Fetching latest...');
  git(repoDir, 'fetch', '--depth', '1', 'origin', 'master');

  const remoteHash = git(repoDir, 'rev-parse', 'origin/master');
  if (beforeHash === remoteHash) {
    console.log('  ✓ Already up-to-date');
    return { cloned: false, updatedFiles: [] };
  }

  // Diff before resetting to see what changed
  let updatedFiles = [];
  try {
    const diff = git(repoDir, 'diff', '--name-only', 'HEAD', 'origin/master');
    updatedFiles = diff ? diff.split('\n').filter(Boolean) : [];
  } catch { /* shallow clone may not support diff */ }

  git(repoDir, 'reset', '--hard', 'origin/master');
  const afterHash = git(repoDir, 'rev-parse', 'HEAD');
  console.log(`  Updated: ${beforeHash.slice(0, 10)} → ${afterHash.slice(0, 10)}`);

  return { cloned: false, updatedFiles };
}

// ─── Step 2: Audit basemaps — find missing / stale WebPs ───────────────────

function auditBasemaps(repoDir) {
  const mapsDir = path.join(repoDir, 'maps');
  if (!fs.existsSync(mapsDir)) {
    console.warn('  ⚠ No maps/ directory in repo');
    return { missing: [], stale: [], extra: [] };
  }

  const repoPngs = new Map(); // id → mtime
  for (const f of fs.readdirSync(mapsDir)) {
    if (!f.endsWith('.png')) continue;
    const id = f.replace('.png', '');
    repoPngs.set(id, fs.statSync(path.join(mapsDir, f)).mtimeMs);
  }

  const ourWebps = new Map(); // id → mtime
  if (fs.existsSync(BASEMAPS_DIR)) {
    for (const f of fs.readdirSync(BASEMAPS_DIR)) {
      if (!f.endsWith('.webp')) continue;
      const id = f.replace('.webp', '');
      ourWebps.set(id, fs.statSync(path.join(BASEMAPS_DIR, f)).mtimeMs);
    }
  }

  const missing = []; // in repo but not in our basemaps
  const stale = [];   // in both but our WebP is older than the PNG
  const extra = [];   // in our basemaps but not in repo

  for (const [id, pngMtime] of repoPngs) {
    if (!ourWebps.has(id)) {
      missing.push(id);
    } else if (ourWebps.get(id) < pngMtime) {
      stale.push(id);
    }
  }

  for (const id of ourWebps.keys()) {
    if (!repoPngs.has(id)) {
      extra.push(id);
    }
  }

  return { missing, stale, extra };
}

// ─── Step 3: Verify map data integrity ─────────────────────────────────────

function verifyMapData(repoDir) {
  const issues = [];

  // Check maps-index.json references have corresponding basemap WebPs
  if (fs.existsSync(MAPS_INDEX)) {
    const index = JSON.parse(fs.readFileSync(MAPS_INDEX, 'utf8'));
    const webpSet = new Set(
      fs.existsSync(BASEMAPS_DIR)
        ? fs.readdirSync(BASEMAPS_DIR).filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''))
        : []
    );

    let missingBasemaps = 0;
    for (const map of index) {
      const mapId = String(map.id);
      if (!webpSet.has(mapId)) {
        missingBasemaps++;
        if (missingBasemaps <= 5) {
          issues.push(`Map "${map.name}" (${map.id}) has no basemap WebP`);
        }
      }
    }
    if (missingBasemaps > 5) {
      issues.push(`  ...and ${missingBasemaps - 5} more missing basemaps`);
    }
  }

  // Check links.xml matches between repo and Companion
  const repoLinksPath = path.join(repoDir, 'links.xml');
  const companionRoot = process.env.LOTRO_COMPANION_PATH ||
    'C:/Users/me/OneDrive/Documents/The Lord of the Rings Online/LotRO Companion/app';
  const companionLinksPath = path.join(companionRoot, 'data', 'lore', 'maps', 'links.xml');

  if (fs.existsSync(repoLinksPath) && fs.existsSync(companionLinksPath)) {
    const repoLinks = fs.readFileSync(repoLinksPath, 'utf8');
    const companionLinks = fs.readFileSync(companionLinksPath, 'utf8');
    if (repoLinks !== companionLinks) {
      issues.push('links.xml differs between repo and Companion — Companion may need updating');
    }
  }

  return issues;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { repo, skipExtract, skipBasemaps } = parseArgs();

  console.log('🗺  Map Sync');
  console.log(`   Repo: ${repo}`);
  console.log('');

  // 1. Pull latest repo
  console.log('Step 1: Update lotro-maps-db');
  const { cloned, updatedFiles } = ensureRepo(repo);
  if (updatedFiles.length > 0) {
    const mapFiles = updatedFiles.filter(f => f.startsWith('maps/') && f.endsWith('.png'));
    console.log(`  Changed files: ${updatedFiles.length} (${mapFiles.length} basemaps)`);
  }
  console.log('');

  // 2. Audit basemaps
  console.log('Step 2: Audit basemaps');
  const { missing, stale, extra } = auditBasemaps(repo);
  console.log(`  Repo PNGs: ${fs.readdirSync(path.join(repo, 'maps')).filter(f => f.endsWith('.png')).length}`);
  console.log(`  Our WebPs: ${fs.existsSync(BASEMAPS_DIR) ? fs.readdirSync(BASEMAPS_DIR).filter(f => f.endsWith('.webp')).length : 0}`);
  console.log(`  Missing: ${missing.length}, Stale: ${stale.length}, Extra: ${extra.length}`);

  if (extra.length > 0) {
    console.log(`  Extra WebPs (not in repo): ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? '...' : ''}`);
  }
  console.log('');

  // 3. Re-extract Companion map data
  if (!skipExtract) {
    console.log('Step 3: Extract Companion map data');
    try {
      execFileSync('node', [path.join(__dirname, 'extract-maps.js')], {
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 120_000,
        cwd: PROJECT_ROOT,
      });
    } catch (err) {
      console.error('  ✗ Map extraction failed:', err.message);
    }
    console.log('');
  } else {
    console.log('Step 3: Skipped (--skip-extract)');
    console.log('');
  }

  // 4. Convert basemaps
  if (!skipBasemaps && (missing.length > 0 || stale.length > 0 || cloned)) {
    console.log('Step 4: Convert basemaps (PNG → WebP)');
    try {
      execFileSync('node', [
        path.join(__dirname, 'convert-basemaps.js'),
        '--source', path.join(repo, 'maps'),
      ], {
        encoding: 'utf8',
        stdio: 'inherit',
        timeout: 600_000,
        cwd: PROJECT_ROOT,
      });
    } catch (err) {
      console.error('  ✗ Basemap conversion failed:', err.message);
    }
    console.log('');
  } else if (skipBasemaps) {
    console.log('Step 4: Skipped (--skip-basemaps)');
    console.log('');
  } else {
    console.log('Step 4: Skipped (basemaps up-to-date)');
    console.log('');
  }

  // 5. Remove extra WebPs that no longer exist in the repo
  if (extra.length > 0) {
    console.log('Step 5: Clean up orphaned basemaps');
    for (const id of extra) {
      const fp = path.join(BASEMAPS_DIR, `${id}.webp`);
      fs.unlinkSync(fp);
    }
    console.log(`  Removed ${extra.length} orphaned WebP files`);
    console.log('');
  }

  // 6. Final verification
  console.log('Step 6: Verify map data integrity');
  const issues = verifyMapData(repo);
  if (issues.length === 0) {
    console.log('  ✓ All map data verified');
  } else {
    for (const issue of issues) {
      console.log(`  ⚠ ${issue}`);
    }
  }

  console.log('');
  console.log('✅ Map sync complete');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
