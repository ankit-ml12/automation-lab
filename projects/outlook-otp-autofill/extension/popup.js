const $ = (id) => document.getElementById(id);
const DEFAULTS = { bridgeUrl: "http://127.0.0.1:4321", bridgeToken: "", pollMs: 3000, autofill: true };

function setStatus(text, cls = "") {
  $("status").textContent = text;
  $("status").className = `status ${cls}`;
}

async function loadSettings() {
  const s = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  $("bridgeUrl").value = s.bridgeUrl;
  $("bridgeToken").value = s.bridgeToken;
  $("pollMs").value = s.pollMs;
  $("autofill").checked = s.autofill;
  if (!s.bridgeToken) $("settings").open = true;
  return s;
}

async function render() {
  const { latest, checkedAt } = await chrome.storage.session.get(["latest", "checkedAt"]);
  if (!latest) {
    $("code").textContent = "------";
    $("meta").textContent = "Waiting for first poll...";
    $("copy").disabled = true;
    return;
  }
  if (latest.error) {
    $("code").textContent = "------";
    $("meta").textContent = latest.error;
    $("meta").className = "meta err";
    $("copy").disabled = true;
    return;
  }
  $("meta").className = "meta";
  if (!latest.code) {
    $("code").textContent = "------";
    $("meta").textContent = `No recent code. Last checked ${new Date(checkedAt).toLocaleTimeString()}.`;
    $("copy").disabled = true;
    return;
  }
  $("code").textContent = latest.code;
  $("meta").textContent = `From ${latest.from || "unknown"} · ${latest.ageSeconds}s ago · expires in ${latest.expiresInSeconds}s`;
  $("copy").disabled = false;
}

$("copy").addEventListener("click", async () => {
  const code = $("code").textContent;
  if (!/^[A-Z0-9]{4,8}$/i.test(code)) return;
  await navigator.clipboard.writeText(code);
  setStatus("Copied.", "ok");
});

$("fill").addEventListener("click", () => {
  setStatus("Filling...");
  chrome.runtime.sendMessage({ type: "FILL_NOW" }, (r) => {
    if (chrome.runtime.lastError) return setStatus(chrome.runtime.lastError.message, "err");
    if (r?.filled) setStatus(`Filled (${r.mode}).`, "ok");
    else setStatus(`Not filled: ${r?.reason ?? "unknown"}.`, "err");
  });
});

$("save").addEventListener("click", async () => {
  const s = {
    bridgeUrl: $("bridgeUrl").value.trim().replace(/\/$/, "") || DEFAULTS.bridgeUrl,
    bridgeToken: $("bridgeToken").value.trim(),
    pollMs: Math.max(1000, Number($("pollMs").value) || DEFAULTS.pollMs),
    autofill: $("autofill").checked,
  };
  await chrome.storage.local.set(s);
  chrome.runtime.sendMessage({ type: "SETTINGS_CHANGED" });
  setStatus("Saved.", "ok");
  setTimeout(render, 800);
});

function renderBridge(status) {
  const el = $("bridge");
  if (!status) {
    el.textContent = "";
    return;
  }
  const parts = [];
  if (status.account) parts.push(status.account);
  if (status.lastPollAgeSeconds != null) parts.push(`inbox checked ${status.lastPollAgeSeconds}s ago`);
  else parts.push("no poll yet");
  parts.push(`${status.codesSeen} code${status.codesSeen === 1 ? "" : "s"} this session`);
  el.textContent = parts.join(" · ");
  el.className = status.lastError ? "meta err" : "meta";
  if (status.lastError) el.textContent += ` · ${status.lastError}`;
}

function refreshBridge() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (status) => {
    if (chrome.runtime.lastError) return;
    renderBridge(status);
  });
}

chrome.storage.session.onChanged.addListener(render);
setInterval(refreshBridge, 3000);

loadSettings().then(() => {
  chrome.runtime.sendMessage({ type: "POLL_NOW" }, () => void chrome.runtime.lastError);
  render();
  refreshBridge();
});
