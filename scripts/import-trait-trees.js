#!/usr/bin/env node
/**
 * Import trait tree data from lotro-data XML, merging cell dependencies
 * and updating trait metadata (maxRank, iconId, names) into existing
 * data/builds/*.json files.
 *
 * Usage:
 *   node scripts/import-trait-trees.js [path-to-lotro-data-lore]
 *
 * Default path: C:\Users\me\Downloads\lotro-data-master\lotro-data-master\lore
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LORE_DIR = process.argv[2] || 'C:\\Users\\me\\Downloads\\lotro-data-master\\lotro-data-master\\lore';
const BUILDS_DIR = path.join(__dirname, '..', 'data', 'builds');

/* ── XML helpers (minimal, no deps) ──────────────────────────────────── */

function attr(tag, name) {
  const re = new RegExp(name + '="([^"]*)"');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function allTags(xml, tagName) {
  // Match both self-closing and open tags (not nested same-name)
  const re = new RegExp('<' + tagName + '\\b[^>]*?(?:/>|>)', 'g');
  const results = [];
  let m;
  while ((m = re.exec(xml))) results.push(m[0]);
  return results;
}

/* ── Parse traitTrees.xml ────────────────────────────────────────────── */

// Map XML key names to our class file names
const KEY_TO_CLASS = {
  'Beorning': 'beorning',
  'Brawler': 'brawler',
  'Burglar': 'burglar',
  'Captain': 'captain',
  'Champion': 'champion',
  'Guardian': 'guardian',
  'Hunter': 'hunter',
  'Lore-master': 'lore-master',
  'Mariner': 'mariner',
  'Minstrel': 'minstrel',
  'Runekeeper': 'rune-keeper',
  'Warden': 'warden',
  // Armour-type trees (Light/Medium/Heavy) are shared and map to multiple classes
  // but the class-specific trees contain the actual data we need
};

function parseTraitTrees() {
  const xmlPath = path.join(LORE_DIR, 'traitTrees.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');

  // Split into per-traitTree blocks
  const treeBlocks = [];
  const treeRe = /<traitTree\b[^>]*>/g;
  let m;
  const positions = [];
  while ((m = treeRe.exec(xml))) {
    positions.push({ index: m.index, tag: m[0] });
  }
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = i + 1 < positions.length ? positions[i + 1].index : xml.indexOf('</traitTrees>');
    treeBlocks.push({
      tag: positions[i].tag,
      body: xml.substring(start, end)
    });
  }

  const classTrees = {}; // className -> { branches: [] }

  for (const block of treeBlocks) {
    const key = attr(block.tag, 'key');
    const treeId = attr(block.tag, 'id');
    const classKey = KEY_TO_CLASS[key];
    if (!classKey) continue; // Skip non-class trees (Light/Medium/Heavy, Class Spec, Helm's Deep)

    // Parse branches within this traitTree
    const branchRe = /<traitTreeBranch\b[^>]*>/g;
    const branchPositions = [];
    let bm;
    while ((bm = branchRe.exec(block.body))) {
      branchPositions.push({ index: bm.index, tag: bm[0] });
    }

    const branches = [];
    for (let i = 0; i < branchPositions.length; i++) {
      const bStart = branchPositions[i].index;
      const bEnd = i + 1 < branchPositions.length ? branchPositions[i + 1].index : block.body.length;
      const branchBody = block.body.substring(bStart, bEnd);
      const branchTag = branchPositions[i].tag;

      const branchName = attr(branchTag, 'name');
      const branchCode = attr(branchTag, 'code');
      const mainTraitId = attr(branchTag, 'mainTraitId');

      // Parse progression steps
      const progression = [];
      const steps = allTags(branchBody, 'step');
      for (const step of steps) {
        progression.push({
          points: parseInt(attr(step, 'nbPoints'), 10),
          traitId: attr(step, 'traitId'),
          name: attr(step, 'traitName')
        });
      }

      // Parse cells with dependencies
      const cells = [];
      // Need to handle cells that may have child cellDependency elements
      // Self-closing: <cell id="1_2" ... />
      // With children: <cell id="2_1" ...>\n<cellDependency .../>\n</cell>
      const cellBlockRe = /<cell\b([^>]*)\/>|<cell\b([^>]*)>([\s\S]*?)<\/cell>/g;
      let cm;
      while ((cm = cellBlockRe.exec(branchBody))) {
        // cm[1] = attrs from self-closing, cm[2]+cm[3] = attrs+body from open/close
        const cellAttrs = cm[1] || cm[2] || '';
        const cellBody = cm[3] || '';
        const cellId = attr(cellAttrs, 'id'); // e.g. "1_2"
        const traitId = attr(cellAttrs, 'traitId');
        const traitName = attr(cellAttrs, 'traitName');

        // Parse dependencies
        const deps = [];
        const depTags = allTags(cellBody, 'cellDependency');
        for (const dep of depTags) {
          deps.push({
            cellId: attr(dep, 'cellId'),
            rank: parseInt(attr(dep, 'rank'), 10)
          });
        }

        const [row, col] = cellId.split('_').map(Number);
        cells.push({
          cellId,
          row,
          col,
          traitId,
          traitName,
          deps: deps.length ? deps : undefined
        });
      }

      branches.push({
        name: branchName,
        code: branchCode,
        mainTraitId,
        progression,
        cells
      });
    }

    classTrees[classKey] = { treeId, branches };
  }

  return classTrees;
}

