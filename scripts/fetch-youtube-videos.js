#!/usr/bin/env node
/**
 * fetch-youtube-videos.js
 *
 * Fetches recent videos from a YouTube channel using the YouTube Data API v3
 * and writes them to content/media/videos.json for the build.
 *
 * Required env var: YOUTUBE_API_KEY
 * Optional env vars:
 *   YOUTUBE_CHANNEL_HANDLE  (default: @lordoftherings)
 *   YOUTUBE_MAX_RESULTS     (default: 50)
 *
 * Usage:
 *   node scripts/fetch-youtube-videos.js
 *
 * API docs: https://developers.google.com/youtube/v3
 */
'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const https = require('https');

const API_KEY         = process.env.YOUTUBE_API_KEY;
const CHANNEL_HANDLE  = process.env.YOUTUBE_CHANNEL_HANDLE || '@lordoftherings';
const MAX_RESULTS     = parseInt(process.env.YOUTUBE_MAX_RESULTS, 10) || 50;
const OUTPUT          = path.join(__dirname, '..', 'content', 'media', 'videos.json');

if (!API_KEY) {
  console.error('Error: YOUTUBE_API_KEY env var is required.');
  console.error('Get one at https://console.cloud.google.com/apis/credentials');
  console.error('Enable "YouTube Data API v3" for your project.');
  process.exit(1);
}

// ── HTTP helper ─────────────────────────────────────────────────────────────
function apiGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          let detail = '';
          try { detail = ': ' + JSON.parse(body).error.message; } catch (_) { detail = ': ' + body.slice(0, 200); }
          return reject(new Error(`HTTP ${res.statusCode} for ${url.pathname}${detail}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Failed to parse API response'));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── Resolve channel handle → channel ID ─────────────────────────────────────
async function resolveChannelId(handle) {
  // Try forHandle first (works for @handles)
  const cleanHandle = handle.replace(/^@/, '');
  const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(cleanHandle)}&key=${API_KEY}`;
  const data = await apiGet(url);

  if (data.items && data.items.length > 0) {
    return data.items[0].id;
  }

  // Fallback: search for the channel by name
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1&key=${API_KEY}`;
  const searchData = await apiGet(searchUrl);

  if (searchData.items && searchData.items.length > 0) {
    return searchData.items[0].snippet.channelId;
  }

  throw new Error(`Could not resolve channel ID for "${handle}"`);
}

// ── Fetch videos from channel ───────────────────────────────────────────────
async function fetchChannelVideos(channelId) {
  const allVideos = [];
  let pageToken = '';
  let remaining = MAX_RESULTS;

  while (remaining > 0) {
    const perPage = Math.min(remaining, 50);
    let url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=${perPage}&key=${API_KEY}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await apiGet(url);

    if (!data.items || data.items.length === 0) break;

    for (const item of data.items) {
      allVideos.push({
        title: item.snippet.title,
        youtubeId: item.id.videoId,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
      });
    }

    remaining -= data.items.length;
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }

  return allVideos;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Fetching videos from YouTube channel ${CHANNEL_HANDLE} …`);

  const channelId = await resolveChannelId(CHANNEL_HANDLE);
  console.log(`  Resolved channel ID: ${channelId}`);

  const videos = await fetchChannelVideos(channelId);
  console.log(`  Found ${videos.length} videos`);

  // Sort by publish date (newest first)
  videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // Write output
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(videos, null, 2));
  console.log(`  ✓ Written to ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch(err => {
  console.error('YouTube fetch failed:', err.message);
  process.exit(1);
});
