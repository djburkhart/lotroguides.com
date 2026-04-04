/**
 * reCAPTCHA Enterprise Verify — DigitalOcean Serverless Function
 *
 * Accepts a reCAPTCHA Enterprise token, creates an assessment via
 * the Enterprise API, and returns the risk score.
 *
 * Required env vars:
 *   RECAPTCHA_SECRET_KEY   — Google Cloud API key
 *   RECAPTCHA_SITE_KEY     — reCAPTCHA Enterprise site key
 *   GOOGLE_CLOUD_PROJECT   — GCP project ID
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

  const apiKey = process.env.RECAPTCHA_SECRET_KEY;
  const siteKey = process.env.RECAPTCHA_SITE_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;

  if (!apiKey || !projectId) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'reCAPTCHA Enterprise not configured' }),
    };
  }

  const token = args.token;
  const action = args.action || 'comment';

  if (!token) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: false, error: 'Missing token' }),
    };
  }

  try {
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { token, siteKey, expectedAction: action },
      }),
    });
    const result = await res.json();

    /* Interpret assessment per
       https://cloud.google.com/recaptcha/docs/interpret-assessment-website */
    const tp = result.tokenProperties || {};
    const ra = result.riskAnalysis || {};

    const valid = !!tp.valid;
    const actionMatch = tp.action === action;
    const score = typeof ra.score === 'number' ? ra.score : 0;
    const reasons = Array.isArray(ra.reasons) ? ra.reasons : [];

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: valid && actionMatch,
        score,
        reasons,
        valid,
        action: tp.action || '',
        assessmentName: result.name || '',
      }),
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
