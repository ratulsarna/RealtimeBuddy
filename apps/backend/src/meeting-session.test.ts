import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { ServerEvent } from "@realtimebuddy/shared/protocol";

import { MeetingSession } from "./meeting-session";
import {
  DEFAULT_REALTIMEBUDDY_HOME,
  resolveConfiguredPath,
} from "./persistent-config";

function createBuddyResult() {
  return {
    ok: true as const,
    response: {
      shouldSurface: false,
      type: "noop" as const,
      title: "",
      body: "",
      suggestedQuestion: null,
    },
    rawText:
      '{"shouldSurface":false,"type":"noop","title":"","body":"","suggestedQuestion":null}',
  };
}

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

test("MeetingSession primes Buddy before emitting buddy_ready and reports the Buddy model only", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-prime-on-start";

  const timeline: string[] = [];
  const events: ServerEvent[] = [];
  let primingPrompt = "";
  let buddyDeveloperInstructions = "";
  let qaDeveloperInstructions = "";

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
        events.push(event);
      },
      createCodexAppServer: createClientFactory([
        ({ developerInstructions }) => {
          buddyDeveloperInstructions = developerInstructions;

          return {
          ready: async () => {
            timeline.push("buddy:ready");
          },
          getSelectedModel: async () => {
            timeline.push("buddy:model");
            return "buddy-model";
          },
          askBuddy: async (prompt) => {
            timeline.push("buddy:ask");
            primingPrompt = prompt;
            return createBuddyResult();
          },
          askQuestion: async () => {
            throw new Error("Buddy client should not answer questions during startup.");
          },
          close: () => undefined,
        };
        },
        ({ developerInstructions }) => {
          qaDeveloperInstructions = developerInstructions;

          return {
          ready: async () => {
            timeline.push("qa:ready");
          },
          getSelectedModel: async () => "qa-model",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question) => {
            if (question.includes("silent setup turn")) {
              timeline.push("qa:prime");
              return "READY";
            }

            throw new Error("Q&A client should not answer user questions in this test.");
          },
          close: () => undefined,
        };
        },
      ]),
    });

    ((session as unknown) as { ensureElevenLabsConnected: () => void }).ensureElevenLabsConnected =
      () => undefined;

    await session.start();
    await waitForEvent(timeline, "event:buddy_ready");

    const buddyReadyEvent = events.find((event) => event.type === "buddy_ready");
    const snapshot = session.getSnapshot();

    assert.match(buddyDeveloperInstructions, /Standing context:/);
    assert.match(buddyDeveloperInstructions, /Prefer concise prompts\./);
    assert.match(buddyDeveloperInstructions, /Meeting brief:/);
    assert.match(buddyDeveloperInstructions, /Land on a rollout owner\./);
    assert.match(qaDeveloperInstructions, /Standing context:/);
    assert.match(qaDeveloperInstructions, /Prefer concise prompts\./);
    assert.match(qaDeveloperInstructions, /Meeting brief:/);
    assert.match(qaDeveloperInstructions, /Land on a rollout owner\./);
    assert.match(primingPrompt, /silent setup turn/);
    assert.match(primingPrompt, /Return the required Buddy no-op JSON object only\./);
    assert.doesNotMatch(primingPrompt, /Standing context:/);
    assert.doesNotMatch(primingPrompt, /Meeting brief:/);
    assert.ok(
      timeline.indexOf("buddy:ask") < timeline.indexOf("event:buddy_ready"),
      `Expected priming before buddy_ready, got timeline: ${timeline.join(", ")}`
    );
    assert.equal(snapshot.model, "buddy-model");
    assert.equal(buddyReadyEvent?.type, "buddy_ready");
    if (buddyReadyEvent?.type === "buddy_ready") {
      assert.equal(buddyReadyEvent.model, "buddy-model");
    }

    await session.stop();
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession eagerly warms Q&A on start, waits for in-flight warmup, and reuses one Q&A runtime across follow-ups", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-qa-followups";

  const timeline: string[] = [];
  const events: ServerEvent[] = [];
  const startupContexts: string[] = [];
  const questionContexts: string[] = [];
  let answeredQuestionCalls = 0;
  let resolveBuddyPriming: (() => void) | null = null;
  let resolveQaPriming: (() => void) | null = null;
  const buddyPrimingReady = new Promise<void>((resolve) => {
    resolveBuddyPriming = resolve;
  });
  const qaPrimingReady = new Promise<void>((resolve) => {
    resolveQaPriming = resolve;
  });

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Async Startup",
      includeTabAudio: false,
      languagePreference: "english",
      staticUserSeed: "Prefer concise prompts.",
      meetingSeed: "Land on a rollout owner.",
      sendEvent: (event) => {
        timeline.push(`event:${event.type}`);
        events.push(event);
      },
      createCodexAppServer: createClientFactory([
        () => ({
          ready: async () => {
            timeline.push("buddy:ready");
          },
          getSelectedModel: async () => {
            timeline.push("buddy:model");
            return "buddy-model";
          },
          askBuddy: async () => {
            timeline.push("buddy:prime");
            await buddyPrimingReady;
            return createBuddyResult();
          },
          askQuestion: async () => {
            throw new Error("Buddy client should not answer questions.");
          },
          close: () => undefined,
        }),
        () => ({
          ready: async () => {
            timeline.push("qa:ready");
          },
          getSelectedModel: async () => "qa-model",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question, context) => {
            if (question.includes("silent setup turn")) {
              timeline.push("qa:prime");
              startupContexts.push(context);
              await qaPrimingReady;
              return "READY";
            }

            answeredQuestionCalls += 1;
            timeline.push(`qa:ask:${answeredQuestionCalls}`);
            questionContexts.push(context);
            return `answer-${answeredQuestionCalls}`;
          },
          close: () => undefined,
        }),
      ]),
    });

    ((session as unknown) as { ensureElevenLabsConnected: () => void }).ensureElevenLabsConnected =
      () => undefined;

    await session.start();
    await waitForEvent(timeline, "qa:prime");
    const firstAskPromise = session.ask("What should I ask next?");

    assert.ok(timeline.includes("qa:prime"));
    assert.ok(!timeline.includes("qa:ask:1"));
    assert.ok(!timeline.includes("event:buddy_ready"));

    resolveQaPriming!();
    await waitForEvent(timeline, "qa:ask:1");
    await waitForEvent(timeline, "event:answer_done");

    resolveBuddyPriming!();
    await firstAskPromise;
    await waitForEvent(timeline, "event:buddy_ready");

    await session.ask("What are the follow-ups?");

    const answerDoneEvents = events.filter((event) => event.type === "answer_done");
    assert.equal(answeredQuestionCalls, 2);
    assert.equal(answerDoneEvents.length, 2);
    assert.equal(
      timeline.filter((entry) => entry === "qa:ready").length,
      1,
      `Expected one Q&A runtime startup, got timeline: ${timeline.join(", ")}`
    );
    assert.ok(
      timeline.indexOf("qa:ask:1") < timeline.indexOf("event:buddy_ready"),
      `Expected first question to finish before buddy_ready, got timeline: ${timeline.join(", ")}`
    );
    assert.equal(
      timeline.filter((entry) => entry === "qa:prime").length,
      1,
      `Expected one Q&A priming turn, got timeline: ${timeline.join(", ")}`
    );
    assert.match(startupContexts[0] ?? "", /No live meeting snapshot is provided for this setup turn\./);
    assert.doesNotMatch(startupContexts[0] ?? "", /Standing context:/);
    assert.doesNotMatch(startupContexts[0] ?? "", /Meeting brief:/);
    assert.match(questionContexts[0] ?? "", /Meeting title: Async Startup/);
    assert.match(questionContexts[0] ?? "", /Current live note:/);
    assert.doesNotMatch(questionContexts[0] ?? "", /Land on a rollout owner\./);
    assert.equal(session.getSnapshot().model, "buddy-model");

    await session.stop();
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession Buddy startup failure does not block Q&A and emits Buddy-only messaging", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-buddy-failure";

  const events: ServerEvent[] = [];

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Failure Isolation",
      includeTabAudio: false,
      languagePreference: "english",
      sendEvent: (event) => {
        events.push(event);
      },
      createCodexAppServer: createClientFactory([
        () => ({
          ready: async () => {
            throw new Error("buddy startup failed");
          },
          getSelectedModel: async () => "buddy-model",
          askBuddy: async () => createBuddyResult(),
          askQuestion: async () => {
            throw new Error("Buddy client should not answer questions.");
          },
          close: () => undefined,
        }),
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "qa-model",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question) => {
            if (question.includes("silent setup turn")) {
              return "READY";
            }

            return "Q&A still works";
          },
          close: () => undefined,
        }),
      ]),
    });

    ((session as unknown) as { ensureElevenLabsConnected: () => void }).ensureElevenLabsConnected =
      () => undefined;

    await session.start();
    const statusEvent = await waitForStatusEvent(events, /Buddy unavailable:/);
    await session.ask("Can you still answer questions?");

    assert.match(statusEvent.message, /may still be available/);
    assert.doesNotMatch(statusEvent.message, /Q&A unavailable/);
    assert.doesNotMatch(statusEvent.message, /question answering will continue/);
    assert.ok(events.some((event) => event.type === "answer_done"));

    const logText = await readFile(session.getSnapshot().logPath, "utf8");
    assert.match(logText, /"type":"codex_unavailable"/);
    assert.match(logText, /Buddy unavailable:/);
    assert.doesNotMatch(logText, /Buddy Q&A unavailable/);

    await session.stop();
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession keeps Buddy transcript work paused while a question is in flight", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-ask-gating";

  const timeline: string[] = [];
  let resolveQuestion: ((value: string) => void) | null = null;
  const questionDone = new Promise<string>((resolve) => {
    resolveQuestion = resolve;
  });

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Concurrency Gate",
      includeTabAudio: false,
      languagePreference: "english",
      sendEvent: (event) => {
        timeline.push(`event:${event.type}`);
      },
      createCodexAppServer: createClientFactory([
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "buddy-model",
          askBuddy: async (prompt) => {
            if (prompt.includes("silent setup turn")) {
              timeline.push("buddy:prime");
            } else {
              timeline.push("buddy:turn");
            }

            return createBuddyResult();
          },
          askQuestion: async () => {
            throw new Error("Buddy client should not answer questions.");
          },
          close: () => undefined,
        }),
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "qa-model",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question) => {
            if (question.includes("silent setup turn")) {
              return "READY";
            }

            timeline.push("qa:start");
            const answer = await questionDone;
            timeline.push("qa:end");
            return answer;
          },
          close: () => undefined,
        }),
      ]),
    });

    ((session as unknown) as { ensureElevenLabsConnected: () => void }).ensureElevenLabsConnected =
      () => undefined;

    await session.start();
    await waitForEvent(timeline, "event:buddy_ready");

    const askPromise = session.ask("What is the next step?");
    await waitForEvent(timeline, "qa:start");

    ((session as unknown) as {
      enqueueBuddyTranscriptSegment: (segment: { text: string; committedAt: string }) => void;
      maybeScheduleBuddyTurnLoop: (delayMs?: number) => void;
    }).enqueueBuddyTranscriptSegment({
      text: "We should assign the rollout owner.",
      committedAt: "10:15:00",
    });
    ((session as unknown) as { maybeScheduleBuddyTurnLoop: (delayMs?: number) => void }).maybeScheduleBuddyTurnLoop(0);

    await sleep(50);
    assert.ok(!timeline.includes("buddy:turn"));

    resolveQuestion!("Queued answer");
    await askPromise;

    await ((session as unknown) as { runBuddyTranscriptLoop: () => Promise<void> }).runBuddyTranscriptLoop();
    await waitForEvent(timeline, "buddy:turn");

    assert.ok(
      timeline.indexOf("event:answer_done") < timeline.indexOf("buddy:turn"),
      `Expected Buddy turn to stay paused until the question finished, got timeline: ${timeline.join(", ")}`
    );

    await session.stop();
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession stop closes dedicated Buddy and Q&A runtimes cleanly", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-stop-close";

  const closedClients: string[] = [];

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Close semantics",
      includeTabAudio: false,
      languagePreference: "english",
      sendEvent: () => undefined,
      createCodexAppServer: createClientFactory([
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "buddy-model",
          askBuddy: async () => createBuddyResult(),
          askQuestion: async () => {
            throw new Error("Buddy client should not answer questions.");
          },
          close: () => {
            closedClients.push("buddy");
          },
        }),
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "qa-model",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question) => {
            if (question.includes("silent setup turn")) {
              return "READY";
            }

            return "Answer";
          },
          close: () => {
            closedClients.push("qa");
          },
        }),
      ]),
    });

    ((session as unknown) as { ensureElevenLabsConnected: () => void }).ensureElevenLabsConnected =
      () => undefined;

    await session.start();
    await waitForCondition(() => session.getSnapshot().model === "buddy-model");
    await session.ask("What changed?");
    await session.stop();

    assert.deepEqual(closedClients.sort(), ["buddy", "qa"]);
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

