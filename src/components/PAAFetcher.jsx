import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Modal from './Modal';


const PAAFetcher = ({ topic }) => {
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

  const [modalOpen, setModalOpen] = useState(false);
  const [prefilteredPAAs, setPrefilteredPAAs] = useState([]);

  // Call Express API for PAA questions
  const fetchPAAQuestions = async () => {
    console.log('Fetch PAA called with topic:', topic);
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      setError('Please enter a topic before fetching PAA questions.');
      return;
    }
    setLoading(true);
    setError('');
    console.log('Starting fetchPAAQuestions...');
    try {
      // 1. Fetch PAAs from backend
      const res = await fetch('https://blog-setup-server.onrender.com/api/paa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: topic, depth, maxQuestions })
      });
      console.log('PAA fetch response:', res);
      let data;
      try {
        data = await res.json();
        console.log('PAA fetch JSON:', data);
      } catch (jsonErr) {
        console.error('Error parsing backend response:', jsonErr);
        setError('Error parsing backend response.');
        setPaaQuestions([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        console.error('Backend error:', data?.error);
        setError(data?.error ? `Backend error: ${data.error}` : 'Failed to fetch PAA questions');
        setPaaQuestions([]);
        setLoading(false);
        return;
      }
      let paaList = data.questions || [];
      console.log('Fetched PAA list:', paaList);
      setPrefilteredPAAs(paaList);

      // 2. Fetch blog titles from 'All Blogs' tab in selectedSheet
      let blogTitles = [];
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${selectedSheet}/values/All Blogs?key=${sheetApiKey}`;
        const blogRes = await fetch(url);
        console.log('Blog titles fetch response:', blogRes);
        if (blogRes.ok) {
          const blogData = await blogRes.json();
          console.log('Blog titles JSON:', blogData);
          // Flatten and clean titles
          blogTitles = (blogData.values || []).map(row => row[0]?.trim()).filter(Boolean);
        }
      } catch (err) {
        console.error('Error fetching blog titles:', err);
        // Ignore blog fetch errors, just skip filtering
      }

      // 3. Normalize and filter PAAs against blog titles (less aggressive)
      function normalize(str) {
        return str.toLowerCase().replace(/[^a-z0-9 ]/gi, '').trim();
      }
      const normTitles = blogTitles.map(normalize);
      let filteredPAAs = paaList.filter(paa => {
        const normPAA = normalize(paa);
        return !normTitles.some(title => {
          // Only filter if exact match
          if (normPAA === title) return true;
          // Or if blog title is long (>=5 words) and is substring of PAA
          const titleWordCount = title.split(' ').filter(Boolean).length;
          if (titleWordCount >= 5 && normPAA.includes(title)) return true;
          return false;
        });
      });
      console.log('Filtered PAAs after blog title check:', filteredPAAs);

      // 4. Use Gemini to remove PAAs that are semantically similar to blog titles (run for all PAAs)
      if (geminiApiKey && filteredPAAs.length > 0 && blogTitles.length > 0) {
        try {
          const genAI = new GoogleGenerativeAI(geminiApiKey);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
          // Prompt: return only PAAs that are NOT similar to any of these blog titles
          const prompt = `Here is a list of blog titles:\n${blogTitles.join('\n')}\nHere is a list of new PAA questions:\n${filteredPAAs.join('\n')}\nReturn only the PAA questions that are NOT similar in meaning to any of the blog titles. Only return the questions, one per line.`;
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          const geminiFiltered = text.split(/\n|\r/).map(q => q.trim()).filter(Boolean);
          // Only use Gemini result if it looks like a list of questions
          if (geminiFiltered.length > 0 && geminiFiltered.every(q => q.endsWith('?'))) {
            filteredPAAs = geminiFiltered;
          }
          console.log('Filtered PAAs after Gemini:', filteredPAAs);
        } catch (err) {
          console.error('Error in Gemini filtering:', err);
          // Ignore Gemini errors, keep default filteredPAAs
        }
      }

      setPaaQuestions(filteredPAAs);
      console.log('Final PAAs set to state:', filteredPAAs);
    } catch (err) {
      setError('Error fetching PAA questions. Is the backend running?');
      setPaaQuestions([]);
    }
    setLoading(false);
  }; // end fetchPAAQuestions

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
    'apply','remove','different','waterproof','prevent','cause','choose','compare','types','benefits','side effects','safe','natural','diy','tips','tricks','methods','ingredients','effective','permanent','temporary','price','cost','reviews','recommend','avoid','problems','solutions','strongest','actually','injections','permanently', 'color'
  ];

  // Filter out stopwords from groupWords before grouping
  const validGroupWords = groupWords.filter(w => !stopwords.includes(w));

  // Group questions by validGroupWords, but filter out topic variants
  let wordGroups = {};
  let singleItems = [];
  const seenQuestions = new Set();
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
  // Move single-item silos to Main Silo
  Object.keys(wordGroups).forEach(word => {
    if (wordGroups[word].length === 1) {
      singleItems.push(wordGroups[word][0]);
      delete wordGroups[word];
    }
  });
  wordGroups['Main Silo'] = singleItems;
  const sortedGroupKeys = ['Main Silo', ...Object.keys(wordGroups).filter(k => k !== 'Main Silo').sort((a, b) => wordGroups[b].length - wordGroups[a].length)];

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
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={() => setModalOpen(true)}>
          Show Full Prefiltered PAA List
        </button>
      </div>
      {Object.keys(wordGroups).length > 0 ? (
        <div>
          <h3>PAA Questions (Mini Silos by Shared Words)</h3>
          <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
            Filtered PAA count: {dedupedQuestions.length}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: '#222', color: '#fff', marginBottom: '2rem' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem', textAlign: 'left' }}>PAA Question</th>
                <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>Silo Keyword</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroupKeys.map(word => (
                wordGroups[word].map((q, idx) => {
                  // Color code: Main Silo = default, others = lighter
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
      ) : dedupedQuestions.length > 0 ? (
        <div>
          <h3>PAA Questions (Deduped)</h3>
          <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
            Filtered PAA count: {dedupedQuestions.length}
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
          Unfiltered PAA count: {prefilteredPAAs.length}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#222', color: '#fff', marginBottom: '2rem' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #444', padding: '0.5rem' }}>PAA Question (Prefiltered)</th>
            </tr>
          </thead>
          <tbody>
            {prefilteredPAAs.map((q, idx) => (
              <tr key={'prefiltered-' + idx}>
                <td style={{ borderBottom: '1px solid #333', padding: '0.5rem' }}>{q.replace(/^\*\s*/, '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
export default PAAFetcher;
