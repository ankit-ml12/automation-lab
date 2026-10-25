import { createServer } from "node:http";
import { config } from "./config.js";
import { createClient, getAccessToken } from "./auth.js";
import { fetchMessagesSince } from "./graph.js";
import { extractOtp } from "./otp.js";
import { createCodeStore } from "./store.js";
import { senderAllowed } from "./filters.js";

const store = createCodeStore({ ttlSeconds: config.codeTtlSeconds });
const seen = new Set();
let lastPollIso = new Date(Date.now() - 60_000).toISOString();

// Runtime diagnostics exposed on /status so the extension popup can explain
// what is going on without the user reading terminal output.
export const state = {
  startedAt: Date.now(),
  account: null,
  polls: 0,
  lastPollAt: null,
  lastPollDurationMs: null,
  lastError: null,
  lastErrorAt: null,
  codesSeen: 0,
};

async function pollOnce(client) {
  const started = Date.now();
  const token = await getAccessToken(client);
  const messages = await fetchMessagesSince(token, lastPollIso);
  state.polls += 1;
  state.lastPollAt = Date.now();
  state.lastPollDurationMs = state.lastPollAt - started;
  state.lastError = null;
  // Move the watermark back a little so clock skew never drops a message.
  lastPollIso = new Date(Date.now() - 30_000).toISOString();

  // Oldest first so the newest code wins.
  for (const msg of messages.sort((a, b) => a.receivedAt - b.receivedAt)) {
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    if (!senderAllowed(msg.from, config.senderAllowlist)) continue;
    const found = extractOtp({ subject: msg.subject, body: msg.body, bodyIsHtml: msg.bodyIsHtml });
    if (!found) continue;
    store.set({ code: found.code, subject: msg.subject, from: msg.from, receivedAt: msg.receivedAt, messageId: msg.id });
    state.codesSeen += 1;
    console.log(`[otp] ${new Date(msg.receivedAt).toISOString()} from=${msg.from} code=${found.code} via=${found.source}`);
  }
  if (seen.size > 500) {
    for (const id of [...seen].slice(0, seen.size - 200)) seen.delete(id);
  }
}

function startPolling(client) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await pollOnce(client);
    } catch (err) {
      state.lastError = err.message;
      state.lastErrorAt = Date.now();
      console.error(`[poll] ${err.message}`);
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, config.pollIntervalMs);
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "X-Bridge-Token, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function authorised(req) {
  return req.headers["x-bridge-token"] === config.bridgeToken;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export function createBridgeServer(codeStore, runtime = state) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "OPTIONS") return json(res, 204, {});
    if (url.pathname === "/health") return json(res, 200, { ok: true });

    if (!authorised(req)) return json(res, 401, { error: "unauthorised" });

    if (req.method === "GET" && url.pathname === "/latest") {
      const entry = codeStore.get();
      if (!entry) return json(res, 200, { code: null });
      return json(res, 200, {
        code: entry.code,
        from: entry.from,
        subject: entry.subject,
        ageSeconds: entry.ageSeconds,
        expiresInSeconds: entry.expiresInSeconds,
      });
    }

    if (req.method === "GET" && url.pathname === "/status") {
      return json(res, 200, {
        ok: !runtime.lastError,
        uptimeSeconds: Math.floor((Date.now() - runtime.startedAt) / 1000),
        account: runtime.account,
        polls: runtime.polls,
        lastPollAgeSeconds: runtime.lastPollAt ? Math.floor((Date.now() - runtime.lastPollAt) / 1000) : null,
        lastPollDurationMs: runtime.lastPollDurationMs,
        lastError: runtime.lastError,
        codesSeen: runtime.codesSeen,
        pollIntervalMs: config.pollIntervalMs,
        codeTtlSeconds: config.codeTtlSeconds,
        hasCode: Boolean(codeStore.get()),
      });
    }

    if (req.method === "POST" && url.pathname === "/consume") {
      const { code } = await readBody(req);
      return json(res, 200, { consumed: codeStore.consume(code) });
    }

    return json(res, 404, { error: "not found" });
  });
}

async function main() {
  const client = createClient();
  // Sign in up front so the device-code prompt appears before we start serving.
  await getAccessToken(client);
  const accounts = await client.getTokenCache().getAllAccounts();
  state.account = accounts[0]?.username ?? null;

  const server = createBridgeServer(store);
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`[bridge] listening on http://127.0.0.1:${config.port}`);
    console.log(`[bridge] polling inbox every ${config.pollIntervalMs} ms, code TTL ${config.codeTtlSeconds} s`);
  });

  const timer = startPolling(client);
  const shutdown = () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Only run when executed directly, so tests can import createBridgeServer.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
