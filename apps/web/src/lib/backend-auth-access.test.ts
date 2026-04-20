import assert from "node:assert/strict";
import test from "node:test";

import { isBackendAuthHostAllowed } from "./backend-auth-access";

test("isBackendAuthHostAllowed allows localhost-style hosts", () => {
  assert.equal(isBackendAuthHostAllowed("localhost:3000"), true);
  assert.equal(isBackendAuthHostAllowed("app.localhost"), true);
  assert.equal(isBackendAuthHostAllowed("127.0.0.1:3000"), true);
  assert.equal(isBackendAuthHostAllowed("[::1]:3000"), true);
  assert.equal(isBackendAuthHostAllowed("0.0.0.0:3000"), true);
});

test("isBackendAuthHostAllowed allows Tailscale hosts", () => {
  assert.equal(isBackendAuthHostAllowed("100.64.0.1:3000"), true);
  assert.equal(isBackendAuthHostAllowed("100.127.255.254"), true);
  assert.equal(isBackendAuthHostAllowed("[fd7a:115c:a1e0::1]:3000"), true);
  assert.equal(isBackendAuthHostAllowed("realtimebuddy.example-tailnet.ts.net"), true);
});

test("isBackendAuthHostAllowed rejects non-local and non-Tailscale hosts", () => {
  assert.equal(isBackendAuthHostAllowed(undefined), false);
  assert.equal(isBackendAuthHostAllowed(""), false);
  assert.equal(isBackendAuthHostAllowed("192.168.1.10:3000"), false);
  assert.equal(isBackendAuthHostAllowed("100.128.0.1"), false);
  assert.equal(isBackendAuthHostAllowed("example.com"), false);
});
