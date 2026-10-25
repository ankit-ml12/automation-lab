// Sender allowlist matching. Entries are case-insensitive substrings, so
// "microsoft" matches "account-security-noreply@accountprotection.microsoft.com".
// An entry starting with "@" matches the domain suffix exactly, so "@github.com"
// does not match "@github.com.evil.example".

export function senderAllowed(from, allowlist = []) {
  if (!allowlist || allowlist.length === 0) return true;
  const f = (from || "").toLowerCase();
  const at = f.lastIndexOf("@");
  const domain = at >= 0 ? f.slice(at + 1) : "";
  return allowlist.some((raw) => {
    const entry = raw.toLowerCase().trim();
    if (!entry) return false;
    if (entry.startsWith("@")) {
      const want = entry.slice(1);
      return domain === want || domain.endsWith(`.${want}`);
    }
    return f.includes(entry);
  });
}
