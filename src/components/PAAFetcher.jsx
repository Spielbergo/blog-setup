import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';


const PAAFetcher = ({ topic }) => {
  // Google OAuth state
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [userName, setUserName] = useState('');

  // Check auth status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('http://localhost:4000/api/auth/status', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setIsGoogleAuthed(data.authed);
          setUserName(data.name || '');
        } else {
          setIsGoogleAuthed(false);
          setUserName('');
        }
      } catch {
        setIsGoogleAuthed(false);
        setUserName('');
      }
    }
    checkAuth();
  }, []);

  // Sign in handler
  const handleGoogleSignIn = () => {
    window.open('http://localhost:4000/api/auth/google', '_blank', 'width=500,height=600');
  };

  // Sign out handler
  const handleGoogleSignOut = async () => {
    await fetch('http://localhost:4000/api/auth/logout', { method: 'POST', credentials: 'include' });
    setIsGoogleAuthed(false);
    setUserName('');
  };
  // Get API key from .env
  const sheetApiKey = import.meta.env.VITE_GOOGLE_SHEETS_API_KEY || '';
  const sheetId1 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_1 || '';
  const sheetId2 = import.meta.env.VITE_GOOGLE_SHEETS_SHEET_ID_2 || '';

  // Sheet IDs (move above useState)
  const sheets = [
    { id: sheetId1, title: 'Lip Stuff' },
    { id: sheetId2, title: 'Mascara' }
  ];

  // Google Sheets Export (API key from .env, dropdowns for sheet/tab, Download CSV)
  // Set initial sheet to first in list
  const [selectedSheet, setSelectedSheet] = useState(sheets[0]?.id || '');
  const [selectedTab, setSelectedTab] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

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

  // Call Express API for PAA questions
  const fetchPAAQuestions = async () => {
    console.log('Fetch PAA called with topic:', topic);
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      setError('Please enter a topic before fetching PAA questions.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:4000/api/paa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: topic, depth, maxQuestions })
      });
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        setError('Error parsing backend response.');
        setPaaQuestions([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        // Show backend error message if available
        setError(data?.error ? `Backend error: ${data.error}` : 'Failed to fetch PAA questions');
        setPaaQuestions([]);
        setLoading(false);
        return;
      }
      setPaaQuestions(data.questions || []);
    } catch (err) {
      setError('Error fetching PAA questions. Is the backend running?');
      setPaaQuestions([]);
    }
    setLoading(false);
  };

  const handleInputChange = e => {
    setInputText(e.target.value);
    const questions = e.target.value.split('\n').map(q => q.trim()).filter(Boolean);
    setPaaQuestions(questions);
  };

  // Deduplicate questions
  const dedupedQuestionsRaw = Array.from(new Set(paaQuestions.map(q => q.trim()).filter(Boolean)));

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
  const dedupedQuestions = filteredQuestions;

  // Expanded stopwords
  const stopwords = [
    'what','how','why','when','where','who','is','are','do','does','can','should','could','will','would','did','was','were','the','a','an','to','in','on','for','of','this','that','these','those','it','its','and','but','or','if','with','as','by','at','from','about','after','before','so','then','than','all','any','be','not','my','your','their','our','his','her','has','have','had','you','me','i'
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
  const mainTopic = topic.toLowerCase();
  // Variants: split topic into words, add singular/plural forms
  const topicWords = Array.from(new Set(mainTopic.split(/\W+/).filter(Boolean)));
  const topicVariants = [mainTopic, ...topicWords, ...topicWords.map(w => w.endsWith('s') ? w.slice(0, -1) : w + 's')];
  // Descriptive/how-to words to prioritize
  const priorityWords = [
    'apply','remove','different','waterproof','prevent','cause','choose','compare','types','benefits','side effects','safe','natural','diy','tips','tricks','methods','ingredients','effective','permanent','temporary','price','cost','reviews','recommend','avoid','problems','solutions','strongest','actually','injections','permanently'
  ];

  // Group questions by groupWords, but filter out topic variants
  const wordGroups = {};
  const seenQuestions = new Set();
  dedupedQuestions.forEach(q => {
    const qLower = q.toLowerCase();
    // Only include questions that contain the main topic or its variants
    if (!topicVariants.some(v => qLower.includes(v))) return;
    const words = qLower.split(/\W+/).filter(w => w && groupWords.includes(w));
    // Remove groups for topic variants
    const filteredWords = words.filter(w => !topicVariants.includes(w));
    if (filteredWords.length === 0) {
      if (!wordGroups['Main Silo']) wordGroups['Main Silo'] = [];
      if (!seenQuestions.has(q)) {
        wordGroups['Main Silo'].push(q);
        seenQuestions.add(q);
      }
    } else {
      filteredWords.forEach(word => {
        if (!wordGroups[word]) wordGroups[word] = [];
        if (!seenQuestions.has(q)) {
          wordGroups[word].push(q);
          seenQuestions.add(q);
        }
      });
    }
  });

  // Sort groups: priority words first, then alphabetically
  const sortedGroupKeys = Object.keys(wordGroups).sort((a, b) => {
    const aPriority = priorityWords.indexOf(a);
    const bPriority = priorityWords.indexOf(b);
    if (aPriority === -1 && bPriority === -1) return a.localeCompare(b);
    if (aPriority === -1) return 1;
    if (bPriority === -1) return -1;
    return aPriority - bPriority;
  });

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
        // Set initial tab to first tab if not already set
        if (tabNames.length > 0 && selectedTab !== tabNames[0]) setSelectedTab(tabNames[0]);
      } catch (err) {
        setTabs([]);
      }
    }
    fetchTabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSheet, sheetApiKey]);

  async function exportToGoogleSheets() {
    setExporting(true);
    setExportError('');
    try {
      // Prepare data: each group as a section, each question as a row
      const rows = [];
      sortedGroupKeys.forEach(group => {
        rows.push([group]);
        wordGroups[group].forEach(q => rows.push(['', q]));
        rows.push(['']);
      });
      // Google Sheets API: batchUpdate (dummy range, use selectedTab)
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${selectedSheet}/values/${selectedTab}!A1:append?valueInputOption=RAW&key=${sheetApiKey}`;
      const body = { values: rows };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Google Sheets API error');
      setExporting(false);
      alert('Exported to Google Sheets!');
    } catch (err) {
      setExporting(false);
      setExportError('Export failed: ' + (err.message || 'Unknown error'));
    }
  }

  // Download CSV
  function downloadCSV() {
    // Prepare CSV content
    let csv = '';
    sortedGroupKeys.forEach(group => {
      csv += `"${group}"\n`;
      wordGroups[group].forEach(q => {
        csv += `,"${q.replace(/"/g, '""')}"\n`;
      });
      csv += '\n';
    });
    // Create blob and download
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

  // Top bar UI
  const topBarStyle = {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: '1px solid #eee',
    marginBottom: '2rem',
    minHeight: '48px',
    background: '#fafafa',
  };

  return (
    <>
      <div style={topBarStyle}>
        {!isGoogleAuthed ? (
          <button onClick={handleGoogleSignIn} style={{ fontWeight: 'bold', padding: '0.5rem 1rem', borderRadius: '20px', background: '#4285F4', color: 'white', border: 'none', cursor: 'pointer' }}>Sign in with Google</button>
        ) : (
          <>
            <button onClick={handleGoogleSignOut} style={{ marginRight: '1rem', padding: '0.5rem 1rem', borderRadius: '20px', background: '#eee', color: '#333', border: 'none', cursor: 'pointer' }}>Sign out</button>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4285F4', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
              {userName ? userName.charAt(0).toUpperCase() : '?'}
            </div>
          </>
        )}
      </div>
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
      <div style={{ margin: '1rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
        <label>
          Tab:
          <select value={selectedTab} onChange={e => setSelectedTab(e.target.value)} style={{ marginLeft: '0.5rem' }}>
            {tabs.map(tab => (
              <option key={tab} value={tab}>{tab}</option>
            ))}
          </select>
        </label>
        <button onClick={exportToGoogleSheets} disabled={exporting || !sheetApiKey || !selectedSheet || !selectedTab}>
          {exporting ? 'Exporting...' : 'Export to Google Sheets'}
        </button>
        {exportError && <div style={{ color: 'red', marginTop: '0.5rem' }}>{exportError}</div>}
      </div>
      {Object.keys(wordGroups).length > 0 ? (
        <div>
          <h3>PAA Questions (Mini Silos by Shared Words)</h3>
          {sortedGroupKeys.map(word => (
            <div key={word} style={{ marginBottom: '1rem' }}>
              <strong>{word.charAt(0).toUpperCase() + word.slice(1)}</strong>
              <ul>
                {wordGroups[word].map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        dedupedQuestions.length > 0 && (
          <div>
            <h3>PAA Questions (Deduped)</h3>
            <ul>
              {dedupedQuestions.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )
      )}
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
    </>
  );
};

export default PAAFetcher;
