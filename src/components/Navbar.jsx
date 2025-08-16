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
          setIsGoogleAuthed(data.authed);
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

  // Listen for JWT from OAuth popup
  useEffect(() => {
    function handleMessage(e) {
      if (e.data && e.data.jwt) {
        setJwt(e.data.jwt);
        localStorage.setItem('googleJwt', e.data.jwt);
        setIsGoogleAuthed(true);
        setUserName(e.data.name || '');
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleGoogleSignIn = () => {
    window.open('https://blog-setup-server.onrender.com/api/auth/google', '_blank', 'width=500,height=600');
  };

  const handleCheckServer = async () => {
    setCheckingServer(true);
    setServerStatus(null);
    try {
      const res = await fetch('https://blog-setup-server.onrender.com/', { method: 'GET' });
      const text = await res.text();
      if (text.includes('Blog Silo Setup API is running')) {
        setServerStatus('online');
      } else {
        setServerStatus('offline');
      }
    } catch {
      setServerStatus('offline');
    }
    setCheckingServer(false);
  };

  const handleGoogleSignOut = async () => {
    if (jwt) {
      await fetch('https://blog-setup-server.onrender.com/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      });
    }
    setIsGoogleAuthed(false);
    setUserName('');
    setJwt('');
    localStorage.removeItem('googleJwt');
  };

  return (
    <div className="navbar">
      <div className="navbar-title">
        Blog Silo Setup Tool
      </div>
      {!isGoogleAuthed ? (
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
          <button className="navbar-btn" onClick={handleGoogleSignIn}>
            Sign in with Google
          </button>
        </div>
      ) : (
        <>
          <button className="navbar-btn-signout" onClick={handleGoogleSignOut}>
            Sign out
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="navbar-avatar">
              {userName ? userName.charAt(0).toUpperCase() : '?'}
            </div>
            <div style={{ color: '#4caf50', fontSize: '0.95rem', marginTop: '0.25rem', fontWeight: 'bold' }}>
              Connected to Google Sheets
            </div>
            {userName && (
              <div style={{ color: '#fff', fontSize: '0.95rem', marginTop: '0.15rem', fontWeight: 'bold' }}>
                Signed in as {userName.split(' ')[0]}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Navbar;
