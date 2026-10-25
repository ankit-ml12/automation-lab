// OTP extraction from email subject and body.
//
// Strategy:
//  1. Normalise HTML to plain text.
//  2. Look for a code that sits close to a keyword such as "code", "OTP",
//     "verification", "passcode". Keyword proximity is what separates a real
//     OTP from phone numbers, order numbers, years, and tracking IDs.
//  3. Fall back to a bare 6-digit number in the subject line, because many
//     senders put only the code there ("123456 is your login code").
//
// Returns { code, source } or null.

const KEYWORD = /(one[\s-]?time|verification|verify|security|login|sign[\s-]?in|auth(?:entication)?|confirmation|access|passcode|pass code|pin|otp|code|token)/i;

// 4 to 8 digits, optionally split by a single space or hyphen in the middle ("123 456", "123-456").
const DIGIT_CODE = /\b(\d{3,4}[ -]?\d{3,4}|\d{4,8})\b/g;

// Uppercase alphanumeric 6 to 8 chars with at least one digit, e.g. "A7K9Q2".
const ALNUM_CODE = /\b(?=[A-Z0-9]{6,8}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{6,8}\b/g;

const WINDOW = 60; // characters either side of a keyword to search

export function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function normaliseDigits(raw) {
  return raw.replace(/[ -]/g, "");
}

function looksLikeYear(code) {
  return /^(19|20)\d{2}$/.test(code);
}

// Blank out phone-number-like runs (9+ digits with separators) so fragments
// such as the trailing "1234" of "+1 415 5550 1234" are never treated as codes.
function maskPhoneNumbers(text) {
  return text.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 9 ? " ".repeat(m.length) : m;
  });
}

function looksLikePhone(text, index) {
  // "+1 415 555 0123" style context right before the match
  const before = text.slice(Math.max(0, index - 6), index);
  return /[+(]\s*\d*\s*$/.test(before);
}

function findNearKeyword(text, pattern, normalise) {
  let best = null;
  const kw = new RegExp(KEYWORD.source, "gi");
  let m;
  while ((m = kw.exec(text)) !== null) {
    const start = Math.max(0, m.index - WINDOW);
    const end = Math.min(text.length, m.index + m[0].length + WINDOW);
    const slice = text.slice(start, end);
    const re = new RegExp(pattern.source, pattern.flags);
    let c;
    while ((c = re.exec(slice)) !== null) {
      const code = normalise ? normalise(c[1] ?? c[0]) : (c[1] ?? c[0]);
      if (code.length < 4 || code.length > 8) continue;
      if (looksLikeYear(code)) continue;
      if (looksLikePhone(slice, c.index)) continue;
      const distance = Math.abs(c.index - (m.index - start));
      if (!best || distance < best.distance) best = { code, distance };
    }
  }
  return best ? best.code : null;
}

// Senders often pad codes with non-breaking spaces, zero-width characters, or
// fancy quotes. Fold them to plain ASCII so the regexes see what a human sees.
export function normaliseText(text) {
  return (text || "")
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/([A-Za-z]):(\d)/g, "$1: $2");
}

export function extractOtp({ subject = "", body = "", bodyIsHtml = false } = {}) {
  const text = bodyIsHtml ? htmlToText(body) : (body || "");
  const combined = maskPhoneNumbers(normaliseText(`${subject}\n${text}`));

  // 1. Digit code near a keyword anywhere in subject + body.
  const digit = findNearKeyword(combined, DIGIT_CODE, normaliseDigits);
  if (digit) return { code: digit, source: "keyword-digit" };

  // 2. Alphanumeric code near a keyword.
  const alnum = findNearKeyword(combined, ALNUM_CODE, null);
  if (alnum) return { code: alnum, source: "keyword-alnum" };

  // 3. Bare 6-digit number in the subject line.
  const subjOnly = subject.match(/\b\d{6}\b/);
  if (subjOnly && !looksLikeYear(subjOnly[0])) return { code: subjOnly[0], source: "subject-bare" };

  return null;
}
