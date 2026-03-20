// config.js
const CONFIG = {
  // Main app location
  // APP_URL: 'http://localhost:5173',
  APP_URL: 'https://gitshelf.vercel.app',

  // Patterns for multi-origin support
  APP_ORIGIN_PATTERNS: [
    //  "*://localhost/*",
    //  "*://127.0.0.1/*",
    "https://gitshelf.vercel.app/*"
  ]
};
