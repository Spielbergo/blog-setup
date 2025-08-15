import React, { useState, useEffect } from 'react';
import './Navbar.css';

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

  // Styles moved to Navbar.css

  return (
    <div className="navbar">
      <div className="navbar-title">
        Blog Silo Setup Tool
      </div>
      {!isGoogleAuthed ? (
        <button className="navbar-btn" onClick={handleGoogleSignIn}>
          Sign in with Google
        </button>
      ) : (
        <>
          <button className="navbar-btn-signout" onClick={handleGoogleSignOut}>
            Sign out
          </button>
          <div className="navbar-avatar">
            {userName ? userName.charAt(0).toUpperCase() : '?'}
          </div>
        </>
      )}
    </div>
  );
};

export default Navbar;
