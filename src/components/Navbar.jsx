import React, { useState, useEffect } from 'react';
import './Navbar.css';

const Navbar = () => {
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [userName, setUserName] = useState('');
  // Removed server status feature

  // JWT state
  const [jwt, setJwt] = useState(() => localStorage.getItem('googleJwt') || '');

  useEffect(() => {
    async function checkAuth() {
      if (!jwt) {
        setIsGoogleAuthed(false);
        setUserName('');
        return;
      }
      try {
        const res = await fetch('https://blog-setup-server.onrender.com/api/auth/status', {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        if (res.ok) {
          const data = await res.json();
          setIsGoogleAuthed(true);
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
  }, [jwt]);

  // Check server status
  // Removed server status feature

  // Google sign in
  const handleGoogleSignIn = () => {
    window.location.href = 'https://blog-setup-server.onrender.com/api/auth/google';
  };

  // Google sign out
  const handleGoogleSignOut = () => {
    localStorage.removeItem('googleJwt');
    setJwt('');
    setIsGoogleAuthed(false);
    setUserName('');
  };

  return (
    <div className="navbar">
      <div className="navbar-title">Blog Silo Setup Tool <span style={{ fontSize: '0.8rem', color: '#aaa', fontWeight: 'normal' }}>1. Make sure server is running &nbsp; 2. Sign in only needed to WRITE to Google Sheets</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          className="navbar-btn"
          onClick={() => window.open('https://blog-setup-server.onrender.com', '_blank', 'noopener,noreferrer')}
        >
          Start Server
        </button>
        {!isGoogleAuthed && (
          <button className="navbar-btn" onClick={handleGoogleSignIn}>
            Sign in with Google
          </button>
        )}
      </div>
      {isGoogleAuthed && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <div
            style={{ color: '#4caf50', fontSize: '0.95rem', marginTop: '0.25rem', fontWeight: 'bold', cursor: 'pointer', position: 'relative', marginRight: 20 }}
            className="sheets-status-hover"
          >
            Connected to Google Sheets
            <button
              className="navbar-btn-signout"
              onClick={handleGoogleSignOut}
              style={{
                position: 'absolute',
                right: '-110px',
                top: '0',
                opacity: 0,
                pointerEvents: 'none',
                transition: 'opacity 0.2s',
                background: '#333',
                color: '#fff',
                fontSize: '0.85rem',
                padding: '4px 12px',
                borderRadius: '4px',
                border: 'none',
                fontWeight: 'normal',
                zIndex: 2,
              }}
              id="signout-btn"
            >
              Sign out
            </button>
          </div>
          {userName && (
            <div style={{ color: '#fff', fontSize: '0.95rem', marginTop: '0.15rem', fontWeight: 'bold' }}>
              Signed in as {userName.split(' ')[0]}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Navbar;
