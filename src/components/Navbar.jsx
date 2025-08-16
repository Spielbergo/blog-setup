import React, { useState, useEffect } from 'react';
import './Navbar.css';

const Navbar = () => {
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [userName, setUserName] = useState('');
  const [serverStatus, setServerStatus] = useState(null); // null, 'online', 'offline'
  const [checkingServer, setCheckingServer] = useState(false);

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
  const handleCheckServer = async () => {
    setCheckingServer(true);
    setServerStatus(null);
    try {
      const res = await fetch('https://blog-setup-server.onrender.com/api/status');
      if (res.ok) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
    setCheckingServer(false);
  };

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
      <div className="navbar-title">Blog Silo Setup Tool <span style={{ fontSize: '0.8rem', color: '#aaa', fontWeight: 'normal' }}>1. Make sure server is running &nbsp; 2. Sign in only needed to connect to Google Sheets</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          className="navbar-btn"
          style={{ background: serverStatus === 'online' ? '#4caf50' : serverStatus === 'offline' ? '#e53935' : undefined, color: 'white', fontWeight: 'bold' }}
          onClick={handleCheckServer}
          disabled={checkingServer}
        >
          {checkingServer ? 'Checking...' : 'Check Server Status'}
        </button>
        {checkingServer && (
          <span style={{ color: '#ffa726', fontWeight: 'bold', marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}>
            <span className="loader-spinner" style={{
              display: 'inline-block',
              width: '18px',
              height: '18px',
              border: '3px solid #ffa726',
              borderTop: '3px solid #22242c',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '0.5rem'
            }}></span>
            Waking up server, please wait...
          </span>
        )}
        {serverStatus === 'online' && !checkingServer && (
          <span style={{ color: '#4caf50', fontWeight: 'bold', marginRight: '0.5rem' }}>Server Online</span>
        )}
        {serverStatus === 'offline' && !checkingServer && (
          <span style={{ color: '#e53935', fontWeight: 'bold', marginRight: '0.5rem' }}>Server Offline</span>
        )}
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
