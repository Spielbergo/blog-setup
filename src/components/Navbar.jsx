import React, { useState, useEffect } from 'react';

const Navbar = () => {
  const [isGoogleAuthed, setIsGoogleAuthed] = useState(false);
  const [userName, setUserName] = useState('');

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

  const handleGoogleSignOut = async () => {
    await fetch('https://blog-setup-server.onrender.com/api/auth/logout', { method: 'POST', credentials: 'include' });
    setIsGoogleAuthed(false);
    setUserName('');
  };

  const navbarStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: '1rem',
    minHeight: '48px',
    background: '#222',
  };

  return (
    <div style={navbarStyle}>
      {!isGoogleAuthed ? (
        <button onClick={handleGoogleSignIn} style={{ fontWeight: 'bold', padding: '0.5rem 1rem', borderRadius: '20px', background: '#4285F4', color: 'white', border: 'none', cursor: 'pointer' }}>Sign in with Google</button>
      ) : (
        <>
          <button onClick={handleGoogleSignOut} style={{ marginRight: '1rem', padding: '0.5rem 1rem', borderRadius: '20px', background: '#eee', color: '#333', border: 'none', cursor: 'pointer' }}>Sign out</button>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#4285F4', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>
            {userName ? userName.charAt(0).toUpperCase() : '?'}
          </div>
        </>
      )}
    </div>
  );
};

export default Navbar;
