document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const targetUrl = urlParams.get("url") || "";
  const targetTitle = urlParams.get("title") || "";

  const lockedTabTitleEl = document.getElementById("locked-tab-title");
  const form = document.getElementById("unlock-form");
  const passwordInput = document.getElementById("password-input");
  const errorMsg = document.getElementById("error-msg");

  if (targetTitle || targetUrl) {
    lockedTabTitleEl.textContent = targetTitle || targetUrl;
    document.title = `Locked: ${targetTitle || "Tab"}`;
  } else {
    lockedTabTitleEl.textContent = "Protected Tab";
  }

  // Handle submit form
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorMsg.classList.add("hidden");

    const password = passwordInput.value;
    if (!password) return;

    chrome.runtime.sendMessage(
      {
        action: "unlockTab",
        password: password,
        targetUrl: targetUrl
      },
      (response) => {
        if (response && response.success) {
          if (response.targetUrl) {
            window.location.href = response.targetUrl;
          }
        } else {
          errorMsg.textContent = response?.error || "Incorrect password. Please try again.";
          errorMsg.classList.remove("hidden");
          passwordInput.value = "";
          passwordInput.focus();
        }
      }
    );
  });
});
