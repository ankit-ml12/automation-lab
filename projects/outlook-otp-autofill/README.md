# outlook-otp-autofill

Reads one-time passcodes (OTPs) that land in your Outlook inbox and makes them
available to a browser extension, which autofills them into the login form you
are currently on. No more switching tabs to copy a six-digit code.

## How it works

```
+-----------------+       Microsoft Graph        +------------------+       localhost:4321       +--------------------+
|  Outlook inbox  |  <-------------------------  |  bridge (Node)   |  <----------------------  |  browser extension |
|  (Microsoft 365 |   polls new mail every few   |  extracts OTP    |   extension polls for     |  detects OTP field |
|   or Outlook.com)|   seconds, read-only scope  |  from subject /  |   latest code, autofills  |  and fills it in   |
+-----------------+                              |  body, serves it |                           +--------------------+
                                                 +------------------+
```

Two parts:

1. **bridge/** A small local Node service. It signs in to your Microsoft account
   with the device-code flow (read-only mail scope), polls the inbox for recent
   messages, extracts a code with a set of regex patterns, and exposes the latest
   code over a local HTTP endpoint.
2. **extension/** A Manifest V3 browser extension (Chrome, Edge, Brave). It polls
   the bridge, detects OTP input fields on the active page, and fills the code.
   A popup shows the latest code with a copy button as a fallback.

## Why a local bridge instead of calling Graph from the extension

- The token and your mail never leave your machine.
- The extension needs no Azure secrets and no mail permission of its own.
- Rotating or revoking access is one file delete.

## Security notes

- The bridge binds to `127.0.0.1` only and requires a shared secret header.
- Only the `Mail.Read` delegated scope is requested.
- Codes expire from the bridge after a short TTL (default 120 seconds).
- Nothing is written to disk except the MSAL token cache, which you can delete at any time.

## Status

In progress. See the root README for the project list.
