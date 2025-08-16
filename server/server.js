// Combined Express server for PAA API and Google Sheets OAuth2 endpoints


import dotenv from 'dotenv';
// import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import session from 'express-session';
import path from 'path';
import { google } from 'googleapis';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: 'https://blog-setup.onrender.com',
  credentials: true
}));
app.use(express.json());

// Session middleware for storing tokens
app.use(session({
  secret: process.env.SESSION_SECRET || 'supersecret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    sameSite: 'none', 
    secure: true,     
    httpOnly: true,
    domain: '.onrender.com',
  }
}));

// Server Status
app.get('/', (req, res) => {
  res.send('Blog Silo Setup API is running.');
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
    req.session.tokens = tokens;
    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    oauth2Client.setCredentials(tokens);
    let name = '';
    try {
      const userinfo = await oauth2.userinfo.get();
      name = userinfo.data.given_name || userinfo.data.name || '';
    } catch {
      name = '';
    }
    req.session.userName = name;
    res.send('<script>window.close();</script>Authentication successful! You can close this window.');
  } catch (err) {
    res.status(500).send('OAuth2 Error: ' + err.message);
  }
});

// Auth status endpoint
app.get('/api/auth/status', (req, res) => {
  if (req.session.tokens) {
    res.json({ authed: true, name: req.session.userName || '' });
  } else {
    res.json({ authed: false });
  }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// --- Google Sheets Write Endpoint ---
app.post('/api/sheets/write', async (req, res) => {
  const { sheetId, tab, values } = req.body;
  if (!sheetId || !tab || !Array.isArray(values)) {
    return res.status(400).json({ error: 'Missing sheetId, tab, or values' });
  }
  if (!req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated with Google' });
  }
  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(req.session.tokens);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    const range = `${tab}!A1`;
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Google Sheets write error', details: err.message });
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