/* ── Parse traits.xml for maxRank and iconId ─────────────────────────── */

function parseTraitsIndex() {
  const xmlPath = path.join(LORE_DIR, 'traits.xml');
  const xml = fs.readFileSync(xmlPath, 'utf8');
  
  const index = {}; // traitId -> { tiers, iconId, name }
  const tags = allTags(xml, 'trait');
  for (const tag of tags) {
    const id = attr(tag, 'identifier');
    if (!id) continue;
    index[id] = {
      name: attr(tag, 'name'),
      tiers: parseInt(attr(tag, 'tiers') || '1', 10),
      iconId: attr(tag, 'iconId')
    };
  }
  console.log(`  Parsed ${Object.keys(index).length} traits from traits.xml`);
  return index;
}

/* ── Merge XML data into existing builds JSON ────────────────────────── */

function mergeIntoBuild(classKey, xmlTree, traitsIndex) {
  const buildPath = path.join(BUILDS_DIR, classKey + '.json');
  if (!fs.existsSync(buildPath)) {
    console.warn(`  ⚠ No build file for ${classKey}, skipping`);
    return null;
  }

  const buildData = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
  const branches = xmlTree.branches;

  // We expect 3 branches matching blue/red/yellow trees
  if (branches.length !== 3) {
    console.warn(`  ⚠ ${classKey}: expected 3 branches, got ${branches.length}`);
  }

  // Map existing trees by some heuristic (branch order matches blue/red/yellow in existing data)
  // However the XML branch order may differ. Let's match by branch name to existing tree name.
  const existingTrees = buildData.trees || [];
  
  for (const branch of branches) {
    // Find matching existing tree by name
    let existingTree = existingTrees.find(t => 
      t.name.toLowerCase() === branch.name.toLowerCase()
    );
    
    if (!existingTree) {
      console.warn(`  ⚠ ${classKey}: no existing tree matching branch "${branch.name}"`);
      continue;
    }

    // Update mainTraitId
    if (branch.mainTraitId) {
      existingTree.mainTraitId = branch.mainTraitId;
    }

    // Update progression with iconId from traits index
    if (branch.progression.length) {
      existingTree.progression = branch.progression.map(step => {
        const traitInfo = traitsIndex[step.traitId];
        return {
          points: step.points,
          traitId: step.traitId,
          name: step.name,
          iconId: (traitInfo && traitInfo.iconId) || undefined
        };
      });
    }

    // Build a map of existing traits by traitId for quick lookup
    const existingTraitMap = {};
    for (const t of existingTree.traits) {
      existingTraitMap[t.traitId] = t;
    }

    // The tree color letter (b/r/y)
    const colorLetter = existingTree.id.charAt(0); // 'blue' -> 'b', 'red' -> 'r', 'yellow' -> 'y'

    // Determine the column offset for this tree
    // XML uses absolute columns (1-4 for first tree, 5-8 for second, 9-12 for third)
    // Existing data normalizes cols per-tree relative to the tree's first col
    // We need to find the min col in the XML to compute the relative offset
    const xmlMinCol = Math.min(...branch.cells.map(c => c.col));

    // Build new traits array from XML cells
    const newTraits = [];
    for (const cell of branch.cells) {
      const relCol = cell.col - xmlMinCol + 1; // Normalize to 1-based within tree
      const traitId = colorLetter + '-' + cell.row + '-' + relCol;
      
      // Get metadata from traits.xml
      const traitInfo = traitsIndex[cell.traitId] || {};
      const existingTrait = existingTraitMap[cell.traitId];

      const trait = {
        id: traitId,
        name: cell.traitName || (traitInfo && traitInfo.name) || (existingTrait && existingTrait.name) || '?',
        row: cell.row,
        col: cell.col, // Keep absolute col — planner auto-detects range
        maxRank: (traitInfo && traitInfo.tiers) || (existingTrait && existingTrait.maxRank) || 1,
        traitId: cell.traitId,
        iconId: (traitInfo && traitInfo.iconId) || (existingTrait && existingTrait.iconId) || undefined
      };

      // Add dependencies
      if (cell.deps && cell.deps.length) {
        trait.deps = cell.deps.map(d => {
          // Convert cellId (e.g. "2_2") to our trait id format (e.g. "b-2-2")
          const [dRow, dCol] = d.cellId.split('_').map(Number);
          const dRelCol = dCol - xmlMinCol + 1;
          return {
            traitId: colorLetter + '-' + dRow + '-' + dRelCol,
            rank: d.rank
          };
        });
      }

      newTraits.push(trait);
    }

    existingTree.traits = newTraits;
  }

  return buildData;
}

