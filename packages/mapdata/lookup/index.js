/**
 * DO Function: /api/mapdata/lookup
 *
 * Unified map overlay API for quests, deeds, and mobs.
 * Returns geo-located marker data for the interactive map.
 *
 * Endpoints:
 *   GET ?type=quest&id=DID  → quest overlay (steps + objectives with coordinates)
 *   GET ?type=deed&id=DID   → deed overlay (objective points)
 *   GET ?type=mob&id=DID    → mob spawn points from marker data
 *
 * Data sources (fetched from CDN):
 *   Quest:  data/lore/quests/{id}.json      (per-quest files)
 *   Deed:   data/deed-overlay.json          (cached in memory)
 *   Mob:    data/lore/markers/{id}.json     (per-DID files from LotRO Companion markers)
 *
 * Required env var:
 *   DO_CDN_URL – e.g. https://lotroguides.atl1.cdn.digitaloceanspaces.com
 */

'use strict';

/* ── Cached data ─────────────────────────────────────────────────────────── */

let deedOverlayData = null;
let deedLoadPromise = null;

function getCdnUrl() {
  const url = (process.env.DO_CDN_URL || '').replace(/\/$/, '');
  if (!url) throw new Error('DO_CDN_URL not configured');
  return url;
}

function loadDeedOverlay() {
  if (deedOverlayData) return Promise.resolve();
  if (deedLoadPromise) return deedLoadPromise;

  deedLoadPromise = fetch(getCdnUrl() + '/data/deed-overlay.json')
    .then(function (r) {
      if (!r.ok) throw new Error('deed-overlay.json: ' + r.status);
      return r.json();
    })
    .then(function (data) {
      deedOverlayData = data;
    })
    .catch(function (err) {
      deedLoadPromise = null;
      throw err;
    });

  return deedLoadPromise;
}

/* ── CORS ────────────────────────────────────────────────────────────────── */

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'https://lotroguides.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
};

/* ── Main ────────────────────────────────────────────────────────────────── */

exports.main = async function main(args) {
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  if (args.__ow_method && args.__ow_method !== 'get') {
    return { statusCode: 405, headers: CORS_HEADERS, body: { error: 'Method not allowed' } };
  }

  const type = (args.type || '').trim().toLowerCase();
  const id = (args.id || '').trim();

  if (!type || !id) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: { error: 'Parameters required: type (quest|deed|mob) and id' },
    };
  }

  // Validate id is numeric (DID format)
  if (!/^\d+$/.test(id)) {
    return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Invalid id format' } };
  }

  try {
    switch (type) {
      case 'quest':
        return await handleQuest(id);
      case 'deed':
        return await handleDeed(id);
      case 'mob':
        return await handleMob(id);
      default:
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: { error: 'Invalid type. Use: quest, deed, or mob' },
        };
    }
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: { error: 'Lookup failed: ' + err.message },
    };
  }
};

/* ── Quest handler ───────────────────────────────────────────────────────── */

async function handleQuest(id) {
  const url = getCdnUrl() + '/data/lore/quests/' + encodeURIComponent(id) + '.json';
  const res = await fetch(url);

  if (!res.ok) {
    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: { error: 'Quest overlay not found' },
    };
  }

  const data = await res.json();
  return { statusCode: 200, headers: CORS_HEADERS, body: data };
}

/* ── Deed handler ────────────────────────────────────────────────────────── */

async function handleDeed(id) {
  await loadDeedOverlay();

  const deed = deedOverlayData[id];
  if (!deed) {
    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: { error: 'Deed overlay not found' },
    };
  }

  return { statusCode: 200, headers: CORS_HEADERS, body: deed };
}

/* ── Mob handler ─────────────────────────────────────────────────────────── */

async function handleMob(id) {
  const url = getCdnUrl() + '/data/lore/markers/' + encodeURIComponent(id) + '.json';
  const res = await fetch(url);

  if (!res.ok) {
    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: { error: 'Mob marker data not found' },
    };
  }

  const data = await res.json();
  return { statusCode: 200, headers: CORS_HEADERS, body: data };
}
