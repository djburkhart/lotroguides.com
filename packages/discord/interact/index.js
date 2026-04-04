/**
 * DO Function: /api/discord/interact
 *
 * Discord Interactions endpoint — receives slash-command webhooks from Discord,
 * verifies Ed25519 signatures, and returns rich embeds matching the LOTRO Guides
 * visual style.
 *
 * Slash commands:
 *   /quest <name>              – search quests by name
 *   /deed  <name>              – search deeds by name
 *   /item  <name>              – search items by name
 *   /map   <region>            – link to an interactive map region
 *   /build <class> [build]     – show a class trait build
 *
 * Required env vars:
 *   DISCORD_PUBLIC_KEY  – Ed25519 public key from Discord Developer Portal
 *   DO_CDN_URL          – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 */

'use strict';

var nacl    = require('tweetnacl');
var embeds  = require('./embeds');

var CDN_URL = '';

/* ── Data caches (cold-start fetch, then kept in memory) ──────────── */

var questIndex = null;
var questNames = null;
var deedIndex  = null;
var deedNames  = null;
var itemIndex  = null;
var itemNames  = null;
var mapIndex   = null;
var mapNames   = null;

var loadPromises = {};

function fetchJson(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return r.json();
  });
}

function loadQuests() {
  if (questIndex) return Promise.resolve();
  if (loadPromises.quests) return loadPromises.quests;
  loadPromises.quests = fetchJson(CDN_URL + '/data/quest-index.json')
    .then(function (data) {
      questIndex = data;
      questNames = data.map(function (q) { return (q.n || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.quests = null; throw err; });
  return loadPromises.quests;
}

function loadDeeds() {
  if (deedIndex) return Promise.resolve();
  if (loadPromises.deeds) return loadPromises.deeds;
  loadPromises.deeds = fetchJson(CDN_URL + '/data/deed-index.json')
    .then(function (data) {
      deedIndex = data;
      deedNames = data.map(function (d) { return (d.n || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.deeds = null; throw err; });
  return loadPromises.deeds;
}

function loadItems() {
  if (itemIndex) return Promise.resolve();
  if (loadPromises.items) return loadPromises.items;
  loadPromises.items = fetchJson(CDN_URL + '/data/lore/item-index.json')
    .then(function (data) {
      itemIndex = data;
      itemNames = data.map(function (it) { return (it.n || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.items = null; throw err; });
  return loadPromises.items;
}

function loadMaps() {
  if (mapIndex) return Promise.resolve();
  if (loadPromises.maps) return loadPromises.maps;
  loadPromises.maps = fetchJson(CDN_URL + '/data/lore/maps-index.json')
    .then(function (data) {
      mapIndex = data;
      mapNames = data.map(function (m) { return (m.name || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.maps = null; throw err; });
  return loadPromises.maps;
}

/* ── Signature verification ───────────────────────────────────────── */

function verifySignature(publicKey, signature, timestamp, rawBody) {
  try {
    var msg = Buffer.from(timestamp + rawBody);
    var sig = Buffer.from(signature, 'hex');
    var key = Buffer.from(publicKey, 'hex');
    return nacl.sign.detached.verify(msg, sig, key);
  } catch (e) {
    return false;
  }
}

/* ── Search helpers ───────────────────────────────────────────────── */

function search(names, index, query, limit) {
  var q = (query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  var results = [];
  var max = Math.min(limit || 5, 25);
  for (var i = 0; i < names.length && results.length < max; i++) {
    if (names[i].includes(q)) results.push(index[i]);
  }
  return results;
}

/* ── Command handlers ─────────────────────────────────────────────── */

function getOptionValue(options, name) {
  if (!options) return undefined;
  for (var i = 0; i < options.length; i++) {
    if (options[i].name === name) return options[i].value;
  }
  return undefined;
}

async function handleQuest(options) {
  var query = getOptionValue(options, 'name');
  await loadQuests();
  var results = search(questNames, questIndex, query, 5);

  if (results.length === 0) {
    return { embeds: [embeds.missingEmbed('Quest')] };
  }
  if (results.length === 1) {
    // Single match — try to fetch full quest data for richer card
    try {
      var full = await fetchJson(CDN_URL + '/data/quests-db.json');
      var detail = full.find(function (q) { return q.id === results[0].id; });
      if (detail) return { embeds: [embeds.questEmbed(detail)] };
    } catch (e) { /* fall through to index data */ }
    return { embeds: [embeds.questEmbed(results[0])] };
  }

  // Multiple matches — show a list embed
  var lines = results.map(function (q, i) {
    var lv = q.lv ? ' (Lv ' + q.lv + ')' : '';
    return (i + 1) + '. [' + (q.n || '?') + '](' + 'https://lotroguides.com/quests?id=' + q.id + ')' + lv;
  });
  return {
    embeds: [{
      title: '📖 Quest search: "' + query + '"',
      description: lines.join('\n'),
      color: 0xc9aa58,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

async function handleDeed(options) {
  var query = getOptionValue(options, 'name');
  await loadDeeds();
  var results = search(deedNames, deedIndex, query, 5);

  if (results.length === 0) {
    return { embeds: [embeds.missingEmbed('Deed')] };
  }
  if (results.length === 1) {
    return { embeds: [embeds.deedEmbed(results[0])] };
  }

  var lines = results.map(function (d, i) {
    var lv = d.lv ? ' (Lv ' + d.lv + ')' : '';
    var tp = d.tp ? ' [' + d.tp + ']' : '';
    return (i + 1) + '. [' + (d.n || '?') + '](https://lotroguides.com/deeds?id=' + d.id + ')' + lv + tp;
  });
  return {
    embeds: [{
      title: '🛡️ Deed search: "' + query + '"',
      description: lines.join('\n'),
      color: 0x5b9bd5,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

async function handleItem(options) {
  var query = getOptionValue(options, 'name');
  await loadItems();
  var results = search(itemNames, itemIndex, query, 5);

  if (results.length === 0) {
    return { embeds: [embeds.missingEmbed('Item')] };
  }
  if (results.length === 1) {
    return { embeds: [embeds.itemEmbed(results[0], CDN_URL)] };
  }

  var lines = results.map(function (it, i) {
    var lv = it.lv ? ' (Lv ' + it.lv + ')' : '';
    return (i + 1) + '. [' + (it.n || '?') + '](https://lotroguides.com/items?id=' + it.id + ')' + lv;
  });
  return {
    embeds: [{
      title: '🎒 Item search: "' + query + '"',
      description: lines.join('\n'),
      color: 0xa855f7,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

async function handleMap(options) {
  var query = getOptionValue(options, 'region');
  await loadMaps();
  var results = search(mapNames, mapIndex, query, 5);

  if (results.length === 0) {
    return { embeds: [embeds.missingEmbed('Map location')] };
  }
  if (results.length === 1) {
    return { embeds: [embeds.mapEmbed(results[0])] };
  }

  var lines = results.map(function (m, i) {
    return (i + 1) + '. [' + (m.name || '?') + '](https://lotroguides.com/map?region=' + m.id + ')';
  });
  return {
    embeds: [{
      title: '🗺️ Map search: "' + query + '"',
      description: lines.join('\n'),
      color: 0x4a6741,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

async function handleBuild(options) {
  var className = (getOptionValue(options, 'class') || '').toLowerCase().replace(/ /g, '-');
  var buildName = (getOptionValue(options, 'build') || 'endgame').toLowerCase().replace(/ /g, '-');

  var validClasses = [
    'beorning', 'brawler', 'burglar', 'captain', 'champion',
    'guardian', 'hunter', 'lore-master', 'mariner', 'minstrel',
    'rune-keeper', 'warden',
  ];
  if (validClasses.indexOf(className) === -1) {
    return {
      embeds: [{
        title: '❌ Unknown class',
        description: 'Valid classes: ' + validClasses.join(', '),
        color: 0xff4444,
      }],
    };
  }

  try {
    var data = await fetchJson(CDN_URL + '/data/builds/' + className + '.json');
    var build = null;

    if (data.builds) {
      build = data.builds[buildName] || data.builds[Object.keys(data.builds)[0]];
    } else if (Array.isArray(data)) {
      build = data.find(function (b) { return (b.name || '').toLowerCase().replace(/ /g, '-') === buildName; }) || data[0];
    } else {
      build = data;
    }

    return { embeds: [embeds.buildEmbed(build, className, buildName)] };
  } catch (err) {
    return { embeds: [embeds.missingEmbed('Build for ' + className)] };
  }
}

/* ── Command router ───────────────────────────────────────────────── */

var HANDLERS = {
  quest: handleQuest,
  deed:  handleDeed,
  item:  handleItem,
  map:   handleMap,
  build: handleBuild,
};

/* ── Main entry point ─────────────────────────────────────────────── */

exports.main = async function main(args) {
  CDN_URL = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  var publicKey = process.env.DISCORD_PUBLIC_KEY || '';

  // ── Signature verification ──
  var signature = args.__ow_headers && (args.__ow_headers['x-signature-ed25519'] || '');
  var timestamp = args.__ow_headers && (args.__ow_headers['x-signature-timestamp'] || '');
  var rawBody   = args.__ow_body || '';

  // __ow_body is base64-encoded in DO Functions when the content type is application/json
  var bodyStr;
  try {
    bodyStr = Buffer.from(rawBody, 'base64').toString('utf8');
  } catch (e) {
    bodyStr = rawBody;
  }

  if (publicKey && signature && timestamp) {
    if (!verifySignature(publicKey, signature, timestamp, bodyStr)) {
      return { statusCode: 401, body: 'invalid request signature' };
    }
  }

  var body;
  try {
    body = JSON.parse(bodyStr);
  } catch (e) {
    return { statusCode: 400, body: { error: 'Invalid JSON body' } };
  }

  // ── Type 1: PING — Discord validation handshake ──
  if (body.type === 1) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { type: 1 },
    };
  }

  // ── Type 2: APPLICATION_COMMAND ──
  if (body.type === 2) {
    var commandName = body.data && body.data.name;
    var options     = body.data && body.data.options;

    var handler = HANDLERS[commandName];
    if (!handler) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          type: 4,
          data: { content: 'Unknown command: ' + commandName, flags: 64 },
        },
      };
    }

    try {
      var responseData = await handler(options);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { type: 4, data: responseData },
      };
    } catch (err) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          type: 4,
          data: {
            content: '⚠️ Something went wrong: ' + (err.message || 'Unknown error'),
            flags: 64,
          },
        },
      };
    }
  }

  // ── Type 3: MESSAGE_COMPONENT (button click, etc.) — reserved for future use ──
  if (body.type === 3) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { type: 6 }, // DEFERRED_UPDATE_MESSAGE — acknowledge without edit
    };
  }

  return { statusCode: 400, body: { error: 'Unsupported interaction type' } };
};
