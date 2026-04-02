/**
 * Enrich instance mob abilities with skill details from LotRO Companion data.
 *
 * Parses skills.xml and effects.xml to add damage type, range, AoE shape,
 * cooldown, induction, and applied effects to each ability in instances-db.json.
 *
 * Usage:  node scripts/enrich-instance-skills.js [path-to-lotro-companion-data]
 * Default path: C:\Users\me\OneDrive\Documents\The Lord of the Rings Online\PluginData\LotRO Companion\app\data\lore
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.argv[2] || path.join(
  'C:\\Users\\me\\OneDrive\\Documents\\The Lord of the Rings Online',
  'PluginData', 'LotRO Companion', 'app', 'data', 'lore'
);

const INSTANCES_DB = path.join(__dirname, '..', 'data', 'instances-db.json');

// ── LOTRO Enum Mappings ─────────────────────────────────────────────────────

const DAMAGE_QUALIFIER = { 1: 'Melee', 2: 'Tactical', 3: 'Ranged' };

const DAMAGE_TYPE = {
  1:     'Common',
  2:     'Westernesse',
  4:     'Ancient Dwarf',
  8:     'Beleriand',
  16:    'Fire',
  32:    'Shadow',
  64:    'Light',
  128:   'Lightning',
  256:   'Frost',
  512:   'Acid',
  1024:  'Cry',
  2048:  'Song',
  4096:  'Fell-wrought',
  8192:  'Orc-craft',
  16384: 'Physical',
};

const COMBAT_STATE = {
  1:  'Stunned',
  2:  'Knocked Down',
  3:  'Dazed',
  4:  'Feared',
  7:  'Knocked Out',
  9:  'Rooted',
  10: 'Silenced',
  13: 'Conjam',
  14: 'Dead',
  15: 'Disarmed',
  25: 'Staggered',
  27: 'Mired',
};

const SHAPE_LABEL = {
  sphere: 'Radius',
  arc:    'Arc',
  box:    'Box',
};

// ── Streaming XML Parser (no deps) ─────────────────────────────────────────

/**
 * Parse skill entries from skills.xml via regex.
 * Returns a Map of identifier → skill detail object.
 */
function parseSkills(skillIds) {
  const skillsPath = path.join(DATA_DIR, 'skills.xml');
  if (!fs.existsSync(skillsPath)) {
    console.error('  ✗ skills.xml not found at', skillsPath);
    return new Map();
  }

  const needed = new Set(skillIds);
  const skills = new Map();
  const xml = fs.readFileSync(skillsPath, 'utf8');

  // Split into individual <skill ...>...</skill> blocks
  const skillRegex = /<skill\s+identifier="(\d+)"[^>]*>[\s\S]*?<\/skill>/g;
  let match;
  while ((match = skillRegex.exec(xml)) !== null) {
    const id = match[1];
    if (!needed.has(id)) continue;

    const block = match[0];
    const skill = parseSkillBlock(id, block);
    skills.set(id, skill);
    needed.delete(id);
    if (needed.size === 0) break;
  }

  // Some skills may be self-closing: <skill identifier="..." ... />
  if (needed.size > 0) {
    const selfClose = /<skill\s+identifier="(\d+)"[^/]*\/>/g;
    while ((match = selfClose.exec(xml)) !== null) {
      const id = match[1];
      if (!needed.has(id)) continue;
      const block = match[0];
      const skill = parseSkillBlock(id, block);
      skills.set(id, skill);
      needed.delete(id);
      if (needed.size === 0) break;
    }
  }

  return skills;
}

