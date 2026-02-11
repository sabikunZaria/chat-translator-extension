// ============================================================
// content.js — Runs inside WhatsApp Web & Discord pages
//
// This script is injected directly into the chat page.
// It watches for new messages using MutationObserver,
// sends them to background.js for translation,
// and injects the translated text back into the page.
// ============================================================

// ---- Which platform are we on? ----
const PLATFORM = window.location.hostname.includes("whatsapp")
  ? "whatsapp"
  : "discord";

console.log(`[AI Translator] Loaded on: ${PLATFORM}`);

// ---- Extension state ----
let isEnabled    = false;
let targetLang   = "en";
let hasApiKey    = false;

// ---- Message history for AI context (better translations) ----
let messageContext = [];

// ---- Load saved settings on startup ----
chrome.storage.sync.get(["enabled", "targetLang", "apiKey"], (result) => {
  isEnabled  = result.enabled  ?? false;
  targetLang = result.targetLang ?? "en";
  hasApiKey  = !!result.apiKey;

  if (isEnabled && hasApiKey) startObserving();
});

// ---- React to setting changes from the popup in real time ----
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled)    isEnabled  = changes.enabled.newValue;
  if (changes.targetLang) targetLang = changes.targetLang.newValue;
  if (changes.apiKey)     hasApiKey  = !!changes.apiKey.newValue;

  if (isEnabled && hasApiKey) {
    startObserving();
  } else {
    stopObserving();
  }
});

// ============================================================
// CSS SELECTORS
// These tell us WHERE to find messages in each platform's DOM.
// If a platform updates their UI, these may need updating.
// ============================================================
const SELECTORS = {
  whatsapp: {
    // The container div for each incoming message
    messageContainer: "div.message-in",
    // The actual text span inside the message
    messageText: "span.selectable-text span[dir]",
    // The typing input box
    inputBox: "div[contenteditable='true'][data-tab='10']",
  },
  discord: {
    messageContainer: "li.messageListItem__6a4fb",
    messageText: "span[id^='message-content']",
    inputBox: "div[role='textbox'][contenteditable='true']",
  },
};

const sel = SELECTORS[PLATFORM];

// ============================================================
// MUTATION OBSERVER
// Watches the page for new messages appearing in the DOM.
// Fires handleNewMessage() whenever a new message is added.
// ============================================================
let observer = null;

function startObserving() {
  if (observer) return; // already watching

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // The added node might BE a message, or CONTAIN messages
        const messages = node.matches(sel.messageContainer)
          ? [node]
          : [...node.querySelectorAll(sel.messageContainer)];

        messages.forEach(handleNewMessage);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,  // watch for added/removed child elements
    subtree: true,    // watch all descendants, not just direct children
  });

  console.log("[AI Translator] Watching for messages ✅");
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log("[AI Translator] Stopped watching ⏹");
  }
}

// ============================================================
// HANDLE NEW MESSAGE
// Called for every new message that appears on screen.
// ============================================================
async function handleNewMessage(messageNode) {

  // Skip if already translated
  if (messageNode.dataset.aiTranslated === "true") return;

  // Find the text element inside this message
  const textEl = messageNode.querySelector(sel.messageText);
  if (!textEl) return;

  const originalText = textEl.innerText?.trim();
  if (!originalText || originalText.length < 2) return;

  // Mark as processed so we don't translate it twice
  messageNode.dataset.aiTranslated = "true";

  // Add to context window (helps AI translate short replies better)
  messageContext.push(originalText);
  if (messageContext.length > 5) messageContext.shift();

  // Show loading indicator while translating
  const loader = showLoader(messageNode);

  // Ask background.js to translate (it holds the API key)
  chrome.runtime.sendMessage(
    {
      action:     "translate",
      text:       originalText,
      targetLang: targetLang,
      context:    messageContext.slice(0, -1), // all except current message
    },
    (response) => {
      removeLoader(loader);

      if (!response) return;

      if (response.success) {
        // Don't show translation if it's the same language
        if (!response.sameLanguage) {
          injectTranslation(messageNode, textEl, originalText, response.translated, response.detectedLanguage);
        }
      } else {
        // Show a subtle error badge
        handleError(messageNode, response.error);
      }
    }
  );
}

