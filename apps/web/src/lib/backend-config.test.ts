import assert from "node:assert/strict";
import test from "node:test";

import { resolveBrowserBackendConfig } from "./backend-config";

test("resolveBrowserBackendConfig points the frontend at the split backend by default", () => {
  const config = resolveBrowserBackendConfig({
    pageUrl: "http://localhost:3000",
  });

  assert.deepEqual(config, {
    displayUrl: "http://localhost:3001",
    webSocketUrl: "ws://localhost:3001/ws",
  });
});

test("resolveBrowserBackendConfig carries auth tokens into the websocket URL", () => {
  const config = resolveBrowserBackendConfig({
    backendAccessToken: "secret",
    backendBaseUrl: "https://buddy.example.com",
    pageUrl: "http://localhost:3000",
  });

  assert.deepEqual(config, {
    displayUrl: "https://buddy.example.com",
    webSocketUrl: "wss://buddy.example.com/ws?token=secret",
  });
});
