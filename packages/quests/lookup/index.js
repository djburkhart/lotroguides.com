/**
 * DO Function: /api/quests/lookup
 *
 * Quest search and lookup API with DataTables server-side processing.
 * Caches data in memory after cold-start for fast subsequent requests.
 *
 * Endpoints:
 *   GET ?draw=N&start=0&length=100&...   – DataTables server-side processing
 *   GET ?meta=categories                 – category list with counts
 *   GET ?id=...                          – full quest record by ID
 *   GET ?q=name                          – lightweight name search (max 50)
 *
 * Required env var:
 *   DO_CDN_URL – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 */

/* ── Cached data ─────────────────────────────────────────────────────────── */

let questIndex = null;    // compact {id, n, lv} from quest-index.json
let questNames = null;    // lowercase names parallel array for ?q= search
let indexPromise = null;

let questsDb = null;      // full array from quests-db.json
let questDbMap = null;     // id → full record
let categories = null;    // [{name, count}]
let dbPromise = null;

function getCdnUrl() {
  const url = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  if (!url) throw new Error('DO_CDN_URL not configured');
  return url;
}

/* Load compact quest-index.json (for ?q= lightweight search) */
function loadIndex() {
  if (questIndex) return Promise.resolve();
  if (indexPromise) return indexPromise;

  indexPromise = fetch(getCdnUrl() + '/data/quest-index.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch quest-index.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      questIndex = data;
      questNames = data.map(function (q) { return (q.n || '').toLowerCase(); });
    })
    .catch(function (err) {
      indexPromise = null;
      throw err;
    });

  return indexPromise;
}

/* Load full quests-db.json (for SSP, detail, and meta endpoints) */
function loadDb() {
  if (questsDb) return Promise.resolve();
  if (dbPromise) return dbPromise;

  dbPromise = fetch(getCdnUrl() + '/data/quests-db.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch quests-db.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      questsDb = data;
      questDbMap = {};
      var cats = {};
      for (var i = 0; i < data.length; i++) {
        questDbMap[data[i].id] = data[i];
        var c = data[i].cat;
        if (c) cats[c] = (cats[c] || 0) + 1;
      }
      categories = Object.keys(cats).sort().map(function (k) {
        return { name: k, count: cats[k] };
      });
    })
    .catch(function (err) {
      dbPromise = null;
      throw err;
    });

  return dbPromise;
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

const SORT_COLUMNS = { n: 'n', lv: 'lv', cat: 'cat', b: 'b' };

/* ── SSP handler ─────────────────────────────────────────────────────────── */

function handleSSP(args) {
  var draw = parseInt(args.draw, 10) || 1;
  var start = Math.max(parseInt(args.start, 10) || 0, 0);
  var length = Math.min(Math.max(parseInt(args.length, 10) || 100, 1), 500);
  var search = (args.search || '').trim().toLowerCase();
  var sortCol = SORT_COLUMNS[args.sort_col] || 'lv';
  var sortDir = args.sort_dir === 'desc' ? -1 : 1;
  var catFilter = args.cat || '';
  var lvMin = parseInt(args.lv_min, 10) || 0;
  var lvMax = parseInt(args.lv_max, 10) || 999;
  var instFilter = args.inst === '1';

  // Filter
  var filtered = questsDb.filter(function (q) {
    if (search && (q.n || '').toLowerCase().indexOf(search) === -1 &&
        (q.b || '').toLowerCase().indexOf(search) === -1) return false;
    if (catFilter && q.cat !== catFilter) return false;
    var lv = q.lv || 0;
    if (lvMin > 0 && lv < lvMin) return false;
    if (lvMax < 999 && lv > lvMax) return false;
    if (instFilter && !q.inst) return false;
    return true;
  });

  // Sort
  filtered.sort(function (a, b) {
    var av = a[sortCol];
    var bv = b[sortCol];
    if (av == null) av = sortCol === 'lv' ? 0 : '';
    if (bv == null) bv = sortCol === 'lv' ? 0 : '';
    var cmp;
    if (sortCol === 'lv') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return cmp * sortDir;
  });

  // Paginate
  var page = filtered.slice(start, start + length);

  return {
    statusCode: 200,
    headers: SSP_HEADERS,
    body: {
      draw: draw,
      recordsTotal: questsDb.length,
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

  // ── Meta: category list with counts ──────────────────────────────
  if (args.meta === 'categories') {
    try { await loadDb(); } catch (err) {
      return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load quest data: ' + err.message } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: { categories: categories } };
  }

  // ── SSP: DataTables server-side processing ───────────────────────
  if (args.draw !== undefined) {
    try { await loadDb(); } catch (err) {
      return { statusCode: 502, headers: SSP_HEADERS, body: { draw: parseInt(args.draw, 10) || 1, recordsTotal: 0, recordsFiltered: 0, data: [], error: err.message } };
    }
    return handleSSP(args);
  }

  // ── Detail: full quest record by ID ──────────────────────────────
  if (args.id) {
    try { await loadDb(); } catch (err) {
      return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load quest data: ' + err.message } };
    }
    var quest = questDbMap[String(args.id)];
    if (!quest) {
      return { statusCode: 404, headers: CORS_HEADERS, body: { error: 'Quest not found' } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: quest };
  }

  // ── Search: lightweight name search (uses compact index) ─────────
  try { await loadIndex(); } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load quest data: ' + err.message } };
  }

  var q = (args.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: { error: 'Query must be at least 2 characters', results: [] },
    };
  }

  var limit = Math.min(parseInt(args.limit, 10) || 20, 50);
  var lvMin = args.lv_min ? parseInt(args.lv_min, 10) : 0;
  var lvMax = args.lv_max ? parseInt(args.lv_max, 10) : 999;

  var results = [];
  for (var i = 0; i < questNames.length && results.length < limit; i++) {
    if (questNames[i].indexOf(q) === -1) continue;
    var entry = questIndex[i];
    if (lvMin > 0 && (entry.lv || 0) < lvMin) continue;
    if (lvMax < 999 && (entry.lv || 0) > lvMax) continue;
    results.push(entry);
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: { results: results, total: results.length, q: q },
  };
};
