import React, { useState, useRef } from 'react';
// Vite exposes env variables prefixed with VITE_ via import.meta.env
import { GoogleGenerativeAI } from '@google/generative-ai';


const TopicSelector = ({ keywords, onTopicSelected, onRelatedTopics }) => {
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [mainTopic, setMainTopic] = useState('');
  const [relatedTopics, setRelatedTopics] = useState([]);
  const [sortBy, setSortBy] = useState('keyword');
  const [sortDir, setSortDir] = useState('asc');
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Persist last checked index for shift-click multi-select
  const lastCheckedIndexRef = useRef(null);

  const fetchRelatedTopicsGemini = async (topic) => {
    setLoading(true);
    setError('');
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      // Prepare prompt with keywords
      const keywordList = keywords.map(k => k.keyword).join(', ');
      const prompt = `Given the main topic "${topic}", suggest all closely related topics from this list: ${keywordList}. Return only the topics from the list, no explanations.`;
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      // Split Gemini response into topics
      let suggested = text.split(/\n|,|\d+\.\s*/).map(s => s.trim()).filter(Boolean);
      // Map back to keyword objects
      const suggestions = keywords.filter(k => suggested.some(s => k.keyword.toLowerCase() === s.toLowerCase()));
      setRelatedTopics(suggestions);
      if (onRelatedTopics) onRelatedTopics(suggestions);
    } catch (err) {
      setError('Error fetching from Gemini API. Check your API key and try again.');
      setRelatedTopics([]);
    }
    setLoading(false);
  };

  const handleTopicChange = (e) => {
    setMainTopic(e.target.value);
  };


  const handleSuggest = () => {
    if (!apiKey) {
      setError('Please enter your Gemini API key.');
      return;
    }
    fetchRelatedTopicsGemini(mainTopic);
    if (onTopicSelected) onTopicSelected(mainTopic);
  };

  // Sorting logic for related topics
  const sortedTopics = [...relatedTopics].sort((a, b) => {
    let valA = a[sortBy] ?? '';
    let valB = b[sortBy] ?? '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = col => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>Select Main Topic</h2>
      <input
        type="text"
        value={mainTopic}
        onChange={handleTopicChange}
        placeholder="Enter main topic (e.g., lipstick)"
        style={{ width: '280px', marginRight: '1rem' }}
      />
      <button className="btn" onClick={handleSuggest} disabled={!mainTopic || loading} style={{ minWidth: '180px' }}>
        {loading ? 'Suggesting...' : 'Suggest Related Topics'}
      </button>
      {loading && (
        <div style={{ marginTop: '2.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
          <span className="loader-spinner" style={{
            display: 'inline-block',
            width: '32px',
            height: '32px',
            border: '4px solid #4285F4',
            borderTop: '4px solid #22242c',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}></span>
        </div>
      )}
      {error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}
      {relatedTopics.length > 0 && (
        <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
          {/* lastCheckedIndexRef is now a top-level hook, per React rules */}
          <button
            className="btn"
            style={{
              marginBottom: '1rem',
              background: selectedTopics.length === 0 ? '#444' : '',
              color: selectedTopics.length === 0 ? '#ccc' : '',
              cursor: selectedTopics.length === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedTopics.length === 0 ? 0.6 : 1
            }}
            disabled={selectedTopics.length === 0}
            onClick={() => {
              if (onTopicSelected && selectedTopics.length > 0) {
                // If only one topic is selected, pass as string; else pass array
                if (selectedTopics.length === 1) {
                  onTopicSelected(selectedTopics[0]);
                } else {
                  onTopicSelected(selectedTopics);
                }
              }
            }}
          >
            Fetch All Selected
          </button>
          <h3>Related Topics</h3>
          <div style={{ marginBottom: '0.5rem', color: '#aaa' }}>
            Related topics count: {relatedTopics.length}
          </div>
          <table className="kw-table" style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem 1rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedTopics.length === sortedTopics.length && sortedTopics.length > 0}
                    indeterminate={selectedTopics.length > 0 && selectedTopics.length < sortedTopics.length ? "true" : undefined}
                    style={{ width: 15, height: 15, marginRight: '0.5rem' }}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedTopics(sortedTopics.map(t => t.keyword));
                      } else {
                        setSelectedTopics([]);
                      }
                    }}
                  />
                </th>
                <th style={{ cursor: 'pointer', textAlign: 'left', paddingLeft: 0 }} onClick={() => handleSort('keyword')}>
                    Topic {sortBy === 'keyword' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => handleSort('volume')}>
                  Search Volume {sortBy === 'volume' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>

                <th style={{ cursor: 'pointer', textAlign: 'center', width: 40 }} onClick={() => handleSort('kd')}>
                  KD {sortBy === 'kd' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>

                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedTopics.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ textAlign: 'left' }}>
                    <input
                      type="checkbox"
                      checked={selectedTopics.includes(item.keyword)}
                      style={{ width: 15, height: 15, marginRight: '0.5rem' }}
                      onClick={e => {
                        if (e.shiftKey && lastCheckedIndexRef.current !== null) {
                          const start = Math.min(lastCheckedIndexRef.current, idx);
                          const end = Math.max(lastCheckedIndexRef.current, idx);
                          const rangeKeywords = sortedTopics.slice(start, end + 1).map(t => t.keyword);
                          let newSelected;
                          if (e.target.checked) {
                            newSelected = Array.from(new Set([...selectedTopics, ...rangeKeywords]));
                          } else {
                            newSelected = selectedTopics.filter(t => !rangeKeywords.includes(t));
                          }
                          setSelectedTopics(newSelected);
                        } else {
                          if (e.target.checked) {
                            setSelectedTopics([...selectedTopics, item.keyword]);
                          } else {
                            setSelectedTopics(selectedTopics.filter(t => t !== item.keyword));
                          }
                        }
                        lastCheckedIndexRef.current = idx;
                      }}
                      onChange={() => {}}
                    />
                  </td>
                  <td style={{ padding: '0.5rem 1rem 0.5rem 0' }}>{item.keyword}</td>
                  <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>{item.volume.toLocaleString()}</td>
                  <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>{item.kd !== null && item.kd !== undefined ? item.kd : '-'}</td>
                  <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                    <button className="btn" onClick={() => onTopicSelected(item.keyword)}>
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'left', padding: '0.5rem 0 0.5rem 16px' }}>
                  <input
                    type="checkbox"
                    checked={selectedTopics.length === sortedTopics.length && sortedTopics.length > 0}
                    indeterminate={selectedTopics.length > 0 && selectedTopics.length < sortedTopics.length ? "true" : undefined}
                    style={{ width: 15, height: 15, marginRight: '1rem' }}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedTopics(sortedTopics.map(t => t.keyword));
                      } else {
                        setSelectedTopics([]);
                      }
                    }}
                  />
                  Select/Deselect All
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default TopicSelector;
