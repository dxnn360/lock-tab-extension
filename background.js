// Import Crypto helper functions
importScripts('crypto.js');

// Initialize right-click context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "lock-current-tab",
    title: "Lock This Tab",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "lock-current-tab" && tab && tab.id) {
    await lockTab(tab.id);
  }
});

// Generate an unguessable random token for the lock session
function generateSecureToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Function to lock a specific tab
async function lockTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;

    // Prevent locking the lock screen itself or browser internals
    const lockPageUrl = chrome.runtime.getURL("lock/lock.html");
    if (tab.url.startsWith(lockPageUrl) || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
      return;
    }

    const { authConfig, lockedTabs = {} } = await chrome.storage.local.get(["authConfig", "lockedTabs"]);

    // If master password is not yet configured, do nothing
    if (!authConfig || !authConfig.salt) {
      return;
    }

    // Generate random session token
    const sessionToken = generateSecureToken();

    // ENCRYPT target URL and title using AES-256-GCM
    // Neither the address bar nor DevTools can read the plain URL!
    const encryptedData = await encryptWithPassword(
      JSON.stringify({
        url: tab.url,
        title: tab.title || "Target Page",
        lockedAt: Date.now()
      }),
      authConfig.verifier, // Derived key component
      authConfig.salt
    );

    lockedTabs[sessionToken] = {
      tabId: tabId,
      encryptedPayload: encryptedData,
      lockedAt: Date.now()
    };

    await chrome.storage.local.set({ lockedTabs });

    // Clear auto-lock alarm if scheduled
    await chrome.alarms.clear(`autolock_${tabId}`);

    // Clean address bar: Only sessionToken is passed, NO URL or Title leaked in query string!
    const redirectUrl = `${lockPageUrl}?token=${sessionToken}`;
    await chrome.tabs.update(tabId, { url: redirectUrl });
    return true;
  } catch (err) {
    console.error("Failed to lock tab:", err);
    return false;
  }
}

// Prevent user from hitting "Back" or navigating to another URL without unlocking
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const lockPageUrl = chrome.runtime.getURL("lock/lock.html");
    if (!changeInfo.url.startsWith(lockPageUrl)) {
      // Check if this tab has an active lock token
      const { lockedTabs = {} } = await chrome.storage.local.get("lockedTabs");
      for (const [token, data] of Object.entries(lockedTabs)) {
        if (data.tabId === tabId) {
          // Tab is supposed to be locked! Reject unauthorized navigation
          await chrome.tabs.update(tabId, { url: `${lockPageUrl}?token=${token}` });
          break;
        }
      }
    }
  }
});

// ==========================================
// AUTO-LOCK TRACKING LOGIC (LEAVE TAB TIMER)
// ==========================================

// Helper to get activeTabId safely
async function getActiveTabId() {
  const { activeTabId } = await chrome.storage.local.get("activeTabId");
  return activeTabId || null;
}

// Helper to set activeTabId safely
async function setActiveTabId(tabId) {
  await chrome.storage.local.set({ activeTabId: tabId });
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const previousTabId = await getActiveTabId();
  await setActiveTabId(activeInfo.tabId);

  const { autoLockTabs = {} } = await chrome.storage.local.get("autoLockTabs");

  if (previousTabId && autoLockTabs[previousTabId]) {
    const timeout = autoLockTabs[previousTabId].timeoutMinutes || 5;
    chrome.alarms.create(`autolock_${previousTabId}`, {
      delayInMinutes: timeout
    });
  }

  if (activeTabId) {
    chrome.alarms.clear(`autolock_${activeTabId}`);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const { autoLockTabs = {} } = await chrome.storage.local.get("autoLockTabs");
  const activeTabId = await getActiveTabId();

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    if (activeTabId && autoLockTabs[activeTabId]) {
      const timeout = autoLockTabs[activeTabId].timeoutMinutes || 5;
      chrome.alarms.create(`autolock_${activeTabId}`, {
        delayInMinutes: timeout
      });
    }
  } else {
    if (activeTabId) {
      chrome.alarms.clear(`autolock_${activeTabId}`);
    }
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith("autolock_")) {
    const tabId = parseInt(alarm.name.replace("autolock_", ""), 10);
    if (!tabId) return;

    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        await lockTab(tabId);
      }
    } catch (e) {
      chrome.alarms.clear(alarm.name);
    }
  }
});

