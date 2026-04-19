import assert from "node:assert/strict";
import test from "node:test";

import { createSessionLaneRuntimes } from "./session-lane-runtimes";

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

test("Buddy lane primes once and reuses one dedicated client for later Buddy turns", async () => {
  const createdClients: string[] = [];
  const prompts: string[] = [];
  let buddyReadyCalls = 0;
  let buddyModelCalls = 0;
  let buddyCalls = 0;
  let closeCalls = 0;

  const { buddyRuntime, qaRuntime } = createSessionLaneRuntimes({
    developerInstructions: "You are RealtimeBuddy.",
    workingDirectory: "/tmp/realtimebuddy-buddy-lane-test",
    createCodexAppServer: () => {
      createdClients.push(`client-${createdClients.length + 1}`);

      return {
        ready: async () => {
          buddyReadyCalls += 1;
        },
        getSelectedModel: async () => {
          buddyModelCalls += 1;
          return "buddy-model";
        },
        askBuddy: async (prompt) => {
          prompts.push(prompt);
          buddyCalls += 1;
          return createBuddyResult();
        },
        askQuestion: async () => {
          throw new Error("Buddy lane client should not answer questions.");
        },
        close: () => {
          closeCalls += 1;
        },
      };
    },
  });

  await buddyRuntime.initialize({
    includeTabAudio: true,
    languagePreference: "english",
    meetingSeed: "Land a rollout owner.",
    meetingTitle: "Design Sync",
    staticUserSeed: "Prefer concise prompts.",
    workingDirectory: "/tmp/realtimebuddy-buddy-lane-test",
  });
  await buddyRuntime.initialize({
    includeTabAudio: true,
    languagePreference: "english",
    meetingSeed: "Land a rollout owner.",
    meetingTitle: "Design Sync",
    staticUserSeed: "Prefer concise prompts.",
    workingDirectory: "/tmp/realtimebuddy-buddy-lane-test",
  });
  const model = await buddyRuntime.getSelectedModel();
  await buddyRuntime.runBuddyTurn({
    trigger: "New transcript arrived.",
    context: "Recent transcript context.",
  });
  await buddyRuntime.runBuddyTurn({
    trigger: "Another transcript arrived.",
    context: "More transcript context.",
  });

  assert.deepEqual(createdClients, ["client-1"]);
  assert.equal(buddyReadyCalls, 1);
  assert.equal(buddyModelCalls, 1);
  assert.equal(model, "buddy-model");
  assert.equal(buddyCalls, 3);
  assert.match(prompts[0] ?? "", /silent setup turn/);
  assert.match(prompts[1] ?? "", /Trigger: New transcript arrived\./);
  assert.match(prompts[2] ?? "", /Trigger: Another transcript arrived\./);

  await Promise.all([buddyRuntime.close(), buddyRuntime.close(), qaRuntime.close()]);
  assert.equal(closeCalls, 1);
});

test("Question lane lazily creates its own client and reuses it across follow-up questions", async () => {
  const createdClients: string[] = [];
  const questions: string[] = [];
  const contexts: string[] = [];
  let questionReadyCalls = 0;
  let questionCalls = 0;
  let modelCalls = 0;
  let closeCalls = 0;

  const { buddyRuntime, qaRuntime } = createSessionLaneRuntimes({
    developerInstructions: "You are RealtimeBuddy.",
    workingDirectory: "/tmp/realtimebuddy-qa-lane-test",
    createCodexAppServer: () => {
      const label = `client-${createdClients.length + 1}`;
      createdClients.push(label);

      return {
        ready: async () => {
          questionReadyCalls += 1;
        },
        getSelectedModel: async () => {
          modelCalls += 1;
          return `${label}-model`;
        },
        askBuddy: async () => {
          throw new Error("Question lane client should not handle Buddy turns.");
        },
        askQuestion: async (question, context, onDelta) => {
          questions.push(question);
          contexts.push(context);
          questionCalls += 1;
          if (question.includes("silent setup turn")) {
            return "READY";
          }

          onDelta(`delta-${questionCalls}`);
          return `answer-${questionCalls}`;
        },
        close: () => {
          closeCalls += 1;
        },
      };
    },
  });

  await qaRuntime.initialize({
    includeTabAudio: true,
    languagePreference: "english",
    meetingSeed: "Land a rollout owner.",
    meetingTitle: "Design Sync",
    staticUserSeed: "Prefer concise prompts.",
    workingDirectory: "/tmp/realtimebuddy-qa-lane-test",
  });
  const model = await qaRuntime.getSelectedModel();
  const deltas: string[] = [];
  const answerOne = await qaRuntime.runQuestion("What changed?", "Context", (delta) => {
    deltas.push(delta);
  });
  const answerTwo = await qaRuntime.runQuestion("And next?", "Context", (delta) => {
    deltas.push(delta);
  });

  assert.deepEqual(createdClients, ["client-1"]);
  assert.equal(questionReadyCalls, 1);
  assert.equal(modelCalls, 1);
  assert.equal(model, "client-1-model");
  assert.equal(questionCalls, 3);
  assert.deepEqual(deltas, ["delta-2", "delta-3"]);
  assert.equal(answerOne, "answer-2");
  assert.equal(answerTwo, "answer-3");
  assert.match(questions[0] ?? "", /silent setup turn/);
  assert.match(contexts[0] ?? "", /Meeting title: Design Sync/);
  assert.match(contexts[0] ?? "", /Preferred transcription language: english/);
  assert.match(contexts[0] ?? "", /Static user seed:/);
  assert.match(contexts[0] ?? "", /Prefer concise prompts\./);
  assert.match(contexts[0] ?? "", /Dynamic meeting seed:/);
  assert.match(contexts[0] ?? "", /Land a rollout owner\./);

  await Promise.all([qaRuntime.close(), qaRuntime.close(), buddyRuntime.close()]);
  assert.equal(closeCalls, 1);
});

