/**
 * Discord Embed Builders — LOTRO Guides
 *
 * Produces Discord embed objects that mirror the visual style of the
 * .lotro-card quest/deed cards on the site.
 *
 * Colours:
 *   Quest  — #c9aa58  (--lotro-gold)
 *   Deed   — #5b9bd5  (deed blue)
 *   Map    — #4a6741  (forest green)
 *   Item   — #a855f7  (purple)
 *   Build  — #e06060  (trait red)
 */

'use strict';

var SITE = 'https://lotroguides.com';

function escMd(s) {
  if (!s) return '';
  return s.replace(/([*_~`|\\>])/g, '\\$1');
}

/* ── Quest ─────────────────────────────────────────────────────────── */

function questEmbed(quest) {
  if (!quest) return missingEmbed('Quest');
  var fields = [];

  if (quest.cat) {
    fields.push({ name: '📍 Zone', value: escMd(quest.cat), inline: true });
  }
  if (quest.lv) {
    fields.push({ name: '⚔️ Level', value: String(quest.lv), inline: true });
  }
  if (quest.arc) {
    fields.push({ name: '🔗 Arc', value: escMd(quest.arc), inline: true });
  }
  if (quest.b) {
    fields.push({ name: 'Bestower', value: escMd(quest.b), inline: true });
  }

  var rewardLines = formatQuestRewards(quest.rw);
  if (rewardLines) {
    fields.push({ name: 'Rewards', value: rewardLines });
  }

  if (quest.pre && quest.pre.length) {
    var preNames = quest.pre.map(function (p) {
      return '[' + escMd(p.n) + '](' + SITE + '/quests?id=' + p.id + ')';
    });
    fields.push({ name: 'Prerequisites', value: preNames.join(', ') });
  }

  if (quest.nxt) {
    fields.push({
      name: 'Next Quest',
      value: '[' + escMd(quest.nxt.n) + '](' + SITE + '/quests?id=' + quest.nxt.id + ')',
    });
  }

  return {
    title: '📖 ' + (quest.n || 'Unknown Quest'),
    url: SITE + '/quests?id=' + encodeURIComponent(quest.id),
    color: 0xc9aa58,
    description: quest.desc ? escMd(quest.desc) : undefined,
    fields: fields.length ? fields : undefined,
    footer: { text: 'LOTRO Guides', icon_url: SITE + '/img/icons/lotro-guides-icon.png' },
  };
}

function formatQuestRewards(rw) {
  if (!rw) return '';
  var parts = [];
  if (rw.xp) parts.push('⭐ ' + rw.xp + ' XP');
  if (rw.m)  parts.push('💰 ' + rw.m);
  if (rw.it && rw.it.length) {
    rw.it.forEach(function (it) {
      parts.push('🎁 ' + escMd(it.n));
    });
  }
  return parts.join('\n') || '';
}

/* ── Deed ──────────────────────────────────────────────────────────── */

function deedEmbed(deed) {
  if (!deed) return missingEmbed('Deed');
  var fields = [];

  if (deed.tp) {
    fields.push({ name: 'Type', value: escMd(deed.tp), inline: true });
  }
  if (deed.lv) {
    fields.push({ name: '⚔️ Level', value: String(deed.lv), inline: true });
  }
  if (deed.rg) {
    fields.push({ name: '📍 Region', value: escMd(deed.rg), inline: true });
  }
  if (deed.cl) {
    fields.push({ name: '🛡️ Class', value: escMd(deed.cl), inline: true });
  }

  if (deed.obj && deed.obj.length) {
    var objLines = deed.obj.slice(0, 6).map(function (o) {
      return '• ' + formatDeedObjective(o);
    });
    if (deed.obj.length > 6) objLines.push('*+' + (deed.obj.length - 6) + ' more…*');
    fields.push({ name: 'Objectives', value: objLines.join('\n') });
  }

  var rewardLines = formatDeedRewards(deed.rw);
  if (rewardLines) {
    fields.push({ name: 'Rewards', value: rewardLines });
  }

  return {
    title: '🛡️ ' + (deed.n || 'Unknown Deed'),
    url: SITE + '/deeds?id=' + encodeURIComponent(deed.id),
    color: 0x5b9bd5,
    fields: fields.length ? fields : undefined,
    footer: { text: 'LOTRO Guides', icon_url: SITE + '/img/icons/lotro-guides-icon.png' },
  };
}

function formatDeedObjective(obj) {
  if (!obj) return '';
  switch (obj.t) {
    case 'kill':     return 'Defeat ' + escMd(obj.mn || 'enemies') + (obj.c ? ' ×' + obj.c : '') + (obj.z ? ' in ' + escMd(obj.z) : '');
    case 'complete': return 'Complete: ' + escMd(obj.an || '');
    case 'qc':       return 'Complete ' + (obj.c || '?') + ' quests';
    case 'explore':  return 'Explore: ' + escMd(obj.n || '');
    case 'item':     return 'Collect: ' + escMd(obj.n || '');
    case 'npc':      return 'Talk to ' + escMd(obj.n || '');
    case 'use':      return 'Use: ' + escMd(obj.n || '');
    case 'skill':    return 'Use skill: ' + escMd(obj.n || '');
    case 'emote':    return 'Emote: ' + escMd(obj.n || '');
    case 'lm':       return escMd(obj.n || obj.t);
    case 'fac':      return 'Reach reputation: ' + escMd(obj.n || '');
    default:         return escMd(obj.n || obj.t || '');
  }
}

function formatDeedRewards(rw) {
  if (!rw || !rw.length) return '';
  var parts = [];
  rw.forEach(function (r) {
    if (r.t === 'LP')         parts.push('⭐ ' + r.v + ' LP');
    else if (r.t === 'Title') parts.push('📜 ' + escMd(String(r.v)));
    else if (r.t === 'Virtue' || r.t === 'VirtueXP')
      parts.push('❤️ ' + escMd(String(r.v)) + (r.t === 'VirtueXP' ? ' VXP' : ''));
    else if (r.t === 'Reputation') parts.push('🏳️ ' + escMd(String(r.v)));
    else if (r.t === 'XP')   parts.push('⭐ ' + escMd(String(r.v)) + ' XP');
    else if (r.t === 'Item') parts.push('🎁 ' + escMd(String(r.v)));
    else                      parts.push(escMd(String(r.v || r.t)));
  });
  return parts.join('\n') || '';
}

/* ── Map ───────────────────────────────────────────────────────────── */

function mapEmbed(region) {
  if (!region) return missingEmbed('Map location');
  return {
    title: '🗺️ ' + (region.name || 'Unknown Region'),
    url: SITE + '/map?region=' + encodeURIComponent(region.id),
    color: 0x4a6741,
    description: 'Click to open the interactive map for this region.',
    footer: { text: 'LOTRO Guides', icon_url: SITE + '/img/icons/lotro-guides-icon.png' },
  };
}

/* ── Item (from items-db.json) ─────────────────────────────────────── */

function itemEmbed(item, cdnUrl) {
  if (!item) return missingEmbed('Item');
  var fields = [];

  if (item.t) {
    fields.push({ name: 'Type', value: escMd(capitalize(item.t)), inline: true });
  }
  if (item.st) {
    fields.push({ name: 'Subtype', value: escMd(capitalize(item.st)), inline: true });
  }
  if (item.stats && item.stats.length) {
    var statLines = item.stats.slice(0, 6).map(function (s) {
      return '• ' + escMd(s.s) + ': **' + s.v + '**';
    });
    if (item.stats.length > 6) statLines.push('*+' + (item.stats.length - 6) + ' more…*');
    fields.push({ name: 'Stats', value: statLines.join('\n') });
  }

  var thumb = undefined;
  if (item.ic && cdnUrl) {
    thumb = { url: cdnUrl + '/img/icons/items/' + item.ic + '.png' };
  }

  return {
    title: '🎒 ' + (item.n || 'Unknown Item'),
    url: SITE + '/items?id=' + encodeURIComponent(item.id),
    color: 0xa855f7,
    fields: fields.length ? fields : undefined,
    thumbnail: thumb,
    footer: { text: 'LOTRO Guides', icon_url: SITE + '/img/icons/lotro-guides-icon.png' },
  };
}

/* ── Build ─────────────────────────────────────────────────────────── */

function buildEmbed(buildData, className, buildName, likes, buildId) {
  if (!buildData) return missingEmbed('Build');

  var displayName = buildData.name || buildData.label || buildName || 'Build';
  var title = capitalize(className) + ' — ' + displayName;
  var lines = [];

  if (buildData.traits && buildData.traits.length) {
    var traitNames = buildData.traits.slice(0, 10).map(function (t) {
      return '• ' + escMd(t.name || t.n || t.id);
    });
    lines.push('**Traits**\n' + traitNames.join('\n'));
  }

  if (buildData.description) {
    lines.push(escMd(buildData.description));
  }

  if (likes) {
    lines.push('❤️ ' + likes + ' like' + (likes === 1 ? '' : 's'));
  }

  // Build clean skills page URL — guide builds resolve by name, community builds by ID
  var url;
  if (buildId) {
    // Community build: use ?id= so the page fetches it by ID
    url = SITE + '/skills?class=' + encodeURIComponent(className) + '&id=' + encodeURIComponent(buildId);
  } else if (buildName) {
    // Guide build: resolve by name (the planner loads points from static data)
    url = SITE + '/skills?class=' + encodeURIComponent(className) + '&build=' + encodeURIComponent(buildName);
  } else {
    url = SITE + '/skills?class=' + encodeURIComponent(className);
  }

  return {
    title: '⚙️ ' + title,
    url: url,
    color: 0xe06060,
    description: lines.join('\n\n') || 'View the full trait build on the site.',
    footer: { text: 'LOTRO Guides', icon_url: SITE + '/img/icons/lotro-guides-icon.png' },
  };
}

/* ── Stat Caps ─────────────────────────────────────────────────────── */

function statCapsEmbeds(result) {
  if (!result) return [missingEmbed('Stat caps')];

  var color = statCapsColor(result);
  var embed = {
    title: '🧮 ' + result.classLabel + ' Stat Caps',
    color: color,
    description: buildStatCapsDescription(result),
    thumbnail: { url: classIconUrl(result.classKey) },
    fields: buildStatCapsFields(result),
    footer: {
      text: "Powered by Giseldah's CalcStat",
      icon_url: SITE + '/img/icons/lotro-guides-icon.png'
    },
  };

  return [embed];
}

function statCapsEmbed(result) {
  return statCapsEmbeds(result)[0];
}

function formatStatCapLines(stats) {
  return stats.map(function (stat) {
    return '• ' + escMd(stat.label) + ': **' + stat.capPercent.toFixed(1) + '%** (' + formatNumber(stat.capRating) + ')';
  }).join('\n');
}

function formatPenetrationSuffix(penetration) {
  var parts = [];
  if (penetration.values.armourpen) parts.push('Armour ' + formatNumber(Math.abs(Math.round(penetration.values.armourpen + 0.00000001))));
  if (penetration.values.bpepen) parts.push('B/P/E ' + formatNumber(Math.abs(Math.round(penetration.values.bpepen + 0.00000001))));
  if (penetration.values.resistpen) parts.push('Resist ' + formatNumber(Math.abs(Math.round(penetration.values.resistpen + 0.00000001))));
  if (!parts.length) return '';
  return ' (' + parts.join(' • ') + ')';
}

function buildStatCapsDescription(result) {
  var line = capitalize(result.armourType) + ' armour';
  line += ' • Lv ' + result.level;
  if (result.mitigationLevel !== result.level) {
    line += ' vs mob Lv ' + result.mitigationLevel;
  } else {
    line += ' • on-level content';
  }
  line += ' • ' + result.penetration.label;
  return line;
}

function buildStatCapsFields(result) {
  var fields = [
    { name: 'Overview', value: formatOverviewField(result), inline: true },
    { name: 'Core Caps', value: formatCoreCapsField(result), inline: true },
    { name: 'Penetration', value: formatPenetrationField(result.penetration), inline: true },
  ];

  if (result.sections.Offense.length) {
    fields.push({ name: 'Offense', value: formatStatList(result.sections.Offense), inline: true });
  }
  if (result.sections.Defense.length) {
    fields.push({ name: 'Defense', value: formatStatList(result.sections.Defense), inline: true });
  }
  var mitigationStats = filterDisplayedStats(result.sections.Mitigations);
  if (mitigationStats.length) {
    fields.push({ name: 'Mitigations', value: formatStatList(mitigationStats), inline: true });
  }

  fields = fields.concat(formatAvoidanceFields(result.sections.Avoidance));
  return fields;
}

function formatOverviewField(result) {
  return [
    '**Armour:** ' + escMd(capitalize(result.armourType)),
    '**Player Lv:** ' + result.level,
    '**Mob Lv:** ' + result.mitigationLevel,
    '**Mit Cap Lv:** ' + result.mitigationCalculationLevel,
  ].join('\n');
}

function formatCoreCapsField(result) {
  return [
    formatSummaryStat(findStat(result, 'crithit')),
    formatSummaryStat(findStat(result, 'finesse')),
    formatCombinedSummaryStat(
      findStat(result, 'tacdmg'),
      findStat(result, 'phydmg'),
      'Mastery'
    ),
    formatCombinedSummaryStat(
      findStat(result, 'tacmit'),
      findStat(result, 'phymit'),
      'Mits'
    ),
  ].filter(Boolean).join('\n');
}

function formatPenetrationField(penetration) {
  var lines = ['**Preset:** ' + escMd(penetration.label)];
  var items = getPenetrationDisplayItems(penetration);

  if (!items.length) {
    lines.push('No penetrations');
    return lines.join('\n');
  }

  items.forEach(function (item) {
    lines.push('**' + item.label + ':** ' + formatPenValue(item.value));
  });

  return lines.join('\n');
}

function formatSummaryStat(stat) {
  if (!stat) return '';
  return '**' + escMd(displayStatLabel(stat.label)) + ':** ' + stat.capPercent.toFixed(1) + '% • ' + formatNumber(stat.capRating);
}

function formatCombinedSummaryStat(primaryStat, secondaryStat, label) {
  if (!primaryStat && !secondaryStat) return '';
  if (!primaryStat) return formatSummaryValue(label, secondaryStat.capPercent, secondaryStat.capRating);
  if (!secondaryStat) return formatSummaryValue(label, primaryStat.capPercent, primaryStat.capRating);

  if (primaryStat.capPercent === secondaryStat.capPercent && primaryStat.capRating === secondaryStat.capRating) {
    return formatSummaryValue(label, primaryStat.capPercent, primaryStat.capRating);
  }

  return '**' + escMd(label) + ':** '
    + displayStatLabel(primaryStat.label) + ' ' + primaryStat.capPercent.toFixed(1) + '% • ' + formatNumber(primaryStat.capRating)
    + ' / '
    + displayStatLabel(secondaryStat.label) + ' ' + secondaryStat.capPercent.toFixed(1) + '% • ' + formatNumber(secondaryStat.capRating);
}

function formatSummaryValue(label, capPercent, capRating) {
  return '**' + escMd(label) + ':** ' + capPercent.toFixed(1) + '% • ' + formatNumber(capRating);
}

function formatStatList(stats) {
  return stats.map(function (stat) {
    return '• **' + escMd(displayStatLabel(stat.label)) + '**\n' + stat.capPercent.toFixed(1) + '% • ' + formatNumber(stat.capRating);
  }).join('\n');
}

function formatPenValue(value) {
  if (!value) return 'none';
  return formatNumber(Math.abs(Math.round(value + 0.00000001)));
}

function getPenetrationDisplayItems(penetration) {
  if (!penetration) return [];

  switch (penetration.scope) {
    case 'armour':
      return [
        { label: 'Target Mitigation', value: penetration.values.armourpen },
      ];
    case 'all':
      return [
        { label: 'B/P/E', value: penetration.values.bpepen },
        { label: 'Resist', value: penetration.values.resistpen },
        { label: 'Armour', value: penetration.values.armourpen },
      ];
    default:
      return [];
  }
}

function classIconUrl(classKey) {
  return SITE + '/img/icons/classes/' + encodeURIComponent(classKey) + '.png';
}

function statCapsColor(result) {
  switch (result.armourType) {
    case 'light': return 0x5b9bd5;
    case 'medium': return 0x4a6741;
    case 'heavy': return 0xc9aa58;
    default: return 0x7f8c3d;
  }
}

function findStat(result, key) {
  var sections = result.sections || {};
  var keys = Object.keys(sections);
  for (var i = 0; i < keys.length; i++) {
    var stats = sections[keys[i]] || [];
    for (var j = 0; j < stats.length; j++) {
      if (stats[j].key === key) return stats[j];
    }
  }
  return null;
}

function formatAvoidanceFields(stats) {
  if (!stats || !stats.length) return [];

  var groups = [
    { name: 'Block', keys: ['block', 'partblock', 'partblockmit'] },
    { name: 'Parry', keys: ['parry', 'partparry', 'partparrymit'] },
    { name: 'Evade', keys: ['evade', 'partevade', 'partevademit'] },
  ];

  return groups.map(function (group) {
    var groupStats = group.keys.map(function (key) {
      return stats.find(function (stat) { return stat.key === key; });
    }).filter(Boolean);

    if (!groupStats.length) return null;

    return {
      name: group.name,
      value: groupStats.map(function (stat) {
        return '• **' + escMd(shortAvoidanceLabel(stat.label, group.name)) + '**\n' + stat.capPercent.toFixed(1) + '% • ' + formatNumber(stat.capRating);
      }).join('\n'),
      inline: true,
    };
  }).filter(Boolean);
}

function filterDisplayedStats(stats) {
  return (stats || []).filter(function (stat) {
    return stat.key !== 'ofmit';
  });
}

function displayStatLabel(label) {
  var labels = {
    'Devastate Hit': 'Dev Hit',
    'Critical Magnitude': 'Crit Mag',
    'Physical Damage': 'Phys Mastery',
    'Tactical Damage': 'Tact Mastery',
    'Outgoing Healing': 'Out Healing',
    'Critical Defence': 'Crit Def',
    'Incoming Healing': 'Inc Healing',
    'Physical Mitigation': 'Phys Mit',
    'Tactical Mitigation': 'Tact Mit',
  };
  return labels[label] || label;
}

function shortAvoidanceLabel(label, groupName) {
  if (label === groupName) return 'Base';
  if (label.indexOf('Partial ') === 0 && label.indexOf('Mitigation') === -1) return 'Partial';
  if (label.indexOf('Mitigation') !== -1) return 'Partial Mit';
  return label;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function missingEmbed(type) {
  return {
    title: '❌ ' + type + ' not found',
    color: 0xff4444,
    description: 'No matching ' + type.toLowerCase() + ' was found. Check your spelling and try again.',
    footer: { text: 'LOTRO Guides' },
  };
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('en-US');
}

exports.questEmbed  = questEmbed;
exports.deedEmbed   = deedEmbed;
exports.mapEmbed    = mapEmbed;
exports.itemEmbed   = itemEmbed;
exports.buildEmbed  = buildEmbed;
exports.statCapsEmbeds = statCapsEmbeds;
exports.statCapsEmbed = statCapsEmbed;
exports.missingEmbed = missingEmbed;
