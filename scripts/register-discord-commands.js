#!/usr/bin/env node
/**
 * Register Discord Slash Commands
 *
 * One-time (or update) script to register the LOTRO Guides bot slash commands
 * with the Discord API. Run after creating the Discord Application in the
 * Developer Portal.
 *
 * Usage:
 *   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... node scripts/register-discord-commands.js
 *
 * Or set those values in your .env file.
 */

'use strict';

require('dotenv').config();

var statcaps = require('../packages/discord/interact/statcaps');

var APP_ID    = process.env.DISCORD_APP_ID;
var BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
var LEVEL_CAP = statcaps.LEVEL_CAP;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN env vars.');
  process.exit(1);
}

// Discord ApplicationCommandOptionType
var STRING  = 3;
var INTEGER = 4;

var CLASS_CHOICES = [
  { name: 'Beorning',    value: 'beorning' },
  { name: 'Brawler',     value: 'brawler' },
  { name: 'Burglar',     value: 'burglar' },
  { name: 'Captain',     value: 'captain' },
  { name: 'Champion',    value: 'champion' },
  { name: 'Guardian',    value: 'guardian' },
  { name: 'Hunter',      value: 'hunter' },
  { name: 'Lore-master', value: 'lore-master' },
  { name: 'Mariner',     value: 'mariner' },
  { name: 'Minstrel',    value: 'minstrel' },
  { name: 'Rune-keeper', value: 'rune-keeper' },
  { name: 'Warden',      value: 'warden' },
];

var STATCAP_PEN_CHOICES = [
  { name: 'Landscape / T1', value: 'landscape' },
  { name: 'Modern T1', value: 'modern1' },
  { name: 'Modern T2', value: 'modern2' },
  { name: 'Modern T3-5', value: 'modern3' },
  { name: 'Traditional T1', value: 'trad1' },
  { name: 'Traditional T2', value: 'trad2' },
  { name: 'Traditional T3-5', value: 'trad3' },
  { name: 'Rift T2', value: 'rift2' },
  { name: 'Rift T3', value: 'rift3' },
  { name: 'ToO T2', value: 'too2' },
  { name: 'Throne T2', value: 'throne2' },
  { name: 'Hoard T1', value: 'hoard1' },
];

var commands = [
  {
    name: 'quest',
    description: 'Look up a LOTRO quest by name',
    options: [
      {
        name: 'name',
        description: 'Start typing a quest name…',
        type: STRING,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'deed',
    description: 'Look up a LOTRO deed by name',
    options: [
      {
        name: 'name',
        description: 'Start typing a deed name…',
        type: STRING,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'item',
    description: 'Look up a LOTRO item by name',
    options: [
      {
        name: 'name',
        description: 'Start typing an item name…',
        type: STRING,
        required: true,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'map',
    description: 'Link to an interactive map region',
    options: [
      {
        name: 'region',
        description: 'Region name (e.g. "Ered Luin", "Moria", "Northern Mirkwood")',
        type: STRING,
        required: true,
      },
    ],
  },
  {
    name: 'build',
    description: 'Show a class trait build',
    options: [
      {
        name: 'class',
        description: 'Class name (e.g. hunter, guardian, lore-master)',
        type: STRING,
        required: true,
        choices: CLASS_CHOICES,
      },
      {
        name: 'build',
        description: 'Build name (search guide and community builds)',
        type: STRING,
        required: false,
        autocomplete: true,
      },
    ],
  },
  {
    name: 'statcaps',
    description: 'Calculate stat caps for a class, level, and penetration preset',
    options: [
      {
        name: 'class',
        description: 'Class name',
        type: STRING,
        required: true,
        choices: CLASS_CHOICES,
      },
      {
        name: 'level',
        description: 'Your character level',
        type: INTEGER,
        required: true,
        min_value: 1,
        max_value: LEVEL_CAP,
      },
      {
        name: 'penetration',
        description: 'Encounter penetration preset',
        type: STRING,
        required: true,
        choices: STATCAP_PEN_CHOICES,
      },
      {
        name: 'mob_level',
        description: 'Mob level for mitigation caps; defaults to your level',
        type: INTEGER,
        required: false,
        min_value: 1,
        max_value: LEVEL_CAP,
      },
    ],
  },
];

async function registerCommands() {
  var url = 'https://discord.com/api/v10/applications/' + APP_ID + '/commands';

  console.log('Registering ' + commands.length + ' global commands for app ' + APP_ID + '…\n');

  var res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': 'Bot ' + BOT_TOKEN,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!res.ok) {
    var errText = await res.text();
    console.error('Discord API error (' + res.status + '): ' + errText);
    process.exit(1);
  }

  var result = await res.json();
  console.log('✓ Registered ' + result.length + ' commands:\n');
  result.forEach(function (cmd) {
    console.log('  /' + cmd.name + '  (id: ' + cmd.id + ')');
  });
  console.log('\nDone. Commands may take up to 1 hour to propagate globally.');
}

registerCommands();
