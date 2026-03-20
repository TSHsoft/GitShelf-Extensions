importScripts('config.js');

// Icon paths configuration
const ICONS_COLOR = {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
};

const ICONS_GREY = {
  "16": "icons/icon16_grey.png",
  "32": "icons/icon32_grey.png",
  "48": "icons/icon48_grey.png",
  "128": "icons/icon128_grey.png"
};

/**
 * Updates the extension icon based on the URL of the tab.
 * Shows color icon on GitHub/Localhost, and grey elsewhere.
 */
function updateExtensionIcon(tabId, url) {
  if (!tabId) return;
  
  // Determine if we should show the colored icon
  // Supports github.com, github.io and localhost (for testing)
  const isSupported = url && (
    url.includes('github.com') || 
    url.includes('github.io') || 
    url.includes('localhost') || 
    url.includes('127.0.0.1')
  );
  
  chrome.action.setIcon({
    tabId: tabId,
    path: isSupported ? ICONS_COLOR : ICONS_GREY
  });
}

// Listen for tab updates (navigation, URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateExtensionIcon(tabId, tab.url);
  }
});

// Listen for tab switching
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    updateExtensionIcon(activeInfo.tabId, tab.url);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SAVE_TO_SHELF') {
    const path = request.path || request.payload?.path;
    if (!path) {
        sendResponse({ success: false, error: 'Missing path in request' });
        return;
    }
    handleSave(path)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (request.type === 'CHECK_REPO') {
    handleCheck(request.id)
      .then((exists) => sendResponse({ exists }))
      .catch(() => sendResponse({ exists: false }));
    return true;
  }

  // Handle messages from the injected script in GitShelf App
  if (request.type === 'APP_AUTH_SYNC') {
    console.log('[Background] Received APP_AUTH_SYNC', request.payload);
    chrome.storage.local.set({
      githubToken: request.payload.githubToken,
      userProfile: request.payload.userProfile
    }).then(() => {
        console.log('[Background] Auth storage updated');
    });
  }

  if (request.type === 'EXT_CHECK_RESULT') {
    if (checkResolver) {
        checkResolver(request.exists);
        checkResolver = null;
    }
  }

  if (request.type === 'APP_SAVE_SUCCESS') {
    if (saveResolver) {
        console.log('[Background] Received APP_SAVE_SUCCESS, resolving promise');
        saveResolver();
        saveResolver = null;
    }
  }

  if (request.type === 'APP_IDS_SYNC') {
    chrome.storage.local.set({ savedRepoIds: request.ids });
  }

  if (request.type === 'SYNC_IDS') {
    ensureOffscreenDocument().then(() => {
        chrome.runtime.sendMessage({
            type: 'OFFSCREEN_GET_IDS',
            target: 'offscreen',
            payload: { appUrl: request.payload.appUrl }
        });
    });
  }
});

let saveResolver = null;

async function handleSave(path) {
  console.log(`[Background] handleSave started for path: ${path}`);
  // 1. Send the path directly to the App tab or offscreen bridge
  await saveToAppDatabase(path);
  
  // 2. Note: We don't update local savedRepoIds cache here anymore 
  // since the App does its own fetch/save now. The App will broadcast 
  // success back to us.
}

