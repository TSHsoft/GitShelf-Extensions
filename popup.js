// popup.js

const elements = {
  loading: document.getElementById('state-loading'),
  loggedOut: document.getElementById('state-logged-out'),
  loggedIn: document.getElementById('state-logged-in'),
  userAvatar: document.getElementById('user-avatar'),
  userName: document.getElementById('user-name'),
  contextCard: document.getElementById('context-card'),
  contextName: document.getElementById('context-name'),
  contextEmpty: document.getElementById('context-empty'),
  btnLogin: document.getElementById('btn-login'),
  btnSave: document.getElementById('btn-save'),
  btnOpenApp: document.getElementById('btn-open-app'),
  btnTheme: document.getElementById('btn-theme'),
  btnSignOut: document.getElementById('btn-sign-out'),
};

const ICONS = {
  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  moon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`
};

const SPINNER_HTML = `<div class="spinner" style="width: 12px; height: 12px; margin-right: 8px;"></div>`;


async function init() {
  // 1. Initial Theme Load
  const { theme } = await chrome.storage.local.get(['theme']);
  if (theme === 'light') {
    document.body.setAttribute('data-theme', 'light');
    elements.btnTheme.innerHTML = ICONS.sun;
  } else {
    elements.btnTheme.innerHTML = ICONS.moon;
  }
  elements.btnSignOut.innerHTML = ICONS.logout;

  // 2. Proactive Sync with App's Main Storage (Pull Model)
  // This ensures that if the app is logged out, the extension knows immediately.
  await syncAuthWithApp();

  // 3. Check Auth Storage
  let storage = await chrome.storage.local.get(['githubToken', 'userProfile']);
  
  if (!storage.githubToken) {
    // Try to sync from open app tabs (Push-back fallback)
    await trySyncAuth();
    storage = await chrome.storage.local.get(['githubToken', 'userProfile']);
  }
  
  if (!storage.githubToken) {
    showState('logged-out');
  } else {
    showState('logged-in');
    updateUserProfile(storage.userProfile);
    checkCurrentPage();
  }

  // 2. Event Listeners
  elements.btnLogin.onclick = () => {
    chrome.tabs.create({ url: CONFIG.APP_URL });
  };

  elements.btnOpenApp.onclick = () => {
    chrome.tabs.create({ url: CONFIG.APP_URL });
  };
  
  elements.btnSignOut.onclick = async () => {
    await chrome.storage.local.remove(['githubToken', 'userProfile', 'savedRepoIds']);
    showState('logged-out');
  };

  elements.btnSave.onclick = handleSave;

  elements.btnTheme.onclick = async () => {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    elements.btnTheme.innerHTML = newTheme === 'light' ? ICONS.sun : ICONS.moon;
    await chrome.storage.local.set({ theme: newTheme });
  };
}

function showState(state) {
  elements.loading.classList.remove('active');
  elements.loggedOut.classList.remove('active');
  elements.loggedIn.classList.remove('active');

  if (state === 'loading') {
    elements.loading.classList.add('active');
    elements.btnSignOut.classList.add('hidden');
  }
  if (state === 'logged-out') {
    elements.loggedOut.classList.add('active');
    elements.btnSignOut.classList.add('hidden');
  }
  if (state === 'logged-in') {
    elements.loggedIn.classList.add('active');
    elements.btnSignOut.classList.remove('hidden');
  }
}

function updateUserProfile(profile) {
  if (profile) {
    elements.userAvatar.src = profile.avatarUrl || '';
    elements.userName.textContent = profile.name || profile.login || 'User';
  }
}

async function checkCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  const repoMatch = tab.url.match(/https:\/\/github\.com\/([^/]+\/[^/]+)/);
  const profileMatch = tab.url.match(/https:\/\/github\.com\/([^/]+)/);

  if (repoMatch) {
    const fullPath = repoMatch[1].split('?')[0].split('#')[0];
    showContext('repo', fullPath);
  } else if (profileMatch) {
    const username = profileMatch[1].split('?')[0].split('#')[0];
    if (['notifications', 'settings', 'trending', 'explore', 'marketplace', 'codespaces', 'issues', 'pulls'].includes(username)) {
        hideContext();
        return;
    }
    showContext('profile', username);
  } else {
    hideContext();
  }
}

async function showContext(type, name) {
  elements.contextCard.classList.remove('hidden');
  elements.contextEmpty.classList.add('hidden');
  elements.contextName.textContent = name;
  
  // Set initial loading state
  elements.btnSave.disabled = true;
  elements.btnSave.innerHTML = `${SPINNER_HTML} Checking...`;

  // Check if already in shelf
  const exists = await checkRepoExists(name);
  
  if (exists) {
      elements.btnSave.disabled = true;
      elements.btnSave.textContent = 'Already In Shelf';
  } else {
      elements.btnSave.disabled = false;
      elements.btnSave.textContent = 'Save to Shelf';
  }
}

async function checkRepoExists(id) {
    console.log(`[Popup] Live check for: ${id}`);
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CHECK_REPO', id }, (response) => {
            console.log(`[Popup] Live check result for ${id}:`, response?.exists);
            resolve(response?.exists || false);
        });
    });
}

function hideContext() {
  elements.contextCard.classList.add('hidden');
  elements.contextEmpty.classList.remove('hidden');
  currentContextId = null; // Clear the current context ID
}

async function handleSave() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const name = elements.contextName.textContent;
  
  elements.btnSave.disabled = true;
  elements.btnSave.textContent = 'Saving...';

  // Send message to background for fetching and saving
  chrome.runtime.sendMessage({ 
    type: 'SAVE_TO_SHELF', 
    path: name 
  }, (response) => {
    if (response?.success) {
      elements.btnSave.textContent = 'Saved!';
      setTimeout(() => window.close(), 1000);
    } else {
      elements.btnSave.disabled = false;
      elements.btnSave.textContent = 'Save Failed';
      console.error(response?.error);
    }
  });
}

async function trySyncAuth() {
  console.log('[Popup] trySyncAuth started');
  // Query for ANY potential app tab
  const tabs = await chrome.tabs.query({ 
    url: CONFIG.APP_ORIGIN_PATTERNS 
  });
  
  if (tabs.length === 0) {
    console.log('[Popup] No matching app tab found for sync');
    return;
  }

  // Use the best available tab (active preferred, otherwise first)
  const tab = tabs.find(t => t.active) || tabs[0];
  console.log('[Popup] App tab found, requesting auth from:', tab.url);
  
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        if (typeof window.__GitShelfGetAuth__ === 'function') {
           return await window.__GitShelfGetAuth__();
        }
        // Fallback to postMessage
        window.postMessage({ type: 'EXT_REQUEST_AUTH' }, '*');
        return null;
      },
      world: 'MAIN'
    });

    const data = results[0].result;
    if (data && data.githubToken) {
        console.log('[Popup] Successfully received auth from direct call', data);
        await chrome.storage.local.set({
            githubToken: data.githubToken,
            userProfile: data.userProfile
        });
        
        // Also Trigger an ID sync via offscreen
        chrome.runtime.sendMessage({ 
            type: 'SYNC_IDS', 
            payload: { appUrl: CONFIG.APP_URL } 
        });
    } else {
        // Wait a bit for the postMessage fallback if needed
        console.log('[Popup] Direct auth not available or empty, waiting for fallback sync');
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } catch (err) {
    console.error('[Popup] Auth sync failed:', err);
  }
}

async function syncAuthWithApp() {
    console.log('[Popup] Proactive auth sync with Bridge (Pull)');
    return new Promise(async (resolve) => {
        chrome.runtime.sendMessage({ 
            type: 'SYNC_AUTH_FROM_APP', 
            payload: { appUrl: CONFIG.APP_URL } 
        }, (response) => {
            console.log('[Popup] Bridge auth sync complete', response?.auth ? 'Authenticated' : 'Logged Out');
            resolve();
        });
    });
}

init();