// ============================================================
// INJECT TRANSLATION
// Adds the translated text below the original message.
// Clicking it toggles between translation and original.
// ============================================================
function injectTranslation(messageNode, textEl, original, translated, detectedLang) {

  // Remove any existing translation for this message
  const existing = messageNode.querySelector(".ai-translation-bubble");
  if (existing) existing.remove();

  const bubble = document.createElement("div");
  bubble.className = "ai-translation-bubble";

  bubble.style.cssText = `
    display: inline-block;
    margin-top: 4px;
    padding: 3px 8px;
    background: rgba(79, 142, 247, 0.08);
    border-left: 2px solid #4f8ef7;
    border-radius: 0 4px 4px 0;
    font-size: 0.82em;
    color: #94a3b8;
    font-style: italic;
    cursor: pointer;
    max-width: 100%;
    line-height: 1.5;
    user-select: none;
    transition: background 0.15s;
  `;

  const flagEl = document.createElement("span");
  flagEl.style.cssText = "font-style:normal; margin-right:4px; font-size:0.9em;";
  flagEl.textContent = "🌐";

  const textSpan = document.createElement("span");
  textSpan.textContent = translated;

  bubble.appendChild(flagEl);
  bubble.appendChild(textSpan);

  // Click to toggle between translation and original
  let showingOriginal = false;
  bubble.title = `Detected: ${detectedLang} — Click to see original`;

  bubble.addEventListener("click", () => {
    showingOriginal = !showingOriginal;
    if (showingOriginal) {
      textSpan.textContent = original;
      flagEl.textContent = "↩️";
      bubble.style.borderLeftColor = "#f59e0b";
      bubble.style.background = "rgba(245,158,11,0.06)";
    } else {
      textSpan.textContent = translated;
      flagEl.textContent = "🌐";
      bubble.style.borderLeftColor = "#4f8ef7";
      bubble.style.background = "rgba(79,142,247,0.08)";
    }
  });

  // Insert bubble after the message text element
  textEl.closest("div")?.appendChild(bubble) || textEl.parentNode.insertBefore(bubble, textEl.nextSibling);
}

// ============================================================
// LOADING INDICATOR
// ============================================================
function showLoader(messageNode) {
  const loader = document.createElement("span");
  loader.className = "ai-translation-loader";
  loader.style.cssText = `
    display: inline-block;
    margin-top: 3px;
    font-size: 0.72em;
    color: #4f8ef7;
    opacity: 0.7;
    font-style: italic;
  `;
  loader.textContent = "⏳ translating...";
  messageNode.appendChild(loader);
  return loader;
}

function removeLoader(loader) {
  loader?.remove();
}

// ============================================================
// ERROR HANDLING
// Shows a small badge if translation fails (e.g. API key issue)
// ============================================================
function handleError(messageNode, errorCode) {
  // Don't flood the page with error badges
  if (messageNode.querySelector(".ai-translation-error")) return;

  const badge = document.createElement("span");
  badge.className = "ai-translation-error";
  badge.style.cssText = `
    display: inline-block;
    margin-top: 3px;
    font-size: 0.7em;
    color: #f87171;
    font-style: italic;
  `;

  if (errorCode === "NO_API_KEY" || errorCode === "INVALID_API_KEY") {
    badge.textContent = "⚠️ Check API key in extension settings";
  } else if (errorCode === "RATE_LIMITED") {
    badge.textContent = "⚠️ Rate limited — slow down";
  } else {
    badge.textContent = "⚠️ Translation failed";
  }

  messageNode.appendChild(badge);
}