// Clean up memory if tab is closed by user
chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.alarms.clear(`autolock_${tabId}`);

  const { lockedTabs = {}, autoLockTabs = {} } = await chrome.storage.local.get([
    "lockedTabs",
    "autoLockTabs"
  ]);

  let changed = false;
  for (const [token, data] of Object.entries(lockedTabs)) {
    if (data.tabId === tabId) {
      delete lockedTabs[token];
      changed = true;
    }
  }

  if (autoLockTabs[tabId]) {
    delete autoLockTabs[tabId];
    changed = true;
  }

  if (changed) {
    await chrome.storage.local.set({ lockedTabs, autoLockTabs });
  }

  const activeTabId = await getActiveTabId();
  if (activeTabId === tabId) {
    await chrome.storage.local.remove("activeTabId");
  }
});

// Handle requests from popup or lock page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "lockTab") {
    lockTab(request.tabId).then((success) => {
      sendResponse({ success: Boolean(success) });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  // Set Master Password using PBKDF2
  if (request.action === "setPassword") {
    createPasswordVerifier(request.password).then(async (config) => {
      await chrome.storage.local.set({ authConfig: config });
      sendResponse({ success: true });
    });
    return true;
  }

  // Change Password
  if (request.action === "changePassword") {
    chrome.storage.local.get("authConfig", async (res) => {
      const { authConfig } = res;
      if (!authConfig) {
        sendResponse({ success: false, error: "No existing password." });
        return;
      }

      const isValid = await verifyPassword(request.oldPassword, authConfig.salt, authConfig.verifier);
      if (!isValid) {
        sendResponse({ success: false, error: "Current password is incorrect!" });
        return;
      }

      // Re-hash new password
      const newConfig = await createPasswordVerifier(request.newPassword);
      await chrome.storage.local.set({ authConfig: newConfig });
      sendResponse({ success: true });
    });
    return true;
  }

  // Unlock Tab
  if (request.action === "unlockTab") {
    const sessionToken = request.token;

    chrome.storage.local.get(["authConfig", "lockedTabs"], async (res) => {
      const { authConfig, lockedTabs = {} } = res;

      if (!authConfig) {
        sendResponse({ success: false, error: "Master password not configured." });
        return;
      }

      // 1. Verify password via PBKDF2
      const isValid = await verifyPassword(request.password, authConfig.salt, authConfig.verifier);
      if (!isValid) {
        sendResponse({ success: false, error: "Incorrect password!" });
        return;
      }

      // 2. Decrypt target payload
      const lockData = lockedTabs[sessionToken];
      let targetUrl = "https://www.google.com";

      if (lockData && lockData.encryptedPayload) {
        const decryptedJson = await decryptWithPassword(
          lockData.encryptedPayload,
          authConfig.verifier,
          authConfig.salt
        );

        if (decryptedJson) {
          try {
            const parsed = JSON.parse(decryptedJson);
            targetUrl = parsed.url;
          } catch (e) {
            targetUrl = decryptedJson;
          }
        }

        // Remove token from storage
        delete lockedTabs[sessionToken];
        await chrome.storage.local.set({ lockedTabs });
      }

      const tabId = (sender.tab && sender.tab.id) || (lockData && lockData.tabId);
      if (tabId) {
        await chrome.tabs.update(tabId, { url: targetUrl });
      }

      sendResponse({ success: true, targetUrl });
    });
    return true;
  }
});
