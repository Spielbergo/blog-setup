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
      let kd = parts[2] ? parts[2].replace(/,/g, '').trim() : '';
      // If volume is not a number, skip
      if (!keyword || isNaN(volume)) return null;
      // If KD is not a number, set to null
      kd = kd && !isNaN(kd) ? parseInt(kd) : null;
      return { keyword, volume: parseInt(volume), kd };
    })
    .filter(Boolean);
}

const KeywordUploader = ({ onKeywordsParsed }) => {
  const [inputText, setInputText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [showKeywords, setShowKeywords] = useState(false);
  const [sortBy, setSortBy] = useState('keyword');
  const [sortDir, setSortDir] = useState('asc');

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

  // Sorting logic
  const sortedKeywords = [...keywords].sort((a, b) => {
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
    <div>
      <h2>Upload aHrefs Keyword List</h2>
      <input type="file" accept=".csv,.txt" onChange={handleFileUpload} />
      <br />
      <textarea
        rows={10}
        cols={50}
        placeholder={"Paste keywords, search volumes, and KD here (tab, comma, or double-space separated)\nExample: best mascara\t30000\t12 or best mascara,30000,12 or best mascara  30000  12"}
        value={inputText}
        onChange={handleTextChange}
      />
      <button className="btn" style={{ margin: '1rem 0' }} onClick={() => setShowKeywords(v => !v)}>
        {showKeywords ? 'Hide' : 'Show'} Parsed Keywords ({keywords.length})
      </button>
      {showKeywords && (
        <div>
          <h3>Parsed Keywords</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="kw-table" style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--color-surface)' }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('keyword')}>
                    Keyword {sortBy === 'keyword' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('volume')}>
                    Search Volume {sortBy === 'volume' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('kd')}>
                    KD {sortBy === 'kd' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedKeywords.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.5rem 1rem' }}>{item.keyword}</td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>{item.volume.toLocaleString()}</td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>{item.kd !== null && item.kd !== undefined ? item.kd : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default KeywordUploader;
