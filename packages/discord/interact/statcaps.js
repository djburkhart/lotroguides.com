'use strict';

var giseldah = require('./vendor/giseldah-calcstat');

var CalcStat = giseldah.CalcStat;
var DblCalcDev = giseldah.DblCalcDev;

var LEVEL_CAP = CalcStat('LevelCap', 0);

var CLASS_MAP = {
  'lore-master': 'loremaster',
  'rune-keeper': 'runekeeper',
};

var CLASS_LABELS = {
  beorning: 'Beorning',
  brawler: 'Brawler',
  burglar: 'Burglar',
  captain: 'Captain',
  champion: 'Champion',
  guardian: 'Guardian',
  hunter: 'Hunter',
  'lore-master': 'Lore-master',
  mariner: 'Mariner',
  minstrel: 'Minstrel',
  'rune-keeper': 'Rune-keeper',
  warden: 'Warden',
};

var ARMOUR_TYPES = ['', 'light', 'medium', 'heavy'];

var PEN_RATINGS = {
  resist: 'resistpen',
  block: 'bpepen',
  partblock: 'bpepen',
  partblockmit: 'bpepen',
  parry: 'bpepen',
  partparry: 'bpepen',
  partparrymit: 'bpepen',
  evade: 'bpepen',
  partevade: 'bpepen',
  partevademit: 'bpepen',
  phymit: 'armourpen',
  ofmit: 'armourpenlow',
  tacmit: 'armourpenlow',
};

var PENETRATION_PRESETS = {
  landscape: { label: 'Landscape / T1', scope: 'none' },
  modern1: { label: 'Modern T1', scope: 'none' },
  modern2: { label: 'Modern T2', scope: 'armour', tier: 2, level: 'onlvl' },
  modern3: { label: 'Modern T3-5', scope: 'armour', tier: 3, level: 'onlvl' },
  trad1: { label: 'Traditional T1', scope: 'none' },
  trad2: { label: 'Traditional T2', scope: 'all', tier: 2, level: 'onlvl' },
  trad3: { label: 'Traditional T3-5', scope: 'all', tier: 3, level: 'onlvl' },
  rift2: { label: 'Rift T2', scope: 'all', tier: 2, level: 54 },
  rift3: { label: 'Rift T3', scope: 'all', tier: 3, level: 54 },
  too2: { label: 'ToO T2', scope: 'all', tier: 2, level: 78 },
  throne2: { label: 'Throne T2', scope: 'all', tier: 2, level: 108 },
  hoard1: { label: 'Hoard T1', scope: 'armour', tier: 1, level: 'onlvl' },
};

var STAT_DEFS = [
  { key: 'crithit', label: 'Crit Hit', section: 'Offense' },
  { key: 'devhit', label: 'Devastate Hit', section: 'Offense' },
  { key: 'critmagn', label: 'Critical Magnitude', section: 'Offense' },
  { key: 'finesse', label: 'Finesse', section: 'Offense' },
  { key: 'phydmg', label: 'Physical Damage', section: 'Offense' },
  { key: 'tacdmg', label: 'Tactical Damage', section: 'Offense' },
  { key: 'outheal', label: 'Outgoing Healing', section: 'Offense' },
  { key: 'resist', label: 'Resistance', section: 'Defense' },
  { key: 'critdef', label: 'Critical Defence', section: 'Defense' },
  { key: 'inheal', label: 'Incoming Healing', section: 'Defense' },
  { key: 'block', label: 'Block', section: 'Avoidance', requiresBlock: true },
  { key: 'partblock', label: 'Partial Block', section: 'Avoidance', requiresBlock: true },
  { key: 'partblockmit', label: 'Partial Block Mitigation', section: 'Avoidance', requiresBlock: true },
  { key: 'parry', label: 'Parry', section: 'Avoidance' },
  { key: 'partparry', label: 'Partial Parry', section: 'Avoidance' },
  { key: 'partparrymit', label: 'Partial Parry Mitigation', section: 'Avoidance' },
  { key: 'evade', label: 'Evade', section: 'Avoidance' },
  { key: 'partevade', label: 'Partial Evade', section: 'Avoidance' },
  { key: 'partevademit', label: 'Partial Evade Mitigation', section: 'Avoidance' },
  { key: 'phymit', label: 'Physical Mitigation', section: 'Mitigations', isMitigation: true },
  { key: 'ofmit', label: 'Orc-craft / Fell-wrought', section: 'Mitigations', isMitigation: true },
  { key: 'tacmit', label: 'Tactical Mitigation', section: 'Mitigations', isMitigation: true },
];

function normalizeClassName(className) {
  var normalized = String(className || '').trim().toLowerCase().replace(/ /g, '-');
  return CLASS_MAP[normalized] || normalized;
}

function createError(code, message) {
  var err = new Error(message);
  err.code = code;
  err.expose = true;
  return err;
}

function getPenetrationPreset(key) {
  var presetKey = String(key || 'landscape').trim().toLowerCase();
  return {
    key: PENETRATION_PRESETS[presetKey] ? presetKey : 'landscape',
    data: PENETRATION_PRESETS[presetKey] || PENETRATION_PRESETS.landscape,
  };
}

