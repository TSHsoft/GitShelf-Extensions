// offscreen.js

let isBridgeReady = false;
let pendingAction = null;
let bridgeReadyTimeout = null;

// 1. Response & Handshake Handler
const handleResponse = (event) => {
  const { type, error } = event.data;

  // Handle Handshake from Bridge
  if (type === 'BRIDGE_READY') {
    console.log('[Offscreen Bridge] Received BRIDGE_READY, flushing pending actions');
    isBridgeReady = true;
    if (bridgeReadyTimeout) clearTimeout(bridgeReadyTimeout);
    
    if (pendingAction) {
      const iframe = document.getElementById('app-iframe');
      console.log('[Offscreen Bridge] Executing flushed action:', pendingAction.type);
      iframe.contentWindow.postMessage(pendingAction, '*');
      pendingAction = null;
    }
    return;
  }

  // Handle Results to Background
  console.log('[Offscreen Bridge] Received response from bridge:', type, event.data);

  if (type === 'EXT_SAVE_SUCCESS') {
    chrome.runtime.sendMessage({ type: 'APP_SAVE_SUCCESS' });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_SAVE_FAILURE') {
    console.error('[Offscreen Bridge] DB write failure:', error);
    chrome.runtime.sendMessage({ type: 'APP_SAVE_FAILURE', error });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_IDS_RESULT') {
    chrome.runtime.sendMessage({ type: 'APP_IDS_SYNC', ids: event.data.ids });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_CHECK_RESULT') {
    chrome.runtime.sendMessage({ type: 'EXT_CHECK_RESULT', exists: event.data.exists });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_AUTH_RESULT') {
    chrome.runtime.sendMessage({ type: 'EXT_AUTH_RESULT', auth: event.data.auth });
    setTimeout(() => window.close(), 500);
  } else if (type === 'EXT_ERROR') {
    chrome.runtime.sendMessage({ type: 'APP_SAVE_FAILURE', error });
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

  // Prepare the action payload
  let action = null;
  if (type === 'OFFSCREEN_SAVE') {
    action = { type: 'EXT_SAVE_REPO', payload: payload.repoData };
  } else if (type === 'OFFSCREEN_SAVE_PATH') {
    action = { type: 'EXT_SAVE_PATH', payload: { path: payload.path, token: payload.token } };
  } else if (type === 'OFFSCREEN_GET_IDS') {
    action = { type: 'EXT_GET_IDS' };
  } else if (type === 'OFFSCREEN_CHECK') {
    action = { type: 'EXT_CHECK_REPO', payload: payload.id };
  } else if (type === 'OFFSCREEN_GET_AUTH') {
    action = { type: 'EXT_GET_AUTH' };
  }

  if (!action) return;

  // If iframe not pointing to correct URL yet, set it
  if (!iframe.src || !iframe.src.includes(appUrl)) {
    console.log('[Offscreen] Setting iframe source to:', `${appUrl}/ext-bridge.html`);
    isBridgeReady = false;
    iframe.src = `${appUrl}/ext-bridge.html`;
    
    // Set a safety timeout for handshake
    if (bridgeReadyTimeout) clearTimeout(bridgeReadyTimeout);
    bridgeReadyTimeout = setTimeout(() => {
        if (!isBridgeReady) {
            console.warn('[Offscreen Bridge] Handshake timed out after 5s. Forcing attempt...');
            if (pendingAction) {
                iframe.contentWindow.postMessage(pendingAction, '*');
                pendingAction = null;
            }
        }
    }, 5000);
  }

  // If bridge not ready, queue it. Otherwise, send it.
  if (!isBridgeReady) {
    console.log('[Offscreen] Bridge not ready, queuing action:', action.type);
    pendingAction = action;
  } else {
    console.log('[Offscreen] Bridge ready, sending action immediately:', action.type);
    iframe.contentWindow.postMessage(action, '*');
  }
});
