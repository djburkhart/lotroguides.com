'use strict';

const path = require('path');
const fs = require('fs');
require('dotenv').config();

const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const fastifyCors = require('@fastify/cors');
const fastifyMultipart = require('@fastify/multipart');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT = __dirname;

/* ── Fastify instance ───────────────────────────────────────────────────── */

const app = Fastify({ logger: false });

/* ── Plugins ────────────────────────────────────────────────────────────── */

app.register(fastifyCors, { origin: true });

app.register(fastifyMultipart, { limits: { fileSize: 10 * 1024 * 1024 } });

app.register(fastifyStatic, {
  root: ROOT,
  prefix: '/',
  decorateReply: true,
  extensions: ['html'],    // clean URLs: /skills → /skills.html
  redirect: false,         // don't redirect /guides → /guides/ (prefer guides.html)
  index: 'index.html',
});

// When a URL matches a directory name AND a .html file exists, prefer the .html file.
// e.g. /guides → guides.html (not guides/index.html which doesn't exist)
app.setNotFoundHandler((request, reply) => {
  const urlPath = request.url.split('?')[0].replace(/\/+$/, '');
  const htmlFile = path.join(ROOT, urlPath + '.html');
  if (urlPath && fs.existsSync(htmlFile) && fs.statSync(htmlFile).isFile()) {
    return reply.sendFile(urlPath + '.html');
  }
  reply.code(404).type('text/html').send('<h1>404 — Page Not Found</h1>');
});

/* ── DO Function proxy helper ───────────────────────────────────────────── */

/**
 * Run a DigitalOcean Function module locally, translating its OpenWhisk-style
 * response into a Fastify reply.
 *
 * @param {string}  modulePath  — relative path from project root
 * @param {object}  fnArgs      — arguments object passed to fn.main()
 * @param {object}  reply       — Fastify reply
 */
async function invokeDOFunction(modulePath, fnArgs, reply) {
  try {
    const fn = require(modulePath);
    const result = await fn.main(fnArgs);
    const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    reply.code(result.statusCode || 200).headers(result.headers || {}).send(body);
  } catch (err) {
    reply.code(500).send({ error: err.message });
  }
}

/** Build a DO Function args object from a GET request's query string. */
function getArgs(request) {
  const args = { __ow_method: 'get' };
  for (const [k, v] of Object.entries(request.query)) args[k] = v;
  return args;
}

/** Build a DO Function args object from a POST request body. */
function postArgs(request) {
  return Object.assign({ __ow_method: 'post' }, request.body || {});
}

/* ── API routes — DO Function proxies ───────────────────────────────────── */

// Quests lookup (GET)
app.get('/api/quests/lookup', async (request, reply) => {
  process.env.DO_CDN_URL = `http://localhost:${PORT}`;
  return invokeDOFunction('./packages/quests/lookup/index.js', getArgs(request), reply);
});

// Deeds lookup (GET)
app.get('/api/deeds/lookup', async (request, reply) => {
  process.env.DO_CDN_URL = `http://localhost:${PORT}`;
  return invokeDOFunction('./packages/deeds/lookup/index.js', getArgs(request), reply);
});

// Builds — save / like / unlike / get / list / stats (POST)
app.post('/api/builds/save', async (request, reply) => {
  return invokeDOFunction('./packages/builds/save/index.js', postArgs(request), reply);
});

// reCAPTCHA Enterprise verification (POST)
app.post('/api/recaptcha/verify', async (request, reply) => {
  const key = process.env.RECAPTCHA_SECRET_KEY;
  if (!key) {
    // No key configured — pass through for local dev
    return reply.send({
      success: true, score: 1.0, reasons: [], valid: true,
      action: 'comment', assessmentName: '',
    });
  }
  return invokeDOFunction('./packages/recaptcha/verify/index.js', postArgs(request), reply);
});

// GitHub OAuth — device flow + legacy code exchange (POST)
app.post('/api/github/auth', async (request, reply) => {
  return invokeDOFunction('./packages/github/auth/index.js', postArgs(request), reply);
});

// Cusdis webhook (POST)
app.post('/api/cusdis/webhook', async (request, reply) => {
  const args = postArgs(request);
  // Pass query-string secret for webhook authentication
  if (request.query.secret) args.secret = request.query.secret;
  return invokeDOFunction('./packages/cusdis/webhook/index.js', args, reply);
});

// Discord interactions — encapsulated with raw body parser for signature verification
app.register(async function (fastify) {
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req._rawBody = body;
    try { done(null, JSON.parse(body.toString())); }
    catch (e) { done(e); }
  });

  fastify.post('/api/discord/interact', async (request, reply) => {
    const rawBody = request.raw._rawBody || Buffer.from(JSON.stringify(request.body));
    const args = {
      __ow_method: 'post',
      __ow_headers: request.headers,
      __ow_body: rawBody.toString('base64'),
    };
    process.env.DO_CDN_URL = `http://localhost:${PORT}`;
    process.env.SITE_API_URL = `http://localhost:${PORT}`;
    return invokeDOFunction('./packages/discord/interact/index.js', args, reply);
  });
});

/* ── Dev-only routes ────────────────────────────────────────────────────── */

// Image upload (multipart form — dev only)
app.post('/api/upload-image', async (request, reply) => {
  const parts = request.parts();
  let imageBuf = null;
  let relPath = null;

  for await (const part of parts) {
    if (part.fieldname === 'image' && part.file) {
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      imageBuf = Buffer.concat(chunks);
    } else if (part.fieldname === 'path') {
      relPath = (await part.toBuffer()).toString().trim();
    }
  }

  if (!imageBuf || !relPath) {
    return reply.code(400).send({ error: 'Missing image or path field' });
  }

  // Prevent directory traversal
  const dest = path.join(ROOT, path.normalize(relPath));
  if (!dest.startsWith(ROOT)) {
    return reply.code(403).send({ error: 'Invalid path' });
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, imageBuf);
  return reply.send({ ok: true, path: relPath });
});

/* ── Start server ───────────────────────────────────────────────────────── */

app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) { console.error(err); process.exit(1); }
  console.log(`Fastify server running on port ${PORT}`);
});
