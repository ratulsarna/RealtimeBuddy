import assert from "node:assert/strict";
import test from "node:test";

import { createBackendAccessToken, verifyBackendAccessToken } from "./backend-auth";

test("verifyBackendAccessToken accepts a freshly minted token", () => {
  const now = Date.UTC(2026, 3, 7, 18, 0, 0);
  const token = createBackendAccessToken("secret", now, 60_000);

  assert.equal(verifyBackendAccessToken(token, "secret", now + 1_000), true);
});

test("verifyBackendAccessToken rejects expired tokens", () => {
  const now = Date.UTC(2026, 3, 7, 18, 0, 0);
  const token = createBackendAccessToken("secret", now, 60_000);

  assert.equal(verifyBackendAccessToken(token, "secret", now + 61_000), false);
});

test("verifyBackendAccessToken rejects signatures minted with another secret", () => {
  const now = Date.UTC(2026, 3, 7, 18, 0, 0);
  const token = createBackendAccessToken("secret-a", now, 60_000);

  assert.equal(verifyBackendAccessToken(token, "secret-b", now + 1_000), false);
});

test("verifyBackendAccessToken tolerates small positive clock skew", () => {
  const now = Date.UTC(2026, 3, 7, 18, 0, 0);
  const token = createBackendAccessToken("secret", now, 60_000);

  assert.equal(verifyBackendAccessToken(token, "secret", now - 5_000), true);
});

test("verifyBackendAccessToken still rejects tokens minted too far in the future", () => {
  const now = Date.UTC(2026, 3, 7, 18, 0, 0);
  const token = createBackendAccessToken("secret", now, 60_000);

  assert.equal(verifyBackendAccessToken(token, "secret", now - 31_000), false);
});
