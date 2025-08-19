import React, { useState, useRef } from 'react';
// Vite exposes env variables prefixed with VITE_ via import.meta.env
import { GoogleGenerativeAI } from '@google/generative-ai';
import './TopicSelector.css';


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

  // Propagate selection to parent immediately
  const propagateSelection = (topics) => {
    if (!onTopicSelected) return;
    if (!topics || topics.length === 0) {
      onTopicSelected('');
    } else if (topics.length === 1) {
      onTopicSelected(topics[0]);
    } else {
      onTopicSelected(topics);
    }
  };

  const fetchRelatedTopicsGemini = async (topic) => {
    setLoading(true);
    setError('');
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
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
    const value = e.target.value;
    setMainTopic(value);
    // If nothing is selected via checkboxes, reflect the manual input on the Fetch PAA button
    if (selectedTopics.length === 0) {
      if (value && value.trim()) {
        onTopicSelected && onTopicSelected(value.trim());
      } else {
        onTopicSelected && onTopicSelected('');
      }
    }
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
    <div className="ts-container">
      <h2>Select Main Topic</h2>
      <input
        type="text"
        value={mainTopic}
        onChange={handleTopicChange}
        placeholder="Enter main topic (e.g., lipstick)"
        className="ts-input"
      />
      <button className="btn ts-suggest-btn" onClick={handleSuggest} disabled={!mainTopic || loading}>
        {loading ? 'Suggesting...' : 'Suggest Related Topics'}
      </button>
      {loading && (
        <div className="ts-loader-wrap">
          <span className="loader-spinner"></span>
        </div>
      )}
  {error && <div className="ts-error">{error}</div>}
      {relatedTopics.length > 0 ? (
        <div className="ts-related-wrap">
          <h3>Related Topics</h3>
          <div className="ts-count">
            Related topics count: {relatedTopics.length}
          </div>
          <table className="kw-table ts-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem 1rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedTopics.length === sortedTopics.length && sortedTopics.length > 0}
                    indeterminate={selectedTopics.length > 0 && selectedTopics.length < sortedTopics.length ? "true" : undefined}
                    className="ts-checkbox"
                    onChange={e => {
                      if (e.target.checked) {
                        const next = sortedTopics.map(t => t.keyword);
                        setSelectedTopics(next);
                        propagateSelection(next);
                      } else {
                        setSelectedTopics([]);
                        propagateSelection([]);
                      }
                    }}
                  />
                </th>
                <th className="ts-th-topic" onClick={() => handleSort('keyword')}>
                    Topic {sortBy === 'keyword' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="ts-th-center" onClick={() => handleSort('volume')}>
                  Search Volume {sortBy === 'volume' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>

                <th className="ts-th-kd" onClick={() => handleSort('kd')}>
                  KD {sortBy === 'kd' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                </th>

                {/* Removed Action column */}
              </tr>
            </thead>
            <tbody>
              {sortedTopics.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ textAlign: 'left' }}>
                    <input
                      type="checkbox"
                      checked={selectedTopics.includes(item.keyword)}
                      className="ts-checkbox"
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
                          propagateSelection(newSelected);
                        } else {
                          let next;
                          if (e.target.checked) {
                            next = [...selectedTopics, item.keyword];
                          } else {
                            next = selectedTopics.filter(t => t !== item.keyword);
                          }
                          setSelectedTopics(next);
                          propagateSelection(next);
                        }
                        lastCheckedIndexRef.current = idx;
                      }}
                      onChange={() => {}}
                    />
                  </td>
                  <td className="ts-td-topic">{item.keyword}</td>
                  <td className="ts-td-center">{item.volume.toLocaleString()}</td>
                  <td className="ts-td-center">{item.kd !== null && item.kd !== undefined ? item.kd : '-'}</td>
                  {/* Removed per-row Select button */}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="ts-footer-cell">
                  <input
                    type="checkbox"
                    checked={selectedTopics.length === sortedTopics.length && sortedTopics.length > 0}
                    indeterminate={selectedTopics.length > 0 && selectedTopics.length < sortedTopics.length ? "true" : undefined}
                    className="ts-checkbox"
                    onChange={e => {
                      if (e.target.checked) {
                        const next = sortedTopics.map(t => t.keyword);
                        setSelectedTopics(next);
                        propagateSelection(next);
                      } else {
                        setSelectedTopics([]);
                        propagateSelection([]);
                      }
                    }}
                  />
                  Select/Deselect All
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (!loading && mainTopic && (
        <div className="ts-empty">
          No related topics found
        </div>
      ))}
    </div>
  );
};

export default TopicSelector;
