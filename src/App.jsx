import React, { useState } from 'react';
import Navbar from './components/Navbar';
import KeywordUploader from './components/KeywordUploader';
import TopicSelector from './components/TopicSelector';
import PAAFetcher from './components/PAAFetcher';

import './App.css'; 
import './styles.css'; // Assuming you have a styles.css for global styles

function App() {
  const [keywords, setKeywords] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [isAuthed, setIsAuthed] = useState(() => {
    return localStorage.getItem('minion_authed') === 'true';
  });
  const [passwordInput, setPasswordInput] = useState('');
  const PASSWORD = 'Garyrooney88$'; // Change this to your desired password

  if (!isAuthed) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(24,26,32,0.98)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          background: '#23262f',
          padding: '2rem 2.5rem',
          borderRadius: '16px',
          boxShadow: '0 2px 16px rgba(0,0,0,0.18)',
          textAlign: 'center',
        }}>
          <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Protected</h2>
          <input
            type="password"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            placeholder="Enter password"
            style={{
              padding: '0.7rem 1rem',
              borderRadius: '8px',
              border: '1px solid #333a47',
              fontSize: '1.1rem',
              background: '#181a20',
              color: '#e0e0e0',
              marginBottom: '1rem',
              width: '220px',
            }}
          />
          <br />
          <button
            className="btn"
            style={{ width: '220px', marginTop: '0.5rem' }}
            onClick={() => {
              if (passwordInput === PASSWORD) {
                setIsAuthed(true);
                localStorage.setItem('minion_authed', 'true');
              } else {
                setPasswordInput('');
              }
            }}
          >
            Unlock
          </button>
          <div style={{ color: '#888', marginTop: '1rem', fontSize: '0.95em' }}>
            {passwordInput && passwordInput !== PASSWORD ? 'Incorrect password.' : ''}
          </div>
        </div>
      </div>
    );
  }

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