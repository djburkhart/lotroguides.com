'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const embeds = require('../packages/discord/interact/embeds');
const statcaps = require('../packages/discord/interact/statcaps');
const giseldah = require('../packages/discord/interact/vendor/giseldah-calcstat');

test('on-level penetration uses player level rather than mob level', function () {
  var result = statcaps.calculateStatCaps({
    className: 'minstrel',
    level: 140,
    mobLevel: 150,
    penetration: 'modern3',
  });

  assert.equal(result.penetration.level, 140);
  assert.equal(result.penetration.values.armourpen, giseldah.CalcStat('TPenArmour', 140, 3));
});

test('landscape preset displays no penetration values', function () {
  var result = statcaps.calculateStatCaps({
    className: 'minstrel',
    level: 140,
    penetration: 'landscape',
  });
  var field = embeds.statCapsEmbed(result).fields.find(function (entry) {
    return entry.name === 'Penetration';
  });

  assert.ok(field);
  assert.match(field.value, /No penetrations/);
});

test('modern presets only display target mitigation penetration', function () {
  var result = statcaps.calculateStatCaps({
    className: 'minstrel',
    level: 140,
    penetration: 'modern3',
  });
  var field = embeds.statCapsEmbed(result).fields.find(function (entry) {
    return entry.name === 'Penetration';
  });

  assert.ok(field);
  assert.match(field.value, /\*\*Target Mitigation:\*\*/);
  assert.doesNotMatch(field.value, /\*\*B\/P\/E:\*\*/);
  assert.doesNotMatch(field.value, /\*\*Resist:\*\*/);
});

test('traditional presets display all Giseldah tooltip penetration categories', function () {
  var result = statcaps.calculateStatCaps({
    className: 'guardian',
    level: 140,
    penetration: 'trad3',
  });
  var field = embeds.statCapsEmbed(result).fields.find(function (entry) {
    return entry.name === 'Penetration';
  });

  assert.ok(field);
  assert.match(field.value, /\*\*B\/P\/E:\*\*/);
  assert.match(field.value, /\*\*Resist:\*\*/);
  assert.match(field.value, /\*\*Armour:\*\*/);
});
