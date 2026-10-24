// Content script: finds one-time-code inputs on the page and fills them.
//
// Handles the three common layouts:
//   1. A single input, usually autocomplete="one-time-code" or named otp/code.
//   2. A row of single-character inputs (one box per digit).
//   3. A generic numeric input that is the only focused/visible short field.
//
// Values are set through the native setter so React, Vue, and Angular pick
// up the change, then input/change events are dispatched.

(() => {
  if (window.__outlookOtpAutofillLoaded) return;
  window.__outlookOtpAutofillLoaded = true;

  const HINT = /(otp|one[-_ ]?time|passcode|pass[-_ ]?code|verification|verify|security[-_ ]?code|auth[-_ ]?code|mfa|2fa|totp|token|pin\b|\bcode\b)/i;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function candidateInputs(root = document) {
    const inputs = [...root.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="email"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])')];
    // Include inputs inside open shadow roots one level deep.
    root.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) inputs.push(...candidateInputs(el.shadowRoot));
    });
    return inputs.filter((i) => isVisible(i) && !i.disabled && !i.readOnly);
  }

  function describe(input) {
    const label = input.labels?.[0]?.textContent ?? "";
    const aria = input.getAttribute("aria-label") ?? "";
    const labelledBy = (input.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    return [input.autocomplete, input.name, input.id, input.placeholder, input.className, label, aria, labelledBy, input.getAttribute("data-testid")]
      .filter(Boolean)
      .join(" ");
  }

  function score(input) {
    let s = 0;
    if (input.autocomplete === "one-time-code") s += 100;
    if (HINT.test(describe(input))) s += 40;
    if (input.inputMode === "numeric" || input.type === "tel" || input.type === "number") s += 15;
    const max = Number(input.maxLength);
    if (max >= 4 && max <= 8) s += 15;
    if (max === 1) s += 10;
    if (input.pattern && /\d/.test(input.pattern)) s += 10;
    if (document.activeElement === input) s += 10;
    if (input.type === "text" || input.type === "tel" || input.type === "number") s += 2;
    return s;
  }

  function setNativeValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter ? setter.call(input, value) : (input.value = value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSplitBoxes(boxes, code) {
    const chars = [...code];
    if (boxes.length < chars.length) return false;
    boxes.slice(0, chars.length).forEach((box, i) => {
      box.focus();
      setNativeValue(box, chars[i]);
      box.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: chars[i] }));
    });
    boxes[chars.length - 1]?.blur();
    return true;
  }

  function fill(code, force = false) {
    const inputs = candidateInputs();
    if (inputs.length === 0) return { filled: false, reason: "no inputs" };

    // Case 2: a group of single-char boxes.
    const singles = inputs.filter((i) => Number(i.maxLength) === 1);
    if (singles.length >= 4 && singles.length <= 8) {
      const groups = new Map();
      singles.forEach((i) => {
        const key = i.parentElement?.parentElement ?? i.parentElement ?? document.body;
        groups.set(key, [...(groups.get(key) ?? []), i]);
      });
      const best = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      if (best && best.length >= code.length && fillSplitBoxes(best, code)) return { filled: true, mode: "split" };
    }

    // Case 1 and 3: single best-scoring input.
    const ranked = inputs.map((i) => ({ i, s: score(i) })).sort((a, b) => b.s - a.s);
    const top = ranked[0];
    const threshold = force ? 1 : 40;
    if (!top || top.s < threshold) return { filled: false, reason: "no confident otp field", topScore: top?.s ?? 0 };
    if (top.i.value && top.i.value === code) return { filled: true, mode: "already" };
    top.i.focus();
    setNativeValue(top.i, code);
    return { filled: true, mode: "single", score: top.s };
  }

  function toast(text) {
    const el = document.createElement("div");
    el.textContent = text;
    Object.assign(el.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: 2147483647,
      background: "#1b5e20", color: "#fff", padding: "10px 14px", borderRadius: "8px",
      font: "13px system-ui, sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,.25)",
    });
    document.documentElement.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  let pending = null;
  let observer = null;

  function tryPending() {
    if (!pending) return;
    const r = fill(pending.code, pending.force);
    if (r.filled) {
      toast(`OTP ${pending.code} filled`);
      pending.resolve(r);
      pending = null;
      observer?.disconnect();
      observer = null;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "OTP_AVAILABLE") return;
    const r = fill(msg.code, msg.force);
    if (r.filled) {
      toast(`OTP ${msg.code} filled`);
      sendResponse(r);
      return;
    }
    // Field not on the page yet. Watch the DOM for up to 20 s and fill when it appears.
    if (pending) pending.resolve({ filled: false, reason: "superseded" });
    pending = { code: msg.code, force: msg.force, resolve: sendResponse };
    observer?.disconnect();
    observer = new MutationObserver(tryPending);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    setTimeout(() => {
      if (pending && pending.code === msg.code) {
        pending.resolve({ filled: false, reason: "timeout" });
        pending = null;
        observer?.disconnect();
        observer = null;
      }
    }, 20_000);
    return true;
  });
})();
