// content.js
// This script runs on the GitShelf app domain

window.addEventListener('message', (event) => {
  // Only handle messages from the same page
  if (event.source !== window) return;

  const { type, payload } = event.data;

  // APP_READY: The GitShelf app has loaded, extension should ask for auth if missing
  if (type === 'APP_READY') {
    window.postMessage({ type: 'EXT_AUTH_REQUEST' }, '*');
  }

  if (type === 'EXT_AUTH_DATA') {
    if (payload && payload.githubToken && !payload.githubToken.startsWith('enc_')) {
      console.log('[Content Bridge] PROACTIVE: Received valid auth data, syncing to background');
      chrome.runtime.sendMessage({ type: 'APP_AUTH_SYNC', payload });
    }
  }

  if (type === 'EXT_SAVE_SUCCESS') {
    chrome.runtime.sendMessage({ type: 'APP_SAVE_SUCCESS' });
  }
});

// Signal that content script is alive
window.postMessage({ type: 'EXT_BRIDGE_ALIVE' }, '*');
