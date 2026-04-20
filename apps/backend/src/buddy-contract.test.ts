import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuddyDeveloperInstructions,
  buildBuddyPrimingPrompt,
  buildBuddyTurnPrompt,
  parseBuddyResponse,
} from "./buddy-contract";

test("buildBuddyDeveloperInstructions keeps stable Buddy rules and omits meeting seed data", () => {
  const instructions = buildBuddyDeveloperInstructions();

  assert.match(instructions, /Buddy JSON schema/);
  assert.match(instructions, /rolling updates/);
  assert.match(instructions, /incomplete slice of a still-unfolding thought/);
  assert.match(instructions, /If the speaker sounds like they are still developing a point/);
  assert.match(instructions, /Suggest a question only when the point seems to have landed, shifted, paused, or exposed a clear unresolved gap/);
  assert.match(instructions, /Most Buddy turns should return the no-op JSON object\./);
  assert.match(instructions, /Return exactly one Buddy JSON object and nothing else/);
  assert.match(instructions, /Do not treat every transcript update as worthy of a visible response\./);
  assert.match(instructions, /Use `ask_this` only when a well-timed question would move the conversation forward now/);
  assert.match(instructions, /Use `important_signal` only for something User should notice right now/);
  assert.match(instructions, /Use `primed` only during the startup setup turn/);
  assert.match(instructions, /Default to the no-op object unless the newest information is materially new, timely, and useful/);
  assert.doesNotMatch(instructions, /RESPONSE_MODE:/);
  assert.doesNotMatch(instructions, /RESPONSE_MODE: user_question/);
  assert.doesNotMatch(instructions, /Static user seed:/);
  assert.doesNotMatch(instructions, /Standing context:/);
  assert.doesNotMatch(instructions, /Meeting brief:/);
  assert.doesNotMatch(instructions, /Meeting startup context:/);
});

test("buildBuddyPrimingPrompt includes seed layers and startup context", () => {
  const prompt = buildBuddyPrimingPrompt();

  assert.match(prompt, /silent setup turn/);
  assert.match(prompt, /dedicated Buddy lane/);
  assert.match(prompt, /return a visible `primed` Buddy JSON object/);
  assert.match(prompt, /short first-person ack summary/);
  assert.match(prompt, /If no meaningful startup context was provided/);
  assert.doesNotMatch(prompt, /Standing context:/);
  assert.doesNotMatch(prompt, /Meeting brief:/);
});

test("buildBuddyTurnPrompt sends only the transcript delta for the current turn", () => {
  const prompt = buildBuddyTurnPrompt({
    transcriptDelta: "Committed transcript update (1 segment):\n- [10:00:00] We still need an owner.",
  });

  assert.match(prompt, /Return the required Buddy JSON object only\./);
  assert.match(prompt, /This is a new committed transcript update in the same live meeting thread\./);
  assert.match(prompt, /The speaker may still be unfolding a point across multiple transcript updates\./);
  assert.match(prompt, /Do not use the startup-only `primed` type/);
  assert.match(prompt, /Committed transcript update \(1 segment\):/);
  assert.doesNotMatch(prompt, /Conversation context:/);
  assert.doesNotMatch(prompt, /Recent committed transcript context:/);
  assert.doesNotMatch(prompt, /Recently surfaced Buddy cards:/);
});

test("parseBuddyResponse accepts a valid priming ack", () => {
  const result = parseBuddyResponse(
    JSON.stringify({
      shouldSurface: true,
      type: "primed",
      title: "Primed for pilot close",
      body: "I'll watch for rollout ownership, pilot decision points, and places where concise prompts help you steer the room.",
      suggestedQuestion: null,
    })
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.response.type, "primed");
  assert.equal(result.response.shouldSurface, true);
  assert.match(result.response.body, /rollout ownership/);
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
