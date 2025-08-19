import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Modal from './Modal';

const PAAFetcher = ({ topic }) => {
  // Track copied and popup state for each topicItem (multi-topic mode)
  const [copiedTopics, setCopiedTopics] = useState({});
  const [popupTopics, setPopupTopics] = useState({});
  // Support multiple topics
  const [multiTopics, setMultiTopics] = useState([]);
  useEffect(() => {
    if (Array.isArray(topic)) {
      setMultiTopics(topic);
    } else if (typeof topic === 'string' && topic.trim()) {
      setMultiTopics([topic]);
    }
  }, [topic]);
  
  const sheetApiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY || '';
  const sheetId1 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_1 || '';
  const sheetId2 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_2 || '';
  const sheetId3 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_3 || '';
  const sheetId4 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_4 || '';
  const sheetId5 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_5 || '';

  // Sheet IDs
  const sheets = [
    { id: sheetId1, title: 'Lip Stuff' },
    { id: sheetId2, title: 'Shampoo' },
    { id: sheetId3, title: 'Mascara' },
    { id: sheetId4, title: 'Jen Jewell' },
    { id: sheetId5, title: 'Blue Kitchens' }
  ];

  const [selectedSheet, setSelectedSheet] = useState(sheets[0]?.id || '');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [templateExists, setTemplateExists] = useState(false);
  // Automated export: always duplicate 'Template' and write starting at B11

  const [paaQuestions, setPaaQuestions] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [depth, setDepth] = useState(2);
  const [maxQuestions, setMaxQuestions] = useState(20);
  const [groupWords, _setGroupWords] = useState([]);
  const groupWordsRef = useRef([]);
  // Safe setter to avoid unnecessary re-renders
  const setGroupWords = (words) => {
    if (JSON.stringify(words) !== JSON.stringify(groupWordsRef.current)) {
      groupWordsRef.current = words;
      _setGroupWords(words);
    }
  };
  const [geminiGroupWords, setGeminiGroupWords] = useState([]);
  const geminiAppliedRef = useRef(false);
  const lastGeminiWordsRef = useRef([]);
  const geminiQuestionsSnapshotRef = useRef([]);
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

  const [modalOpen, setModalOpen] = useState(false);
  const [prefilteredPAAs, setPrefilteredPAAs] = useState([]); // single-topic or flattened manual list
  const [prefilteredByTopic, setPrefilteredByTopic] = useState({}); // raw results per topic before filtering
  // Export confirmation modal
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportDetails, setExportDetails] = useState(null);

  // Call Express API for PAA questions
  const fetchPAAQuestions = async () => {
    console.log('Fetch PAA called with topics:', multiTopics);
    if (!multiTopics || multiTopics.length === 0) {
      setError('Please select at least one topic before fetching PAA questions.');
      return;
    }
    setLoading(true);
    setError('');
    let allResults = {};
  let preMap = {};
    try {
      // 1. Fetch blog titles once
      let blogTitles = [];
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${selectedSheet}/values/All Blogs?key=${sheetApiKey}`;
        const blogRes = await fetch(url);
        if (blogRes.ok) {
          const blogData = await blogRes.json();
          blogTitles = (blogData.values || []).map(row => row[0]?.trim()).filter(Boolean);
        }
      } catch (err) {
        // Ignore blog fetch errors
      }
      function normalize(str) {
        return str.toLowerCase().replace(/[^a-z0-9 ]/gi, '').trim();
      }
      const normTitles = blogTitles.map(normalize);
      // 2. For each topic, fetch PAAs and filter
      for (const topicItem of multiTopics) {
        // Fetch PAAs for topicItem
        const res = await fetch('https://blog-setup-server.onrender.com/api/paa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: topicItem, depth, maxQuestions })
        });
        let data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          continue;
        }
        if (!res.ok) continue;
  let paaList = data.questions || [];
  // Capture raw, prefiltered PAA list for this topic
  preMap[topicItem] = Array.isArray(paaList) ? paaList.slice() : [];
        // Filter against blog titles
        let filteredPAAs = paaList.filter(paa => {
          const normPAA = normalize(paa);
          return !normTitles.some(title => {
            if (normPAA === title) return true;
            const titleWordCount = title.split(' ').filter(Boolean).length;
            if (titleWordCount >= 5 && normPAA.includes(title)) return true;
            return false;
          });
        });
        // Gemini semantic filter (dedupe against existing blog titles)
        if (geminiApiKey && filteredPAAs.length > 0 && blogTitles.length > 0) {
          try {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const prompt = `Here is a list of blog titles:\n${blogTitles.join('\n')}\nHere is a list of new PAA questions:\n${filteredPAAs.join('\n')}\nReturn only the PAA questions that are NOT similar in meaning to any of the blog titles. Only return the questions, one per line.`;
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            const geminiFiltered = text.split(/\n|\r/).map(q => q.trim()).filter(Boolean);
            if (geminiFiltered.length > 0 && geminiFiltered.every(q => q.endsWith('?'))) {
              filteredPAAs = geminiFiltered;
            }
          } catch (err) {
            // Ignore Gemini errors
          }
        }

        // Apply custom hard filters per topic (after semantic blog-title filter)
        filteredPAAs = applyCustomFiltersForTopic(topicItem, filteredPAAs);

        // Intra-list dedupe via Gemini within this topic
        if (geminiApiKey && filteredPAAs.length > 1) {
          filteredPAAs = await geminiDedupeSimilar(filteredPAAs, topicItem, geminiApiKey);
        }

        // Title case for display/export consistency
        filteredPAAs = filteredPAAs.map(q => toTitleCase(q.replace(/^\*\s*/, '')));

        allResults[topicItem] = filteredPAAs;
      }
      setPaaQuestions(allResults);
      setPrefilteredByTopic(preMap);
      // For single-topic, store array for convenience; for multi, flatten for modal fallback
      if (multiTopics.length === 1) {
        const only = multiTopics[0];
        setPrefilteredPAAs(preMap[only] || []);
      } else {
        setPrefilteredPAAs(Object.values(preMap).flat());
      }
    } catch (err) {
      setError('Error fetching PAA questions. Is the backend running?');
      setPaaQuestions({});
      setPrefilteredByTopic({});
      setPrefilteredPAAs([]);
    }
    setLoading(false);
  }; // end fetchPAAQuestions

  const handleInputChange = e => {
    setInputText(e.target.value);
    const questions = e.target.value.split('\n').map(q => q.trim()).filter(Boolean);
  setPaaQuestions(questions);
  setPrefilteredPAAs(questions);
  setPrefilteredByTopic(questions.length ? { Manual: questions } : {});
  };

  // Deduplicate questions
  // If multi-topic, flatten all results
  let dedupedQuestionsRaw = [];
  if (Array.isArray(paaQuestions)) {
    dedupedQuestionsRaw = Array.from(new Set(paaQuestions.map(q => q.trim()).filter(Boolean)));
  } else if (typeof paaQuestions === 'object' && paaQuestions !== null) {
    // Multi-topic: flatten all arrays
    Object.values(paaQuestions).forEach(arr => {
      dedupedQuestionsRaw.push(...arr.map(q => q.trim()).filter(Boolean));
    });
    dedupedQuestionsRaw = Array.from(new Set(dedupedQuestionsRaw));
  }

  // Filter out questions mentioning brands/celebrities using Gemini
  const [filteredQuestions, setFilteredQuestions] = useState([]);
  const lastBrandFilterInputRef = useRef('');
  useEffect(() => {
    async function filterBrandsCelebs() {
      if (!geminiApiKey || dedupedQuestionsRaw.length === 0) {
        if (JSON.stringify(filteredQuestions) !== JSON.stringify(dedupedQuestionsRaw)) {
          setFilteredQuestions(dedupedQuestionsRaw);
        }
        return;
      }
      const joined = dedupedQuestionsRaw.join('\n');
      if (joined === lastBrandFilterInputRef.current) return;
      lastBrandFilterInputRef.current = joined;
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Here is a list of questions about ${topic}. Return only the questions that do NOT mention any brand names or celebrities.\nQuestions:\n${dedupedQuestionsRaw.join('\n')}`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        // Try to extract questions from Gemini response
        const filtered = text.split(/\n|\r/).map(q => q.trim()).filter(Boolean);
        // Only use filtered if it looks like a list of questions
        if (filtered.length > 0 && filtered.every(q => q.endsWith('?'))) {
          if (JSON.stringify(filteredQuestions) !== JSON.stringify(filtered)) {
            setFilteredQuestions(filtered);
          }
        } else {
          if (JSON.stringify(filteredQuestions) !== JSON.stringify(dedupedQuestionsRaw)) {
            setFilteredQuestions(dedupedQuestionsRaw);
          }
        }
      } catch (err) {
        if (JSON.stringify(filteredQuestions) !== JSON.stringify(dedupedQuestionsRaw)) {
          setFilteredQuestions(dedupedQuestionsRaw);
        }
      }
    }
    filterBrandsCelebs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupedQuestionsRaw, geminiApiKey, topic, filteredQuestions]);

  // Use filteredQuestions for grouping
  const dedupedQuestions = filteredQuestions.map(q => toTitleCase(String(q || '').replace(/^\*\s*/, '')));

  // Expanded stopwords
  const stopwords = [
    'what','how','why','when','which','where','who','is','are','do','does','can','should','could','will','would','did','was','were','the','a','an','to','in','on','for','of','this','that','these','those','it','its','and','but','or','if','with','as','by','at','from','about','after','before','so','then','than','all','any','be','not','my','your','their','our','his','her','has','have','had','you','me','i'
  ];

  // Auto-detect shared words
  function getSharedWords(questions) {
    const wordCount = {};
    questions.forEach(q => {
      q.toLowerCase().split(/\W+/).forEach(w => {
        if (w && !stopwords.includes(w)) {
          wordCount[w] = (wordCount[w] || 0) + 1;
        }
      });
    });
    // Only keep words that appear in more than one question
    return Object.keys(wordCount).filter(w => wordCount[w] > 1);
  }

  // Set default group words from auto-detect (runs only when dedupedQuestions changes)
  useEffect(() => {
    if (dedupedQuestions.length === 0) return;
    const autoWords = getSharedWords(dedupedQuestions);
    // Only set groupWords if different
    if (JSON.stringify(autoWords) !== JSON.stringify(groupWordsRef.current)) {
      setGroupWords(autoWords);
      groupWordsRef.current = autoWords;
    }
    // Only reset Gemini state if dedupedQuestions actually changed
    geminiAppliedRef.current = false;
    lastGeminiWordsRef.current = [];
    geminiQuestionsSnapshotRef.current = dedupedQuestions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupedQuestions]);

  // Fetch Gemini grouping words (runs only when dedupedQuestions or geminiApiKey changes)
  // Track last Gemini group words and last dedupedQuestions to prevent repeated API calls
  const lastGeminiApiWordsRef = useRef([]);
  const lastGeminiDedupedRef = useRef([]);
  useEffect(() => {
    // Only run Gemini effect if dedupedQuestions are truly new
    if (
      dedupedQuestions.length < 2 ||
      JSON.stringify(dedupedQuestions) === JSON.stringify(lastGeminiDedupedRef.current)
    ) return;
    lastGeminiDedupedRef.current = dedupedQuestions;
    async function fetchGeminiGroupingWords() {
      if (!geminiApiKey) return;
      try {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const prompt = `Given this list of questions: ${dedupedQuestions.join(' | ')}\nSuggest 10 words that could be used to group these questions into silos based on exact word matches. Only return the words, comma separated.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiWords = text.split(/,|\n/).map(w => w.trim().toLowerCase()).filter(Boolean);
        // Only update if Gemini result is truly new
        if (aiWords.length > 0 && JSON.stringify(aiWords) !== JSON.stringify(lastGeminiApiWordsRef.current)) {
          setGeminiGroupWords(aiWords);
          geminiQuestionsSnapshotRef.current = dedupedQuestions;
          lastGeminiApiWordsRef.current = aiWords;
        }
      } catch (err) {
        // Ignore Gemini errors, keep default
      }
    }
    fetchGeminiGroupingWords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupedQuestions, geminiApiKey]);

  // Merge Gemini group words into main groupWords only once per dedupedQuestions change
  useEffect(() => {
    // Only apply Gemini group words if dedupedQuestions match the snapshot
    if (
      geminiGroupWords.length > 0 &&
      !geminiAppliedRef.current &&
      JSON.stringify(geminiGroupWords) !== JSON.stringify(lastGeminiWordsRef.current) &&
      JSON.stringify(dedupedQuestions) === JSON.stringify(geminiQuestionsSnapshotRef.current)
    ) {
      // Only set groupWords if different to avoid loop
      if (JSON.stringify(geminiGroupWords) !== JSON.stringify(groupWordsRef.current)) {
        setGroupWords(geminiGroupWords);
        groupWordsRef.current = geminiGroupWords;
        console.log('Applied Gemini grouping:', geminiGroupWords);
      }
      geminiAppliedRef.current = true;
      lastGeminiWordsRef.current = geminiGroupWords;
      setGeminiGroupWords([]); // clear Gemini group words to prevent repeated effect
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geminiGroupWords, dedupedQuestions]);

  // Improved grouping and sorting
  // Remove groups for main topic and its variants, deduplicate questions, prioritize descriptive/how-to words
  // Support topic as string or array
  let mainTopic = '';
  let topicVariants = [];
  if (Array.isArray(topic)) {
    // Use first topic for variants, but multiTopics logic will handle grouping
    mainTopic = topic[0]?.toLowerCase?.() || '';
    const topicWords = Array.from(new Set(mainTopic.split(/\W+/).filter(Boolean)));
    topicVariants = [mainTopic, ...topicWords, ...topicWords.map(w => w.endsWith('s') ? w.slice(0, -1) : w + 's')];
  } else if (typeof topic === 'string') {
    mainTopic = topic.toLowerCase();
    const topicWords = Array.from(new Set(mainTopic.split(/\W+/).filter(Boolean)));
    topicVariants = [mainTopic, ...topicWords, ...topicWords.map(w => w.endsWith('s') ? w.slice(0, -1) : w + 's')];
  }
  // Descriptive/how-to words to prioritize
  const priorityWords = [
    'apply','remove','different','waterproof','prevent','cause','choose','compare','types','benefit','effect','safe','natural','diy','tips','trick','method','ingredient','effective','permanent','temporary','price','cost','review','recommend','avoid','problem','solution','strongest','actually','injection','permanently', 'color'
  ];

  // Filter out stopwords from groupWords before grouping
  const validGroupWords = groupWords.filter(w => !stopwords.includes(w));

  // Group questions by validGroupWords, but filter out topic variants
  let wordGroups = {};
  let singleItems = [];
  const seenQuestions = new Set();
  let sortedGroupKeys = [];
  if (multiTopics.length > 1 && typeof paaQuestions === 'object') {
    // Multi-topic: group by topic, each topic gets its own silo
    wordGroups = {};
    sortedGroupKeys = [];
    multiTopics.forEach(topicItem => {
      const arr = paaQuestions[topicItem] || [];
      if (arr.length > 0) {
        wordGroups[topicItem] = arr;
        sortedGroupKeys.push(topicItem);
      }
    });
  } else {
    dedupedQuestions.forEach(q => {
      const qLower = q.toLowerCase();
      if (!topicVariants.some(v => qLower.includes(v))) return;
      const words = qLower.split(/\W+/).filter(w => w && validGroupWords.includes(w));
      const filteredWords = words.filter(w => !topicVariants.includes(w));
      if (filteredWords.length === 0) {
        if (!seenQuestions.has(q)) {
          singleItems.push(q);
          seenQuestions.add(q);
        }
      } else {
        let assigned = false;
        filteredWords.forEach(word => {
          if (!wordGroups[word]) wordGroups[word] = [];
          if (!seenQuestions.has(q)) {
            wordGroups[word].push(q);
            seenQuestions.add(q);
            assigned = true;
          }
        });
        if (!assigned && !seenQuestions.has(q)) {
          singleItems.push(q);
          seenQuestions.add(q);
        }
      }
    });
    Object.keys(wordGroups).forEach(word => {
      if (wordGroups[word].length === 1) {
        singleItems.push(wordGroups[word][0]);
        delete wordGroups[word];
      }
    });
    wordGroups['Main Silo'] = singleItems;
    sortedGroupKeys = ['Main Silo', ...Object.keys(wordGroups).filter(k => k !== 'Main Silo').sort((a, b) => wordGroups[b].length - wordGroups[a].length)];
  }

  // Fetch tabs for selected sheet using Google Sheets API
  const [tabs, setTabs] = useState([]);
  useEffect(() => {
    async function fetchTabs() {
      if (!selectedSheet || !sheetApiKey) {
        setTabs([]);
        return;
      }
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${selectedSheet}?fields=sheets.properties&key=${sheetApiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch tabs');
        const data = await res.json();
  const tabNames = (data.sheets || []).map(s => s.properties.title);
  setTabs(tabNames);
  setTemplateExists(tabNames.includes('Template'));
      } catch (err) {
        setTabs([]);
  setTemplateExists(false);
      }
    }
    fetchTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSheet, sheetApiKey]);

  function sanitizeTabTitle(name) {
    if (!name || typeof name !== 'string') return 'Silo';
    // Remove forbidden characters: []:*?/\
    let t = name.replace(/[\[\]:\*\?\/\\]/g, ' ').trim();
    if (t.length > 90) t = t.slice(0, 90);
    return t || 'Silo';
  }

  // Transform topic into tab title rules:
  // - If starts with "best ", remove "est" to become "b " + rest (e.g., "best lip balm" -> "b lip balm")
  function topicToTabTitle(raw) {
    let t = String(raw || '').trim();
    const lower = t.toLowerCase();
    if (lower.startsWith('best ')) {
      // remove 'est' from leading 'best '
      t = 'b ' + t.slice(5);
    }
  return toTitleCase(sanitizeTabTitle(t));
  }

  // Google Sheets palette approximations for background colors (0..1 floats)
  // light magenta 3 and light magenta 2
  const MAGENTA3 = { r: 234 / 255, g: 209 / 255, b: 220 / 255 }; // #ead1dc
  const MAGENTA2 = { r: 213 / 255, g: 166 / 255, b: 189 / 255 }; // #d5a6bd

  // Helper: group an array of questions into mini-silos like the UI and return
  // the ordered keys, groups map, flattened questions, and color bands metadata.
  function buildGroupsAndBands(questions, baseTopic) {
    const qs = (questions || []).map(q => String(q || '').trim()).filter(Boolean);
    // Inject leading All About article
    const allAbout = getAllAboutTitle(baseTopic || (Array.isArray(topic) ? topic[0] : topic));
    const qsWithIntro = [allAbout, ...qs];

    // Auto-detect grouping words from this question set
    const wordCount = {};
    const localStop = new Set(stopwords);
    qsWithIntro.forEach(q => {
      q.toLowerCase().split(/\W+/).forEach(w => {
        if (w && !localStop.has(w)) wordCount[w] = (wordCount[w] || 0) + 1;
      });
    });
    const topicBase = String(baseTopic || (Array.isArray(topic) ? (topic[0] || '') : (topic || ''))).toLowerCase();
    const topicWords = Array.from(new Set(topicBase.split(/\W+/).filter(Boolean)));
    const topicVariantsLocal = [
      ...topicWords,
      ...topicWords.map(w => (w.endsWith('s') ? w.slice(0, -1) : w + 's'))
    ];
    const autoWords = Object.keys(wordCount).filter(w => wordCount[w] > 1 && !localStop.has(w));
    const validWords = autoWords.filter(w => !topicVariantsLocal.includes(w));

    const groups = {};
    const singles = [];
    const seen = new Set();
    qsWithIntro.forEach(q => {
      const qLower = q.toLowerCase();
      const words = qLower.split(/\W+/).filter(w => w && validWords.includes(w));
      const filteredWords = words.filter(w => !topicVariantsLocal.includes(w));
      if (filteredWords.length === 0) {
        if (!seen.has(q)) {
          singles.push(q);
          seen.add(q);
        }
      } else {
        let assigned = false;
        filteredWords.forEach(word => {
          if (!groups[word]) groups[word] = [];
          if (!seen.has(q)) {
            groups[word].push(q);
            seen.add(q);
            assigned = true;
          }
        });
        if (!assigned && !seen.has(q)) {
          singles.push(q);
          seen.add(q);
        }
      }
    });
    Object.keys(groups).forEach(w => {
      if (groups[w].length === 1) {
        singles.push(groups[w][0]);
        delete groups[w];
      }
    });
    groups['Main Silo'] = singles;
    const keys = ['Main Silo', ...Object.keys(groups).filter(k => k !== 'Main Silo').sort((a, b) => groups[b].length - groups[a].length)];
    const flattened = keys.flatMap(k => groups[k]);
    const bands = keys.map((k, idx) => ({ size: (groups[k] || []).length, color: idx % 2 === 0 ? MAGENTA3 : MAGENTA2 }));
    return { keys, groups, flattened, bands };
  }

  function toTitleCase(s) {
    return String(s || '')
      .toLowerCase()
      .split(/\s+/)
      .map(w => w ? (w[0].toUpperCase() + w.slice(1)) : '')
      .join(' ')
      .trim();
  }

  // ===== Custom filtering helpers =====
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
    if (/\b(best|top rated|top-rated|top 10|top10|highest rated)\b/.test(s)) return true;
    if (/\bmost popular\b/.test(s)) return true;
    return false;
  }

  function isTrendQuestion(q) {
    const s = normalizeText(q);
    return /\b(trend|trending|right now|current|hottest|biggest trend|in \d{4})\b/.test(s);
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

  function questionContainsAllTokens(q, tokens) {
    const s = ' ' + normalizeText(q) + ' ';
    return tokens.every(tok => {
      if (!tok || tok.length < 2) return true;
      const re = new RegExp(`\\b${tok}(s)?\\b`, 'i');
      return re.test(s);
    });
  }

  function canonicalizeForDedup(q) {
    let s = ' ' + normalizeText(q) + ' ';
    s = s
      .replace(/\bis it (ok|okay|good) to\b/g, ' to ')
      .replace(/\bis it (ok|okay|good)\b/g, ' ')
      .replace(/\bshould (i|you)\b/g, ' ')
      .replace(/\bcan (i|you)\b/g, ' ')
      .replace(/\bdo (i|you) need\b/g, ' need ')
      .replace(/\bapply\b/g, ' use ')
      .replace(/\bput\b/g, ' use ')
      .replace(/\beveryday\b/g, ' every day ')
      .replace(/\bon (my|your) lips\b/g, ' on lips ')
      .replace(/\b(for|on) (my|your) lips\b/g, ' for lips ')
      .replace(/\b(okay|ok)\b/g, ' good ')
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  }

  function applyCustomFiltersForTopic(topicItem, list) {
    const core = topicCoreTokens(topicItem);
    let arr = (list || []).filter(q => !hasBestOrTopRated(q) && !isTrendQuestion(q) && !isAttractionPreference(q));
    if (core.length > 0) {
      arr = arr.filter(q => questionContainsAllTokens(q, core));
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

  function getAllAboutTitle(topicStr) {
    const coreTokens = topicCoreTokens(topicStr);
    const core = coreTokens.length > 0 ? coreTokens.join(' ') : String(topicStr || '').trim();
    const coreTitle = toTitleCase(core);
    return `All About ${coreTitle}`;
  }

  async function geminiDedupeSimilar(list, aboutTopic, geminiApiKey) {
    try {
      if (!geminiApiKey || !Array.isArray(list) || list.length < 2) return list;
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are cleaning a list of proposed blog post titles for the topic "${aboutTopic}".\n` +
        `Remove near-duplicates and keep only one best-phrased version per intent. Preserve specificity to ${aboutTopic}.\n` +
        `Return only the final titles, one per line, with no bullets or numbering.` +
        `\n\nTitles:\n${list.join('\n')}`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      // Fallback: only accept if it returned at least 50% of originals to avoid over-pruning mistakes
      if (lines.length > 0 && lines.length <= list.length && lines.length >= Math.ceil(list.length * 0.5)) {
        return Array.from(new Set(lines));
      }
      return list;
    } catch (_) {
      return list;
    }
  }

  // Export to Gemini for deduping and grouping, then update local state
  async function exportAndGroupToGemini(questions, topic) {
    if (!geminiApiKey || questions.length < 2) return questions;
    try {
      const deduped = await geminiDedupeSimilar(questions, topic, geminiApiKey);
      return deduped;
    } catch (err) {
      return questions;
    }
  }

  // Download CSV of current grouped questions
  function downloadCSV() {
    // Use unified grouping for the current view to ensure consistent ordering
    const baseTopic = Array.isArray(topic) ? (topic[0] || '') : (topic || '');
    const { keys: csvKeys, groups: csvGroups } = buildGroupsAndBands(
      multiTopics.length > 1 && typeof paaQuestions === 'object'
        ? Object.values(paaQuestions).flat()
        : dedupedQuestions,
      baseTopic
    );

    let csv = '';
    csvKeys.forEach(group => {
      csv += `"${group}"\n`;
      (csvGroups[group] || []).forEach(q => {
        csv += `,"${toTitleCase(q).replace(/\"/g, '""')}"\n`;
      });
      csv += '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'paa_questions.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const writeOne = async (tabTitle, questions) => {
    const { flattened, bands } = buildGroupsAndBands(questions, tabTitle);
    const count = flattened.length;
    const titleCase = toTitleCase(tabTitle);
    const headerTitle = `${titleCase} - ${count}`;
    const values = (flattened || []).map(q => [toTitleCase(String(q || '').replace(/^\*\s*/, ''))]);
    const body = {
      sheetId: selectedSheet,
      sourceTab: 'Template',
      newTabTitle: topicToTabTitle(tabTitle),
      startCell: 'B11',
      values,
      bands,
      titleCell: 'B10',
      titleValue: headerTitle,
    };
    const jwt = localStorage.getItem('googleJwt') || '';
    if (!jwt) {
      throw new Error('Not signed in to Google. Click "Sign in with Google" first.');
    }
    const res = await fetch('https://blog-setup-server.onrender.com/api/sheets/duplicate-and-write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      // Clear invalid token and notify navbar to refresh UI
      localStorage.removeItem('googleJwt');
      window.dispatchEvent(new Event('googleJwtChanged'));
      throw new Error('Your Google session expired. Please sign in again.');
    }
  if (!res.ok) {
      let msg = 'Export failed';
      try {
        const data = await res.json();
        msg = data?.error || data?.details || msg;
      } catch {}
      throw new Error(msg);
    }
  const json = await res.json();
  return { tabTitle: json?.tabTitle || topicToTabTitle(tabTitle), count };
  }

  // Export grouped questions to Google Sheets (duplicate Template -> write at B11)
  const exportToGoogleSheets = async () => {
    setExportError('');
    if (!selectedSheet) {
      setExportError('Please select a Google Sheet.');
      return;
    }
    if (!templateExists) {
      setExportError('Template tab not found in this sheet.');
      return;
    }
    try {
      setExporting(true);
      const entries = [];
      if (multiTopics.length > 1 && typeof paaQuestions === 'object') {
        // Export each topic as its own tab
        for (const topicItem of multiTopics) {
          const arr = paaQuestions[topicItem] || [];
          if (!arr || arr.length === 0) continue;
          const result = await writeOne(topicItem, arr);
          entries.push({ tabTitle: result.tabTitle, count: result.count });
        }
      } else {
        // Single-topic or pasted list
        const baseTopic = Array.isArray(topic) ? (topic[0] || '') : (topic || 'Silo');
        const list = dedupedQuestions && dedupedQuestions.length > 0 ? dedupedQuestions : [];
        if (list.length === 0) {
          setExportError('Nothing to export. Fetch or paste some questions first.');
        } else {
          const result = await writeOne(baseTopic, list);
          entries.push({ tabTitle: result.tabTitle, count: result.count });
        }
      }
      if (entries.length > 0) {
        const sheetInfo = sheets.find(s => s.id === selectedSheet);
        const sheetTitle = sheetInfo?.title || selectedSheet;
        const totalCount = entries.reduce((sum, e) => sum + (e.count || 0), 0);
        setExportDetails({ sheetTitle, entries, totalCount });
        setExportModalOpen(true);
      }
    } catch (err) {
      setExportError(err?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>People Also Ask (PAA) Questions</h2>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '1rem' }}>
          Depth:
          <input
            type="number"
            min={1}
            max={10}
            value={depth}
            onChange={e => setDepth(Number(e.target.value))}
            style={{ width: '60px', marginLeft: '0.5rem' }}
          />
        </label>
        <label>
          Max Questions:
          <input
            type="number"
            min={1}
            max={100}
            value={maxQuestions}
            onChange={e => setMaxQuestions(Number(e.target.value))}
            style={{ width: '80px', marginLeft: '0.5rem' }}
          />
        </label>
      </div>
      <div>
        <button onClick={fetchPAAQuestions} disabled={loading || !topic}>
          {loading ? 'Fetching...' : `Fetch PAA for "${topic}"`}
        </button>
      </div>
      <div style={{ margin: '1rem 0' }}>
        <textarea
          rows={8}
          cols={60}
          placeholder="Or paste PAA questions here, one per line"
          value={inputText}
          onChange={handleInputChange}
        />
      </div>
      <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button onClick={downloadCSV}>
          Download CSV
        </button>
        <label>
          Google Sheet:
          <select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            {sheets.map(sheet => (
              <option key={sheet.id} value={sheet.id}>{sheet.title}</option>
            ))}
          </select>
        </label>
        {!templateExists && (
          <span style={{ color: 'salmon', fontWeight: 600 }}>
            Template tab not found in this sheet
          </span>
        )}
  <button onClick={exportToGoogleSheets} disabled={exporting || !sheetApiKey || !selectedSheet || !templateExists}>
          {exporting ? 'Exporting...' : 'Export to Google Sheets'}
        </button>
        {exportError && <div style={{ color: 'red', marginTop: '0.5rem' }}>{exportError}</div>}
      </div>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button onClick={() => setModalOpen(true)}>
          Show Full Prefiltered PAA List
        </button>
      </div>
      {multiTopics.length > 1 && typeof paaQuestions === 'object' ? (
        <div>
          {multiTopics.map(topicItem => {
            const topicQuestions = paaQuestions[topicItem] || [];
            // Use unified grouping/ordering for consistency across UI/CSV/Sheets
            const { keys: topicKeys, groups: topicGroups, flattened: topicFlattened } = buildGroupsAndBands(topicQuestions, topicItem);

            // Helper for copy logic per topic (use top-level state)
            const copied = !!copiedTopics[topicItem];
            const showPopup = !!popupTopics[topicItem];
            const handleCopySilo = () => {
              const text = topicFlattened.join('\n');
              navigator.clipboard.writeText(text).then(() => {
                setCopiedTopics(prev => ({ ...prev, [topicItem]: true }));
                setPopupTopics(prev => ({ ...prev, [topicItem]: true }));
                setTimeout(() => {
                  setCopiedTopics(prev => ({ ...prev, [topicItem]: false }));
                  setPopupTopics(prev => ({ ...prev, [topicItem]: false }));
                }, 1500);
              });
            };

            return (
              <div key={topicItem} style={{ marginBottom: '2rem', border: '2px solid #444', borderRadius: '8px', padding: '1rem', position: 'relative' }}>
                {/* Popup confirmation */}
                {showPopup && (
                  <div style={{
                    position: 'absolute',
                    top: 10,
                    right: 50,
                    background: '#333',
                    color: '#fff',
                    padding: '6px 16px',
                    borderRadius: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    fontSize: '1rem',
                    zIndex: 10,
                    transition: 'opacity 0.3s',
                    opacity: showPopup ? 1 : 0
                  }}>
                    Copied!
                  </div>
                )}
                <h3 style={{ color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Silo: {topicItem}
                  <button
                    onClick={handleCopySilo}
                    title="Copy all questions in this silo"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '1rem', padding: 0, display: 'flex', alignItems: 'center' }}
                  >
                    {copied ? (
                      // Checkmark icon
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" fill="#4caf50" />
                        <path d="M7 13l3 3 6-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      // Copy icon
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="7" y="3" width="10" height="14" rx="2" fill="#bbb" stroke="#888" strokeWidth="1.5"/>
                        <rect x="3" y="7" width="10" height="14" rx="2" fill="#222" stroke="#888" strokeWidth="1.5"/>
                        <rect x="7" y="3" width="10" height="14" rx="2" fill="#bbb" opacity="0.7"/>
                      </svg>
                    )}
                  </button>
                </h3>
                <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
                  PAA count: {topicFlattened.length}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#222', color: '#fff', marginBottom: '1rem' }}>
                  <thead>
                    <tr>
                      <th style={{ borderBottom: '1px solid #444', padding: '0.5rem', textAlign: 'left' }}>PAA Question</th>
                      <th style={{ borderBottom: '1px solid #444', padding: '0.5rem', textAlign: 'left' }}>Mini Silo Keyword</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topicKeys.map(word => (
                      (topicGroups[word] || []).map((q, idx) => {
                        const isMain = word === 'Main Silo';
                        const rowBg = isMain ? '#222' : '#333';
                        const cellBg = isMain ? '#222' : '#2a2a2a';
                        return (
                          <tr key={word + '-' + idx} style={{ background: rowBg }}>
                            <td style={{ borderBottom: '1px solid #333', padding: '0.5rem', background: cellBg }}>{q.replace(/^\*\s*/, '')}</td>
                            <td style={{ borderBottom: '1px solid #333', padding: '0.5rem', background: cellBg }}>{word}</td>
                          </tr>
                        );
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ) : Object.keys(wordGroups).length > 0 ? (
        <div>
          <h3>PAA Questions (Mini Silos by Shared Words)</h3>
          <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
            {/* Include injected "All About …" intro in the count */}
            {(() => {
              const baseTopic = Array.isArray(topic) ? (topic[0] || '') : (topic || '');
              const { flattened } = buildGroupsAndBands(dedupedQuestions, baseTopic);
              return <>Filtered PAA count: {flattened.length}</>;
            })()}
          </div>
          {/* Use unified grouping for single-topic view */}
          {(() => {
            const { keys: displaySortedGroupKeys, groups: displayWordGroups } = buildGroupsAndBands(dedupedQuestions, Array.isArray(topic) ? (topic[0] || '') : (topic || ''));
            return (
              <table style={{ width: '100%', borderCollapse: 'collapse', background: '#222', color: '#fff', marginBottom: '2rem' }}>
                <thead>
                  <tr>
                    <th style={{ borderBottom: '1px solid #444', padding: '0.5rem', textAlign: 'left' }}>PAA Question</th>
                    <th style={{ borderBottom: '1px solid #444', padding: '0.5rem', textAlign: 'left' }}>Silo Keyword</th>
                  </tr>
                </thead>
                <tbody>
                  {displaySortedGroupKeys.map(word => (
                    (displayWordGroups[word] || []).map((q, idx) => {
                      const isMain = word === 'Main Silo';
                      const rowBg = isMain ? '#222' : '#333';
                      const cellBg = isMain ? '#222' : '#2a2a2a';
                      return (
                        <tr key={word + '-' + idx} style={{ background: rowBg }}>
                          <td style={{ borderBottom: '1px solid #333', padding: '0.5rem', background: cellBg }}>{q.replace(/^\*\s*/, '')}</td>
                          <td style={{ borderBottom: '1px solid #333', padding: '0.5rem', background: cellBg }}>{word}</td>
                        </tr>
                      );
                    })
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      ) : dedupedQuestions.length > 0 ? (
        <div>
          <h3>PAA Questions (Deduped)</h3>
          <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
            {/* Include injected "All About …" intro in the count */}
            {(() => {
              const baseTopic = Array.isArray(topic) ? (topic[0] || '') : (topic || '');
              const { flattened } = buildGroupsAndBands(dedupedQuestions, baseTopic);
              return <>Filtered PAA count: {flattened.length}</>;
            })()}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#222', color: '#fff', marginBottom: '2rem' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>PAA Question</th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Silo Keyword</th>
              </tr>
            </thead>
            <tbody>
              {dedupedQuestions.map((q, idx) => (
                <tr key={idx}>
                  <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>{q.replace(/^\*\s*/, '')}</td>
                  <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>Main Silo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Full Prefiltered PAA List">
        <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
          {(() => {
            if (multiTopics.length > 1) {
              const total = Object.values(prefilteredByTopic || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
              return <>Unfiltered PAA count: {total}</>;
            }
            return <>Unfiltered PAA count: {prefilteredPAAs.length}</>;
          })()}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#222', color: '#fff', marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>PAA Question (Prefiltered)</th>
            </tr>
          </thead>
          <tbody>
            {(multiTopics.length > 1
              ? Object.values(prefilteredByTopic || {}).flat()
              : prefilteredPAAs
            ).map((q, idx) => (
              <tr key={'prefiltered-' + idx}>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>{q.replace(/^\*\s*/, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
      {/* Export confirmation modal */}
      <Modal open={exportModalOpen} onClose={() => setExportModalOpen(false)} title="Export complete">
        {exportDetails && (
          <div>
            <p style={{ marginTop: 0 }}>
              Exported {exportDetails.totalCount} item{exportDetails.totalCount === 1 ? '' : 's'} to Google Sheet "{exportDetails.sheetTitle}".
            </p>
            <div style={{ color: '#aaa', marginBottom: '0.5rem' }}>
              Includes the "All About …" intro at the top of each tab, title at B10, values from B11, alternating magenta bands, and Arial 12 for questions.
            </div>
            <ul style={{ paddingLeft: '1.25rem' }}>
              {exportDetails.entries.map((e, i) => (
                <li key={i}>
                  {toTitleCase(e.tabTitle)}: {e.count} row{e.count === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: '0.75rem' }}>
              <button className="btn" onClick={() => setExportModalOpen(false)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}

export default PAAFetcher;
