import { test } from "node:test";
import assert from "node:assert/strict";
import { senderAllowed } from "../src/filters.js";

test("empty allowlist allows everyone", () => {
  assert.equal(senderAllowed("x@y.com", []), true);
  assert.equal(senderAllowed("x@y.com"), true);
});

test("substring match is case-insensitive", () => {
  assert.equal(senderAllowed("Account-Security@accountprotection.MICROSOFT.com", ["microsoft"]), true);
  assert.equal(senderAllowed("noreply@example.com", ["microsoft"]), false);
});

test("domain entries match suffix exactly", () => {
  assert.equal(senderAllowed("noreply@github.com", ["@github.com"]), true);
  assert.equal(senderAllowed("noreply@mail.github.com", ["@github.com"]), true);
  assert.equal(senderAllowed("noreply@github.com.evil.example", ["@github.com"]), false);
});

test("blank entries are ignored", () => {
  assert.equal(senderAllowed("a@b.com", ["", "  "]), false);
});
