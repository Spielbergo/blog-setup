import React, { useState } from 'react';
// Vite exposes env variables prefixed with VITE_ via import.meta.env
import { GoogleGenerativeAI } from '@google/generative-ai';


const TopicSelector = ({ keywords, onTopicSelected, onRelatedTopics }) => {
  const [mainTopic, setMainTopic] = useState('');
  const [relatedTopics, setRelatedTopics] = useState([]);
  const defaultApiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const [apiKey, setApiKey] = useState(defaultApiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRelatedTopicsGemini = async (topic) => {
    setLoading(true);
    setError('');
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      // Prepare prompt with keywords
      const keywordList = keywords.map(k => k.keyword).join(', ');
      const prompt = `Given the main topic "${topic}", suggest 10 closely related topics from this list: ${keywordList}. Return only the topics from the list, no explanations.`;
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

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  const handleSuggest = () => {
    if (!apiKey) {
      setError('Please enter your Gemini API key.');
      return;
    }
    fetchRelatedTopicsGemini(mainTopic);
    if (onTopicSelected) onTopicSelected(mainTopic);
  };

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2>Select Main Topic</h2>
      <input
        type="text"
        value={mainTopic}
        onChange={handleTopicChange}
        placeholder="Enter main topic (e.g., lipstick)"
        style={{ width: '300px', marginRight: '1rem' }}
      />
      <div style={{ margin: '1rem 0' }}>
        <input
          type="password"
          value={apiKey}
          onChange={handleApiKeyChange}
          placeholder="Gemini API Key"
          style={{ width: '300px', marginRight: '1rem' }}
        />
        <span style={{ fontSize: '0.9em', color: '#888' }}>Required for AI suggestions</span>
      </div>
      <button onClick={handleSuggest} disabled={!mainTopic || !apiKey || loading}>
        {loading ? 'Suggesting...' : 'Suggest Related Topics'}
      </button>
      {error && <div style={{ color: 'red', marginTop: '1rem' }}>{error}</div>}
      {relatedTopics.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Related Topics</h3>
          <ul>
            {relatedTopics.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '0.5rem' }}>
                {item.keyword} ({item.volume.toLocaleString()})
                <button style={{ marginLeft: '1rem' }} onClick={() => onTopicSelected(item.keyword)}>
                  Select & Run PAA
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default TopicSelector;
