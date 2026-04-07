import assert from "node:assert/strict";
import test from "node:test";

import {
  isAuthorizedRequestUrl,
  resolveBackendHttpBaseUrl,
  resolveBackendWebSocketUrl,
} from "./backend-connection";

test("resolveBackendHttpBaseUrl defaults to the browser host on port 3001", () => {
  const url = resolveBackendHttpBaseUrl({
    pageUrl: "http://localhost:3000/dashboard",
  });

  assert.equal(url.toString(), "http://localhost:3001/");
});

test("resolveBackendWebSocketUrl converts an explicit https backend to wss", () => {
  const url = resolveBackendWebSocketUrl({
    explicitBackendBaseUrl: "https://buddy.example.com/api",
    pageUrl: "http://localhost:3000",
    authToken: "secret",
  });

  assert.equal(url, "wss://buddy.example.com/ws?token=secret");
});

test("isAuthorizedRequestUrl rejects missing or wrong tokens when auth is enabled", () => {
  assert.equal(isAuthorizedRequestUrl("/ws", "secret"), false);
  assert.equal(isAuthorizedRequestUrl("/ws?token=wrong", "secret"), false);
  assert.equal(isAuthorizedRequestUrl("/ws?token=secret", "secret"), true);
});

test("isAuthorizedRequestUrl fails closed when no expected token is configured", () => {
  assert.equal(isAuthorizedRequestUrl("/ws", undefined), false);
  assert.equal(isAuthorizedRequestUrl("/ws?token=anything", undefined), false);
});