function parseSkillBlock(id, block) {
  const skill = {};

  // Icon ID from the <skill> opening tag
  const icon = attr(block, 'iconId');
  if (icon) skill.iconId = icon;

  // Cooldown
  const cd = attr(block, 'cooldown');
  if (cd) skill.cooldown = parseFloat(cd);

  // Induction (cast time)
  const induc = attr(block, 'channelingDuration');
  if (induc) skill.induction = parseFloat(induc);

  // Max targets
  const mt = attr(block, 'maxTargets');
  if (mt) skill.maxTargets = parseInt(mt, 10);

  // Geometry: range and AoE
  const geoMatch = block.match(/<geometry\s+([^>]+)/);
  if (geoMatch) {
    const geo = geoMatch[1];
    const maxR = attrFrom(geo, 'maxRange');
    if (maxR) skill.maxRange = parseFloat(maxR);
    const minR = attrFrom(geo, 'minRange');
    if (minR) skill.minRange = parseFloat(minR);

    const shape = attrFrom(geo, 'shape');
    if (shape) {
      skill.aoeShape = shape;
      const radius = attrFrom(geo, 'radius');
      if (radius) skill.aoeRadius = parseFloat(radius);
      const degrees = attrFrom(geo, 'degrees');
      if (degrees) skill.aoeDegrees = parseFloat(degrees);
      const length = attrFrom(geo, 'length');
      if (length) skill.aoeLength = parseFloat(length);
      const width = attrFrom(geo, 'width');
      if (width) skill.aoeWidth = parseFloat(width);
    }
  }

  // Attack info (take first attack element)
  const atkMatch = block.match(/<attack\s+([^>]*)/);
  if (atkMatch) {
    const atk = atkMatch[1];
    const dq = attrFrom(atk, 'damageQualifier');
    if (dq) skill.damageQualifier = DAMAGE_QUALIFIER[parseInt(dq, 10)] || dq;
    const dt = attrFrom(atk, 'damageType');
    if (dt) skill.damageType = DAMAGE_TYPE[parseInt(dt, 10)] || 'Unknown';
  }

  // Effects applied by the skill
  const effectMatches = [...block.matchAll(/<effect\s+id="(\d+)"\s+name="([^"]*)"(?:\s+duration="([^"]*)")?/g)];
  if (effectMatches.length > 0) {
    skill.effects = effectMatches
      .filter(m => m[2] && m[2] !== '..')
      .map(m => {
        const e = { id: m[1], name: m[2] };
        if (m[3]) e.duration = parseFloat(m[3]);
        return e;
      });
    if (skill.effects.length === 0) delete skill.effects;
  }

  return skill;
}

