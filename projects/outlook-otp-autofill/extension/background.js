// Service worker: polls the local bridge for the latest OTP, keeps it in
// session storage, updates the toolbar badge, and pushes the code to the
// active tab's content script so it can autofill.

const DEFAULTS = { bridgeUrl: "http://127.0.0.1:4321", bridgeToken: "", pollMs: 3000, autofill: true };
const ALARM = "otp-poll";

let lastCode = null;

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function fetchLatest(settings) {
  if (!settings.bridgeToken) return { error: "Bridge token not set. Open the popup and paste it." };
  try {
    const res = await fetch(`${settings.bridgeUrl}/latest`, {
      headers: { "X-Bridge-Token": settings.bridgeToken },
      cache: "no-store",
    });
    if (res.status === 401) return { error: "Bridge rejected token." };
    if (!res.ok) return { error: `Bridge error ${res.status}` };
    return await res.json();
  } catch {
    return { error: "Bridge not reachable. Is `npm start` running in bridge/?" };
  }
}

async function fetchStatus(settings) {
  if (!settings.bridgeToken) return null;
  try {
    const res = await fetch(`${settings.bridgeUrl}/status`, { headers: { "X-Bridge-Token": settings.bridgeToken }, cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function consume(settings, code) {
  try {
    await fetch(`${settings.bridgeUrl}/consume`, {
      method: "POST",
      headers: { "X-Bridge-Token": settings.bridgeToken, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    // Best effort. The code will expire on its own.
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

async function pushToActiveTab(payload) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url ?? "")) return { filled: false };
  try {
    return await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    // Content script may not be injected yet (tab opened before install). Inject once and retry.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      return await chrome.tabs.sendMessage(tab.id, payload);
    } catch {
      return { filled: false };
    }
  }
}

async function poll() {
  const settings = await getSettings();
  const latest = await fetchLatest(settings);
  await chrome.storage.session.set({ latest, checkedAt: Date.now() });

  if (latest.error) {
    setBadge("!", "#b00020");
    return;
  }
  if (!latest.code) {
    setBadge("", null);
    return;
  }

  setBadge("OTP", "#1b5e20");

  if (latest.code !== lastCode) {
    lastCode = latest.code;
    if (settings.autofill) {
      const result = await pushToActiveTab({ type: "OTP_AVAILABLE", code: latest.code });
      if (result?.filled) {
        await consume(settings, latest.code);
        setBadge("", null);
      }
    }
  }
}

// Alarms survive service-worker suspension. Minimum period is 30 s in MV3,
// so we also run a short setInterval while the worker is alive for snappier fills.
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 0.5 }));
chrome.alarms.onAlarm.addListener((a) => a.name === ALARM && poll());

let fastTimer = null;
async function startFastLoop() {
  const { pollMs } = await getSettings();
  if (fastTimer) clearInterval(fastTimer);
  fastTimer = setInterval(poll, Math.max(1000, pollMs));
}
startFastLoop();
poll();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "POLL_NOW") {
    poll().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "FILL_NOW") {
    getSettings()
      .then(async (settings) => {
        const latest = await fetchLatest(settings);
        if (!latest.code) return sendResponse({ filled: false, reason: latest.error || "No code available" });
        const result = await pushToActiveTab({ type: "OTP_AVAILABLE", code: latest.code, force: true });
        if (result?.filled) await consume(settings, latest.code);
        sendResponse(result ?? { filled: false });
      })
      .catch(() => sendResponse({ filled: false }));
    return true;
  }
  if (msg?.type === "GET_STATUS") {
    getSettings().then(fetchStatus).then((status) => sendResponse(status));
    return true;
  }
  if (msg?.type === "SETTINGS_CHANGED") {
    startFastLoop().then(poll);
  }
});
