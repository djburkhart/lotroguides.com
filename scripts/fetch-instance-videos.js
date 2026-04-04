#!/usr/bin/env node
/**
 * Fetch YouTube videos related to each LOTRO instance.
 *
 * Searches YouTube Data API v3 for "LOTRO <instance name>" and caches
 * the top 4 results per instance into data/instance-videos.json.
 *
 * Usage:  node scripts/fetch-instance-videos.js
 * Env:    YOUTUBE_API_KEY (required)
 *
 * The output file is consumed at build time by build.js to inject
 * a "Strategy Videos" section into each instance detail page.
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) {
  console.error('YOUTUBE_API_KEY is required. Set it in .env');
  process.exit(1);
}

const INSTANCES_PATH = path.join(__dirname, '..', 'data', 'instances-db.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'instance-videos.json');
const MAX_PER_INSTANCE = 4;

// Rate-limit: wait between requests to be nice to the API
const DELAY_MS = 250;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchVideos(query) {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(MAX_PER_INSTANCE),
    order: 'relevance',
    safeSearch: 'none',
    key: API_KEY,
  });
  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.items || []).map(item => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    published: item.snippet.publishedAt,
    thumbnail: (item.snippet.thumbnails.medium || item.snippet.thumbnails.default || {}).url || '',
  }));
}

async function main() {
  if (!fs.existsSync(INSTANCES_PATH)) {
    console.error('instances-db.json not found. Run build first.');
    process.exit(1);
  }

  const instances = JSON.parse(fs.readFileSync(INSTANCES_PATH, 'utf8'));
  console.log(`Fetching YouTube videos for ${instances.length} instances...`);

  // Load existing cache to preserve results and avoid redundant queries
  let cache = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')); } catch (e) { /* ignore */ }
  }

  let fetched = 0;
  let skipped = 0;

  for (const inst of instances) {
    // Skip if already cached with results
    if (cache[inst.slug] && cache[inst.slug].length > 0) {
      skipped++;
      continue;
    }

    const query = `LOTRO ${inst.name} guide`;
    try {
      const videos = await searchVideos(query);
      cache[inst.slug] = videos;
      fetched++;
      if (videos.length) {
        console.log(`  ✓ ${inst.name}: ${videos.length} videos`);
      } else {
        console.log(`  - ${inst.name}: no results`);
      }
    } catch (err) {
      console.error(`  ✗ ${inst.name}: ${err.message}`);
      cache[inst.slug] = [];
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 2));
  console.log(`\nDone. Fetched: ${fetched}, Cached: ${skipped}. Saved to ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
