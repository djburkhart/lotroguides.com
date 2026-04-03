/**
 * GitHub Auth — DigitalOcean Serverless Function
 *
 * Handles GitHub OAuth code exchange and device flow,
 * gated behind Google ID token verification.
 *
 * Actions:
 *   (default) — Legacy code-for-token exchange (no Google auth required)
 *   device-code — Request device + user verification codes (requires Google auth)
 *   device-poll — Poll for access token using device code (requires Google auth)
 *
 * Required env vars:
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
 *   GOOGLE_OAUTH_CLIENT_ID, EDITOR_ALLOWED_EMAILS
 */

var CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** Verify Google ID token + email allowlist. */
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

/** Step 1 of device flow: request device + user verification codes. */
async function handleDeviceCode(args) {
  var clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return { statusCode: 500, headers: CORS_HEADERS, body: { error: 'GitHub OAuth not configured' } };
  }

  try {
    var res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: 'repo' })
    });
    var data = await res.json();

    if (data.error) {
      return { statusCode: 400, headers: CORS_HEADERS, body: { error: data.error_description || data.error } };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: {
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri,
        expires_in: data.expires_in,
        interval: data.interval,
      }
    };
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to contact GitHub: ' + err.message } };
  }
}

/** Step 3 of device flow: poll for the access token. */
async function handleDevicePoll(args) {
  var deviceCode = args.device_code;
  if (!deviceCode || typeof deviceCode !== 'string') {
    return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Missing device_code' } };
  }

  var clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return { statusCode: 500, headers: CORS_HEADERS, body: { error: 'GitHub OAuth not configured' } };
  }

  try {
    var res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });
    var data = await res.json();

    // Pending / slow_down / expired are not errors — pass them through
    if (data.error) {
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: { error: data.error, error_description: data.error_description || '', interval: data.interval }
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: { access_token: data.access_token, token_type: data.token_type, scope: data.scope }
    };
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to contact GitHub: ' + err.message } };
  }
}

/** Legacy: exchange authorization code for token (backward compat). */
async function handleCodeExchange(args) {
  var code = args.code;
  if (!code || typeof code !== 'string') {
    return { statusCode: 400, headers: CORS_HEADERS, body: { error: 'Missing code parameter' } };
  }

  var clientId = process.env.GITHUB_CLIENT_ID;
  var clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers: CORS_HEADERS, body: { error: 'GitHub OAuth not configured' } };
  }

  try {
    var res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code: code })
    });
    var data = await res.json();

    if (data.error) {
      return { statusCode: 401, headers: CORS_HEADERS, body: { error: data.error_description || data.error } };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: { access_token: data.access_token, token_type: data.token_type, scope: data.scope }
    };
  } catch (err) {
    return { statusCode: 502, headers: CORS_HEADERS, body: { error: 'Failed to contact GitHub: ' + err.message } };
  }
}

exports.main = async function main(args) {
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS };
  }
  if (args.__ow_method !== 'post') {
    return { statusCode: 405, headers: CORS_HEADERS, body: { error: 'Method not allowed' } };
  }

  var action = args.action || '';

  // Device flow actions require Google authentication
  if (action === 'device-code' || action === 'device-poll') {
    var auth = await authenticate(args);
    if (auth.error) {
      return { statusCode: auth.status, headers: CORS_HEADERS, body: { error: auth.error } };
    }

    if (action === 'device-code') return handleDeviceCode(args);
    return handleDevicePoll(args);
  }

  // Legacy code exchange (backward compat — no Google auth required)
  return handleCodeExchange(args);
};
