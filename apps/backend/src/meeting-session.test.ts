import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

import { MeetingSession } from "./meeting-session";
import {
  DEFAULT_REALTIMEBUDDY_HOME,
  resolveConfiguredPath,
} from "./persistent-config";

test("resolveConfiguredPath expands a home-relative path", () => {
  assert.equal(
    resolveConfiguredPath("~/DemoVault", "/tmp/fallback"),
    path.join(homedir(), "DemoVault")
  );
});

test("MeetingSession writes notes under REALTIMEBUDDY_BASE_PATH Notes/", () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-demo-base";

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Demo Session",
      includeTabAudio: false,
      languagePreference: "auto",
      sendEvent: () => undefined,
    });

    const snapshot = session.getSnapshot();

    assert.match(snapshot.notePath, /^\/tmp\/realtimebuddy-demo-base\/Notes\//);
    assert.match(snapshot.notePathRelative, /^Notes\//);
    assert.equal(snapshot.notePath, path.join("/tmp/realtimebuddy-demo-base", snapshot.notePathRelative));
    assert.equal(snapshot.markdown, "# Demo Session\n\n## Buddy Q&A\nNo Buddy Q&A yet.\n");
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession defaults notes to ~/.realtimebuddy when no base path env is set", () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  delete process.env.REALTIMEBUDDY_BASE_PATH;

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Default Vault Session",
      includeTabAudio: false,
      languagePreference: "auto",
      sendEvent: () => undefined,
    });

    const snapshot = session.getSnapshot();

    assert.match(
      snapshot.notePath,
      new RegExp(`^${escapeRegExp(path.join(DEFAULT_REALTIMEBUDDY_HOME, "Notes"))}`)
    );
    assert.match(snapshot.notePathRelative, /^Notes\//);
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
