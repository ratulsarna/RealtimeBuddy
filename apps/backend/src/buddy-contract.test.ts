import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuddyDeveloperInstructions,
  buildBuddyPrimingPrompt,
  parseBuddyResponse,
} from "./buddy-contract";

test("buildBuddyDeveloperInstructions keeps stable Buddy rules and omits meeting seed data", () => {
  const instructions = buildBuddyDeveloperInstructions();

  assert.match(instructions, /RESPONSE_MODE: buddy_event/);
  assert.match(instructions, /RESPONSE_MODE: user_question/);
  assert.match(instructions, /Buddy JSON schema/);
  assert.doesNotMatch(instructions, /Static user seed:/);
  assert.doesNotMatch(instructions, /Dynamic meeting seed:/);
  assert.doesNotMatch(instructions, /Meeting startup context:/);
});

test("buildBuddyPrimingPrompt includes seed layers and startup context", () => {
  const prompt = buildBuddyPrimingPrompt({
    includeTabAudio: true,
    languagePreference: "english",
    meetingSeed: "Goal: land on a next-step owner.",
    meetingTitle: "Design sync",
    staticUserSeed: "Ratul prefers short direct prompts.",
    workingDirectory: "/tmp/vault",
  });

  assert.match(prompt, /Meeting startup context:/);
  assert.match(prompt, /Meeting title: Design sync/);
  assert.match(prompt, /Audio sources: microphone \+ tab audio/);
  assert.match(prompt, /Preferred transcription language: english/);
  assert.match(prompt, /Working directory: \/tmp\/vault/);
  assert.match(prompt, /Static user seed:/);
  assert.match(prompt, /Ratul prefers short direct prompts\./);
  assert.match(prompt, /Dynamic meeting seed:/);
  assert.match(prompt, /Goal: land on a next-step owner\./);
  assert.match(prompt, /Return the required Buddy no-op JSON object only\./);
});

test("parseBuddyResponse accepts a valid surfaced Buddy card", () => {
  const result = parseBuddyResponse(
    JSON.stringify({
      shouldSurface: true,
      type: "ask_this",
      title: "Clarify rollout timing",
      body: "Ask whether the pilot starts this week or next.",
      suggestedQuestion: "What rollout date should we align on today?",
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.response, {
    shouldSurface: true,
    type: "ask_this",
    title: "Clarify rollout timing",
    body: "Ask whether the pilot starts this week or next.",
    suggestedQuestion: "What rollout date should we align on today?",
  });
});

test("parseBuddyResponse normalizes valid no-op Buddy output", () => {
  const result = parseBuddyResponse(
    JSON.stringify({
      shouldSurface: false,
      type: "important_signal",
      title: "ignore me",
      body: "ignore me",
      suggestedQuestion: "ignore me",
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.response, {
    shouldSurface: false,
    type: "noop",
    title: "",
    body: "",
    suggestedQuestion: null,
  });
});

test("parseBuddyResponse falls back to no-op on malformed Buddy output", () => {
  const result = parseBuddyResponse("Buddy says: maybe ask about timeline next.");

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.deepEqual(result.response, {
    shouldSurface: false,
    type: "noop",
    title: "",
    body: "",
    suggestedQuestion: null,
  });
  assert.equal(result.failure.stage, "json_parse");
});
