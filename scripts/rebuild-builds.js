/**
 * Rebuild all class build JSON files from LotRO Companion data.
 * 
 * Reads traitTrees.xml and traits.xml from the companion app data,
 * cross-references them, and generates correct build files with:
 * - Correct Blue/Red/Yellow tree assignments based on column positions
 * - Correct trait names, IDs, icon IDs, and max ranks from companion data
 * - Proper cell positions preserving the companion's grid layout
 * - Milestone/progression data for each tree
 */

const fs = require('fs');
const path = require('path');

// Paths
const COMPANION_DATA = 'C:\\Users\\me\\OneDrive\\Documents\\The Lord of the Rings Online\\LotRO Companion\\app\\data\\lore';
const BUILDS_DIR = path.join(__dirname, '..', 'data', 'builds');

// Simple XML parser for the specific structures we need
function parseXmlAttr(tag) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(tag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

// Parse traitTrees.xml
function parseTraitTrees(xmlStr) {
  const trees = {};
  // Match each traitTree element
  const treeRe = /<traitTree\s+([^>]+)>([\s\S]*?)<\/traitTree>/g;
  let treeMatch;
  while ((treeMatch = treeRe.exec(xmlStr)) !== null) {
    const treeAttrs = parseXmlAttr(treeMatch[1]);
    const treeContent = treeMatch[2];
    const branches = [];
    
    // Match each traitTreeBranch
    const branchRe = /<traitTreeBranch\s+([^>]+)>([\s\S]*?)<\/traitTreeBranch>/g;
    let branchMatch;
    while ((branchMatch = branchRe.exec(treeContent)) !== null) {
      const branchAttrs = parseXmlAttr(branchMatch[1]);
      const branchContent = branchMatch[2];
      
      // Parse progression steps
      const progression = [];
      const stepRe = /<step\s+([\s\S]*?)\/>/g;
      let stepMatch;
      while ((stepMatch = stepRe.exec(branchContent)) !== null) {
        const stepAttrs = parseXmlAttr(stepMatch[1]);
        progression.push({
          points: parseInt(stepAttrs.nbPoints),
          traitId: stepAttrs.traitId,
          name: stepAttrs.traitName
        });
      }
      
      // Parse cells
      const cells = [];
      // Match cells with or without dependencies
      const cellRe = /<cell\s+([\s\S]*?)\s*\/?>(?:<cellDependency\s+([\s\S]*?)\/>\s*<\/cell>)?/g;
      let cellMatch;
      while ((cellMatch = cellRe.exec(branchContent)) !== null) {
        const cellAttrs = parseXmlAttr(cellMatch[1]);
        const [row, col] = cellAttrs.id.split('_').map(Number);
        const cell = {
          row,
          col,
          traitId: cellAttrs.traitId,
          traitName: cellAttrs.traitName
        };
        if (cellMatch[2]) {
          const depAttrs = parseXmlAttr(cellMatch[2]);
          cell.dependency = {
            cellId: depAttrs.cellId,
            rank: parseInt(depAttrs.rank)
          };
        }
        cells.push(cell);
      }
      
      branches.push({
        code: parseInt(branchAttrs.code),
        name: branchAttrs.name,
        progression,
        cells
      });
    }
    
    trees[treeAttrs.key] = {
      id: treeAttrs.id,
      code: parseInt(treeAttrs.code),
      key: treeAttrs.key,
      branches
    };
  }
  return trees;
}

// Parse traits.xml for metadata
function parseTraits(xmlStr) {
  const traits = {};
  const traitRe = /<trait\s+([^>]*?)(?:\/>|>[\s\S]*?<\/trait>)/g;
  let m;
  while ((m = traitRe.exec(xmlStr)) !== null) {
    const attrs = parseXmlAttr(m[1]);
    if (attrs.identifier) {
      traits[attrs.identifier] = {
        name: attrs.name,
        iconId: attrs.iconId,
        tiers: parseInt(attrs.tiers) || 1
      };
    }
  }
  return traits;
}

// Class mapping: companion key -> our slug
const CLASS_MAP = {
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
  'Warden': 'warden'
};

// Role descriptions for each branch (maintained from existing data or assigned)
const BRANCH_ROLES = {
  // Beorning
  'The Hide': 'Tank',
  'The Claw': 'DPS',
  'The Roar': 'Heal/Support',
  // Brawler
  'The Fulcrum': 'Support',
  'The Maelstrom': 'DPS',
  'The Fundament': 'Tank',
  // Burglar
  'The Gambler': 'Support/Debuff',
  'The Quiet Knife': 'DPS',
  'The Mischief-maker': 'Debuff/CC',
  // Captain
  'Hands of Healing': 'Heal/Support',
  'Lead the Charge': 'DPS',
  'Leader of Men': 'Tank/Buffer',
  // Champion
  'The Martial Champion': 'Single-target DPS',
  'The Berserker': 'AoE DPS',
  'The Deadly Storm': 'AoE DPS',
  // Guardian
  'The Defender of the Free': 'Tank',
  'The Keen Blade': 'DPS',
  'The Fighter of Shadow': 'DPS/Off-tank',
  // Hunter
  'Huntsman': 'Mobile DPS',
  'Bowmaster': 'Ranged DPS',
  'Trapper of Foes': 'CC/Support',
  // Lore-master
  'Keeper of Animals': 'Pet/Support',
  "Master of Nature's Fury": 'DPS',
  'The Ancient Master': 'CC/Debuff',
  // Mariner
  'The Shanty-caller': 'Support',
  'The Duellist': 'DPS',
  'The Rover': 'Tank/Utility',
  // Minstrel
  'The Watcher of Resolve': 'Heal',
  'The Warrior-Skald': 'DPS',
  'The Protector of Song': 'Support/Heal',
  // Rune-keeper
  'Benediction of Peace': 'Heal',
  'Cleansing Flame': 'DPS',
  'Solitary Thunder': 'DPS',
  // Warden
  'Determination': 'Tank',
  'Recklessness': 'DPS',
  'Assailment': 'Ranged DPS'
};

// Colors for each position
const TREE_COLORS = {
  blue: '#4080c0',
  red: '#c04040',
  yellow: '#c0a040'
};

function main() {
  console.log('Reading companion data...');
  const traitTreesXml = fs.readFileSync(path.join(COMPANION_DATA, 'traitTrees.xml'), 'utf8');
  const traitsXml = fs.readFileSync(path.join(COMPANION_DATA, 'traits.xml'), 'utf8');
  
  const allTrees = parseTraitTrees(traitTreesXml);
  const allTraits = parseTraits(traitsXml);
  
  console.log(`Parsed ${Object.keys(allTrees).length} trait trees`);
  console.log(`Parsed ${Object.keys(allTraits).length} traits`);
  
  // Process each class
  for (const [companionKey, slug] of Object.entries(CLASS_MAP)) {
    const classTree = allTrees[companionKey];
    if (!classTree) {
      console.warn(`No trait tree found for ${companionKey}`);
      continue;
    }
    
    console.log(`\nProcessing ${companionKey} (${slug})...`);
    
    // Read existing build file for metadata we want to preserve
    const buildPath = path.join(BUILDS_DIR, `${slug}.json`);
    let existingBuild = null;
    try {
      existingBuild = JSON.parse(fs.readFileSync(buildPath, 'utf8'));
    } catch (e) {
      console.log(`  No existing build file, creating new one`);
    }
    
    // Separate branches by column position to determine blue/red/yellow
    // Filter out non-class branches (Attack, Defence from gear trees)
    const classBranches = classTree.branches.filter(b => {
      // Skip generic Attack/Defence branches 
      return b.name !== 'Attack' && b.name !== 'Defence';
    });
    
    if (classBranches.length !== 3) {
      console.warn(`  Expected 3 class branches for ${companionKey}, got ${classBranches.length}: ${classBranches.map(b => b.name).join(', ')}`);
      continue;
    }
    
    // Determine position by column ranges
    const branchPositions = classBranches.map(branch => {
      const cols = branch.cells.map(c => c.col);
      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      let position;
      if (minCol <= 4) position = 'blue';
      else if (minCol <= 8) position = 'red';
      else position = 'yellow';
      return { branch, position, minCol, maxCol };
    });
    
    // Sort by position: blue first, then red, then yellow
    const posOrder = { blue: 0, red: 1, yellow: 2 };
    branchPositions.sort((a, b) => posOrder[a.position] - posOrder[b.position]);
    
    console.log(`  Trees: ${branchPositions.map(bp => `${bp.position}=${bp.branch.name} (cols ${bp.minCol}-${bp.maxCol})`).join(', ')}`);
    
    // Build the trees array
    const trees = branchPositions.map(({ branch, position, minCol, maxCol }) => {
      // Build traits array from cells
      const traits = branch.cells.map(cell => {
        const traitMeta = allTraits[cell.traitId] || {};
        const trait = {
          id: `${position.charAt(0)}-${cell.row}-${cell.col - minCol + 1}`,
          name: traitMeta.name || cell.traitName,
          row: cell.row,
          col: cell.col,
          maxRank: traitMeta.tiers || 5,
          traitId: cell.traitId,
          iconId: traitMeta.iconId || ''
        };
        return trait;
      });
      
      // Sort traits by row then col
      traits.sort((a, b) => a.row - b.row || a.col - b.col);
      
      // Build progression from branch progression data
      const progression = branch.progression.map(step => {
        const traitMeta = allTraits[step.traitId] || {};
        return {
          points: step.points,
          traitId: step.traitId,
          name: traitMeta.name || step.name,
          iconId: traitMeta.iconId || ''
        };
      });
      
      // Look for existing tree data to preserve desc/bonuses
      let existingTree = null;
      if (existingBuild) {
        existingTree = existingBuild.trees.find(t => 
          t.name === branch.name || 
          t.name.toLowerCase().includes(branch.name.toLowerCase().replace('the ', ''))
        );
      }
      
      const tree = {
        id: position,
        name: branch.name,
        role: BRANCH_ROLES[branch.name] || 'Unknown',
        color: TREE_COLORS[position],
        desc: existingTree ? existingTree.desc : '',
        bonuses: existingTree ? existingTree.bonuses : [],
        progression,
        traits
      };
      
      return tree;
    });
    
    // Build the final JSON
    const buildData = {
      class: slug,
      totalPoints: 98,
      builds: existingBuild ? existingBuild.builds : {
        endgame: {
          name: `${companionKey} Endgame`,
          description: `Standard endgame ${slug} build template`,
          points: {},
          virtues: ['Fortitude', 'Determination', 'Zeal', 'Valour', 'Wisdom'],
          level: 160
        }
      },
      trees
    };
    
    // Write the build file
    fs.writeFileSync(buildPath, JSON.stringify(buildData, null, 2) + '\n');
    console.log(`  Written ${buildPath}`);
    console.log(`  Trees: ${trees.map(t => `${t.id}="${t.name}" (${t.traits.length} traits, ${t.progression.length} milestones)`).join(', ')}`);
  }
  
  console.log('\nDone!');
}

main();
