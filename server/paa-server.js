const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());

const SERPAPI_KEY = process.env.SERPAPI_KEY;

// Helper to fetch PAA questions for a keyword
async function fetchPAA(keyword) {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(keyword)}&engine=google&api_key=${SERPAPI_KEY}`;
  const response = await axios.get(url);
  const data = response.data;
  let questions = [];
  if (data.related_questions && Array.isArray(data.related_questions)) {
    questions = data.related_questions.map(q => q.question).filter(Boolean);
  }
  return questions;
}

// Recursive fetcher
async function recursiveFetch(keyword, depth = 1, maxQuestions = 20, seen = new Set()) {
  console.log('recursiveFetch called:', { keyword, depth, maxQuestions });
  if (seen.size >= maxQuestions || depth < 1) return Array.from(seen);
  let queue = [keyword];
  while (queue.length && seen.size < maxQuestions && depth > 0) {
    const current = queue.shift();
    try {
      const questions = await fetchPAA(current);
      for (const q of questions) {
        if (!seen.has(q) && seen.size < maxQuestions) {
          seen.add(q);
          queue.push(q);
        }
      }
    } catch (err) {
      // Ignore errors for individual fetches
    }
    depth--;
  }
  return Array.from(seen);
}

app.post('/api/paa', async (req, res) => {
  const { keyword, depth = 2, maxQuestions = 20 } = req.body;
  if (!keyword) {
    return res.status(400).json({ error: 'Missing keyword' });
  }
  if (!SERPAPI_KEY) {
    return res.status(500).json({ error: 'Missing SERPAPI_KEY in .env file' });
  }
  try {
    const questions = await recursiveFetch(keyword, depth, maxQuestions);
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err.message || 'SerpAPI error' });
  }
});

app.listen(port, () => {
  console.log(`PAA API listening at http://localhost:${port}`);
});