test("MeetingSession retries Q&A warmup on ask after a background warmup failure", async () => {
  const previousBasePath = process.env.REALTIMEBUDDY_BASE_PATH;
  process.env.REALTIMEBUDDY_BASE_PATH = "/tmp/realtimebuddy-qa-retry";

  const timeline: string[] = [];

  try {
    const session = new MeetingSession({
      sampleRate: 48_000,
      title: "Retry Q&A Warmup",
      includeTabAudio: false,
      languagePreference: "english",
      meetingSeed: "Keep the rollout moving.",
      sendEvent: (event) => {
        timeline.push(`event:${event.type}`);
      },
      createCodexAppServer: createClientFactory([
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "buddy-model",
          askBuddy: async () => createBuddyResult(),
          askQuestion: async () => {
            throw new Error("Buddy client should not answer questions.");
          },
          close: () => undefined,
        }),
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "qa-model-fail",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question) => {
            if (question.includes("silent setup turn")) {
              timeline.push("qa:prime:1");
              throw new Error("Transient Q&A setup failure");
            }

            throw new Error("First Q&A runtime should not answer user questions.");
          },
          close: () => {
            timeline.push("qa:close:1");
          },
        }),
        () => ({
          ready: async () => undefined,
          getSelectedModel: async () => "qa-model-retry",
          askBuddy: async () => {
            throw new Error("Q&A client should not handle Buddy turns.");
          },
          askQuestion: async (question) => {
            if (question.includes("silent setup turn")) {
              timeline.push("qa:prime:2");
              return "READY";
            }

            timeline.push("qa:ask:retry");
            return "Recovered answer";
          },
          close: () => undefined,
        }),
      ]),
    });

    ((session as unknown) as { ensureElevenLabsConnected: () => void }).ensureElevenLabsConnected =
      () => undefined;

    await session.start();
    await waitForEvent(timeline, "qa:prime:1");
    await session.ask("Can you still answer after warmup failed?");

    assert.ok(timeline.includes("qa:close:1"));
    assert.ok(timeline.includes("qa:prime:2"));
    assert.ok(timeline.includes("qa:ask:retry"));

    const logText = await readFile(session.getSnapshot().logPath, "utf8");
    assert.match(logText, /"lane":"qa"/);
    assert.match(logText, /Q&A warmup failed:/);

    await session.stop();
  } finally {
    if (previousBasePath === undefined) {
      delete process.env.REALTIMEBUDDY_BASE_PATH;
    } else {
      process.env.REALTIMEBUDDY_BASE_PATH = previousBasePath;
    }
  }
});

