/**
 * DO Function: /api/quests/lookup
 *
 * Quest search and lookup API. Fetches quest-index.json from DigitalOcean
 * Spaces CDN at cold-start, then caches in memory for fast subsequent lookups.
 *
 * Endpoints:
 *   GET /api/quests/lookup?q=name     – search by name (min 2 chars), returns up to 50 matches
 *   GET /api/quests/lookup?id=...     – check if a single quest ID has map overlay data
 *
 * Required env var:
 *   DO_CDN_URL – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 */

let questIndex = null;
let questNames = null;
let loadPromise = null;

function loadIndex() {
  if (questIndex) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const cdnUrl = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  if (!cdnUrl) return Promise.reject(new Error('DO_CDN_URL not configured'));

  loadPromise = fetch(cdnUrl + '/data/quest-index.json')
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to fetch quest-index.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      questIndex = data;
      questNames = data.map(function (q) { return (q.n || '').toLowerCase(); });
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
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to load quest data: ' + err.message } };
  }

  // Single ID existence check — used by map to verify quest has overlay data
  const id = args.id;
  if (id) {
    const idx = questIndex.findIndex(q => q.id === String(id));
    if (idx === -1) {
      return { statusCode: 404, headers: CORS_HEADERS, body: { error: 'Quest not found' } };
    }
    return { statusCode: 200, headers: CORS_HEADERS, body: questIndex[idx] };
  }

  // Name search
  const q = (args.q || '').trim().toLowerCase();
  if (q.length < 2) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: { error: 'Query must be at least 2 characters', results: [] },
    };
  }

  const limit = Math.min(parseInt(args.limit, 10) || 20, 50);
  const lvMin = args.lv_min ? parseInt(args.lv_min, 10) : 0;
  const lvMax = args.lv_max ? parseInt(args.lv_max, 10) : 999;

  const results = [];
  for (let i = 0; i < questNames.length && results.length < limit; i++) {
    if (!questNames[i].includes(q)) continue;
    const entry = questIndex[i];
    if (lvMin > 0 && (entry.lv || 0) < lvMin) continue;
    if (lvMax < 999 && (entry.lv || 0) > lvMax) continue;
    results.push(entry);
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: { results, total: results.length, q },
  };
};
