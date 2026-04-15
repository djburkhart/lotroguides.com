/**
 * DO Function: /api/discord/interact
 *
 * Discord Interactions endpoint — receives slash-command webhooks from Discord,
 * verifies Ed25519 signatures, and returns rich embeds matching the LOTRO Guides
 * visual style.
 *
 * Slash commands:
 *   /quest <name>              – search quests via quest DO Function API
 *   /deed  <name>              – search deeds via deed DO Function API
 *   /item  <name>              – search items by name
 *   /guide <name>              – link to a guide on lotroguides.com
 *   /map   <region>            – link to an interactive map region
 *   /build <class> [build]     – show a class trait build
 *   /statcaps <class> <level> <penetration> [mob_level]
 *                             – calculate stat caps using Giseldah formulas
 *
 * Required env vars:
 *   DISCORD_PUBLIC_KEY  – Ed25519 public key from Discord Developer Portal
 *   DO_CDN_URL          – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 *   SITE_API_URL        – e.g. https://lotroguides.com (base URL for quest/deed API)
 */

'use strict';

var nacl    = require('tweetnacl');
var embeds  = require('./embeds');
var statCaps = require('./statcaps');

var CDN_URL = '';
var SITE_API = '';

/* ── Data caches (only for item + map which have no DO Function) ──── */

var itemIndex  = null;
var itemNames  = null;
var mapIndex   = null;
var mapNames   = null;

var loadPromises = {};

function fetchJson(url, opts) {
  return fetch(url, opts).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    return r.json();
  });
}

/* ── DO Function API helpers (quests + deeds) ─────────────────────── */

function questApiUrl(params) {
  var qs = new URLSearchParams(params).toString();
  return SITE_API + '/api/quests/lookup?' + qs;
}

function deedApiUrl(params) {
  var qs = new URLSearchParams(params).toString();
  return SITE_API + '/api/deeds/lookup?' + qs;
}

/* ── Guide catalog (static — no data loading needed) ─────────────── */

var GUIDES = [
  { slug: 'beginners-guide', title: "Beginner's Guide to LOTRO", cat: 'New Player' },
  { slug: 'starter-zones-leveling-guide-0-20', title: 'Starter Zones Leveling Guide (0-20)', cat: 'Leveling' },
  { slug: 'legendary-items-guide', title: 'Legendary Items Reforged — Complete LI Guide', cat: 'Gear' },
  { slug: 'raid-preparation-guide', title: 'Raid Preparation Guide — Consumables & Store Buffs', cat: 'Raiding' },
  { slug: 'red-line-hunter-endgame-guide', title: 'Red Line Hunter End-Game Guide (Post-Rework)', cat: 'Class' },
  { slug: 'light-of-earendil-shadow-of-mordor-guide', title: 'Light of Eärendil & Shadow of Mordor — Complete Mechanic Guide', cat: 'Mechanics' },
  { slug: 'abyss-of-mordath-raid-guide', title: 'The Abyss of Mordath — Full Raid Guide (T1 & T2)', cat: 'Raid' },
  { slug: 'hiddenhoard-of-abnankara-raid-guide', title: 'The Hiddenhoard of Abnankâra — Full Raid Guide', cat: 'Raid' },
  { slug: 'tower-of-orthanc-fire-ice-guide', title: 'Tower of Orthanc Fire and Ice T2c — Raid Guide', cat: 'Raid' },
  { slug: 'ost-dunhoth-disease-wing-guide', title: 'Ost Dunhoth Disease Wing T2c — Raid Guide', cat: 'Raid' },
  { slug: 'sarch-vorn-the-black-grave-guide', title: 'Sarch Vorn, the Black Grave — Full Instance Guide', cat: 'Instance' },
  { slug: 'court-of-seregost-guide', title: 'The Court of Seregost — Full Instance Guide', cat: 'Instance' },
  { slug: 'dungeons-of-naerband-guide', title: 'The Dungeons of Naerband — Instance Guide', cat: 'Instance' },
  { slug: 'lotro-guides-site-companion-guide', title: 'LOTRO Guides: Your Ultimate Companion for Middle-earth', cat: 'Meta' },
];

var guideNames = GUIDES.map(function (g) { return g.title.toLowerCase(); });

/* ── CDN-based loaders (items + maps only) ────────────────────────── */

