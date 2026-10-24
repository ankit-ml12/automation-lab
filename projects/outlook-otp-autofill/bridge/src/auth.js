// Microsoft identity platform sign-in using the device-code flow.
//
// Device-code is the right fit for a local service: no redirect URI, no client
// secret, and the user signs in once in a browser. Tokens are cached on disk
// (encrypted at rest is left to the OS; delete the cache file to sign out).

import { PublicClientApplication, LogLevel } from "@azure/msal-node";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { config } from "./config.js";

export const SCOPES = ["Mail.Read", "offline_access"];

function cachePlugin(path) {
  return {
    async beforeCacheAccess(ctx) {
      if (existsSync(path)) ctx.tokenCache.deserialize(readFileSync(path, "utf8"));
    },
    async afterCacheAccess(ctx) {
      if (ctx.cacheHasChanged) writeFileSync(path, ctx.tokenCache.serialize(), { mode: 0o600 });
    },
  };
}

export function createClient() {
  return new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
    cache: { cachePlugin: cachePlugin(config.tokenCachePath) },
    system: {
      loggerOptions: {
        logLevel: LogLevel.Warning,
        loggerCallback: (_level, message) => console.error(`[msal] ${message}`),
        piiLoggingEnabled: false,
      },
    },
  });
}

/**
 * Returns a valid access token. Uses the cached account silently when possible,
 * otherwise prints a device code and waits for the user to complete sign-in.
 */
export async function getAccessToken(client) {
  const accounts = await client.getTokenCache().getAllAccounts();
  if (accounts.length > 0) {
    try {
      const res = await client.acquireTokenSilent({ account: accounts[0], scopes: SCOPES });
      return res.accessToken;
    } catch (err) {
      console.error(`[auth] silent token refresh failed, falling back to device code: ${err.message}`);
    }
  }

  const res = await client.acquireTokenByDeviceCode({
    scopes: SCOPES,
    deviceCodeCallback: (info) => {
      console.log("\n==============================================");
      console.log(info.message);
      console.log("==============================================\n");
    },
  });
  console.log(`[auth] signed in as ${res.account?.username ?? "unknown"}`);
  return res.accessToken;
}
