/**
 * CDN Upload — DigitalOcean Serverless Function
 *
 * Accepts a Google ID token + file key + base64-encoded content,
 * verifies the token, checks the email against the allowed list,
 * and uploads the file to DigitalOcean Spaces.
 *
 * Required env vars:
 *   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_REGION,
 *   GOOGLE_OAUTH_CLIENT_ID, EDITOR_ALLOWED_EMAILS
 */
'use strict';

const { S3Client, PutObjectCommand, ListObjectVersionsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const CORS_HEADERS = {
  'Content-Type': 'application/json',
};

const EDITOR_MANIFEST_KEY = 'data/editor-manifest.json';

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { data: {}, content: "" } similar to gray-matter.
 */
function parseFrontmatter(text) {
  var match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: text };

  var yaml = match[1];
  var body = match[2];
  var data = {};

  yaml.split(/\r?\n/).forEach(function (line) {
    // Handle array values: key: [val1, val2]
    var arrMatch = line.match(/^(\w[\w-]*):\s*\[([^\]]*)\]\s*$/);
    if (arrMatch) {
      data[arrMatch[1]] = arrMatch[2].split(',').map(function (s) {
        return s.trim().replace(/^["']|["']$/g, '');
      }).filter(Boolean);
      return;
    }
    // Handle scalar values: key: "value" or key: value
    var kvMatch = line.match(/^(\w[\w-]*):\s*"?(.*?)"?\s*$/);
    if (kvMatch && kvMatch[1] && kvMatch[2] !== undefined) {
      data[kvMatch[1]] = kvMatch[2];
    }
  });

  return { data: data, content: body };
}

/** Format a date value to a display string like "April 8, 2026". */
function formatDate(dateVal) {
  if (!dateVal) return '';
  var d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  var months = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

/**
 * After a content markdown file is uploaded, update the per-article JSON
 * and the editor manifest on CDN. Runs as a best-effort side effect.
 */
async function updateEditorManifest(key, buf) {
  var m = key.match(/^content\/(guides|news)\/(.+)\.md$/);
  if (!m) return;

  var category = m[1];
  var slug = m[2];
  var text = buf.toString('utf-8');
  var parsed = parseFrontmatter(text);
  var fm = parsed.data;

  // Build per-article JSON
  var articleJson = {
    slug: slug,
    category: category,
    title: fm.title || '',
    date: fm.date instanceof Date ? fm.date.toISOString().slice(0, 10) : (fm.date ? String(fm.date).slice(0, 10) : ''),
    author: fm.author || '',
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    image: fm.image || '',
    excerpt: fm.excerpt || '',
    markdown: parsed.content.trim(),
  };

  var bucket = process.env.DO_SPACES_BUCKET;
  var client = getS3Client();

  // Upload per-article JSON
  var articleKey = 'data/content/' + category + '/' + slug + '.json';
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: articleKey,
    Body: Buffer.from(JSON.stringify(articleJson), 'utf-8'),
    ContentType: 'application/json; charset=utf-8',
    ACL: 'public-read',
    CacheControl: 'public, max-age=300',
  }));

  // Read current manifest
  var manifest = [];
  try {
    var existing = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: EDITOR_MANIFEST_KEY,
    }));
    var raw = await existing.Body.transformToString('utf-8');
    manifest = JSON.parse(raw);
    if (!Array.isArray(manifest)) manifest = [];
  } catch (e) {
    // Manifest doesn't exist yet — start fresh
    manifest = [];
  }

  // Build the manifest entry
  var entry = {
    slug: slug,
    title: fm.title || slug,
    category: category,
    date: formatDate(fm.date),
    author: fm.author || '',
  };
  if (fm.draft === true || fm.draft === 'true') entry.draft = true;

  // Update or add
  var idx = manifest.findIndex(function (item) { return item.slug === slug && item.category === category; });
  if (idx !== -1) {
    manifest[idx] = entry;
  } else {
    manifest.unshift(entry);
  }

  // Upload updated manifest
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: EDITOR_MANIFEST_KEY,
    Body: Buffer.from(JSON.stringify(manifest), 'utf-8'),
    ContentType: 'application/json; charset=utf-8',
    ACL: 'public-read',
    CacheControl: 'public, max-age=60',
  }));
}

