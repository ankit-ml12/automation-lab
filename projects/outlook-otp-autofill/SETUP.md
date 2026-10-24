# Setup

Takes about 10 minutes. You need Node 20 or newer and a Microsoft account
(Microsoft 365 work/school or personal Outlook.com).

## 1. Register an app in Microsoft Entra (one time)

1. Go to https://entra.microsoft.com and open **App registrations**, then **New registration**.
2. Name: `outlook-otp-bridge`.
3. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
   If your work tenant blocks this, choose single tenant and set `AZURE_TENANT_ID` to your tenant ID.
4. Leave Redirect URI empty. Click **Register**.
5. Open **Authentication**, scroll to **Advanced settings**, set **Allow public client flows** to **Yes**, save.
6. Open **API permissions**, **Add a permission**, **Microsoft Graph**, **Delegated**, tick `Mail.Read`, add.
   Admin consent is not usually needed for `Mail.Read` on your own mailbox. If your tenant requires it, ask your admin.
7. Copy the **Application (client) ID** from the Overview page.

## 2. Run the bridge

```bash
cd projects/outlook-otp-autofill/bridge
npm install
cp .env.example .env
```

Fill in the config file:

- `AZURE_CLIENT_ID`: the client ID from step 1.
- `BRIDGE_TOKEN`: any long random string. Generate one with
  `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
- Optional: `SENDER_ALLOWLIST=microsoft,github,google` to ignore mail from other senders.

Start it:

```bash
npm start
```

The first run prints a device code and a URL. Open the URL, enter the code, sign in.
After that the token is cached and future starts are silent. Delete `.msal-cache.json`
to sign out.

Check it is up:

```bash
curl http://127.0.0.1:4321/health
```

## 3. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select `projects/outlook-otp-autofill/extension`.
4. Click the extension icon, open **Settings**, paste the same `BRIDGE_TOKEN` value, save.

## 4. Try it

Trigger any login that emails you a code. Within a few seconds the toolbar badge
shows `OTP`, and if the login page has a recognisable code field it is filled and a
small toast confirms it. If the page is not recognised, click the icon and use
**Fill on this page** or **Copy**.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Badge shows `!` | Bridge not running or wrong token | Check `npm start` output, re-paste the token |
| Bridge logs `Graph request failed: 401` | Token expired and silent refresh failed | Restart the bridge, sign in again |
| Bridge logs `403` | `Mail.Read` not granted | Re-check API permissions in Entra |
| Code found but not filled | Page uses an unusual input | Use **Fill on this page**, then open an issue with the site |
| Wrong number picked as the code | Regex edge case | Open an issue with the (redacted) email text |

## Running tests

```bash
cd projects/outlook-otp-autofill/bridge
npm test
```
