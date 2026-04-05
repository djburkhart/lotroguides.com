#!/usr/bin/env node
/**
 * Deploy DO Functions — each package to its own namespace.
 *
 * Usage:
 *   node scripts/deploy-functions.js            # deploy all
 *   node scripts/deploy-functions.js cdn         # deploy only cdn
 *   node scripts/deploy-functions.js cdn quests  # deploy cdn and quests
 */

'use strict';

require('dotenv').config();
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PACKAGES_DIR = path.join(__dirname, '..', 'packages');

// Map each package name → its DO Functions namespace ID
const NAMESPACES = {
  cdn:       'fn-ee2ee76a-f0db-416f-852b-f334142df8da',
  cusdis:    'fn-98a5d3ed-57bd-49c4-bb7d-ab0f53f67ef5',
  quests:    'fn-3d455932-ad0c-4e6b-b531-278828780133',
  recaptcha: 'fn-7b5a7150-3649-47f5-b0ce-6752484ced31',
  // github shares the cdn namespace (add its own if created)
  github:    'fn-ee2ee76a-f0db-416f-852b-f334142df8da',
  discord:   'fn-41039bc6-30e5-4581-a23a-f14fe5c2f748',
  deeds:     'fn-15b56daf-ff46-43ce-a2ed-b3ac87f50a7f',
  builds:    'fn-db4a7682-0b2c-40c0-b008-b9cc91c16a92',
};

// Full project.yml entry for each package
const PACKAGE_DEFS = {
  cdn: {
    name: 'cdn',
    functions: [{ name: 'upload', runtime: 'nodejs:22', web: true }],
  },
  cusdis: {
    name: 'cusdis',
    functions: [{ name: 'webhook', runtime: 'nodejs:22', web: true }],
  },
  quests: {
    name: 'quests',
    functions: [{ name: 'lookup', runtime: 'nodejs:22', web: true }],
    environment: {
      DO_CDN_URL: 'https://lotroguides.atl1.cdn.digitaloceanspaces.com',
    },
  },
  recaptcha: {
    name: 'recaptcha',
    functions: [{ name: 'verify', runtime: 'nodejs:22', web: true }],
  },
  github: {
    name: 'github',
    functions: [{ name: 'auth', runtime: 'nodejs:22', web: true }],
  },
  discord: {
    name: 'discord',
    functions: [{ name: 'interact', runtime: 'nodejs:22', web: true }],
    environment: {
      DO_CDN_URL: 'https://lotroguides.atl1.cdn.digitaloceanspaces.com',
      SITE_API_URL: 'https://lotroguides.com',
    },
  },
  deeds: {
    name: 'deeds',
    functions: [{ name: 'lookup', runtime: 'nodejs:22', web: true }],
    environment: {
      DO_CDN_URL: 'https://lotroguides.atl1.cdn.digitaloceanspaces.com',
    },
  },
  builds: {
    name: 'builds',
    functions: [{ name: 'save', runtime: 'nodejs:22', web: true }],
    environment: {
      DO_SPACES_KEY: process.env.DO_SPACES_KEY || '',
      DO_SPACES_SECRET: process.env.DO_SPACES_SECRET || '',
      DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET || '',
      DO_SPACES_REGION: process.env.DO_SPACES_REGION || 'nyc3',
    },
  },
};

function run(cmd) {
  console.log('  $ ' + cmd);
  execSync(cmd, { stdio: 'inherit' });
}

function buildProjectYml(pkgName) {
  const def = PACKAGE_DEFS[pkgName];
  if (!def) throw new Error('Unknown package: ' + pkgName);

  const lines = ['packages:'];
  lines.push('  - name: ' + def.name);
  if (def.environment) {
    lines.push('    environment:');
    for (const [k, v] of Object.entries(def.environment)) {
      lines.push('      ' + k + ': ' + JSON.stringify(v));
    }
  }
  lines.push('    functions:');
  for (const fn of def.functions) {
    lines.push('      - name: ' + fn.name);
    lines.push('        runtime: ' + fn.runtime);
    if (fn.web) lines.push('        web: true');
  }
  return lines.join('\n') + '\n';
}

/**
 * Build a temporary project directory with the DO Functions expected structure:
 *   tmp-dir/
 *     project.yml
 *     packages/
 *       <pkgName>/
 *         <fnName>/
 *           index.js
 *           package.json (if exists)
 *           ...
 */
function buildTempProject(pkgName) {
  const def = PACKAGE_DEFS[pkgName];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-fn-'));
  fs.writeFileSync(path.join(tmpDir, 'project.yml'), buildProjectYml(pkgName));

  for (const fn of def.functions) {
    const srcDir = path.join(PACKAGES_DIR, def.name, fn.name);
    const dstDir = path.join(tmpDir, 'packages', def.name, fn.name);
    fs.mkdirSync(dstDir, { recursive: true });

    // Copy all files from the source function directory
    for (const file of fs.readdirSync(srcDir)) {
      const srcFile = path.join(srcDir, file);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(dstDir, file));
      }
    }
  }

  return tmpDir;
}

function deploy(pkgName) {
  const ns = NAMESPACES[pkgName];
  if (!ns) {
    console.error('  \u2717 No namespace configured for "' + pkgName + '", skipping');
    return false;
  }

  console.log('\n\u2500\u2500\u2500 Deploying ' + pkgName + ' \u2192 ' + ns + ' \u2500\u2500\u2500');

  var tmpDir;
  try {
    // Build temp project with correct structure
    tmpDir = buildTempProject(pkgName);
    console.log('  Project staged at ' + tmpDir);

    // Connect to the namespace
    run('doctl serverless connect ' + ns);

    // Deploy
    run('doctl serverless deploy "' + tmpDir + '"');

    console.log('  \u2713 ' + pkgName + ' deployed');
    return true;
  } catch (err) {
    console.error('  \u2717 ' + pkgName + ' failed: ' + err.message);
    return false;
  } finally {
    // Clean up temp directory
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const targets = args.length > 0
  ? args.filter(function (a) {
      if (!PACKAGE_DEFS[a]) { console.error('Unknown package: ' + a); return false; }
      return true;
    })
  : Object.keys(NAMESPACES);

if (targets.length === 0) {
  console.error('No valid packages to deploy.');
  process.exit(1);
}

console.log('Deploying: ' + targets.join(', '));

let ok = 0;
let fail = 0;
for (const pkg of targets) {
  if (deploy(pkg)) ok++; else fail++;
}

console.log('\n' + ok + ' deployed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
