import { useState } from 'react';
import KeywordUploader from './components/KeywordUploader';
import TopicSelector from './components/TopicSelector';
import PAAFetcher from './components/PAAFetcher';
import Navbar from './components/Navbar';
import './dashboard.css';

function App() {
  const [keywords, setKeywords] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');

  return (
    <div className="dashboard-container">
      <Navbar />
      <div className="dashboard-main dashboard-three-cols">
        {/* Column 1: Upload keywords */}
        <section className="dashboard-col">
          <h2>Step 1: Upload Keywords</h2>
          <div className="card">
            <KeywordUploader onKeywordsParsed={setKeywords} />
          </div>
        </section>
        {/* Column 2: Select topic */}
        <section className="dashboard-col">
          <h2>Step 2: Select Topic</h2>
          <div className="card">
            {keywords.length > 0 ? (
              <TopicSelector keywords={keywords} onTopicSelected={setSelectedTopic} />
            ) : (
              <p style={{ color: '#888', fontSize: '1.1rem' }}>Upload keywords to enable topic selection.</p>
            )}
          </div>
        </section>
        {/* Column 3: Fetch PAA */}
        <section className="dashboard-col">
          <h2>Step 3: Fetch PAA</h2>
          <div className="card">
            {selectedTopic ? (
              <PAAFetcher topic={selectedTopic} />
            ) : (
              <p style={{ color: '#888', fontSize: '1.1rem' }}>Select a topic to fetch PAA questions.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;