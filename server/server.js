// Combined Express server for PAA API and Google Sheets OAuth2 endpoints


import dotenv from 'dotenv';
// import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import path from 'path';
import { google } from 'googleapis';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: [
    'https://blog-setup.onrender.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  credentials: true
}));
app.use(express.json());

// Session middleware for storing tokens
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwt1963';

// Server Status
app.get('/', (req, res) => {
  res.send('Blog Silo Setup API is running.');
});

// Explicit health/status endpoint for frontend checks
app.get('/api/status', cors({ origin: '*', credentials: false }), (req, res) => {
  res.json({ status: 'online', uptime: process.uptime(), timestamp: Date.now() });
});

// Google OAuth2 client setup
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
let REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://blog-setup-server.onrender.com/api/auth/google/callback';
// Normalize double slashes except after https://
REDIRECT_URI = REDIRECT_URI.replace(/([^:]\/)\/+/, '$1/');
REDIRECT_URI = REDIRECT_URI.replace(/([^:]\/)\/+/, '$1/'); // run twice in case of multiple
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getOAuth2Client(req) {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

// --- OAuth2 Endpoints ---
// Start OAuth2 flow
app.get('/api/auth/google', (req, res) => {
  const oauth2Client = getOAuth2Client(req);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

// OAuth2 callback
app.get('/api/auth/google/callback', async (req, res) => {
  const oauth2Client = getOAuth2Client(req);
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    let name = '';
    try {
      const userinfo = await oauth2.userinfo.get();
      name = userinfo.data.given_name || userinfo.data.name || '';
    } catch {
      name = '';
    }
    // Create JWT with tokens and name
    const jwtPayload = { tokens, name };
    const jwtToken = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '2h' });
    // Send JWT to frontend via window.opener if opened as a popup; else render a page with a link back
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authentication Complete</title>
  <style>body{font-family: Arial, sans-serif; background:#111; color:#eee; display:flex; align-items:center; justify-content:center; height:100vh; margin:0} .card{background:#1c1c1c; padding:24px 28px; border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.4)} a{color:#4caf50}</style>
  <script>
    (function(){
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ jwt: '${jwtToken}', name: '${name}' }, '*');
          setTimeout(function(){ window.close(); }, 50);
        }
      } catch (e) {}
    })();
  </script>
  </head>
  <body>
    <div class="card">
      <div>Authentication successful.</div>
      <div style="margin-top:8px">You can close this window. If it did not close automatically, <a href="https://blog-setup.onrender.com" rel="opener">return to the app</a>.</div>
    </div>
  </body>
</html>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('OAuth2 Error: ' + err.message);
  }
});

// Auth status endpoint (JWT-based)
app.get('/api/auth/status', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authed: false });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ authed: true, name: payload.name || '' });
  } catch {
    res.json({ authed: false });
  }
});

// Logout endpoint (JWT-based, just instruct frontend to remove JWT)
app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

// --- Google Sheets Write Endpoint (JWT-based) ---
app.post('/api/sheets/write', async (req, res) => {
  const { sheetId, tab, values, startCell } = req.body;
  const authHeader = req.headers.authorization;
  if (!sheetId || !tab || !Array.isArray(values)) {
    return res.status(400).json({ error: 'Missing sheetId, tab, or values' });
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(payload.tokens);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const range = `${tab}!${startCell && typeof startCell === 'string' ? startCell : 'A1'}`;
    if (startCell) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values, majorDimension: 'ROWS' },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Google Sheets write error', details: err.message });
  }
});

