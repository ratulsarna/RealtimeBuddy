import assert from "node:assert/strict";
import test from "node:test";

import { createSessionLaneRuntimes, SharedCodexSessionRuntime } from "./session-lane-runtimes";

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

test("SharedCodexSessionRuntime lazily creates one Codex client and closes idempotently", async () => {
  let createCalls = 0;
  let readyCalls = 0;
  let modelCalls = 0;
  let buddyCalls = 0;
  let questionCalls = 0;
  let closeCalls = 0;

  const runtime = new SharedCodexSessionRuntime({
    developerInstructions: "You are RealtimeBuddy.",
    workingDirectory: "/tmp/realtimebuddy-test",
    createCodexAppServer: () => {
      createCalls += 1;
      return {
        ready: async () => {
          readyCalls += 1;
        },
        getSelectedModel: async () => {
          modelCalls += 1;
          return "gpt-5.4";
        },
        askBuddy: async () => {
          buddyCalls += 1;
          return createBuddyResult();
        },
        askQuestion: async () => {
          questionCalls += 1;
          return "Answer";
        },
        close: () => {
          closeCalls += 1;
        },
      };
    },
  });

  await runtime.ready();
  assert.equal(createCalls, 1);
  assert.equal(readyCalls, 1);

  await runtime.getSelectedModel();
  await runtime.askBuddy("Prime me.");
  await runtime.askQuestion("Question?", "Context", () => undefined);

  assert.equal(createCalls, 1);
  assert.equal(modelCalls, 1);
  assert.equal(buddyCalls, 1);
  assert.equal(questionCalls, 1);

  await Promise.all([runtime.close(), runtime.close()]);
  assert.equal(closeCalls, 1);
});

test("Lane runtimes share one adapter without owning the Buddy priming dependency", async () => {
  let createCalls = 0;
  let buddyCalls = 0;
  let questionCalls = 0;
  let closeCalls = 0;

  const { buddyRuntime, qaRuntime } = createSessionLaneRuntimes({
    developerInstructions: "You are RealtimeBuddy.",
    workingDirectory: "/tmp/realtimebuddy-lane-test",
    createCodexAppServer: () => {
      createCalls += 1;
      return {
        ready: async () => undefined,
        getSelectedModel: async () => "gpt-5.4",
        askBuddy: async () => {
          buddyCalls += 1;
          return createBuddyResult();
        },
        askQuestion: async () => {
          questionCalls += 1;
          return "Answer";
        },
        close: () => {
          closeCalls += 1;
        },
      };
    },
  });

  await buddyRuntime.ready();
  await buddyRuntime.prime("Prime me.");
  await qaRuntime.runQuestion("What changed?", "Context", () => undefined);

  assert.equal(createCalls, 1);
  assert.equal(buddyCalls, 1);
  assert.equal(questionCalls, 1);

  await Promise.all([buddyRuntime.close(), qaRuntime.close()]);
  assert.equal(closeCalls, 1);
});