async function fetchRepoFromGithub(path, token) {
  const parts = path.split('/');
  const owner = parts[0];
  const repo = parts[1];

  try {
    const isProfile = !repo;
    const query = isProfile 
    ? `query($login: String!) {
        user: repositoryOwner(login: $login) {
          ... on User { login, url, name, bio, followers { totalCount }, updatedAt, id }
          ... on Organization { login, url, name, description, updatedAt, id }
        }
      }`
    : `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          nameWithOwner, url, name, owner { login }, description, stargazerCount, pushedAt, updatedAt, isArchived, isDisabled, isLocked, isPrivate, isEmpty, isFork, isMirror, id, primaryLanguage { name }, defaultBranchRef { name },
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } },
          repositoryTopics(first: 10) { nodes { topic { name } } },
          latestRelease { tagName }
        }
      }`;

    const variables = isProfile ? { login: owner } : { owner, name: repo };

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) throw new Error(`GraphQL API error: ${response.status}`);
    const { data } = await response.json();

    if (isProfile) {
      const u = data?.user;
      if (!u) throw new Error('Profile not found');
      
      const repo = {
        id: u.login,
        name: u.name || u.login,
        owner: u.login,
        description: u.bio || u.description || '',
        stars: u.followers?.totalCount || 0,
        url: u.url,
        language: null,
        updated_at: u.updatedAt,
        last_push_at: '',
        tags: [],
        status: 'active',
        type: 'profile',
        profile_type: u.followers ? 'user' : 'org', // Detect type
        is_fork: false,
        is_private: false,
        archived: false,
        node_id: u.id,
        added_at: Date.now()
      };

      // --- Organization Follower Patch (Extension Fallback) ---
      if (repo.profile_type === 'org') {
        try {
          const restRes = await fetch(`https://api.github.com/users/${u.login}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (restRes.ok) {
            const restData = await restRes.json();
            repo.stars = restData.followers || 0;
          }
        } catch (e) {
          console.warn('[Background] Org followers fallback failed:', e);
        }
      }

      return repo;
    } else {
      const r = data?.repository;
      if (!r) throw new Error('Repository not found');
      return {
        id: r.nameWithOwner,
        name: r.name,
        owner: r.owner?.login,
        description: r.description || '',
        stars: r.stargazerCount,
        url: r.url,
        language: r.primaryLanguage?.name || null,
        languages: (() => {
          if (!r.languages?.edges) return undefined;
          const langs = {};
          r.languages.edges.forEach(e => langs[e.node.name] = e.size);
          return Object.keys(langs).length > 0 ? langs : undefined;
        })(),
        topics: r.repositoryTopics?.nodes?.map(n => n.topic.name).sort() || [],
        updated_at: r.updatedAt,
        last_push_at: r.pushedAt || '',
        latest_release: r.latestRelease?.tagName || null,
        tags: [],
        status: 'active',
        type: 'repository',
        is_fork: !!r.isFork,
        is_private: !!r.isPrivate,
        archived: !!r.isArchived,
        is_disabled: !!r.isDisabled,
        is_locked: !!r.isLocked,
        is_empty: !!r.isEmpty,
        is_mirror: !!r.isMirror,
        default_branch: r.defaultBranchRef?.name || 'master',
        node_id: r.id,
        added_at: Date.now()
      };
    }
  } catch (err) {
    console.warn('[Background] GraphQL fetch failed, falling back to REST:', err);
    // REST Fallback (original logic)
    const headers = { 
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitShelf-Extension/1.1.0'
    };
    const url = repo 
      ? `https://api.github.com/repos/${owner}/${repo}`
      : `https://api.github.com/users/${owner}`;

    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
    const data = await response.json();

    return {
      id: repo ? data.full_name : data.login,
      name: repo ? data.name : (data.name || data.login),
      owner: data.owner?.login || data.login,
      description: data.description || data.bio || '',
      stars: repo ? data.stargazers_count : data.followers,
      url: data.html_url,
      language: data.language || null,
      updated_at: data.updated_at || data.created_at || new Date().toISOString(),
      last_push_at: data.pushed_at || '',
      tags: [],
      status: 'active',
      type: repo ? 'repository' : 'profile',
      is_fork: !!data.fork,
      is_private: !!data.private,
      archived: !!data.archived,
      node_id: data.node_id,
      added_at: Date.now()
    };
  }
}

async function saveToAppDatabase(path) {
  // 1. Prioritize live UI update if an active app tab is available
  const tabs = await chrome.tabs.query({ 
    url: CONFIG.APP_ORIGIN_PATTERNS 
  });
  
  if (tabs.length > 0) {
    const activeTab = tabs.find(t => !t.discarded && t.status === 'complete') || tabs[0];
    try {
        console.log('[Background] Attempting live sync via tab:', activeTab.id);
        const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: injectedSaveAction,
            args: [path],
            world: 'MAIN'
        });
        
        if (results[0]?.result?.success) {
            console.log('[Background] Live sync message sent');
            return;
        }
    } catch (e) {
        console.warn('[Background] Live sync message failed, falling back to offscreen bridge', e);
    }
  }

  // 2. Fallback: Use the offscreen bridge (Universal & Guaranteed)
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
        saveResolver = null;
        reject(new Error('Save timeout (10s): Bridge did not respond'));
    }, 10000);

    saveResolver = () => {
        clearTimeout(timeout);
        resolve();
    };

    console.log('[Background] Using offscreen bridge for path-based save');
    await ensureOffscreenDocument();
    
    chrome.runtime.sendMessage({
        type: 'OFFSCREEN_SAVE_PATH', // New type
        target: 'offscreen',
        payload: { path, appUrl: CONFIG.APP_URL }
    });
  });
}

function injectedSaveAction(path) {
  // Try to use the direct function if the app exposed it (Main world)
  if (typeof window.__GitShelfSaveRepoPath__ === 'function') {
    return window.__GitShelfSaveRepoPath__(path);
  } else {
    // Fallback to postMessage (Works across worlds)
    window.postMessage({ type: 'EXT_SAVE_BY_PATH', payload: { path } }, '*');
    return { success: true };
  }
}

let creatingOffscreen = null;
async function ensureOffscreenDocument() {
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  creatingOffscreen = chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'], // Closest reason for DB access
    justification: 'Interact with GitShelf website IndexedDB via bridge'
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

let checkResolver = null;
async function handleCheck(id) {
  return new Promise(async (resolve) => {
    checkResolver = (exists) => resolve(exists);
    
    // Set a safety timeout
    setTimeout(() => {
        if (checkResolver) {
            checkResolver(false);
            checkResolver = null;
        }
    }, 5000);

    await ensureOffscreenDocument();
    chrome.runtime.sendMessage({
        type: 'OFFSCREEN_CHECK',
        target: 'offscreen',
        payload: { id, appUrl: CONFIG.APP_URL }
    });
  });
}
