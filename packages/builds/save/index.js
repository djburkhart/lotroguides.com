/**
 * User Builds — DigitalOcean Serverless Function
 *
 * Handles saving user trait builds to the CDN and per-build likes.
 *
 * Actions:
 *   save  — Persist a build JSON to data/builds/user-builds/{id}.json
 *   like  — Increment the like count for a specific build
 *   get   — Retrieve a single build by ID
 *   list  — List recent builds (optionally filtered by class)
 *
 * Required env vars:
 *   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION
 */
'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const PREFIX = 'data/builds/user-builds/';
const MAX_BUILD_SIZE = 50 * 1024; // 50 KB cap per build
const VALID_CLASSES = [
  'beorning', 'brawler', 'burglar', 'captain', 'champion',
  'guardian', 'hunter', 'lore-master', 'mariner', 'minstrel',
  'rune-keeper', 'warden',
];

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ── S3 client (lazy singleton) ─────────────────────────────────────────── */

let s3;
function getS3() {
  if (!s3) {
    const region = process.env.DO_SPACES_REGION || 'nyc3';
    s3 = new S3Client({
      endpoint: 'https://' + region + '.digitaloceanspaces.com',
      region: region,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET,
      },
      forcePathStyle: false,
    });
  }
  return s3;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function respond(statusCode, body) {
  return { statusCode: statusCode, headers: CORS_HEADERS, body: body };
}

/** Read a JSON object from Spaces. Returns null if not found. */
async function readJSON(key) {
  try {
    const res = await getS3().send(new GetObjectCommand({
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: key,
    }));
    const text = await res.Body.transformToString('utf-8');
    return JSON.parse(text);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** Write a JSON object to Spaces (public-read, short cache). */
async function writeJSON(key, data) {
  await getS3().send(new PutObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
    ACL: 'public-read',
    CacheControl: 'public, max-age=60',
  }));
}

/** Generate a short unique build ID (8-char hex from SHA-256 of content + timestamp). */
function generateBuildId(content) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(content) + Date.now().toString());
  return hash.digest('hex').substring(0, 12);
}

/** Validate & sanitise a build payload. Returns { build, error }. */
function validateBuild(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Missing build data' };

  const cls = String(raw.class || '').toLowerCase();
  if (!VALID_CLASSES.includes(cls)) return { error: 'Invalid class: ' + cls };

  const name = String(raw.name || '').trim().substring(0, 100);
  if (!name) return { error: 'Build name is required' };

  const points = raw.points && typeof raw.points === 'object' ? raw.points : {};
  // Ensure all point values are non-negative integers
  for (const key of Object.keys(points)) {
    const v = parseInt(points[key], 10);
    if (isNaN(v) || v < 0 || v > 20) return { error: 'Invalid point value for ' + key };
    points[key] = v;
  }

  const virtues = Array.isArray(raw.virtues)
    ? raw.virtues.filter(function (v) { return typeof v === 'string'; }).slice(0, 5)
    : [];

  const level = parseInt(raw.level, 10);
  if (isNaN(level) || level < 1 || level > 200) return { error: 'Invalid level' };

  const description = String(raw.description || '').trim().substring(0, 500);

  return {
    build: {
      class: cls,
      name: name,
      description: description,
      points: points,
      virtues: virtues,
      level: level,
    },
  };
}

/* ── Actions ────────────────────────────────────────────────────────────── */

/** Save a new build. */
async function handleSave(args) {
  const { build, error } = validateBuild(args.build || args);
  if (error) return respond(400, { error: error });

  const id = generateBuildId(build);
  const key = PREFIX + id + '.json';

  const record = {
    id: id,
    build: build,
    likes: 0,
    createdAt: new Date().toISOString(),
  };

  // Sanity-check total size
  const payload = JSON.stringify(record);
  if (payload.length > MAX_BUILD_SIZE) {
    return respond(400, { error: 'Build data too large' });
  }

  await writeJSON(key, record);

  return respond(200, { ok: true, id: id, url: key });
}

