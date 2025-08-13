import React, { useState } from 'react';

function parseKeywords(text) {
  // Split lines and parse tab, comma, or multiple spaces
  return text
    .split('\n')
    .map(line => {
      // Try tab, then comma, then multiple spaces
      let parts = line.split(/\t|,|\s{2,}/);
      if (parts.length < 2) return null;
      let keyword = parts[0].trim();
      let volume = parts[1].replace(/,/g, '').trim();
      // If volume is not a number, skip
      if (!keyword || isNaN(volume)) return null;
      return { keyword, volume: parseInt(volume) };
    })
    .filter(Boolean);
}

const KeywordUploader = ({ onKeywordsParsed }) => {
  const [inputText, setInputText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [showKeywords, setShowKeywords] = useState(false);

  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      setInputText(evt.target.result);
      const parsed = parseKeywords(evt.target.result);
      setKeywords(parsed);
      if (onKeywordsParsed) onKeywordsParsed(parsed);
    };
    reader.readAsText(file);
  };

  const handleTextChange = e => {
    setInputText(e.target.value);
    const parsed = parseKeywords(e.target.value);
    setKeywords(parsed);
    if (onKeywordsParsed) onKeywordsParsed(parsed);
  };

  return (
    <div>
      <h2>Upload aHrefs Keyword List</h2>
      <input type="file" accept=".csv,.txt" onChange={handleFileUpload} />
      <br />
      <textarea
        rows={10}
        cols={50}
        placeholder="Paste keywords and search volumes here (tab, comma, or double-space separated)\nExample: best mascara\t30000 or best mascara,30000 or best mascara  30000"
        value={inputText}
        onChange={handleTextChange}
      />
      <button style={{ margin: '1rem 0' }} onClick={() => setShowKeywords(v => !v)}>
        {showKeywords ? 'Hide' : 'Show'} Parsed Keywords ({keywords.length})
      </button>
      {showKeywords && (
        <div>
          <h3>Parsed Keywords</h3>
          <ul>
            {keywords.map((item, idx) => (
              <li key={idx}>{item.keyword} ({item.volume.toLocaleString()})</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default KeywordUploader;
