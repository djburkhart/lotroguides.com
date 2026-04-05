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

var APP_ID    = process.env.DISCORD_APP_ID;
var BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Missing DISCORD_APP_ID or DISCORD_BOT_TOKEN env vars.');
  process.exit(1);
}

// Discord ApplicationCommandOptionType
var STRING  = 3;
var INTEGER = 4;

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
        choices: [
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
        ],
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
