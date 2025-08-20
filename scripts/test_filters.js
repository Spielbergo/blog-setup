// Lightweight filter test harness copied/adjusted from PAAFetcher.jsx logic
function normalizeText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[_`~!@#$%^&*()\-+={}[\]|\\:;"'<>,./?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasBestOrTopRated(q) {
  const s = normalizeText(q);
  if (/\bwhat (is|are) the best\b/.test(s)) return true;
  if (/\b(top 10|top10|highest rated)\b/.test(s)) return true;
  return false;
}

function isTrendQuestion(q) {
  const s = normalizeText(q);
  return /\b(trend|trending|hottest|in \d{4})\b/.test(s);
}

function isAttractionPreference(q) {
  const s = normalizeText(q);
  return /\b(men|guys|boys)\b/.test(s) && /\b(prefer|like|find|attracts?|attractive|seductive)\b/.test(s);
}

function topicCoreTokens(topicStr) {
  const s = normalizeText(topicStr)
    .replace(/^best\s+/, ' ')
    .replace(/^top rated\s+/, ' ')
    .replace(/^top\s+/, ' ')
    .replace(/^most popular\s+/, ' ')
    .trim();
  const tokens = s.split(/\s+/).filter(Boolean);
  const drop = new Set(['best', 'top', 'rated', 'most', 'popular']);
  return tokens.filter(t => !drop.has(t));
}

function questionContainsAnyToken(q, tokens) {
  if (!tokens || tokens.length === 0) return true;
  const s = ' ' + normalizeText(q) + ' ';
  return tokens.some(tok => {
    if (!tok || tok.length < 2) return false;
    const re = new RegExp(`\\b${tok}(s)?\\b`, 'i');
    return re.test(s);
  });
}

function canonicalizeForDedup(q) {
  if (!q) return '';
  let s = normalizeText(q);
  s = s
    .replace(/\boils\b/g, 'oil')
    .replace(/\boils?\b/g, 'oil')
    .replace(/\blips?\b/g, 'lip')
    .replace(/\bbalms?\b/g, 'balm')
    .replace(/\bglosses?\b/g, 'gloss')
    .replace(/\btips?\b/g, 'tip');
  return s.replace(/\s+/g, ' ').trim();
}

function applyCustomFiltersForTopic(topicItem, list) {
  const core = topicCoreTokens(topicItem);
  let arr = (list || []).filter(q => !hasBestOrTopRated(q) && !isTrendQuestion(q) && !isAttractionPreference(q));
  if (core.length > 0) {
    arr = arr.filter(q => questionContainsAnyToken(q, core));
  }
  const seen = new Set();
  const unique = [];
  for (const q of arr) {
    const key = canonicalizeForDedup(q);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(q);
    }
  }
  return unique;
}

function runTest(topic, rawList) {
  console.log('\n=== Topic:', topic, '===');
  console.log('Raw count:', rawList.length);
  console.log('Raw sample (first 8):');
  rawList.slice(0, 8).forEach((q, i) => console.log(`  ${i+1}. ${q}`));
  const filtered = applyCustomFiltersForTopic(topic, rawList);
  console.log('\nAfter filters count:', filtered.length);
  console.log('After filters sample (first 12):');
  filtered.slice(0, 12).forEach((q, i) => console.log(`  ${i+1}. ${q}`));
}

// Example raw PAA lists (representative synthetic samples)
const lipRaw = [
  'What is the best lip balm?',
  'Best lip balm for chapped lips',
  'Are lip balms trending in 2024?',
  'How to apply lip balm so it lasts?',
  'Do guys find lip balm attractive?',
  'Lip balm vs lip gloss: which is better?',
  'How long does medicated lip balm take to work?',
  'Can lip balm cause acne?',
  'What are the ingredients in natural lip balm?',
  'Lip balm tips for winter',
  'How to remove lip balm stains',
  'Top 10 lip balms for dry lips',
  'Is lip balm good for sore lips?'
];

const shampooRaw = [
  'What is the best shampoo for oily hair?',
  'Shampoo for dandruff that actually works',
  'Are clarifying shampoos bad for color treated hair?',
  'How often should you shampoo your hair?',
  'Trending: shampoo bars in 2024',
  'Does shampoo cause hair loss?',
  'Shampoo vs co-wash: what is the difference?',
  'How to choose a sulfate free shampoo',
  'What shampoo to use for curly hair to avoid frizz',
  'Can you use baby shampoo on adults?',
  'Best way to remove buildup from hair',
  'Top10 highest rated clarifying shampoos',
  'How to prevent itchy scalp'
];

runTest('lip balm', lipRaw);
runTest('shampoo', shampooRaw);

console.log('\nDone.');
