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
  'Access-Control-Allow-Origin': 'https://lotroguides.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
