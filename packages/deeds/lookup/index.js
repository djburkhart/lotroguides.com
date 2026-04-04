/**
 * DO Function: /api/deeds/lookup
 *
 * Deed search, browse, and lookup API. Fetches deed-index.json from DigitalOcean
 * Spaces CDN at cold-start, then caches in memory for fast subsequent lookups.
 *
 * Endpoints:
 *   GET /api/deeds/lookup?id=...                – single deed lookup from index
 *   GET /api/deeds/lookup?q=name                – search by name (min 2 chars)
 *   GET /api/deeds/lookup?region=...            – browse/filter by region
 *   GET /api/deeds/lookup?type=...              – filter by deed type
 *   GET /api/deeds/lookup?cls=...               – filter by required class
 *   GET /api/deeds/lookup?reward=...            – filter by reward type (LP, Virtue, etc.)
 *   GET /api/deeds/lookup?region=...&type=...   – combine filters
 *
 * Pagination:  ?limit=N&offset=M  (default limit 200, max 500)
 *
 * Required env var:
 *   DO_CDN_URL – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 */

let deedIndex = null;
let deedNames = null;
let loadPromise = null;

function loadIndex() {
  if (deedIndex) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const cdnUrl = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  if (!cdnUrl) return Promise.reject(new Error('DO_CDN_URL not configured'));

  loadPromise = fetch(cdnUrl + '/data/deed-index.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch deed-index.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      deedIndex = data;
      deedNames = data.map(function (d) { return (d.n || '').toLowerCase(); });
    })
    .catch(function (err) {
      loadPromise = null; // Allow retry on next invocation
      throw err;
    });

  return loadPromise;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://lotroguides.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
};

exports.main = async function main(args) {
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  if (args.__ow_method && args.__ow_method !== 'get') {
    return { statusCode: 405, headers: CORS_HEADERS, body: { error: 'Method not allowed' } };
  }

  try {
    await loadIndex();
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load deed data: ' + err.message } };
  }

  // Single ID lookup
  const id = args.id;
  if (id) {
    const idx = deedIndex.findIndex(d => d.id === String(id));
    if (idx === -1) {
      return { statusCode: 404, headers: CORS_HEADERS, body: { error: 'Deed not found' } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: deedIndex[idx] };
  }

  // Collect filters
  const q = (args.q || '').trim().toLowerCase();
  const typeFilter = (args.type || '').trim();
  const regionFilter = (args.region || '').trim();
  const classFilter = (args.cls || '').trim();
  const rewardFilter = (args.reward || '').trim();
  const lvMin = args.lv_min ? parseInt(args.lv_min, 10) : 0;
  const lvMax = args.lv_max ? parseInt(args.lv_max, 10) : 999;

  const hasFilter = q || typeFilter || regionFilter || classFilter || rewardFilter || lvMin > 0 || lvMax < 999;
  if (!hasFilter) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: { error: 'At least one filter parameter is required (q, region, type, cls, reward, lv_min, lv_max)', results: [] },
    };
  }

  // Name search requires at least 2 chars
  if (q && q.length < 2) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: { error: 'Query must be at least 2 characters', results: [] },
    };
  }

  const limit = Math.min(parseInt(args.limit, 10) || 200, 500);
  const offset = Math.max(parseInt(args.offset, 10) || 0, 0);
  const regionLower = regionFilter.toLowerCase();

  // Count total matches and collect paginated results
  let matched = 0;
  const results = [];
  for (let i = 0; i < deedIndex.length; i++) {
    const entry = deedIndex[i];

    // Apply filters
    if (q && !deedNames[i].includes(q)) continue;
    if (typeFilter && entry.tp !== typeFilter) continue;
    if (regionLower && (entry.rg || '').toLowerCase() !== regionLower) continue;
    if (classFilter && (entry.cl || '') !== classFilter) continue;
    if (rewardFilter && !(entry.rw && entry.rw.some(function (r) { return r.t === rewardFilter; }))) continue;
    if (lvMin > 0 && (entry.lv || 0) < lvMin) continue;
    if (lvMax < 999 && (entry.lv || 0) > lvMax) continue;

    matched++;
    if (matched > offset && results.length < limit) {
      results.push(entry);
    }
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: { results, total: matched, q: q || undefined, offset, limit },
  };
};