test("Question lane retries setup after a failed setup turn", async () => {
  let setupAttempts = 0;
  let answerCalls = 0;

  const { buddyRuntime, qaRuntime } = createSessionLaneRuntimes({
    developerInstructions: "You are RealtimeBuddy.",
    workingDirectory: "/tmp/realtimebuddy-qa-retry-test",
    createCodexAppServer: () => {
      return {
        ready: async () => undefined,
        getSelectedModel: async () => "qa-model",
        askBuddy: async () => {
          throw new Error("Question lane client should not handle Buddy turns.");
        },
        askQuestion: async (question, _context, onDelta) => {
          if (question.includes("silent setup turn")) {
            setupAttempts += 1;
            if (setupAttempts === 1) {
              throw new Error("Transient Q&A setup failure");
            }

            return "READY";
          }

          answerCalls += 1;
          onDelta("delta");
          return "answer";
        },
        close: () => undefined,
      };
    },
  });

  await assert.rejects(
    qaRuntime.initialize({
      includeTabAudio: false,
      languagePreference: "english",
      meetingSeed: "",
      meetingTitle: "Retry Sync",
      staticUserSeed: "",
      workingDirectory: "/tmp/realtimebuddy-qa-retry-test",
    }),
    /Transient Q&A setup failure/
  );

  await qaRuntime.initialize({
    includeTabAudio: false,
    languagePreference: "english",
    meetingSeed: "",
    meetingTitle: "Retry Sync",
    staticUserSeed: "",
    workingDirectory: "/tmp/realtimebuddy-qa-retry-test",
  });
  const answer = await qaRuntime.runQuestion("What changed?", "Context", () => undefined);

  assert.equal(setupAttempts, 2);
  assert.equal(answerCalls, 1);
  assert.equal(answer, "answer");

  await Promise.all([qaRuntime.close(), buddyRuntime.close()]);
});

test("Buddy and question lanes never reuse the same underlying client", async () => {
  const createdClients: string[] = [];
  let buddyCalls = 0;
  let questionCalls = 0;
  let closeCalls = 0;

  const { buddyRuntime, qaRuntime } = createSessionLaneRuntimes({
    developerInstructions: "You are RealtimeBuddy.",
    workingDirectory: "/tmp/realtimebuddy-separate-lane-test",
    createCodexAppServer: () => {
      const label = `client-${createdClients.length + 1}`;
      createdClients.push(label);

      return {
        ready: async () => undefined,
        getSelectedModel: async () => `${label}-model`,
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

  await buddyRuntime.initialize({
    includeTabAudio: false,
    languagePreference: "auto",
    meetingSeed: "",
    meetingTitle: "Weekly Sync",
    staticUserSeed: "",
    workingDirectory: "/tmp/realtimebuddy-separate-lane-test",
  });
  await qaRuntime.initialize({
    includeTabAudio: false,
    languagePreference: "auto",
    meetingSeed: "",
    meetingTitle: "Weekly Sync",
    staticUserSeed: "",
    workingDirectory: "/tmp/realtimebuddy-separate-lane-test",
  });
  await qaRuntime.runQuestion("What changed?", "Context", () => undefined);

  assert.deepEqual(createdClients, ["client-1", "client-2"]);
  assert.equal(buddyCalls, 1);
  assert.equal(questionCalls, 2);

  await Promise.all([buddyRuntime.close(), qaRuntime.close()]);
  assert.equal(closeCalls, 2);
});
