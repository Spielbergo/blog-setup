// Centralized API base URL for both dev and prod
// Use Vite env if provided, else infer from hostname
const inferredBase = (typeof window !== 'undefined' && /localhost|127\.0\.0\.1/.test(window.location.hostname))
  ? 'http://localhost:4000'
  : 'https://blog-setup-server.onrender.com';

export const API_BASE_URL = import.meta?.env?.VITE_API_BASE_URL || inferredBase;
