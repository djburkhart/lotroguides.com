/**
 * reCAPTCHA v3 Verify — DigitalOcean Serverless Function
 *
 * Accepts a reCAPTCHA v3 token, verifies it with Google,
 * and returns the success/score result.
 *
 * Required env vars:
 *   RECAPTCHA_SECRET_KEY
 */
'use strict';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function main(args) {
  // Handle CORS preflight
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const secretKey = process.env.RECAPTCHA_SECRET_KEY;
  if (!secretKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'RECAPTCHA_SECRET_KEY not configured' }),
    };
  }

  const token = args.token;
  if (!token) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Missing token' }),
    };
  }

  try {
    const params = new URLSearchParams({ secret: secretKey, response: token });
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const result = await res.json();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: result.success, score: result.score || 0 }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Verification request failed' }),
    };
  }
}

exports.main = main;
