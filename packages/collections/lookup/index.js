/**
 * DO Function: /api/collections/lookup
 *
 * Collections search, browse, and lookup API with DataTables server-side
 * processing for the items tab. Caches data from CDN in memory.
 *
 * Endpoints:
 *   GET ?draw=N&start=0&length=100&...  – DataTables server-side processing (items)
 *   GET ?meta=sources                   – source category list with counts
 *   GET ?meta=collections               – full collections array
 *   GET ?id=...                         – single item by ID
 *   GET ?q=name                         – lightweight name search (max 50)
 *
 * Required env var:
 *   DO_CDN_URL – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 */

'use strict';

/* ── Cached data ─────────────────────────────────────────────────────────── */

let collections = null;    // array from collections-db.json
let items = null;          // array from collections-items-db.json
let itemNames = null;      // lowercase names parallel array for search
let sourceCats = null;     // [{name, count}]
let colPromise = null;
let itemsPromise = null;

function getCdnUrl() {
  const url = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  if (!url) throw new Error('DO_CDN_URL not configured');
  return url;
}

function loadCollections() {
  if (collections) return Promise.resolve();
  if (colPromise) return colPromise;

  colPromise = fetch(getCdnUrl() + '/data/collections-db.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch collections-db.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      collections = data;
    })
    .catch(function (err) {
      colPromise = null;
      throw err;
    });

  return colPromise;
}

function loadItems() {
  if (items) return Promise.resolve();
  if (itemsPromise) return itemsPromise;

  itemsPromise = fetch(getCdnUrl() + '/data/collections-items-db.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch collections-items-db.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      items = data;
      itemNames = data.map(function (d) { return (d.n || '').toLowerCase(); });

      // Build source category counts
      var cats = {};
      for (var i = 0; i < data.length; i++) {
        var sc = classifySource(data[i].src);
        if (sc) cats[sc] = (cats[sc] || 0) + 1;
      }
      sourceCats = Object.keys(cats).sort().map(function (k) {
        return { name: k, count: cats[k] };
      });
    })
    .catch(function (err) {
      itemsPromise = null;
      throw err;
    });

  return itemsPromise;
}

/* ── Source classification (mirrors client-side logic) ────────────────────── */

function classifySource(src) {
  if (!src) return '';
  var s = src.toLowerCase();
  if (s.indexOf('store') !== -1 || s.indexOf('lotro market') !== -1 || s.indexOf('mithril coin') !== -1) return 'Store';
  if (s.indexOf('festival') !== -1 || s.indexOf('anniversary') !== -1 || s.indexOf('yule') !== -1 || s.indexOf('spring') !== -1 || s.indexOf('harvest') !== -1 || s.indexOf('farmer') !== -1 || s.indexOf('mid-summer') !== -1 || s.indexOf('midsummer') !== -1) return 'Festival';
  if (s.indexOf('barter') !== -1) return 'Barter';
  if (s.indexOf('quest') !== -1) return 'Quest';
  if (s.indexOf('deed') !== -1 || s.indexOf('reputation') !== -1) return 'Deed/Reputation';
  if (s.indexOf('drop') !== -1 || s.indexOf('loot') !== -1 || s.indexOf('chance') !== -1) return 'Drop/Loot';
  if (s.indexOf('craft') !== -1) return 'Crafting';
  if (s.indexOf('pvp') !== -1 || s.indexOf('pvmp') !== -1 || s.indexOf('ettenmoors') !== -1 || s.indexOf('creep') !== -1 || s.indexOf('monster play') !== -1) return 'PvMP';
  if (s.indexOf('hobbyist') !== -1 || s.indexOf('hobby') !== -1) return 'Hobby';
  if (s.indexOf('starter') !== -1 || s.indexOf('default') !== -1 || s.indexOf('standard') !== -1) return 'Starter';
  return 'Other';
}

/* ── CORS headers ────────────────────────────────────────────────────────── */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://lotroguides.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
};

const SSP_HEADERS = Object.assign({}, CORS_HEADERS, {
  'Cache-Control': 'public, max-age=60',
});

