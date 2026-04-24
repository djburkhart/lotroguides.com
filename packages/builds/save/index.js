/**
 * User Builds — DigitalOcean Serverless Function
 *
 * Handles saving user trait builds to the CDN and per-build likes.
 * Maintains a lightweight manifest for efficient listing and stats.
 *
 * Actions:
 *   save   — Persist a build JSON to data/builds/user-builds/{id}.json
 *   like   — Increment the like count for a specific build
 *   unlike — Decrement the like count for a specific build
 *   get    — Retrieve a single build by ID
 *   list   — List recent builds (optionally filtered by class)
 *   stats  — Per-class build count and like totals
 *   delete — Remove a build (editor auth required)
 *
 * Required env vars:
 *   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION
 */
'use strict';

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

const PREFIX = 'data/builds/user-builds/';
const MAX_BUILD_SIZE = 50 * 1024; // 50 KB cap per build
const VALID_CLASSES = [
  'beorning', 'brawler', 'burglar', 'captain', 'champion',
  'guardian', 'hunter', 'lore-master', 'mariner', 'minstrel',
  'rune-keeper', 'warden',
];
const VALID_SPECS = ['blue', 'red', 'yellow'];

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

/* ── Manifest management ────────────────────────────────────────────────── */

const MANIFEST_KEY = PREFIX + 'manifest.json';

/** Read the community builds manifest. */
async function readManifest() {
  var data = await readJSON(MANIFEST_KEY);
  if (!data || !Array.isArray(data.builds)) return { builds: [], updated: null };
  return data;
}

/** Write the community builds manifest. */
async function writeManifest(manifest) {
  manifest.updated = new Date().toISOString();
  await writeJSON(MANIFEST_KEY, manifest);
}

/** Create a lightweight manifest entry from a full build record. */
function toManifestEntry(record) {
  var build = record.build;
  var ps = { b: 0, r: 0, y: 0 };
  if (build.points) {
    Object.keys(build.points).forEach(function (key) {
      var v = build.points[key] || 0;
      if (key.indexOf('b-') === 0) ps.b += v;
      else if (key.indexOf('r-') === 0) ps.r += v;
      else if (key.indexOf('y-') === 0) ps.y += v;
    });
  }
  return {
    id: record.id,
    class: build.class,
    name: build.name,
    desc: build.description || '',
    specialization: build.specialization || null,
    level: build.level || 160,
    likes: record.likes || 0,
    ps: ps,
    virtues: build.virtues || [],
    createdAt: record.createdAt,
  };
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
  const specialization = VALID_SPECS.includes(String(raw.specialization || '').toLowerCase())
    ? String(raw.specialization).toLowerCase()
    : null;

  return {
    build: {
      class: cls,
      name: name,
      description: description,
      specialization: specialization,
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

  // Update manifest with new entry
  var manifest = await readManifest();
  manifest.builds.push(toManifestEntry(record));
  await writeManifest(manifest);

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

  // Update manifest likes
  var manifest = await readManifest();
  var entry = manifest.builds.find(function (b) { return b.id === id; });
  if (entry) {
    entry.likes = record.likes;
    await writeManifest(manifest);
  }

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

  // Update manifest likes
  var manifest = await readManifest();
  var entry = manifest.builds.find(function (b) { return b.id === id; });
  if (entry) {
    entry.likes = record.likes;
    await writeManifest(manifest);
  }

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

/** List recent builds (optionally filtered by class). Uses manifest for efficiency. */
async function handleList(args) {
  const filterClass = args.class ? String(args.class).toLowerCase() : null;
  if (filterClass && !VALID_CLASSES.includes(filterClass)) {
    return respond(400, { error: 'Invalid class filter' });
  }

  const limit = Math.min(parseInt(args.limit, 10) || 50, 200);
  const offset = parseInt(args.offset, 10) || 0;

  var manifest = await readManifest();
  var builds = manifest.builds;

  if (filterClass) {
    builds = builds.filter(function (b) { return b.class === filterClass; });
  }

  // Sort: most likes first, then newest first
  builds.sort(function (a, b) {
    if ((b.likes || 0) !== (a.likes || 0)) return (b.likes || 0) - (a.likes || 0);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return respond(200, {
    builds: builds.slice(offset, offset + limit),
    total: builds.length,
  });
}

/** Verify a Google ID token and check the editor allowlist. */
async function authenticateEditor(idToken) {
  if (!idToken) return { error: 'Missing idToken', status: 401 };
  var payload;
  try {
    var res = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken)
    );
    if (!res.ok) throw new Error('Invalid token');
    payload = await res.json();
  } catch (err) {
    return { error: 'Authentication failed: ' + err.message, status: 401 };
  }
  var expectedClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (expectedClientId && payload.aud !== expectedClientId) {
    return { error: 'Token audience mismatch', status: 401 };
  }
  var email = (payload.email || '').toLowerCase();
  var allowed = (process.env.EDITOR_ALLOWED_EMAILS || '').split(',')
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(Boolean);
  if (!email || (allowed.length > 0 && allowed.indexOf(email) === -1)) {
    return { error: 'Access denied for ' + email, status: 403 };
  }
  return { email: email };
}

/** Delete a build by ID (editor auth required). */
async function handleDelete(args) {
  var auth = await authenticateEditor(args.idToken);
  if (auth.error) return respond(auth.status, { error: auth.error });

  const id = String(args.id || '').replace(/[^a-f0-9]/gi, '');
  if (!id) return respond(400, { error: 'Missing build id' });

  const key = PREFIX + id + '.json';
  const record = await readJSON(key);
  if (!record) return respond(404, { error: 'Build not found' });

  // Delete the file from Spaces
  await getS3().send(new DeleteObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
  }));

  // Remove from manifest
  var manifest = await readManifest();
  manifest.builds = manifest.builds.filter(function (b) { return b.id !== id; });
  await writeManifest(manifest);

  return respond(200, { ok: true, id: id, deletedBy: auth.email });
}

/** Return per-class build counts and like totals. */
async function handleStats() {
  var manifest = await readManifest();
  var stats = {};
  var totalBuilds = 0;
  var totalLikes = 0;

  manifest.builds.forEach(function (b) {
    var cls = b.class;
    if (!stats[cls]) stats[cls] = { count: 0, likes: 0 };
    stats[cls].count++;
    stats[cls].likes += (b.likes || 0);
    totalBuilds++;
    totalLikes += (b.likes || 0);
  });

  return respond(200, { stats: stats, totalBuilds: totalBuilds, totalLikes: totalLikes });
}

/* ── Entry point ────────────────────────────────────────────────────────── */

exports.main = async function main(args) {
  // CORS preflight
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }

  const action = String(args.action || '').toLowerCase();
  if (!['save', 'like', 'unlike', 'get', 'list', 'stats', 'delete'].includes(action)) {
    return respond(400, { error: 'Unknown action. Use: save, like, unlike, get, list, stats, delete' });
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
      case 'stats':  return await handleStats();
      case 'delete': return await handleDelete(args);
    }
  } catch (err) {
    return respond(502, { error: 'Operation failed: ' + err.message });
  }
};
