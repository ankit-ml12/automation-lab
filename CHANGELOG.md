# Changelog

All notable changes to projects in this repo. Dates are in ISO format.

## 2026-10-25

### outlook-otp-autofill
- Bridge: normalise non-breaking spaces, zero-width characters, unicode dashes and
  quotes, and `Label:123456` with no space before extracting codes. Six new tests.
- Bridge: new authenticated `GET /status` endpoint with account, poll count, last
  poll age, last error, and codes seen this session.
- Bridge: sender allowlist entries starting with `@` now match the domain suffix
  exactly instead of as a substring. Moved to `src/filters.js` with tests.
- Extension: popup shows the signed-in account, when the inbox was last checked,
  and any bridge error, refreshing every 3 seconds.

## 2026-10-24

### outlook-otp-autofill
- Initial release. Local Node bridge using Microsoft Graph device-code sign-in,
  inbox polling, OTP extraction, TTL code store, and localhost API.
- Manifest V3 extension with background polling, OTP field autofill including
  split digit boxes, popup with copy and fill-now, and settings.
- Setup guide and CI running bridge tests.
