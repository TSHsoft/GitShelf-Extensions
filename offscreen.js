// offscreen.js

// 1. Single Global Response Handler
const handleResponse = (event) => {
  const { type, error } = event.data;
  console.log('[Offscreen Bridge] Received response from bridge:', type, event.data);

  if (type === 'EXT_SAVE_SUCCESS') {
    chrome.runtime.sendMessage({ type: 'APP_SAVE_SUCCESS' });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_SAVE_FAILURE') {
    console.error('[Offscreen Bridge] DB write failure:', error);
  } else if (type === 'EXT_IDS_RESULT') {
    chrome.runtime.sendMessage({ type: 'APP_IDS_SYNC', ids: event.data.ids });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_CHECK_RESULT') {
    chrome.runtime.sendMessage({ type: 'EXT_CHECK_RESULT', exists: event.data.exists });
    setTimeout(() => window.close(), 500);
  }
};

window.addEventListener('message', handleResponse);

// 2. Global Request Listener
chrome.runtime.onMessage.addListener((request) => {
  if (request.target !== 'offscreen') return;

  const { type, payload } = request;
  const iframe = document.getElementById('app-iframe');
  const appUrl = payload?.appUrl;

  if (!appUrl) return;

  // Ensure bridge is set
  iframe.src = `${appUrl}/ext-bridge.html`;

  iframe.onload = () => {
    console.log(`[Offscreen Bridge] Iframe loaded for action: ${type}`);
    
    // Slight delay to ensure bridge script is ready
    setTimeout(() => {
        if (type === 'OFFSCREEN_SAVE') {
            iframe.contentWindow.postMessage({ 
                type: 'EXT_SAVE_REPO', 
                payload: payload.repoData 
            }, '*');
        } else if (type === 'OFFSCREEN_SAVE_PATH') {
            iframe.contentWindow.postMessage({ 
                type: 'EXT_SAVE_PATH', 
                payload: payload.path 
            }, '*');
        } else if (type === 'OFFSCREEN_GET_IDS') {
            iframe.contentWindow.postMessage({ 
                type: 'EXT_GET_IDS' 
            }, '*');
        } else if (type === 'OFFSCREEN_CHECK') {
            iframe.contentWindow.postMessage({ 
                type: 'EXT_CHECK_REPO', 
                payload: payload.id 
            }, '*');
        }
    }, 1000);
  };
});