function getPenetrationValues(presetKey, playerLevel) {
  var presetInfo = getPenetrationPreset(presetKey);
  var preset = presetInfo.data;
  var values = {
    armourpen: 0,
    armourpenlow: 0,
    bpepen: 0,
    resistpen: 0,
  };

  if (preset.scope === 'none') {
    return {
      key: presetInfo.key,
      label: preset.label,
      scope: preset.scope,
      level: null,
      values: values,
    };
  }

  // Giseldah's UI computes "on-level" penetration presets from the player's
  // level, not the target mob level. Mob level only affects mitigation caps.
  var calcLevel = preset.level === 'onlvl' ? playerLevel : preset.level;

  if (preset.scope === 'armour' || preset.scope === 'all') {
    values.armourpen = CalcStat('TPenArmour', calcLevel, preset.tier);
    values.armourpenlow = values.armourpen;
  }
  if (preset.scope === 'all') {
    values.bpepen = CalcStat('TPenBPE', calcLevel, preset.tier);
    values.resistpen = CalcStat('TPenResist', calcLevel, preset.tier);
  }

  return {
    key: presetInfo.key,
    label: preset.label,
    scope: preset.scope,
    level: calcLevel,
    values: values,
  };
}

function getArmourTypeKey(armourTypeIndex) {
  return ARMOUR_TYPES[armourTypeIndex] || '';
}

function replaceArmourType(statKey, armourTypeIndex) {
  if (statKey !== 'phymit' && statKey !== 'ofmit' && statKey !== 'tacmit') {
    return statKey;
  }
  return 'Mit' + getArmourTypeKey(armourTypeIndex);
}

function getCalculationLevel(statDef, playerLevel, mitigationLevel) {
  return statDef.isMitigation ? Math.max(playerLevel, mitigationLevel) : playerLevel;
}

function getStatCap(statDef, playerLevel, mitigationLevel, armourTypeIndex, penetrationValues) {
  var calcLevel = getCalculationLevel(statDef, playerLevel, mitigationLevel);
  var calcStatKey = replaceArmourType(statDef.key, armourTypeIndex);
  var penetrationKey = PEN_RATINGS[statDef.key];
  var penetration = penetrationKey ? penetrationValues[penetrationKey] : 0;
  var bonus = CalcStat(calcStatKey + 'PBonus', calcLevel);
  var capRating = Math.max(0, Math.ceil(CalcStat(calcStatKey + 'PRatPCapR', calcLevel) - penetration - DblCalcDev));
  var capPercent = Math.ceil((CalcStat(calcStatKey + 'PRatPCap', calcLevel) + bonus) * 10 - DblCalcDev) / 10;

  return {
    key: statDef.key,
    label: statDef.label,
    section: statDef.section,
    calculationLevel: calcLevel,
    capPercent: capPercent,
    capRating: capRating,
    penetration: penetration,
  };
}

function groupStats(stats) {
  var grouped = {
    Offense: [],
    Defense: [],
    Avoidance: [],
    Mitigations: [],
  };

  stats.forEach(function (stat) {
    grouped[stat.section].push(stat);
  });

  return grouped;
}

function calculateStatCaps(input) {
  var classKey = String(input.className || '').trim().toLowerCase().replace(/ /g, '-');
  var calculatorClass = normalizeClassName(classKey);
  var playerLevel = Number(input.level);
  var penetrationKey = String(input.penetration || '').trim().toLowerCase();
  var mitigationLevel = Number(
    typeof input.mobLevel !== 'undefined' ? input.mobLevel :
    typeof input.mitigationLevel !== 'undefined' ? input.mitigationLevel :
    input.level
  );

  if (!CLASS_LABELS[classKey]) {
    throw createError('INVALID_CLASS', 'Unknown class "' + input.className + '".');
  }
  if (!Number.isFinite(playerLevel) || playerLevel < 1 || playerLevel > LEVEL_CAP) {
    throw createError('INVALID_LEVEL', 'Level must be between 1 and ' + LEVEL_CAP + '.');
  }
  if (!Number.isFinite(mitigationLevel) || mitigationLevel < 1 || mitigationLevel > LEVEL_CAP) {
    throw createError('INVALID_MOB_LEVEL', 'Mob level must be between 1 and ' + LEVEL_CAP + '.');
  }
  if (!penetrationKey || !PENETRATION_PRESETS[penetrationKey]) {
    throw createError('INVALID_PENETRATION', 'Choose a valid penetration preset.');
  }

  var armourTypeIndex = CalcStat(calculatorClass + 'CDArmourType', playerLevel);
  var canBlock = CalcStat(calculatorClass + 'CDCanBlock', playerLevel) > 0;
  var penetration = getPenetrationValues(penetrationKey, playerLevel);

  var stats = STAT_DEFS
    .filter(function (statDef) { return !statDef.requiresBlock || canBlock; })
    .map(function (statDef) {
      return getStatCap(statDef, playerLevel, mitigationLevel, armourTypeIndex, penetration.values);
    });

  return {
    classKey: classKey,
    classLabel: CLASS_LABELS[classKey],
    calculatorClass: calculatorClass,
    level: playerLevel,
    mitigationLevel: mitigationLevel,
    mitigationCalculationLevel: Math.max(playerLevel, mitigationLevel),
    armourType: getArmourTypeKey(armourTypeIndex),
    canBlock: canBlock,
    penetration: penetration,
    sections: groupStats(stats),
  };
}

exports.LEVEL_CAP = LEVEL_CAP;
exports.PENETRATION_PRESETS = PENETRATION_PRESETS;
exports.calculateStatCaps = calculateStatCaps;