/* ── Main ────────────────────────────────────────────────────────────── */

function main() {
  console.log('Importing trait tree data from:', LORE_DIR);
  console.log('Target builds dir:', BUILDS_DIR);
  console.log();

  // Check source files exist
  if (!fs.existsSync(path.join(LORE_DIR, 'traitTrees.xml'))) {
    console.error('ERROR: traitTrees.xml not found in', LORE_DIR);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(LORE_DIR, 'traits.xml'))) {
    console.error('ERROR: traits.xml not found in', LORE_DIR);
    process.exit(1);
  }

  console.log('Parsing traitTrees.xml...');
  const classTrees = parseTraitTrees();
  console.log(`  Found ${Object.keys(classTrees).length} class trees: ${Object.keys(classTrees).join(', ')}`);

  console.log('Parsing traits.xml...');
  const traitsIndex = parseTraitsIndex();

  console.log();
  let updated = 0;
  let added = 0;
  let depsAdded = 0;

  for (const [classKey, xmlTree] of Object.entries(classTrees)) {
    const buildPath = path.join(BUILDS_DIR, classKey + '.json');
    if (!fs.existsSync(buildPath)) {
      console.log(`  SKIP ${classKey} (no build file)`);
      continue;
    }

    const original = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
    const originalTraitCount = (original.trees || []).reduce((s, t) => s + t.traits.length, 0);
    const originalDeps = (original.trees || []).reduce((s, t) => 
      s + t.traits.reduce((s2, tr) => s2 + (tr.deps ? tr.deps.length : 0), 0), 0);

    const result = mergeIntoBuild(classKey, xmlTree, traitsIndex);
    if (!result) continue;

    const newTraitCount = (result.trees || []).reduce((s, t) => s + t.traits.length, 0);
    const newDeps = (result.trees || []).reduce((s, t) => 
      s + t.traits.reduce((s2, tr) => s2 + (tr.deps ? tr.deps.length : 0), 0), 0);

    fs.writeFileSync(buildPath, JSON.stringify(result, null, 2) + '\n');
    
    const traitDiff = newTraitCount - originalTraitCount;
    console.log(`  ✓ ${classKey}: ${newTraitCount} traits (${traitDiff >= 0 ? '+' : ''}${traitDiff}), ${newDeps} deps (was ${originalDeps})`);
    updated++;
    added += Math.max(0, traitDiff);
    depsAdded += newDeps;
  }

  console.log();
  console.log(`Done — ${updated} class files updated, ${depsAdded} total dependencies added.`);
}

main();
