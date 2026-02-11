// ============================================================
// background.js — Service Worker
//
// This is the brain of the extension.
// It lives in the background and handles all OpenAI API calls.
// Content scripts CANNOT call external APIs directly,
// so they send a message here and we make the API call for them.
//
// NO BACKEND SERVER NEEDED — we call OpenAI directly.
// ============================================================

// ---- Map language codes to readable names for the AI prompt ----
const LANGUAGE_NAMES = {
  en: "English",
  bn: "Bengali (Bangla)",
  es: "Spanish",
  fr: "French",
  de: "German",
  ar: "Arabic",
  hi: "Hindi",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  pt: "Portuguese",
  ru: "Russian",
  ko: "Korean",
  tr: "Turkish",
};

// ============================================================
// Listen for messages from content.js
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === "translate") {
    handleTranslation(request)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err  => sendResponse({ success: false, error: err.message }));

    return true; // IMPORTANT: tells Chrome we'll respond asynchronously
  }

});

// ============================================================
// Main translation function — calls OpenAI directly
// ============================================================
async function handleTranslation({ text, targetLang, context = [] }) {

  // Step 1: Get the user's API key from storage
  const { apiKey } = await chrome.storage.sync.get("apiKey");

  if (!apiKey) {
    throw new Error("NO_API_KEY"); // special error — popup will catch this
  }

  const targetLanguage = LANGUAGE_NAMES[targetLang] || targetLang;

  // Step 2: Build context string (last few messages = better translations)
  let contextStr = "";
  if (context.length > 0) {
    contextStr = "\n\nPrevious messages for context:\n";
    context.slice(-3).forEach((msg, i) => {
      contextStr += `  ${i + 1}. ${msg}\n`;
    });
  }

  // Step 3: Build the AI prompt
  const systemPrompt = `You are a real-time chat message translator.

Your job:
1. Detect the language of the message
2. Translate it naturally into ${targetLanguage}
3. Preserve tone, emoji, slang, and energy of the original
4. Keep it short and conversational — this is chat, not formal writing

Rules:
- If the message is ALREADY in ${targetLanguage}, return it unchanged
- Handle mixed-language text (Banglish, Spanglish, etc.) gracefully  
- Preserve all emojis exactly as they appear
- Never add explanations or notes — just the translation

Respond ONLY in this JSON format:
{
  "translated": "the translated text",
  "detected_language": "the source language name",
  "same_language": true or false
}`;

  const userPrompt = `Translate this chat message:${contextStr}\n\nMessage: ${text}`;

  // Step 4: Call OpenAI API directly
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",      // Fast, cheap, perfect for real-time chat
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   }
      ],
      temperature: 0.3,          // Low = consistent translations
      response_format: { type: "json_object" }
    })
  });

  // Step 5: Handle errors
  if (response.status === 401) throw new Error("INVALID_API_KEY");
  if (response.status === 429) throw new Error("RATE_LIMITED");
  if (!response.ok)            throw new Error(`OpenAI error: ${response.status}`);

  // Step 6: Parse and return result
  const data   = await response.json();
  const result = JSON.parse(data.choices[0].message.content);

  return {
    translated:        result.translated        || text,
    detectedLanguage:  result.detected_language || "Unknown",
    sameLanguage:      result.same_language     || false,
  };
}