/* ── Column name validation ──────────────────────────────────────────────── */

const SORT_COLUMNS = { n: 'n', cat: 'cat', src: 'src' };

/* ── SSP handler ─────────────────────────────────────────────────────────── */

function handleSSP(args) {
  var draw = parseInt(args.draw, 10) || 1;
  var start = Math.max(parseInt(args.start, 10) || 0, 0);
  var length = Math.min(Math.max(parseInt(args.length, 10) || 100, 1), 500);
  var search = (args.search || '').trim().toLowerCase();
  var sortCol = SORT_COLUMNS[args.sort_col] || 'n';
  var sortDir = args.sort_dir === 'desc' ? -1 : 1;
  var catFilter = args.cat || '';
  var srcFilter = args.src || '';
  var colFilter = args.col || '';

  // Filter
  var filtered = items.filter(function (item) {
    if (search && (item.n || '').toLowerCase().indexOf(search) === -1 &&
        (item.src || '').toLowerCase().indexOf(search) === -1) return false;
    if (catFilter && item.cat !== catFilter) return false;
    if (srcFilter && classifySource(item.src) !== srcFilter) return false;
    if (colFilter === 'yes' && !item.col) return false;
    if (colFilter === 'no' && item.col) return false;
    return true;
  });

  // Sort
  filtered.sort(function (a, b) {
    var av = a[sortCol];
    var bv = b[sortCol];
    if (av == null) av = '';
    if (bv == null) bv = '';
    var cmp = String(av).localeCompare(String(bv));
    return cmp * sortDir;
  });

  // Paginate
  var page = filtered.slice(start, start + length);

  return {
    statusCode: 200,
    headers: SSP_HEADERS,
    body: {
      draw: draw,
      recordsTotal: items.length,
      recordsFiltered: filtered.length,
      data: page,
    },
  };
}

/* ── Main entry point ────────────────────────────────────────────────────── */

exports.main = async function main(args) {
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  if (args.__ow_method && args.__ow_method !== 'get') {
    return { statusCode: 405, headers: CORS_HEADERS, body: { error: 'Method not allowed' } };
  }

  // ── Meta: source category list with counts ─────────────────────────
  if (args.meta === 'sources') {
    try { await loadItems(); } catch (err) {
      return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load items data: ' + err.message } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: { sources: sourceCats } };
  }

  // ── Meta: full collections array ───────────────────────────────────
  if (args.meta === 'collections') {
    try { await loadCollections(); } catch (err) {
      return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load collections data: ' + err.message } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: { collections: collections } };
  }

  // ── SSP: DataTables server-side processing ─────────────────────────
  if (args.draw) {
    try { await loadItems(); } catch (err) {
      return { statusCode: 502, headers: SSP_HEADERS, body: { error: 'Failed to load items data: ' + err.message } };
    }
    return handleSSP(args);
  }

  // ── Single item lookup by ID ───────────────────────────────────────
  if (args.id) {
    try { await loadItems(); } catch (err) {
      return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load items data: ' + err.message } };
    }
    var id = String(args.id);
    var found = items.find(function (item) { return String(item.id) === id; });
    if (!found) {
      return { statusCode: 404, headers: CORS_HEADERS, body: { error: 'Item not found' } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: found };
  }

  // ── Lightweight name search ────────────────────────────────────────
  if (args.q) {
    var q = (args.q || '').trim().toLowerCase();
    if (q.length < 2) {
      return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Query must be at least 2 characters', results: [] } };
    }
    try { await loadItems(); } catch (err) {
      return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load items data: ' + err.message } };
    }
    var results = [];
    for (var i = 0; i < itemNames.length && results.length < 50; i++) {
      if (itemNames[i].indexOf(q) !== -1) {
        results.push(items[i]);
      }
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: { results: results } };
  }

  return {
    statusCode: 400,
    headers: CORS_HEADERS,
    body: { error: 'Provide at least one parameter: draw (SSP), meta, id, or q' },
  };
};
