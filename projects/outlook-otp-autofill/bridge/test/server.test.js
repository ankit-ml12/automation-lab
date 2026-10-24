import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AZURE_CLIENT_ID = "test-client";
process.env.BRIDGE_TOKEN = "secret-token";

const { createBridgeServer } = await import("../src/index.js");
const { createCodeStore } = await import("../src/store.js");

async function withServer(fn) {
  const store = createCodeStore({ ttlSeconds: 100 });
  const server = createBridgeServer(store);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, store);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("health is open", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/health`);
    assert.equal(r.status, 200);
  });
});

test("latest requires token", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/latest`);
    assert.equal(r.status, 401);
  });
});

test("latest returns code and consume hides it", async () => {
  await withServer(async (base, store) => {
    store.set({ code: "445566", subject: "Your code", from: "noreply@x.com", receivedAt: Date.now(), messageId: "m" });
    const headers = { "X-Bridge-Token": "secret-token", "Content-Type": "application/json" };
    let r = await fetch(`${base}/latest`, { headers });
    let body = await r.json();
    assert.equal(body.code, "445566");
    r = await fetch(`${base}/consume`, { method: "POST", headers, body: JSON.stringify({ code: "445566" }) });
    body = await r.json();
    assert.equal(body.consumed, true);
    r = await fetch(`${base}/latest`, { headers });
    body = await r.json();
    assert.equal(body.code, null);
  });
});
