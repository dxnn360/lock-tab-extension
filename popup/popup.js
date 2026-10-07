function showToast(message, duration = 2000) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), duration);
}

document.addEventListener("DOMContentLoaded", async () => {
  const setupView = document.getElementById("setup-view");
  const mainView = document.getElementById("main-view");
  const changePwdView = document.getElementById("change-pwd-view");

  const setupForm = document.getElementById("setup-form");
  const changePwdForm = document.getElementById("change-pwd-form");
  const btnLockCurrent = document.getElementById("btn-lock-current");
  const btnChangePassword = document.getElementById("btn-change-password");
  const btnCancelChange = document.getElementById("btn-cancel-change");

  const currentTabTitle = document.getElementById("current-tab-title");
  const currentTabUrl = document.getElementById("current-tab-url");
  const lockedCountEl = document.getElementById("locked-count");
  const autolockCountEl = document.getElementById("autolock-count");

  const toggleAutolock = document.getElementById("toggle-autolock");
  const autolockTimerRow = document.getElementById("autolock-timer-row");
  const selectAutolockTime = document.getElementById("select-autolock-time");

  let currentTab = null;

  // Get active tab in current window
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = activeTab;

  if (currentTab) {
    currentTabTitle.textContent = currentTab.title || "Untitled Tab";
    currentTabUrl.textContent = currentTab.url || "";

    // Prevent locking internal or lock screen pages
    const lockPageUrl = chrome.runtime.getURL("lock/lock.html");
    if (
      currentTab.url?.startsWith(lockPageUrl) ||
      currentTab.url?.startsWith("chrome://") ||
      currentTab.url?.startsWith("edge://")
    ) {
      btnLockCurrent.disabled = true;
      btnLockCurrent.textContent = "Cannot Lock This Tab";
      btnLockCurrent.style.opacity = "0.4";
      btnLockCurrent.style.cursor = "not-allowed";
      toggleAutolock.disabled = true;
    }
  }

  // Check password status and current tab auto-lock configuration
  async function checkPasswordState() {
    const { authConfig, lockedTabs = {}, autoLockTabs = {} } = await chrome.storage.local.get([
      "authConfig",
      "lockedTabs",
      "autoLockTabs"
    ]);

    lockedCountEl.textContent = Object.keys(lockedTabs).length;
    autolockCountEl.textContent = Object.keys(autoLockTabs).length;

    if (!authConfig || !authConfig.salt) {
      setupView.classList.remove("hidden");
      mainView.classList.add("hidden");
      changePwdView.classList.add("hidden");
    } else {
      setupView.classList.add("hidden");
      mainView.classList.remove("hidden");
      changePwdView.classList.add("hidden");

      // Set toggle state for active tab
      if (currentTab && autoLockTabs[currentTab.id]) {
        toggleAutolock.checked = true;
        autolockTimerRow.classList.remove("hidden");
        selectAutolockTime.value = String(autoLockTabs[currentTab.id].timeoutMinutes || 5);
      } else {
        toggleAutolock.checked = false;
        autolockTimerRow.classList.add("hidden");
      }
    }
  }

  await checkPasswordState();

  // Auto-lock toggle change
  toggleAutolock.addEventListener("change", async () => {
    if (!currentTab || !currentTab.id) return;

    const { autoLockTabs = {} } = await chrome.storage.local.get("autoLockTabs");

    if (toggleAutolock.checked) {
      autolockTimerRow.classList.remove("hidden");
      const minutes = parseInt(selectAutolockTime.value, 10) || 5;
      autoLockTabs[currentTab.id] = {
        timeoutMinutes: minutes,
        tabId: currentTab.id,
        url: currentTab.url,
        title: currentTab.title
      };
      await chrome.storage.local.set({ autoLockTabs });
      showToast(`Auto-lock enabled (${minutes}m after leaving tab)`);
    } else {
      autolockTimerRow.classList.add("hidden");
      delete autoLockTabs[currentTab.id];
      await chrome.storage.local.set({ autoLockTabs });
      showToast("Auto-lock disabled for this tab");
    }

    autolockCountEl.textContent = Object.keys(autoLockTabs).length;
  });

  // Auto-lock duration selection change
  selectAutolockTime.addEventListener("change", async () => {
    if (!currentTab || !currentTab.id || !toggleAutolock.checked) return;

    const { autoLockTabs = {} } = await chrome.storage.local.get("autoLockTabs");
    const minutes = parseInt(selectAutolockTime.value, 10) || 5;

    if (autoLockTabs[currentTab.id]) {
      autoLockTabs[currentTab.id].timeoutMinutes = minutes;
      await chrome.storage.local.set({ autoLockTabs });
      showToast(`Timeout set to ${minutes} minutes`);
    }
  });

  // Setup Form Submit (Create initial password)
  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const newPwd = document.getElementById("new-password").value;
    const confirmPwd = document.getElementById("confirm-password").value;

    if (newPwd.length < 4) {
      showToast("Password must be at least 4 characters!");
      return;
    }
    if (newPwd !== confirmPwd) {
      showToast("Passwords do not match!");
      return;
    }

    chrome.runtime.sendMessage({ action: "setPassword", password: newPwd }, (res) => {
      if (res?.success) {
        showToast("Password saved securely (PBKDF2)!");
        setTimeout(() => checkPasswordState(), 500);
      }
    });
  });

  // Lock Current Tab Button
  btnLockCurrent.addEventListener("click", () => {
    if (!currentTab || !currentTab.id) return;
    chrome.runtime.sendMessage({ action: "lockTab", tabId: currentTab.id }, (res) => {
      if (res?.success) {
        window.close();
      }
    });
  });

  // Open Change Password View
  btnChangePassword.addEventListener("click", () => {
    mainView.classList.add("hidden");
    changePwdView.classList.remove("hidden");
  });

  btnCancelChange.addEventListener("click", () => {
    changePwdView.classList.add("hidden");
    mainView.classList.remove("hidden");
  });

  // Change Password Form Submit
  changePwdForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const oldPwd = document.getElementById("old-password").value;
    const updatePwd = document.getElementById("update-password").value;

    if (updatePwd.length < 4) {
      showToast("New password must be at least 4 characters!");
      return;
    }

    chrome.runtime.sendMessage(
      { action: "changePassword", oldPassword: oldPwd, newPassword: updatePwd },
      (res) => {
        if (res?.success) {
          showToast("Password updated successfully!");
          changePwdForm.reset();
          setTimeout(() => checkPasswordState(), 800);
        } else {
          showToast(res?.error || "Failed to update password!");
        }
      }
    );
  });
});
