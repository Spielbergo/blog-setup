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
          if (data.authed) {
            setIsGoogleAuthed(true);
            setUserName(data.name || '');
          } else {
            // Token invalid/expired
            localStorage.removeItem('googleJwt');
            setJwt('');
            setIsGoogleAuthed(false);
            setUserName('');
          }
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

  // Listen for custom event to refresh JWT state when other components clear it
  useEffect(() => {
    const handler = () => setJwt(localStorage.getItem('googleJwt') || '');
    window.addEventListener('googleJwtChanged', handler);
    return () => window.removeEventListener('googleJwtChanged', handler);
  }, []);

  // Check server status
  // Removed server status feature

  // Google sign in
  const handleGoogleSignIn = () => {
    const authUrl = 'https://blog-setup-server.onrender.com/api/auth/google';
    const w = 520, h = 640;
    const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const dualScreenTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    const width = window.innerWidth || document.documentElement.clientWidth || screen.width;
    const height = window.innerHeight || document.documentElement.clientHeight || screen.height;
    const systemZoom = width / window.screen.availWidth;
    const left = (width - w) / 2 / systemZoom + dualScreenLeft;
    const top = (height - h) / 2 / systemZoom + dualScreenTop;
    const popup = window.open(
      authUrl,
      'google-oauth',
      `scrollbars=yes,width=${w / systemZoom},height=${h / systemZoom},top=${top},left=${left}`
    );
    if (!popup) return;
    const handler = (ev) => {
      // Optionally restrict origin; Render.com server origin starts with https://blog-setup-server.onrender.com
      try {
        const data = ev.data || {};
        if (data && data.jwt) {
          localStorage.setItem('googleJwt', data.jwt);
          setJwt(data.jwt);
          setIsGoogleAuthed(true);
          setUserName(data.name || '');
          window.removeEventListener('message', handler);
          try { popup.close(); } catch {}
        }
      } catch {}
    };
    window.addEventListener('message', handler);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
            <span style={{ color: '#4caf50', fontSize: '0.95rem', fontWeight: 'bold' }}>Connected to Google Sheets</span>
            <button className="navbar-btn" onClick={handleGoogleSignOut} title="Sign out from Google">
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