/** Increment likes for a specific build. */
async function handleLike(args) {
  const id = String(args.id || '').replace(/[^a-f0-9]/gi, '');
  if (!id) return respond(400, { error: 'Missing build id' });

  const key = PREFIX + id + '.json';
  const record = await readJSON(key);
  if (!record) return respond(404, { error: 'Build not found' });

  record.likes = (record.likes || 0) + 1;
  await writeJSON(key, record);

  return respond(200, { ok: true, id: id, likes: record.likes });
}

/** Decrement likes for a specific build. */
async function handleUnlike(args) {
  const id = String(args.id || '').replace(/[^a-f0-9]/gi, '');
  if (!id) return respond(400, { error: 'Missing build id' });

  const key = PREFIX + id + '.json';
  const record = await readJSON(key);
  if (!record) return respond(404, { error: 'Build not found' });

  record.likes = Math.max(0, (record.likes || 0) - 1);
  await writeJSON(key, record);

  return respond(200, { ok: true, id: id, likes: record.likes });
}

/** Retrieve a single build. */
async function handleGet(args) {
  const id = String(args.id || '').replace(/[^a-f0-9]/gi, '');
  if (!id) return respond(400, { error: 'Missing build id' });

  const key = PREFIX + id + '.json';
  const record = await readJSON(key);
  if (!record) return respond(404, { error: 'Build not found' });

  return respond(200, record);
}

/** List recent builds (optionally filtered by class). */
async function handleList(args) {
  const filterClass = args.class ? String(args.class).toLowerCase() : null;
  if (filterClass && !VALID_CLASSES.includes(filterClass)) {
    return respond(400, { error: 'Invalid class filter' });
  }

  const limit = Math.min(parseInt(args.limit, 10) || 50, 200);

  // List all build keys under the prefix
  const res = await getS3().send(new ListObjectsV2Command({
    Bucket: process.env.DO_SPACES_BUCKET,
    Prefix: PREFIX,
    MaxKeys: 1000,
  }));

  const keys = (res.Contents || [])
    .sort(function (a, b) { return (b.LastModified || 0) - (a.LastModified || 0); })
    .slice(0, limit + 50); // fetch a few extra to account for class filtering

  // Fetch each build (in parallel, capped at 20 concurrency)
  const builds = [];
  const batchSize = 20;
  for (let i = 0; i < keys.length && builds.length < limit; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(function (obj) {
      return readJSON(obj.Key).catch(function () { return null; });
    }));
    for (const rec of results) {
      if (!rec || !rec.build) continue;
      if (filterClass && rec.build.class !== filterClass) continue;
      builds.push({ id: rec.id, build: rec.build, likes: rec.likes || 0, createdAt: rec.createdAt });
      if (builds.length >= limit) break;
    }
  }

  return respond(200, { builds: builds, total: builds.length });
}

/* ── Entry point ────────────────────────────────────────────────────────── */

exports.main = async function main(args) {
  // CORS preflight
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const action = String(args.action || '').toLowerCase();
  if (!['save', 'like', 'unlike', 'get', 'list'].includes(action)) {
    return respond(400, { error: 'Unknown action. Use: save, like, unlike, get, list' });
  }

  if (!process.env.DO_SPACES_KEY || !process.env.DO_SPACES_SECRET || !process.env.DO_SPACES_BUCKET) {
    return respond(500, { error: 'CDN storage not configured' });
  }

  try {
    switch (action) {
      case 'save':   return await handleSave(args);
      case 'like':   return await handleLike(args);
      case 'unlike': return await handleUnlike(args);
      case 'get':    return await handleGet(args);
      case 'list':   return await handleList(args);
    }
  } catch (err) {
    return respond(502, { error: 'Operation failed: ' + err.message });
  }
};