function createClientFactory(
  factories: Array<(options: { developerInstructions: string; workingDirectory: string }) => {
    ready: () => Promise<void>;
    getSelectedModel: () => Promise<string>;
    askBuddy: (prompt: string) => Promise<ReturnType<typeof createBuddyResult>>;
    askQuestion: (
      question: string,
      context: string,
      onDelta: (delta: string) => void
    ) => Promise<string>;
    close: () => void;
  }>
) {
  let index = 0;

  return (options: { developerInstructions: string; workingDirectory: string }) => {
    const factory = factories[index];
    index += 1;

    if (!factory) {
      throw new Error(`Unexpected extra Codex client creation at index ${index}.`);
    }

    return factory(options);
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function waitForEvent(timeline: string[], value: string, timeoutMs = 1_000) {
  await waitForCondition(() => timeline.includes(value), timeoutMs, () => {
    return `Timed out waiting for ${value}. Timeline: ${timeline.join(", ")}`;
  });
}

async function waitForStatusEvent(events: ServerEvent[], pattern: RegExp, timeoutMs = 1_000) {
  let statusEvent: Extract<ServerEvent, { type: "status" }> | undefined;

  await waitForCondition(() => {
    statusEvent = events.find((event) => event.type === "status" && pattern.test(event.message)) as
      | Extract<ServerEvent, { type: "status" }>
      | undefined;

    return Boolean(statusEvent);
  }, timeoutMs, () => `Timed out waiting for a status event matching ${pattern}.`);

  return statusEvent!;
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 1_000,
  errorMessage = () => "Timed out waiting for condition."
) {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(errorMessage());
    }

    await sleep(10);
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
