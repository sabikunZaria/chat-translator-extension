// ============================================================
// popup.js — Popup Logic
//
// Manages 3 screens:
//   1. Setup screen   — shown when no API key saved yet
//   2. Main screen    — translation toggle + language picker
//   3. Change key     — update or remove API key
//
// All settings saved to chrome.storage.sync so content.js
// can read them and react in real time.
// ============================================================

// ---- Screen elements ----
const setupScreen     = document.getElementById("setupScreen");
const mainScreen      = document.getElementById("mainScreen");
const changeKeyScreen = document.getElementById("changeKeyScreen");

// ---- Setup screen ----
const apiKeyInput  = document.getElementById("apiKeyInput");
const showKeyBtn   = document.getElementById("showKeyBtn");
const saveKeyBtn   = document.getElementById("saveKeyBtn");
const setupError   = document.getElementById("setupError");

// ---- Main screen ----
const enableToggle = document.getElementById("enableToggle");
const statusText   = document.getElementById("statusText");
const toggleCard   = document.getElementById("toggleCard");
const langSelect   = document.getElementById("langSelect");
const platformTag  = document.getElementById("platformTag");
const settingsBtn  = document.getElementById("settingsBtn");
const changeKeyBtn = document.getElementById("changeKeyBtn");

// ---- Change key screen ----
const newApiKeyInput  = document.getElementById("newApiKeyInput");
const showNewKeyBtn   = document.getElementById("showNewKeyBtn");
const updateKeyBtn    = document.getElementById("updateKeyBtn");
const removeKeyBtn    = document.getElementById("removeKeyBtn");
const backBtn         = document.getElementById("backBtn");
const changeKeyError  = document.getElementById("changeKeyError");

// ============================================================
// INIT — Decide which screen to show on popup open
// ============================================================
chrome.storage.sync.get(["apiKey", "enabled", "targetLang"], (result) => {
  if (result.apiKey) {
    // Has API key — show main screen
    showScreen("main");
    enableToggle.checked = result.enabled ?? false;
    langSelect.value     = result.targetLang ?? "en";
    updateToggleUI(enableToggle.checked);
    updatePlatformTag();
  } else {
    // No API key yet — show setup screen
    showScreen("setup");
  }
});

// ============================================================
// SCREEN NAVIGATION
// ============================================================
function showScreen(name) {
  setupScreen.classList.add("hidden");
  mainScreen.classList.add("hidden");
  changeKeyScreen.classList.add("hidden");

  if (name === "setup")     setupScreen.classList.remove("hidden");
  if (name === "main")      mainScreen.classList.remove("hidden");
  if (name === "changeKey") changeKeyScreen.classList.remove("hidden");
}

settingsBtn.addEventListener("click",  () => showScreen("changeKey"));
changeKeyBtn.addEventListener("click", () => showScreen("changeKey"));
backBtn.addEventListener("click",      () => showScreen("main"));

// ============================================================
// SETUP SCREEN — Save API key for the first time
// ============================================================
saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  const err  = validateApiKey(key);

  if (err) {
    showError(setupError, err);
    return;
  }

  chrome.storage.sync.set({ apiKey: key, enabled: false, targetLang: "en" }, () => {
    showScreen("main");
    enableToggle.checked = false;
    langSelect.value     = "en";
    updateToggleUI(false);
    updatePlatformTag();
  });
});

// Show/hide key toggle
showKeyBtn.addEventListener("click", () => togglePasswordVisibility(apiKeyInput, showKeyBtn));

// ============================================================
// MAIN SCREEN — Toggle & language
// ============================================================
enableToggle.addEventListener("change", () => {
  const isOn = enableToggle.checked;
  chrome.storage.sync.set({ enabled: isOn });
  updateToggleUI(isOn);
});

langSelect.addEventListener("change", () => {
  chrome.storage.sync.set({ targetLang: langSelect.value });
});

function updateToggleUI(isOn) {
  if (isOn) {
    statusText.textContent = "ON";
    statusText.classList.add("on");
    toggleCard.classList.add("active");
  } else {
    statusText.textContent = "OFF";
    statusText.classList.remove("on");
    toggleCard.classList.remove("active");
  }
}

// Show which platform the current tab is on
function updatePlatformTag() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url ?? "";

    if (url.includes("whatsapp")) {
      platformTag.textContent = "WhatsApp Web ✓";
      platformTag.style.color = "#34d399";
    } else if (url.includes("discord")) {
      platformTag.textContent = "Discord ✓";
      platformTag.style.color = "#a78bfa";
    } else {
      platformTag.textContent = "Open WhatsApp or Discord";
      platformTag.style.color = "#475569";
    }
  });
}

// ============================================================
// CHANGE KEY SCREEN — Update or remove API key
// ============================================================
showNewKeyBtn.addEventListener("click", () => togglePasswordVisibility(newApiKeyInput, showNewKeyBtn));

updateKeyBtn.addEventListener("click", () => {
  const key = newApiKeyInput.value.trim();
  const err  = validateApiKey(key);

  if (err) {
    showError(changeKeyError, err);
    return;
  }

  chrome.storage.sync.set({ apiKey: key }, () => {
    newApiKeyInput.value = "";
    hideError(changeKeyError);
    showScreen("main");
  });
});

removeKeyBtn.addEventListener("click", () => {
  if (!confirm("Remove your API key and reset the extension?")) return;

  chrome.storage.sync.clear(() => {
    showScreen("setup");
  });
});

// ============================================================
// HELPERS
// ============================================================

// Basic API key format validation (starts with "sk-")
function validateApiKey(key) {
  if (!key)               return "Please enter your API key.";
  if (!key.startsWith("sk-")) return "API key should start with 'sk-'. Please check it.";
  if (key.length < 20)    return "That key looks too short. Please check it.";
  return null; // no error
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError(el) {
  el.textContent = "";
  el.classList.add("hidden");
}

function togglePasswordVisibility(input, btn) {
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
}