function loadItems() {
  if (itemIndex) return Promise.resolve();
  if (loadPromises.items) return loadPromises.items;
  loadPromises.items = fetchJson(CDN_URL + '/data/items-db.json')
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

/* ── Titles / Factions / Recipes CDN caches ───────────────────────── */

var titleIndex = null;
var titleNames = [];

var factionIndex = null;
var factionNames = [];

var recipeIndex = null;
var recipeNames = [];

function loadTitles() {
  if (loadPromises.titles) return loadPromises.titles;
  loadPromises.titles = fetchJson(CDN_URL + '/data/titles-db.json')
    .then(function (data) {
      titleIndex = data;
      titleNames = data.map(function (t) { return (t.n || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.titles = null; throw err; });
  return loadPromises.titles;
}

function loadFactions() {
  if (loadPromises.factions) return loadPromises.factions;
  loadPromises.factions = fetchJson(CDN_URL + '/data/factions-db.json')
    .then(function (data) {
      factionIndex = data;
      factionNames = data.map(function (f) { return (f.n || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.factions = null; throw err; });
  return loadPromises.factions;
}

function loadRecipes() {
  if (loadPromises.recipes) return loadPromises.recipes;
  loadPromises.recipes = fetchJson(CDN_URL + '/data/recipes-db.json')
    .then(function (data) {
      recipeIndex = data;
      recipeNames = data.map(function (r) { return (r.n || '').toLowerCase(); });
    })
    .catch(function (err) { loadPromises.recipes = null; throw err; });
  return loadPromises.recipes;
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/-/g, ' ');
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

/* ── Search helper (for items + maps only) ────────────────────────── */

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

/* ── Autocomplete handlers ────────────────────────────────────────── */

async function autocompleteQuest(query) {
  if (!query || query.trim().length < 2) return [];
  var data = await fetchJson(questApiUrl({ q: query, limit: '25' }));
  return (data.results || []).map(function (q) {
    var label = q.n || '?';
    if (q.lv) label += ' (Lv ' + q.lv + ')';
    return { name: label.slice(0, 100), value: String(q.id) };
  });
}

async function autocompleteDeed(query) {
  if (!query || query.trim().length < 2) return [];
  var data = await fetchJson(deedApiUrl({ q: query, limit: '25' }));
  return (data.results || []).map(function (d) {
    var label = d.n || '?';
    if (d.lv) label += ' (Lv ' + d.lv + ')';
    if (d.tp) label += ' [' + d.tp + ']';
    return { name: label.slice(0, 100), value: String(d.id) };
  });
}

async function autocompleteItem(query) {
  if (!query || query.trim().length < 2) return [];
  await loadItems();
  var results = search(itemNames, itemIndex, query, 25);
  return results.map(function (it) {
    var label = it.n || '?';
    if (it.lv) label += ' (Lv ' + it.lv + ')';
    return { name: label.slice(0, 100), value: String(it.id) };
  });
}

async function autocompleteBuild(query, allOptions) {
  var className = getOptionValue(allOptions, 'class');
  if (!className) return [];
  className = className.toLowerCase().replace(/ /g, '-');
  var q = (query || '').trim().toLowerCase();

  var choices = [];

  // Fetch community builds for this class
  try {
    var listData = await fetchJson(SITE_API + '/api/builds/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', class: className, limit: 50 }),
    });
    (listData.builds || []).forEach(function (b) {
      var label = b.name || 'Unnamed';
      if (b.likes) label += ' (' + b.likes + ' ❤️)';
      label = '🌐 ' + label;
      choices.push({ name: label.slice(0, 100), value: b.id });
    });
  } catch (e) { /* community unavailable, continue */ }

  // Fetch guide builds for this class
  try {
    var classData = await fetchJson(CDN_URL + '/data/builds/' + className + '.json');
    if (classData && classData.builds) {
      Object.keys(classData.builds).forEach(function (key) {
        var gb = classData.builds[key];
        var label = '📖 ' + (gb.name || key);
        choices.push({ name: label.slice(0, 100), value: 'guide:' + key });
      });
    }
  } catch (e) { /* no guide builds */ }

  // Filter by query if provided
  if (q.length >= 1) {
    choices = choices.filter(function (c) {
      return c.name.toLowerCase().indexOf(q) !== -1;
    });
  }

  return choices.slice(0, 25);
}

async function autocompleteGuide(query) {
  var q = (query || '').trim().toLowerCase();
  if (q.length < 1) {
    // Show all guides when no query
    return GUIDES.map(function (g) {
      return { name: ('[' + g.cat + '] ' + g.title).slice(0, 100), value: g.slug };
    });
  }
  var results = [];
  for (var i = 0; i < GUIDES.length && results.length < 25; i++) {
    if (guideNames[i].includes(q) || GUIDES[i].cat.toLowerCase().includes(q) || GUIDES[i].slug.includes(q)) {
      var g = GUIDES[i];
      results.push({ name: ('[' + g.cat + '] ' + g.title).slice(0, 100), value: g.slug });
    }
  }
  return results;
}

async function autocompleteTitle(query) {
  if (!query || query.trim().length < 2) return [];
  await loadTitles();
  var results = search(titleNames, titleIndex, query, 25);
  return results.map(function (t) {
    var label = t.n || '?';
    if (t.cat) label += ' [' + t.cat + ']';
    return { name: label.slice(0, 100), value: String(t.id) };
  });
}

async function autocompleteFaction(query) {
  if (!query || query.trim().length < 2) return [];
  await loadFactions();
  var results = search(factionNames, factionIndex, query, 25);
  return results.map(function (f) {
    var label = f.n || '?';
    if (f.cat) label += ' [' + f.cat + ']';
    return { name: label.slice(0, 100), value: String(f.id) };
  });
}

async function autocompleteRecipe(query) {
  if (!query || query.trim().length < 2) return [];
  await loadRecipes();
  var results = search(recipeNames, recipeIndex, query, 25);
  return results.map(function (r) {
    var label = r.n || '?';
    if (r.prof) label += ' (' + capitalize(r.prof.toLowerCase()) + ')';
    return { name: label.slice(0, 100), value: String(r.id) };
  });
}

var AUTOCOMPLETE_HANDLERS = {
  quest:   autocompleteQuest,
  deed:    autocompleteDeed,
  item:    autocompleteItem,
  build:   autocompleteBuild,
  guide:   autocompleteGuide,
  title:   autocompleteTitle,
  faction: autocompleteFaction,
  recipe:  autocompleteRecipe,
};

/* ── Command handlers ─────────────────────────────────────────────── */

function getOptionValue(options, name) {
  if (!options) return undefined;
  for (var i = 0; i < options.length; i++) {
    if (options[i].name === name) return options[i].value;
  }
  return undefined;
}

async function handleQuest(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Quest')] };

  // Value is an ID from autocomplete selection — fetch full detail
  try {
    var detail = await fetchJson(questApiUrl({ id: value }));
    if (detail && detail.n) return { embeds: [embeds.questEmbed(detail)] };
  } catch (e) { /* fall through */ }

  // Fallback: user typed a free-text name without selecting autocomplete
  try {
    var data = await fetchJson(questApiUrl({ q: value, limit: '5' }));
    var results = data.results || [];
    if (results.length === 0) return { embeds: [embeds.missingEmbed('Quest')] };
    if (results.length === 1) {
      try {
        var d = await fetchJson(questApiUrl({ id: results[0].id }));
        if (d && d.n) return { embeds: [embeds.questEmbed(d)] };
      } catch (e2) { /* ignore */ }
      return { embeds: [embeds.questEmbed(results[0])] };
    }
    var lines = results.map(function (q, i) {
      var lv = q.lv ? ' (Lv ' + q.lv + ')' : '';
      return (i + 1) + '. [' + (q.n || '?') + '](https://lotroguides.com/quests?id=' + q.id + ')' + lv;
    });
    return {
      embeds: [{
        title: '📖 Quest search: "' + value + '"',
        description: lines.join('\n'),
        color: 0xc9aa58,
        footer: { text: results.length + ' results — LOTRO Guides' },
      }],
    };
  } catch (e) {
    return { embeds: [embeds.missingEmbed('Quest')] };
  }
}

async function handleDeed(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Deed')] };

  // Value is an ID from autocomplete selection — fetch detail from deed API
  try {
    var detail = await fetchJson(deedApiUrl({ id: value }));
    if (detail && detail.n) return { embeds: [embeds.deedEmbed(detail)] };
  } catch (e) { /* fall through */ }

  // Fallback: free-text name search
  try {
    var data = await fetchJson(deedApiUrl({ q: value, limit: '5' }));
    var results = data.results || [];
    if (results.length === 0) return { embeds: [embeds.missingEmbed('Deed')] };
    if (results.length === 1) return { embeds: [embeds.deedEmbed(results[0])] };
    var lines = results.map(function (d, i) {
      var lv = d.lv ? ' (Lv ' + d.lv + ')' : '';
      var tp = d.tp ? ' [' + d.tp + ']' : '';
      return (i + 1) + '. [' + (d.n || '?') + '](https://lotroguides.com/deeds?id=' + d.id + ')' + lv + tp;
    });
    return {
      embeds: [{
        title: '🛡️ Deed search: "' + value + '"',
        description: lines.join('\n'),
        color: 0x5b9bd5,
        footer: { text: results.length + ' results — LOTRO Guides' },
      }],
    };
  } catch (e) {
    return { embeds: [embeds.missingEmbed('Deed')] };
  }
}

async function handleItem(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Item')] };

  await loadItems();

  // Try as an ID first (from autocomplete)
  var item = null;
  for (var i = 0; i < itemIndex.length; i++) {
    if (String(itemIndex[i].id) === String(value)) { item = itemIndex[i]; break; }
  }
  if (item) return { embeds: [embeds.itemEmbed(item, CDN_URL)] };

  // Fallback: free-text search
  var results = search(itemNames, itemIndex, value, 5);
  if (results.length === 0) return { embeds: [embeds.missingEmbed('Item')] };
  if (results.length === 1) return { embeds: [embeds.itemEmbed(results[0], CDN_URL)] };

  var lines = results.map(function (it, i) {
    var lv = it.lv ? ' (Lv ' + it.lv + ')' : '';
    return (i + 1) + '. [' + (it.n || '?') + '](https://lotroguides.com/items?id=' + it.id + ')' + lv;
  });
  return {
    embeds: [{
      title: '🎒 Item search: "' + value + '"',
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
  var buildValue = (getOptionValue(options, 'build') || '').trim();

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

  // Try community build by ID first (from autocomplete — community IDs are hex)
  if (buildValue && /^[a-f0-9]{8,12}$/.test(buildValue)) {
    try {
      var record = await fetchJson(SITE_API + '/api/builds/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', id: buildValue }),
      });
      if (record && record.build) {
        return { embeds: [embeds.buildEmbed(record.build, className, record.build.name, record.likes, record.id)] };
      }
    } catch (e) { /* fall through to guide builds */ }
  }

  // Handle guide: prefix from autocomplete selection
  var guideKey = null;
  if (buildValue && buildValue.indexOf('guide:') === 0) {
    guideKey = buildValue.slice(6);
  }

  // Try guide build from static class data
  try {
    var data = await fetchJson(CDN_URL + '/data/builds/' + className + '.json');
    if (data && data.builds) {
      var buildKey = guideKey || (buildValue ? buildValue.toLowerCase().replace(/ /g, '-') : null);
      var build = buildKey ? data.builds[buildKey] : null;
      if (!build) {
        buildKey = Object.keys(data.builds)[0];
        build = data.builds[buildKey];
      }
      if (build) {
        return { embeds: [embeds.buildEmbed(build, className, buildKey)] };
      }
    }
  } catch (e) { /* fall through */ }

  return { embeds: [embeds.missingEmbed('Build for ' + className)] };
}

async function handleGuide(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Guide')] };

  // Find by slug (from autocomplete) or by name search
  var guide = null;
  for (var i = 0; i < GUIDES.length; i++) {
    if (GUIDES[i].slug === value) { guide = GUIDES[i]; break; }
  }
  if (!guide) {
    // Fallback: search by name
    var q = value.toLowerCase();
    for (var j = 0; j < GUIDES.length; j++) {
      if (guideNames[j].includes(q)) { guide = GUIDES[j]; break; }
    }
  }

  if (!guide) return { embeds: [embeds.missingEmbed('Guide')] };

  return { embeds: [embeds.guideEmbed(guide)] };
}

async function handleStatCaps(options) {
  try {
    var result = statCaps.calculateStatCaps({
      className: getOptionValue(options, 'class'),
      level: getOptionValue(options, 'level'),
      mobLevel: getOptionValue(options, 'mob_level'),
      mitigationLevel: getOptionValue(options, 'mitigation_level'),
      penetration: getOptionValue(options, 'penetration'),
    });
    return { embeds: embeds.statCapsEmbeds(result) };
  } catch (err) {
    if (err && err.expose) {
      return {
        embeds: [{
          title: '❌ Invalid /statcaps input',
          description: err.message,
          color: 0xff4444,
          footer: { text: 'LOTRO Guides' },
        }],
      };
    }
    throw err;
  }
}

/* ── Command router ───────────────────────────────────────────────── */

async function handleTitle(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Title')] };

  await loadTitles();

  // Try as ID first (from autocomplete)
  var title = null;
  for (var i = 0; i < titleIndex.length; i++) {
    if (String(titleIndex[i].id) === String(value)) { title = titleIndex[i]; break; }
  }
  if (title) return { embeds: [embeds.titleEmbed(title, CDN_URL)] };

  // Fallback: free-text search
  var results = search(titleNames, titleIndex, value, 5);
  if (results.length === 0) return { embeds: [embeds.missingEmbed('Title')] };
  if (results.length === 1) return { embeds: [embeds.titleEmbed(results[0], CDN_URL)] };

  var lines = results.map(function (t, i) {
    var cat = t.cat ? ' [' + t.cat + ']' : '';
    return (i + 1) + '. [' + (t.n || '?') + '](https://lotroguides.com/titles?id=' + t.id + ')' + cat;
  });
  return {
    embeds: [{
      title: '📜 Title search: "' + value + '"',
      description: lines.join('\n'),
      color: 0xdaa520,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

async function handleFaction(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Faction')] };

  await loadFactions();

  // Try as ID first (from autocomplete)
  var faction = null;
  for (var i = 0; i < factionIndex.length; i++) {
    if (String(factionIndex[i].id) === String(value)) { faction = factionIndex[i]; break; }
  }
  if (faction) return { embeds: [embeds.factionEmbed(faction)] };

  // Fallback: free-text search
  var results = search(factionNames, factionIndex, value, 5);
  if (results.length === 0) return { embeds: [embeds.missingEmbed('Faction')] };
  if (results.length === 1) return { embeds: [embeds.factionEmbed(results[0])] };

  var lines = results.map(function (f, i) {
    var cat = f.cat ? ' [' + f.cat + ']' : '';
    return (i + 1) + '. [' + (f.n || '?') + '](https://lotroguides.com/factions?id=' + f.id + ')' + cat;
  });
  return {
    embeds: [{
      title: '🏳️ Faction search: "' + value + '"',
      description: lines.join('\n'),
      color: 0x8b4513,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

async function handleRecipe(options) {
  var value = getOptionValue(options, 'name');
  if (!value) return { embeds: [embeds.missingEmbed('Recipe')] };

  await loadRecipes();

  // Try as ID first (from autocomplete)
  var recipe = null;
  for (var i = 0; i < recipeIndex.length; i++) {
    if (String(recipeIndex[i].id) === String(value)) { recipe = recipeIndex[i]; break; }
  }
  if (recipe) return { embeds: [embeds.recipeEmbed(recipe, CDN_URL)] };

  // Fallback: free-text search
  var results = search(recipeNames, recipeIndex, value, 5);
  if (results.length === 0) return { embeds: [embeds.missingEmbed('Recipe')] };
  if (results.length === 1) return { embeds: [embeds.recipeEmbed(results[0], CDN_URL)] };

  var lines = results.map(function (r, i) {
    var prof = r.prof ? ' (' + capitalize(r.prof.toLowerCase()) + ')' : '';
    return (i + 1) + '. [' + (r.n || '?') + '](https://lotroguides.com/recipes?id=' + r.id + ')' + prof;
  });
  return {
    embeds: [{
      title: '🔨 Recipe search: "' + value + '"',
      description: lines.join('\n'),
      color: 0xcd7f32,
      footer: { text: results.length + ' results — LOTRO Guides' },
    }],
  };
}

var HANDLERS = {
  quest:    handleQuest,
  deed:     handleDeed,
  item:     handleItem,
  map:      handleMap,
  build:    handleBuild,
  guide:    handleGuide,
  statcaps: handleStatCaps,
  title:    handleTitle,
  faction:  handleFaction,
  recipe:   handleRecipe,
};

var CT_JSON = { 'Content-Type': 'application/json' };

/* ── Webhook follow-up (for deferred responses) ──────────────────── */

function sendFollowUp(appId, token, responseData) {
  var url = 'https://discord.com/api/v10/webhooks/' + appId + '/' + token + '/messages/@original';
  return fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(responseData),
  }).catch(function (err) {
    console.error('Follow-up webhook failed:', err.message || err);
  });
}

/* ── Main entry point ─────────────────────────────────────────────── */

exports.main = async function main(args) {
  CDN_URL    = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  SITE_API   = (process.env.SITE_API_URL || '').replace(/\/$/, '');
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
      headers: CT_JSON,
      body: { type: 1 },
    };
  }

  // ── Type 2: APPLICATION_COMMAND ──
  if (body.type === 2) {
    var commandName = body.data && body.data.name;
    var options     = body.data && body.data.options;
    var appId       = process.env.DISCORD_APP_ID || body.application_id || '';
    var token       = body.token || '';

    var handler = HANDLERS[commandName];
    if (!handler) {
      return {
        statusCode: 200,
        headers: CT_JSON,
        body: {
          type: 4,
          data: { content: 'Unknown command: ' + commandName, flags: 64 },
        },
      };
    }

    // Race the handler against a 2.5s timeout.
    // Fast path → respond directly (type 4).
    // Slow path → return deferred (type 5) and send follow-up via webhook.
    var TIMEOUT_MS = 2500;
    var handlerPromise = handler(options).then(
      function (data) { return { ok: true, data: data }; },
      function (err)  { return { ok: false, err: err }; }
    );

    var result = await Promise.race([
      handlerPromise,
      new Promise(function (resolve) {
        setTimeout(function () { resolve(null); }, TIMEOUT_MS);
      }),
    ]);

    if (result !== null) {
      // Handler completed within timeout — respond directly
      if (result.ok) {
        return { statusCode: 200, headers: CT_JSON, body: { type: 4, data: result.data } };
      }
      return {
        statusCode: 200,
        headers: CT_JSON,
        body: { type: 4, data: { content: '⚠️ Something went wrong: ' + (result.err.message || 'Unknown error'), flags: 64 } },
      };
    }

    // Handler still running — fire-and-forget the follow-up webhook
    handlerPromise.then(function (res) {
      var responseData = res.ok
        ? res.data
        : { content: '⚠️ Something went wrong: ' + (res.err.message || 'Unknown error'), flags: 64 };
      return sendFollowUp(appId, token, responseData);
    });

    return { statusCode: 200, headers: CT_JSON, body: { type: 5 } };
  }

  // ── Type 4: APPLICATION_COMMAND_AUTOCOMPLETE ──
  if (body.type === 4) {
    var acCommandName = body.data && body.data.name;
    var acOptions     = body.data && body.data.options || [];

    // Find the focused option (the one the user is currently typing in)
    var focused = null;
    for (var f = 0; f < acOptions.length; f++) {
      if (acOptions[f].focused) { focused = acOptions[f]; break; }
    }

    var acHandler = AUTOCOMPLETE_HANDLERS[acCommandName];
    if (!acHandler || !focused) {
      return {
        statusCode: 200,
        headers: CT_JSON,
        body: { type: 8, data: { choices: [] } },
      };
    }

    try {
      var choices = await acHandler(focused.value || '', acOptions);
      return {
        statusCode: 200,
        headers: CT_JSON,
        body: { type: 8, data: { choices: choices.slice(0, 25) } },
      };
    } catch (err) {
      return {
        statusCode: 200,
        headers: CT_JSON,
        body: { type: 8, data: { choices: [] } },
      };
    }
  }

  // ── Type 3: MESSAGE_COMPONENT (button click, etc.) — reserved for future use ──
  if (body.type === 3) {
    return {
      statusCode: 200,
      headers: CT_JSON,
      body: { type: 6 }, // DEFERRED_UPDATE_MESSAGE — acknowledge without edit
    };
  }

  return { statusCode: 400, body: { error: 'Unsupported interaction type' } };
};