function attr(block, name) {
  const m = block.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function attrFrom(str, name) {
  const m = str.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/**
 * Parse effect entries from effects.xml.
 * Returns a Map of id → { name, type, duration, ... }
 */
function parseEffects(effectIds) {
  const effectsPath = path.join(DATA_DIR, 'effects.xml');
  if (!fs.existsSync(effectsPath)) {
    console.error('  ✗ effects.xml not found at', effectsPath);
    return new Map();
  }

  const needed = new Set(effectIds);
  const effects = new Map();
  const xml = fs.readFileSync(effectsPath, 'utf8');

  // Match any effect element type: <propertyModEffect ...>, <vitalOverTimeEffect ...>, <induceCombatState ...>, etc.
  const effectRegex = /<(\w+Effect|induceCombatState)\s+id="(\d+)"([^>]*)(?:\/>|>[\s\S]*?<\/\1>)/g;
  let match;
  while ((match = effectRegex.exec(xml)) !== null) {
    const eid = match[2];
    if (!needed.has(eid)) continue;

    const tag = match[1];
    const attrs = match[3];
    const eff = { type: tag };

    const effIcon = attrFrom(attrs, 'iconId');
    if (effIcon) eff.iconId = effIcon;

    const dur = attrFrom(attrs, 'duration');
    if (dur) eff.duration = parseFloat(dur);

    const state = attrFrom(attrs, 'state');
    const stateDur = attrFrom(attrs, 'stateDuration');
    if (stateDur) eff.stateDuration = parseFloat(stateDur);

    // Derive CC type from effect name (e.g. "Induce Rooted" → "Rooted")
    if (tag === 'induceCombatState') {
      const nameMatch = match[0].match(/name="([^"]*)"/);
      if (nameMatch) {
        const ccName = nameMatch[1].replace(/^Induce\s+/, '');
        eff.combatState = ccName.charAt(0).toUpperCase() + ccName.slice(1);
      } else if (state) {
        eff.combatState = COMBAT_STATE[parseInt(state, 10)] || `State ${state}`;
      }
    }

    const pulseCount = attrFrom(attrs, 'pulseCount');
    if (pulseCount) eff.pulseCount = parseInt(pulseCount, 10);

    // Extract stat modifications
    const statMatches = [...match[0].matchAll(/<stat\s+name="([^"]*)"(?:\s+operator="([^"]*)")?/g)];
    if (statMatches.length > 0) {
      eff.stats = statMatches.map(s => {
        const o = { stat: s[1] };
        if (s[2]) o.operator = s[2];
        return o;
      });
    }

    effects.set(eid, eff);
    needed.delete(eid);
    if (needed.size === 0) break;
  }

  return effects;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

// Generic placeholder icon used by nearly all mob skills
const GENERIC_SKILL_ICON = '1090522259';

function formatSkillForDisplay(skill, effectsMap) {
  const out = {};

  // Icon: prefer first effect icon over generic skill icon
  let bestIcon = null;
  let bestIconDir = null;
  if (skill.iconId && skill.iconId !== GENERIC_SKILL_ICON) {
    bestIcon = skill.iconId;
    bestIconDir = 'skills';
  }
  if (!bestIcon && skill.effects) {
    for (const e of skill.effects) {
      const resolved = effectsMap.get(e.id);
      if (resolved && resolved.iconId && resolved.iconId !== GENERIC_SKILL_ICON) {
        bestIcon = resolved.iconId;
        bestIconDir = 'effects';
        break;
      }
    }
  }
  if (bestIcon) {
    out.iconId = bestIcon;
    out.iconDir = bestIconDir;
  }

  // Attack type: "Melee · Common" or "Tactical · Shadow"
  if (skill.damageQualifier || skill.damageType) {
    const parts = [];
    if (skill.damageQualifier) parts.push(skill.damageQualifier);
    if (skill.damageType) parts.push(skill.damageType);
    out.attackType = parts.join(' · ');
  }

  // Range
  if (skill.maxRange) {
    out.range = skill.maxRange;
  }

  // AoE description
  if (skill.aoeShape) {
    const label = SHAPE_LABEL[skill.aoeShape] || skill.aoeShape;
    if (skill.aoeShape === 'sphere' && skill.aoeRadius) {
      out.aoe = `${label} ${skill.aoeRadius}m`;
    } else if (skill.aoeShape === 'arc' && skill.aoeRadius && skill.aoeDegrees) {
      out.aoe = `${label} ${skill.aoeDegrees}° ${skill.aoeRadius}m`;
    } else if (skill.aoeShape === 'box' && skill.aoeLength && skill.aoeWidth) {
      out.aoe = `${label} ${skill.aoeLength}×${skill.aoeWidth}m`;
    } else {
      out.aoe = label;
    }
  }

  // Cooldown
  if (skill.cooldown) {
    out.cooldown = skill.cooldown;
  }

  // Induction
  if (skill.induction) {
    out.induction = skill.induction;
  }

  // Max targets
  if (skill.maxTargets) {
    out.maxTargets = skill.maxTargets;
  }

  // Effects with resolved details
  if (skill.effects && skill.effects.length > 0) {
    out.effects = skill.effects.map(e => {
      const resolved = effectsMap.get(e.id);
      const result = { name: e.name };
      if (e.duration) result.duration = e.duration;

      if (resolved) {
        if (resolved.combatState) result.cc = resolved.combatState;
        if (resolved.stateDuration) result.ccDuration = resolved.stateDuration;
        if (resolved.pulseCount) result.ticks = resolved.pulseCount;

        // Classify effect
        if (resolved.type === 'induceCombatState') {
          result.type = 'cc';
        } else if (resolved.type === 'vitalOverTimeEffect') {
          result.type = 'dot';
        } else if (resolved.type === 'propertyModEffect') {
          result.type = 'debuff';
        } else if (resolved.type === 'countdownEffect') {
          result.type = 'countdown';
        }
      }
      return result;
    });
  }

  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Enriching instance skills from LotRO Companion data…');
  console.log(`  Source: ${DATA_DIR}`);

  if (!fs.existsSync(INSTANCES_DB)) {
    console.error('  ✗ instances-db.json not found at', INSTANCES_DB);
    process.exit(1);
  }

  const instances = JSON.parse(fs.readFileSync(INSTANCES_DB, 'utf8'));

  // Collect all unique skill IDs across all instances
  const allSkillIds = new Set();
  for (const inst of instances) {
    for (const mob of inst.mobs) {
      for (const ability of mob.abilities) {
        allSkillIds.add(ability.id);
      }
    }
  }
  console.log(`  Found ${allSkillIds.size} unique skill IDs to resolve`);

  // Parse skills.xml for only the IDs we need
  const skills = parseSkills([...allSkillIds]);
  console.log(`  Resolved ${skills.size}/${allSkillIds.size} skills from skills.xml`);

  // Collect all effect IDs referenced by resolved skills
  const allEffectIds = new Set();
  for (const skill of skills.values()) {
    if (skill.effects) {
      for (const e of skill.effects) {
        allEffectIds.add(e.id);
      }
    }
  }
  console.log(`  Found ${allEffectIds.size} effect IDs to resolve`);

  // Parse effects.xml for only the IDs we need
  const effects = parseEffects([...allEffectIds]);
  console.log(`  Resolved ${effects.size}/${allEffectIds.size} effects from effects.xml`);

  // Enrich each ability in the instances data
  let enriched = 0;
  let total = 0;
  for (const inst of instances) {
    for (const mob of inst.mobs) {
      for (const ability of mob.abilities) {
        total++;
        const skill = skills.get(ability.id);
        if (skill) {
          const details = formatSkillForDisplay(skill, effects);
          Object.assign(ability, details);
          enriched++;
        }
      }
    }
  }

  console.log(`  Enriched ${enriched}/${total} abilities with skill metadata`);

  // Write back
  fs.writeFileSync(INSTANCES_DB, JSON.stringify(instances, null, 2));
  console.log(`  ✓ Updated ${INSTANCES_DB}`);
}

main();
