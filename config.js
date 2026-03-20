// config.js
// Configuration for the GitShelf Extension

const CONFIG = {
  // Primary URL of the GitShelf application. 
  // Development (Local): 'http://localhost:5173'
  // Production (Vercel): 'https://gitshelf.vercel.app'
  APP_URL: 'http://localhost:5173',

  // List of patterns allowed for the app (used in tab querying)
  APP_ORIGIN_PATTERNS: [
    'http://localhost:5173/*',
    'http://127.0.0.1:5173/*',
    'https://gitshelf.vercel.app/*',
    'http://localhost/*',
    'http://127.0.0.1/*'
  ]
};
