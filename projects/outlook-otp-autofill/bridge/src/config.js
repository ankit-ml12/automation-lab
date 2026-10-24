import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "..", ".env");

// Minimal .env loader so we do not need a dependency for it.
// Values already present in process.env win over the file.
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(envPath);

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v;
}

function intOr(name, fallback) {
  const v = process.env[name];
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  clientId: required("AZURE_CLIENT_ID"),
  tenantId: process.env.AZURE_TENANT_ID || "common",
  bridgeToken: required("BRIDGE_TOKEN"),
  port: intOr("BRIDGE_PORT", 4321),
  pollIntervalMs: intOr("POLL_INTERVAL_MS", 5000),
  codeTtlSeconds: intOr("CODE_TTL_SECONDS", 120),
  senderAllowlist: (process.env.SENDER_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  tokenCachePath: resolve(here, "..", ".msal-cache.json"),
};