/** Shared auth helper — verifies Google token + email allowlist. */
async function authenticate(args) {
  var idToken = args.idToken;
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

/** Restrict upload keys to safe content paths. */
function isAllowedKey(key) {
  if (key.indexOf('..') !== -1) return false;
  if (key.startsWith('/')) return false;
  return key.startsWith('content/') || key.startsWith('data/') || key.startsWith('img/') || key.startsWith('drafts/');
}

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    const region = process.env.DO_SPACES_REGION || 'nyc3';
    s3Client = new S3Client({
      endpoint: 'https://' + region + '.digitaloceanspaces.com',
      region: region,
      credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET,
      },
      forcePathStyle: false,
    });
  }
  return s3Client;
}

/** Action: upload a file (versioning-aware — returns VersionId). */
async function handleUpload(args, email) {
  var key = args.key;
  var content = args.content;
  var contentType = args.contentType || 'application/octet-stream';

  if (!key || !content) {
    return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Missing key or content' } };
  }
  if (!isAllowedKey(key)) {
    return { statusCode: 403, headers: CORS_HEADERS, body: { error: 'Upload path not allowed: ' + key } };
  }

  var buf = Buffer.from(content, 'base64');
  var result = await getS3Client().send(new PutObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentType,
    ACL: 'public-read',
    CacheControl: 'public, max-age=300',
  }));

  // If a content markdown file was uploaded, update the editor manifest + article JSON
  try {
    await updateEditorManifest(key, buf);
  } catch (e) {
    // Best-effort — don't fail the upload if manifest update fails
    console.error('Manifest update failed:', e.message);
  }

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: {
      ok: true,
      key: key,
      size: buf.length,
      versionId: result.VersionId || null,
      uploadedBy: email,
    },
  };
}

/** Action: list versions of an object (requires Spaces versioning enabled). */
async function handleListVersions(args) {
  var key = args.key;
  if (!key) {
    return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Missing key' } };
  }

  var result = await getS3Client().send(new ListObjectVersionsCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Prefix: key,
  }));

  var versions = (result.Versions || [])
    .filter(function (v) { return v.Key === key; })
    .map(function (v) {
      return {
        versionId: v.VersionId,
        lastModified: v.LastModified ? v.LastModified.toISOString() : null,
        size: v.Size,
        isLatest: v.IsLatest,
        etag: (v.ETag || '').replace(/"/g, ''),
      };
    });

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: { key: key, versions: versions },
  };
}

/** Action: restore a specific version by copying it as the new current version. */
async function handleRestore(args, email) {
  var key = args.key;
  var versionId = args.versionId;

  if (!key || !versionId) {
    return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Missing key or versionId' } };
  }
  if (!isAllowedKey(key)) {
    return { statusCode: 403, headers: CORS_HEADERS, body: { error: 'Restore path not allowed: ' + key } };
  }

  // Fetch the old version
  var old = await getS3Client().send(new GetObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
    VersionId: versionId,
  }));
  var body = await old.Body.transformToByteArray();

  // Re-upload as new current version
  var result = await getS3Client().send(new PutObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
    Body: body,
    ContentType: old.ContentType || 'application/octet-stream',
    ACL: 'public-read',
    CacheControl: 'public, max-age=300',
  }));

  return {
    statusCode: 200,
    headers: CORS_HEADERS,
    body: {
      ok: true,
      key: key,
      restoredFrom: versionId,
      newVersionId: result.VersionId || null,
      restoredBy: email,
    },
  };
}

exports.main = async function main(args) {
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (args.__ow_method !== 'post') {
    return { statusCode: 405, headers: CORS_HEADERS, body: { error: 'Method not allowed' } };
  }
  if (!process.env.DO_SPACES_KEY || !process.env.DO_SPACES_SECRET || !process.env.DO_SPACES_BUCKET) {
    return { statusCode: 500, headers: CORS_HEADERS, body: { error: 'CDN storage not configured' } };
  }

  // Authenticate
  var auth = await authenticate(args);
  if (auth.error) {
    return { statusCode: auth.status, headers: CORS_HEADERS, body: { error: auth.error } };
  }

  var action = args.action || 'upload';

  try {
    switch (action) {
      case 'upload':
        return await handleUpload(args, auth.email);
      case 'versions':
        return await handleListVersions(args);
      case 'restore':
        return await handleRestore(args, auth.email);
      default:
        return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Unknown action: ' + action } };
    }
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Operation failed: ' + err.message } };
  }
};
