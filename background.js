// Helper SHA-256 Hash
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Initialize right-click context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "lock-current-tab",
    title: "🔒 Lock This Tab",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "lock-current-tab" && tab && tab.id) {
    await lockTab(tab.id);
  }
});

// Fungsi untuk mengunci tab tertentu
async function lockTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;

    // Cegah mengunci halaman lock itu sendiri atau internal browser
    const lockPageUrl = chrome.runtime.getURL("lock/lock.html");
    if (tab.url.startsWith(lockPageUrl) || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
      return;
    }

    const { lockedTabs = {} } = await chrome.storage.local.get("lockedTabs");
    
    // Simpan URL asli & favicon/title
    lockedTabs[tabId] = {
      targetUrl: tab.url,
      title: tab.title || "Locked Tab",
      favicon: tab.favIconUrl || "",
      lockedAt: Date.now()
    };

    await chrome.storage.local.set({ lockedTabs });

    // Clear alarm autolock jika ada
    await chrome.alarms.clear(`autolock_${tabId}`);

    // Redirect tab ke halaman input password / unlock
    const encodedTarget = encodeURIComponent(tab.url);
    const encodedTitle = encodeURIComponent(tab.title || "Halaman Terkunci");
    const redirectUrl = `${lockPageUrl}?url=${encodedTarget}&title=${encodedTitle}`;
    await chrome.tabs.update(tabId, { url: redirectUrl });
  } catch (err) {
    console.error("Gagal mengunci tab:", err);
  }
}

// ==========================================
// AUTO-LOCK TRACKING LOGIC (LEAVE TAB TIMER)
// ==========================================

// Variabel memori tab yang sedang aktif
let activeTabId = null;

// Lacak saat tab aktif berganti
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const previousTabId = activeTabId;
  activeTabId = activeInfo.tabId;

  const { autoLockTabs = {} } = await chrome.storage.local.get("autoLockTabs");

  // Jika tab sebelumnya ditinggalkan dan terdaftar autoLock, jadwalkan penguncian
  if (previousTabId && autoLockTabs[previousTabId]) {
    const timeout = autoLockTabs[previousTabId].timeoutMinutes || 5;
    chrome.alarms.create(`autolock_${previousTabId}`, {
      delayInMinutes: timeout
    });
  }

  // Jika tab yang baru aktif memiliki alarm tertunda, batalkan karena user kembali ke tab ini
  if (activeTabId) {
    chrome.alarms.clear(`autolock_${activeTabId}`);
  }
});

// Lacak saat jendela browser kehilangan fokus (user beralih ke aplikasi lain)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const { autoLockTabs = {} } = await chrome.storage.local.get("autoLockTabs");

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // User berpindah ke aplikasi luar (alt-tab)
    if (activeTabId && autoLockTabs[activeTabId]) {
      const timeout = autoLockTabs[activeTabId].timeoutMinutes || 5;
      chrome.alarms.create(`autolock_${activeTabId}`, {
        delayInMinutes: timeout
      });
    }
  } else {
    // User kembali ke browser, batalkan timer tab aktif
    if (activeTabId) {
      chrome.alarms.clear(`autolock_${activeTabId}`);
    }
  }
});

// Alarm listener saat waktu leave tab habis
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith("autolock_")) {
    const tabId = parseInt(alarm.name.replace("autolock_", ""), 10);
    if (!tabId) return;

    try {
      const tab = await chrome.tabs.get(tabId);
      // Kunci tab jika masih terbuka
      if (tab) {
        await lockTab(tabId);
      }
    } catch (e) {
      // Tab mungkin sudah ditutup
      chrome.alarms.clear(alarm.name);
    }
  }
});

// Hapus tab dari memori lockedTabs dan autoLockTabs jika tab ditutup oleh user
chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.alarms.clear(`autolock_${tabId}`);

  const { lockedTabs = {}, autoLockTabs = {} } = await chrome.storage.local.get([
    "lockedTabs",
    "autoLockTabs"
  ]);

  let changed = false;
  if (lockedTabs[tabId]) {
    delete lockedTabs[tabId];
    changed = true;
  }
  if (autoLockTabs[tabId]) {
    delete autoLockTabs[tabId];
    changed = true;
  }

  if (changed) {
    await chrome.storage.local.set({ lockedTabs, autoLockTabs });
  }

  if (activeTabId === tabId) {
    activeTabId = null;
  }
});

// Message listener dari popup atau halaman unlock
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "lockTab") {
    lockTab(request.tabId).then(() => sendResponse({ success: true }));
    return true;
  }

  if (request.action === "unlockTab") {
    const tabId = (sender.tab && sender.tab.id) || request.tabId;
    const fallbackTargetUrl = request.targetUrl;

    chrome.storage.local.get(["passwordHash", "lockedTabs"], async (res) => {
      const { passwordHash, lockedTabs = {} } = res;

      if (!passwordHash) {
        sendResponse({ success: false, error: "Master password not configured." });
        return;
      }

      const inputHash = await hashPassword(request.password);
      if (inputHash === passwordHash) {
        let targetUrl = fallbackTargetUrl;
        if (tabId && lockedTabs[tabId]) {
          targetUrl = lockedTabs[tabId].targetUrl || targetUrl;
          delete lockedTabs[tabId];
          await chrome.storage.local.set({ lockedTabs });
        }

        if (!targetUrl || targetUrl === "about:blank") {
          targetUrl = "https://www.google.com";
        }

        if (tabId) {
          await chrome.tabs.update(tabId, { url: targetUrl });
        }
        sendResponse({ success: true, targetUrl });
      } else {
        sendResponse({ success: false, error: "Incorrect password!" });
      }
    });
    return true; // async response
  }

  if (request.action === "verifyPassword") {
    chrome.storage.local.get("passwordHash", async (res) => {
      if (!res.passwordHash) {
        sendResponse({ valid: false, notConfigured: true });
        return;
      }
      const inputHash = await hashPassword(request.password);
      sendResponse({ valid: inputHash === res.passwordHash });
    });
    return true;
  }
});
