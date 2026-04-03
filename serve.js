const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

// Minimal multipart/form-data parser (dev-only helper)
function parseMultipart(buf, boundary) {
  const sep = Buffer.from('--' + boundary);
  const parts = [];
  let start = bufferIndexOf(buf, sep, 0);
  while (start !== -1) {
    start += sep.length;
    // Skip \r\n after boundary
    if (buf[start] === 0x0d) start += 2;
    else if (buf[start] === 0x0a) start += 1;
    // Check for closing --
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    const headerEnd = bufferIndexOf(buf, Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;
    const headers = buf.slice(start, headerEnd).toString();
    const nameMatch = headers.match(/name="([^"]+)"/);
    const dataStart = headerEnd + 4;
    const dataEnd = bufferIndexOf(buf, sep, dataStart);
    if (dataEnd === -1) break;
    // Trim trailing \r\n before boundary
    let end = dataEnd;
    if (buf[end - 2] === 0x0d && buf[end - 1] === 0x0a) end -= 2;
    parts.push({ name: nameMatch ? nameMatch[1] : '', data: buf.slice(dataStart, end) });
    start = dataEnd;
    // reset to re-find boundary from this position
    start = bufferIndexOf(buf, sep, dataEnd);
  }
  return parts;
}

function bufferIndexOf(buf, search, offset) {
  for (let i = offset; i <= buf.length - search.length; i++) {
    let found = true;
    for (let j = 0; j < search.length; j++) {
      if (buf[i + j] !== search[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

const server = http.createServer((req, res) => {
  // ── Image upload API (dev only) ──────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/upload-image') {
    const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
    if (!boundary) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing multipart boundary' }));
      return;
    }

    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      const parts = parseMultipart(buf, boundary);
      const imgPart = parts.find(p => p.name === 'image');
      const pathPart = parts.find(p => p.name === 'path');
      if (!imgPart || !pathPart) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing image or path field' }));
        return;
      }
      const relPath = pathPart.data.toString().trim();
      // Prevent directory traversal
      const dest = path.join(ROOT, path.normalize(relPath));
      if (!dest.startsWith(ROOT)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, imgPart.data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: relPath }));
    });
    return;
  }

  // ── Cusdis webhook dev endpoint ────────────────────────────────
  if (req.method === 'POST' && req.url.startsWith('/api/cusdis-webhook')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString()); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      console.log('[cusdis-webhook]', JSON.stringify(payload, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, dev: true }));
    });
    return;
  }

  // ── reCAPTCHA Enterprise verification endpoint ──────────────────
  if (req.method === 'POST' && req.url === '/api/recaptcha/verify') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      if (!RECAPTCHA_SECRET_KEY) {
        // No key configured — pass through for local dev
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, score: 1.0 }));
        return;
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid request body' }));
        return;
      }
      const { token, action } = body;
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Missing token' }));
        return;
      }
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || '';
      const apiKey = RECAPTCHA_SECRET_KEY;
      const siteKey = process.env.RECAPTCHA_SITE_KEY || '';
      const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
      const payload = JSON.stringify({
        event: { token, siteKey, expectedAction: action || 'comment' }
      });
      const verifyReq = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }, (verifyRes) => {
        let data = '';
        verifyRes.on('data', d => data += d);
        verifyRes.on('end', () => {
          try {
            const result = JSON.parse(data);
            const score = result.riskAnalysis ? result.riskAnalysis.score : 0;
            const valid = result.tokenProperties && result.tokenProperties.valid;
            const actionMatch = result.tokenProperties && result.tokenProperties.action === (action || 'comment');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: !!(valid && actionMatch), score }));
          } catch (e) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid upstream response' }));
          }
        });
      });
      verifyReq.on('error', () => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Verification request failed' }));
      });
      verifyReq.write(payload);
      verifyReq.end();
    });
    return;
  }

  // Normalize URL and prevent directory traversal
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = path.join(ROOT, path.normalize(url.pathname));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Serve index.html for directory requests, or fall back to .html file with same name
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    if (fs.existsSync(indexPath)) {
      filePath = indexPath;
    } else if (fs.existsSync(filePath + '.html')) {
      filePath = filePath + '.html';
    }
  }

  // Try adding .html extension for clean URLs
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 — Page Not Found</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Static server running on port ${PORT}`);
});
