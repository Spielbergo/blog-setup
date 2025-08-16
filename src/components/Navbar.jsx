import React, { useState, useEffect } from 'react';
import './Navbar.css';

const Navbar = () => {
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [userName, setUserName] = useState('');
  const [serverStatus, setServerStatus] = useState(null); // null, 'online', 'offline'
  const [checkingServer, setCheckingServer] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('https://blog-setup-server.onrender.com/api/auth/status', { credentials: 'include' });
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
    await fetch('https://blog-setup-server.onrender.com/api/auth/logout', { method: 'POST', credentials: 'include' });
    setIsGoogleAuthed(false);
    setUserName('');
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
          {serverStatus === 'online' && (
            <span style={{ color: '#4caf50', fontWeight: 'bold', marginRight: '0.5rem' }}>Server Online</span>
          )}
          {serverStatus === 'offline' && (
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
          </div>
        </>
      )}
    </div>
  );
};

export default Navbar;
