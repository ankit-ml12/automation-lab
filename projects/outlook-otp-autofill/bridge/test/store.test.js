import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodeStore } from "../src/store.js";

test("returns latest code with age and expiry", () => {
  let t = 1_000_000;
  const store = createCodeStore({ ttlSeconds: 100, now: () => t });
  store.set({ code: "123456", subject: "s", from: "a@b.c", receivedAt: t, messageId: "m1" });
  t += 10_000;
  const got = store.get();
  assert.equal(got.code, "123456");
  assert.equal(got.ageSeconds, 10);
  assert.equal(got.expiresInSeconds, 90);
});

test("expires after ttl", () => {
  let t = 0;
  const store = createCodeStore({ ttlSeconds: 5, now: () => t });
  store.set({ code: "111111", receivedAt: t });
  t = 6_000;
  assert.equal(store.get(), null);
});

test("consume hides the code", () => {
  const store = createCodeStore({ ttlSeconds: 100, now: () => 0 });
  store.set({ code: "222222", receivedAt: 0 });
  assert.equal(store.consume("999999"), false);
  assert.equal(store.get().code, "222222");
  assert.equal(store.consume("222222"), true);
  assert.equal(store.get(), null);
});

test("newer code replaces older", () => {
  const store = createCodeStore({ ttlSeconds: 100, now: () => 0 });
  store.set({ code: "111111", receivedAt: 0 });
  store.set({ code: "333333", receivedAt: 0 });
  assert.equal(store.get().code, "333333");
});