// Duplicate an existing tab and write values at a specific start cell
// Body: { sheetId (spreadsheetId), sourceTab (title), newTabTitle (optional), startCell (e.g., "B5"), values, bands?, titleCell?, titleValue? }
app.post('/api/sheets/duplicate-and-write', async (req, res) => {
  const { sheetId, sourceTab, newTabTitle, startCell, values, bands, titleCell, titleValue } = req.body;
  const authHeader = req.headers.authorization;
  if (!sheetId || !sourceTab || !Array.isArray(values)) {
    return res.status(400).json({ error: 'Missing sheetId, sourceTab, or values' });
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  const token = authHeader.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(payload.tokens);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    // Helper: parse an A1 notation like "B11" into zero-based row/column indices
    function parseA1(a1) {
      const m = String(a1 || 'A1').match(/^\s*([A-Za-z]+)(\d+)\s*$/);
      if (!m) return { rowIndex: 0, columnIndex: 0 };
      const letters = m[1].toUpperCase();
      const row = parseInt(m[2], 10);
      let colNum = 0;
      for (let i = 0; i < letters.length; i++) {
        colNum = colNum * 26 + (letters.charCodeAt(i) - 64); // A=1
      }
      return { rowIndex: Math.max(0, row - 1), columnIndex: Math.max(0, colNum - 1) };
    }

    // 1) Get sheet metadata to find source sheetId and to ensure unique target title
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: 'sheets.properties(sheetId,title,index)'
    });
    const props = meta.data.sheets?.map(s => s.properties) || [];
    const sourceProps = props.find(p => p.title === sourceTab);
    if (!sourceProps) {
      return res.status(404).json({ error: `Source tab not found: ${sourceTab}` });
    }

    // 2) Copy the tab
    const copyResp = await sheets.spreadsheets.sheets.copyTo({
      spreadsheetId: sheetId,
      sheetId: sourceProps.sheetId,
      requestBody: { destinationSpreadsheetId: sheetId }
    });
    let targetSheetId = copyResp.data.sheetId;
    let targetTitle = copyResp.data.title || `Copy of ${sourceTab}`;

    // 3) Optionally rename the copied sheet; ensure uniqueness
    if (newTabTitle && typeof newTabTitle === 'string' && newTabTitle.trim()) {
      let desired = newTabTitle.trim();
      const existingTitles = new Set(props.map(p => p.title));
      if (existingTitles.has(desired)) {
        desired = `${desired} (${Date.now().toString().slice(-4)})`;
      }
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: { sheetId: targetSheetId, title: desired },
                fields: 'title'
              }
            }
          ]
        }
      });
      targetTitle = desired;
    }

    // 4) Write values starting at startCell (default A1)
    const writeRange = `${targetTitle}!${startCell && typeof startCell === 'string' ? startCell : 'A1'}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: writeRange,
      valueInputOption: 'RAW',
      requestBody: { values, majorDimension: 'ROWS' },
    });

    const requests = [];
    const { rowIndex: startRowIndex, columnIndex: startColumnIndex } = parseA1(startCell || 'A1');

    // 5) Apply background color bands to the written rows (e.g., per mini-silo)
    if (Array.isArray(bands) && bands.length > 0) {
      let runningOffset = 0;
      for (const band of bands) {
        const size = Number(band?.size) || 0;
        const color = band?.color || null;
        if (size <= 0 || !color) {
          runningOffset += Math.max(0, size);
          continue;
        }
        requests.push({
          repeatCell: {
            range: {
              sheetId: targetSheetId,
              startRowIndex: startRowIndex + runningOffset,
              endRowIndex: startRowIndex + runningOffset + size,
              startColumnIndex,
              endColumnIndex: startColumnIndex + 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: color.red ?? color.r ?? 0,
                  green: color.green ?? color.g ?? 0,
                  blue: color.blue ?? color.b ?? 0,
                }
              }
            },
            fields: 'userEnteredFormat.backgroundColor'
          }
        });
        runningOffset += size;
      }
    }

    // 6) Apply text formatting (Arial, size 12) to the question range we wrote
    if (Array.isArray(values) && values.length > 0) {
      requests.push({
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: startRowIndex,
            endRowIndex: startRowIndex + values.length,
            startColumnIndex,
            endColumnIndex: startColumnIndex + 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: { fontFamily: 'Arial', fontSize: 12 }
            }
          },
          fields: 'userEnteredFormat.textFormat'
        }
      });
    }

    // 7) Optional title cell write and formatting (e.g., B10)
    const titleA1 = typeof titleCell === 'string' && titleCell.trim() ? titleCell.trim() : null;
    if (titleA1 && typeof titleValue === 'string' && titleValue.trim()) {
      const titleRange = `${targetTitle}!${titleA1}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: titleRange,
        valueInputOption: 'RAW',
        requestBody: { values: [[titleValue.trim()]], majorDimension: 'ROWS' },
      });
      const { rowIndex: titleRowIndex, columnIndex: titleColumnIndex } = parseA1(titleA1);
      requests.push({
        repeatCell: {
          range: {
            sheetId: targetSheetId,
            startRowIndex: titleRowIndex,
            endRowIndex: titleRowIndex + 1,
            startColumnIndex: titleColumnIndex,
            endColumnIndex: titleColumnIndex + 1
          },
          cell: {
            userEnteredFormat: {
              textFormat: { fontFamily: 'Arial', fontSize: 13, bold: true },
              backgroundColor: { red: 1, green: 1, blue: 0 }
            }
          },
          fields: 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor'
        }
      });
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests }
      });
    }

    res.json({ success: true, tabTitle: targetTitle, tabId: targetSheetId });
  } catch (err) {
    res.status(500).json({ error: 'Duplicate and write error', details: err.message });
  }
});

// PAA API endpoint (uses SerpAPI)
app.post('/api/paa', async (req, res) => {
  const { keyword, depth = 2, maxQuestions = 20 } = req.body;
  console.log('Received /api/paa request:', req.body);
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (!serpApiKey) {
    return res.status(400).json({ error: 'Missing SerpAPI API key' });
  }
  if (!keyword || typeof keyword !== 'string' || keyword.trim() === '') {
    return res.status(400).json({ error: 'Missing or empty keyword' });
  }
  try {
    // Recursive fetch logic
    let questions = [];
    let seen = new Set();
    async function fetchQuestions(q, d) {
      if (d > depth || questions.length >= maxQuestions) return;
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${serpApiKey}&engine=google`;
      const resp = await axios.get(url);
      const paa = resp.data?.related_questions || [];
      for (const item of paa) {
        const text = item.question?.trim();
        if (text && !seen.has(text) && questions.length < maxQuestions) {
          questions.push(text);
          seen.add(text);
          await fetchQuestions(text, d + 1);
        }
      }
    }
    await fetchQuestions(keyword, 1);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch PAA questions', details: err.message });
  }
});

// Placeholder for Google Sheets OAuth2 endpoints


// Placeholder for Gemini API proxy (if needed)
// app.post('/api/gemini', ...)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
