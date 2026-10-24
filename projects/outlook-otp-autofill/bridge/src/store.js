// In-memory holder for the most recent OTP. Codes expire after a TTL and can be
// marked as consumed once the extension has filled them, so the same code is
// not offered twice.

export function createCodeStore({ ttlSeconds = 120, now = () => Date.now() } = {}) {
  let current = null;

  function isExpired(entry) {
    return now() - entry.receivedAt > ttlSeconds * 1000;
  }

  return {
    set({ code, subject, from, receivedAt, messageId }) {
      current = { code, subject, from, receivedAt, messageId, consumed: false };
    },
    get() {
      if (!current || isExpired(current) || current.consumed) return null;
      const ageSeconds = Math.floor((now() - current.receivedAt) / 1000);
      return { ...current, ageSeconds, expiresInSeconds: ttlSeconds - ageSeconds };
    },
    consume(code) {
      if (current && current.code === code) current.consumed = true;
      return current?.consumed ?? false;
    },
    clear() {
      current = null;
    },
  };
}
