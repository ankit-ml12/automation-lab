import { test } from "node:test";
import assert from "node:assert/strict";
import { extractOtp, htmlToText } from "../src/otp.js";

test("plain code with keyword in body", () => {
  const r = extractOtp({ subject: "Your verification code", body: "Your verification code is 482913. It expires in 10 minutes." });
  assert.equal(r?.code, "482913");
});

test("code in subject only", () => {
  const r = extractOtp({ subject: "739201 is your Microsoft account security code", body: "Hello, we received a sign-in request." });
  assert.equal(r?.code, "739201");
});

test("code split with a space", () => {
  const r = extractOtp({ subject: "Login code", body: "Enter this one-time code: 123 456" });
  assert.equal(r?.code, "123456");
});

test("code split with a hyphen", () => {
  const r = extractOtp({ subject: "Confirm your sign-in", body: "Use code 987-654 to continue." });
  assert.equal(r?.code, "987654");
});

test("html body is stripped", () => {
  const html = `<html><body><p>Hi there,</p><p>Your OTP is <b style="font-size:20px">556677</b></p><p>Order #20231099</p></body></html>`;
  const r = extractOtp({ subject: "Security alert", body: html, bodyIsHtml: true });
  assert.equal(r?.code, "556677");
});

test("ignores years and order numbers without keyword proximity", () => {
  const r = extractOtp({ subject: "Your receipt", body: "Thanks for your order 20240931 placed in 2024. Total 1299." });
  assert.equal(r, null);
});

test("ignores phone numbers near keyword", () => {
  const r = extractOtp({ subject: "Account help", body: "Call support about your code at +1 415 5550 1234." });
  // phone fragments start right after "+1 " so should be filtered; nothing else qualifies
  assert.equal(r, null);
});

test("alphanumeric code near keyword", () => {
  const r = extractOtp({ subject: "Your access code", body: "Access code: A7K9Q2" });
  assert.equal(r?.code, "A7K9Q2");
});

test("prefers closest code to keyword", () => {
  const r = extractOtp({ subject: "Sign in", body: "Reference 88888888. Your sign-in code is 246810. Ticket 1357." });
  assert.equal(r?.code, "246810");
});

test("four digit pin", () => {
  const r = extractOtp({ subject: "Your PIN", body: "PIN: 4821" });
  assert.equal(r?.code, "4821");
});

test("htmlToText decodes entities and line breaks", () => {
  assert.equal(htmlToText("a&amp;b<br>c&nbsp;d"), "a&b\nc d");
});
