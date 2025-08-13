

import { useState } from 'react';
import KeywordUploader from './components/KeywordUploader';
import TopicSelector from './components/TopicSelector';


import PAAFetcher from './components/PAAFetcher';

function App() {
  const [keywords, setKeywords] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');

  return (
    <div style={{ maxWidth: 700, margin: '2rem auto', padding: '1rem' }}>
      <h1>Blog Silo Minion</h1>
      <KeywordUploader onKeywordsParsed={setKeywords} />
      {keywords.length > 0 && (
        <>
          <TopicSelector keywords={keywords} onTopicSelected={setSelectedTopic} />
          {selectedTopic && <PAAFetcher topic={selectedTopic} />}
        </>
      )}
    </div>
  );
}

export default App;
