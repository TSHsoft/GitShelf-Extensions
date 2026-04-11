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

// Tracks tabs that currently have an in-progress badge check to avoid stacking
const checkingTabs = new Set();

// System pages that are not valid GitHub profiles
const GITHUB_SYSTEM_PATHS = new Set([
  'notifications', 'settings', 'trending', 'explore',
  'marketplace', 'codespaces', 'issues', 'pulls'
]);

/**
 * Parses a GitHub URL and returns the shelf ID ("owner/repo" or "owner").
 * Returns null for non-GitHub or system pages.
 */
function parseGithubPath(url) {
  if (!url) return null;
  const repoMatch = url.match(/https:\/\/github\.com\/([^/?#]+\/[^/?#]+)/);
  if (repoMatch) return repoMatch[1];
  const profileMatch = url.match(/https:\/\/github\.com\/([^/?#]+)/);
  if (profileMatch) {
    const name = profileMatch[1];
    if (GITHUB_SYSTEM_PATHS.has(name)) return null;
    return name;
  }
  return null;
}

/**
 * Updates the extension icon and badge for a tab.
 * - GitHub pages → color icon
 * - Saved path   → yellow ★ badge
 * - Unsaved path → no badge
 * - Other pages  → grey icon, no badge
 */
async function updateIconBadge(tabId, url) {
  if (!tabId) return;

  const isGithub = url && url.includes('github.com');
  const isLocal = url && (url.includes('localhost') || url.includes('127.0.0.1'));

  if (!isGithub && !isLocal) {
    // Non-GitHub page: grey icon, no badge
    chrome.action.setIcon({ tabId, path: ICONS_GREY });
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  // GitHub (or local dev) page: always show color icon
  chrome.action.setIcon({ tabId, path: ICONS_COLOR });

  if (!isGithub) {
    // Local dev page — color icon but no shelf check
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const path = parseGithubPath(url);
  if (!path) {
    // System page (settings, trending…) — no badge
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  // Guard: skip if a check is already in flight for this tab
  if (checkingTabs.has(tabId)) return;
  checkingTabs.add(tabId);

  try {
    const exists = await handleCheck(path);
    if (exists) {
      chrome.action.setBadgeText({ tabId, text: '★' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#F6C90E' });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch (_) {
    chrome.action.setBadgeText({ tabId, text: '' });
  } finally {
    checkingTabs.delete(tabId);
  }
}

// Listen for tab updates (navigation, URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateIconBadge(tabId, tab.url);
  }
});

// Listen for tab switching
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    updateIconBadge(activeInfo.tabId, tab.url);
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

  if (request.type === 'APP_AUTH_SYNC') {
    console.log('[Background] Received APP_AUTH_SYNC', request.payload);
    chrome.storage.local.set({
      githubToken: request.payload.githubToken,
      userProfile: request.payload.userProfile
    }).then(() => {
        console.log('[Background] Auth storage updated');
    });
  }

  if (request.type === 'APP_SIGN_OUT') {
    console.log('[Background] Received APP_SIGN_OUT request from App');
    chrome.storage.local.remove(['githubToken', 'userProfile', 'savedRepoIds']).then(() => {
        console.log('[Background] Auth storage cleared (Log Out)');
    });
  }

  if (request.type === 'EXT_CHECK_RESULT') {
    if (checkResolver) {
        checkResolver(request.exists);
        checkResolver = null;
    }
  }

  if (request.type === 'APP_SAVE_SUCCESS') {
    if (saveResolver && saveResolver.resolve) {
        console.log('[Background] Received APP_SAVE_SUCCESS, resolving promise');
        saveResolver.resolve();
        saveResolver = null;
    }
  }

  if (request.type === 'APP_SAVE_FAILURE') {
    if (saveResolver && saveResolver.reject) {
        console.error('[Background] Received APP_SAVE_FAILURE:', request.error);
        saveResolver.reject(request.error);
        saveResolver = null;
    }
  }

  if (request.type === 'APP_IDS_SYNC') {
    chrome.storage.local.set({ savedRepoIds: request.ids });
  }

  if (request.type === 'EXT_AUTH_RESULT') {
    if (authResolver) {
        // If auth exists in app, sync it locally just in case
        if (request.auth) {
            chrome.storage.local.set({ 
              githubToken: request.auth.githubToken,
              userProfile: request.auth.userProfile
            });
        } else {
            // Force clear if App reported NULL
            chrome.storage.local.remove(['githubToken', 'userProfile', 'savedRepoIds']);
        }
        authResolver(request.auth);
        authResolver = null;
    }
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

  if (request.type === 'SYNC_AUTH_FROM_APP') {
    handleAuthSync(CONFIG.APP_URL)
        .then((auth) => sendResponse({ auth, appUrl: CONFIG.APP_URL }))
        .catch(() => sendResponse({ auth: null, appUrl: CONFIG.APP_URL }));
    return true; // Keep channel open for async response
  }
});

let saveResolver = null;
let authResolver = null;

async function handleAuthSync(appUrl) {
    return new Promise(async (resolve) => {
        authResolver = (auth) => resolve(auth);
        
        // Safety timeout
        setTimeout(() => {
            if (authResolver) {
                authResolver(null);
                authResolver = null;
            }
        }, 5000);

        await ensureOffscreenDocument();
        chrome.runtime.sendMessage({
            type: 'OFFSCREEN_GET_AUTH',
            target: 'offscreen',
            payload: { appUrl }
        });
    });
}

async function handleSave(path) {
  console.log(`[Background] handleSave started for path: ${path}`);
  await saveToAppDatabase(path);

  // Immediately show star badge on the active tab after a successful save
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) updateIconBadge(tab.id, tab.url);
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
  // 1. Force all saves to use the offscreen bridge (Unified Truth source)
  // This eliminates race conditions/stale reads when the App home page is also open.
  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
        saveResolver = null;
        reject(new Error('Save timeout (10s): Bridge did not respond'));
    }, 10000);

    saveResolver = {
        resolve: () => {
            clearTimeout(timeout);
            resolve();
        },
        reject: (err) => {
            clearTimeout(timeout);
            reject(new Error(err || 'Save failed'));
        }
    };

    console.log('[Background] Using UNIFIED bridge (Localhood)');
    await ensureOffscreenDocument();
    const { githubToken } = await chrome.storage.local.get(['githubToken']);
    chrome.runtime.sendMessage({
        type: 'OFFSCREEN_SAVE_PATH', // New type
        target: 'offscreen',
        payload: { path, appUrl: CONFIG.APP_URL, token: githubToken }
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
