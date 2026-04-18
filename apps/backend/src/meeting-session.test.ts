import assert from "node:assert/strict";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ServerEvent } from "@realtimebuddy/shared/protocol";

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

test("MeetingSession primes Buddy before emitting buddy_ready", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-prime-on-start";

  const timeline: string[] = [];
  let primingPrompt = "";

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Design Sync",
      includeTabAudio: true,
      languagePreference: "english",
      staticUserSeed: "Prefer concise prompts.",
      meetingSeed: "Land on a rollout owner.",
      sendEvent: (event) => {
        timeline.push(`event:${event.type}`);
      },
      createCodexAppServer: () => ({
        ready: async () => {
          timeline.push("codex:ready");
        },
        getSelectedModel: async () => {
          timeline.push("codex:model");
          return "gpt-5.4";
        },
        askBuddy: async (prompt) => {
          timeline.push("codex:askBuddy");
          primingPrompt = prompt;
          return {
            ok: true,
            response: {
              shouldSurface: false,
              type: "noop",
              title: "",
              body: "",
              suggestedQuestion: null,
            },
            rawText:
              '{"shouldSurface":false,"type":"noop","title":"","body":"","suggestedQuestion":null}',
          };
        },
        askQuestion: async () => {
          throw new Error("askQuestion should not run during startup priming.");
        },
        close: () => undefined,
      }),
    });

    (session as any).ensureElevenLabsConnected = () => undefined;

    await session.start();
    await waitForEvent(timeline, "event:buddy_ready");

    assert.match(primingPrompt, /Meeting title: Design Sync/);
    assert.match(primingPrompt, /Static user seed:/);
    assert.match(primingPrompt, /Prefer concise prompts\./);
    assert.match(primingPrompt, /Dynamic meeting seed:/);
    assert.match(primingPrompt, /Land on a rollout owner\./);
    assert.match(primingPrompt, /Return the required Buddy no-op JSON object only\./);
    assert.ok(
      timeline.indexOf("codex:askBuddy") < timeline.indexOf("event:buddy_ready"),
      `Expected priming before buddy_ready, got timeline: ${timeline.join(", ")}`
    );
    assert.ok(!timeline.includes("event:buddy_event"));
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession ask waits for Buddy priming to finish", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-prime-ask";

  const timeline: string[] = [];
  const events: ServerEvent[] = [];
  let resolvePriming: (() => void) | null = null;
  const primingReady = new Promise<void>((resolve) => {
    resolvePriming = resolve;
  });

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Async Startup",
      includeTabAudio: false,
      languagePreference: "english",
      sendEvent: (event) => {
        timeline.push(`event:${event.type}`);
        events.push(event);
      },
      createCodexAppServer: () => ({
        ready: async () => undefined,
        getSelectedModel: async () => "gpt-5.4",
        askBuddy: async () => {
          timeline.push("codex:askBuddy");
          await primingReady;
          return {
            ok: true,
            response: {
              shouldSurface: false,
              type: "noop",
              title: "",
              body: "",
              suggestedQuestion: null,
            },
            rawText:
              '{"shouldSurface":false,"type":"noop","title":"","body":"","suggestedQuestion":null}',
          };
        },
        askQuestion: async () => {
          timeline.push("codex:askQuestion");
          return "Primed answer";
        },
        close: () => undefined,
      }),
    });

    (session as any).ensureElevenLabsConnected = () => undefined;

    await session.start();
    const askPromise = session.ask("What should I ask next?");

    await sleep(30);
    assert.ok(!timeline.includes("codex:askQuestion"));
    assert.ok(!events.some((event) => event.type === "answer_done"));

    resolvePriming!();
    await askPromise;

    assert.ok(
      timeline.indexOf("codex:askBuddy") < timeline.indexOf("codex:askQuestion"),
      `Expected priming before askQuestion, got timeline: ${timeline.join(", ")}`
    );
    assert.ok(events.some((event) => event.type === "buddy_ready"));
    assert.ok(events.some((event) => event.type === "answer_done"));
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

async function waitForEvent(timeline: string[], value: string, timeoutMs = 1_000) {
  const startedAt = Date.now();

  while (!timeline.includes(value)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for ${value}. Timeline: ${timeline.join(", ")}`);
    }

    await sleep(10);
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
