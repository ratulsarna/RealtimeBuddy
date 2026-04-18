import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MeetingSession, resolveConfiguredPath } from "./meeting-session";

test("resolveConfiguredPath expands a home-relative path", () => {
  assert.equal(resolveConfiguredPath("~/DemoVault", "/tmp/fallback"), path.join(homedir(), "DemoVault"));
});

test("MeetingSession writes notes under CODEX_VAULT_PATH Notes/", () => {
  const previousVaultPath = process.env.CODEX_VAULT_PATH;
  process.env.CODEX_VAULT_PATH = "/tmp/realtimebuddy-demo-vault";

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Demo Session",
      includeTabAudio: false,
      languagePreference: "auto",
      sendEvent: () => undefined,
    });

    const snapshot = session.getSnapshot();

    assert.match(snapshot.notePath, /^\/tmp\/realtimebuddy-demo-vault\/Notes\//);
    assert.match(snapshot.notePathRelative, /^Notes\//);
    assert.equal(snapshot.notePath, path.join("/tmp/realtimebuddy-demo-vault", snapshot.notePathRelative));
    assert.equal(snapshot.markdown, "# Demo Session\n\n## Buddy Q&A\nNo Buddy Q&A yet.\n");
  } finally {
    if (previousVaultPath === undefined) {
      delete process.env.CODEX_VAULT_PATH;
    } else {
      process.env.CODEX_VAULT_PATH = previousVaultPath;
    }
  }
});
