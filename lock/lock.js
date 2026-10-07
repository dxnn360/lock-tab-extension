document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionToken = urlParams.get("token") || "";

  const form = document.getElementById("unlock-form");
  const passwordInput = document.getElementById("password-input");
  const errorMsg = document.getElementById("error-msg");
  const btnUnlock = document.getElementById("btn-unlock");

  // Prevent back button navigation bypass
  window.history.pushState(null, "", window.location.href);
  window.onpopstate = () => {
    window.history.pushState(null, "", window.location.href);
  };

  // Handle submit form
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorMsg.classList.add("hidden");

    const password = passwordInput.value;
    if (!password) return;

    btnUnlock.disabled = true;

    chrome.runtime.sendMessage(
      {
        action: "unlockTab",
        password: password,
        token: sessionToken
      },
      (response) => {
        btnUnlock.disabled = false;
        if (response && response.success) {
          if (response.targetUrl) {
            window.location.replace(response.targetUrl);
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
