/**
 * Cusdis Webhook → Google Sheets
 * DigitalOcean Serverless Function
 *
 * Receives Cusdis webhook payloads (new_comment) and appends a row
 * to a Google Sheet for Looker Studio dashboards.
 *
 * Required env vars:
 *   CUSDIS_WEBHOOK_SECRET     — shared secret to authenticate requests (set in Cusdis webhook URL as ?secret=xxx)
 *   GOOGLE_SHEETS_ID          — the Google Sheets spreadsheet ID
 *   GOOGLE_SERVICE_ACCOUNT    — JSON-encoded service account credentials
 */
'use strict';

const { google } = require('googleapis');

const HEADERS = {
  'Content-Type': 'application/json',
};

function getAuth() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function appendRow(data) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Comments!A:G',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        new Date().toISOString(),           // A: Timestamp
        data.by_nickname || '',             // B: Nickname
        data.by_email || '',                // C: Email
        data.page_title || data.page_id,    // D: Page
        data.page_id || '',                 // E: Page ID
        data.content || '',                 // F: Comment
        data.project_title || '',           // G: Project
      ]],
    },
  });
}

async function main(args) {
  if (args.__ow_method === 'options') {
    return { statusCode: 204, headers: HEADERS, body: '' };
  }

  // Authenticate via shared secret in query string
  const secret = process.env.CUSDIS_WEBHOOK_SECRET;
  if (secret && args.secret !== secret) {
    return {
      statusCode: 401,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  // Parse body — DO Functions passes JSON args directly
  const type = args.type;
  const data = args.data;

  if (type !== 'new_comment' || !data) {
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true, skipped: true }),
    };
  }

  try {
    await appendRow(data);
    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: 'Failed to append row: ' + err.message }),
    };
  }
}

exports.main = main;
