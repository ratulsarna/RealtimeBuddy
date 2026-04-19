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
  assert.match(instructions, /Buddy JSON schema/);
  assert.match(instructions, /Most `RESPONSE_MODE: buddy_event` turns should return the no-op JSON object\./);
  assert.match(instructions, /usually the no-op JSON object/);
  assert.match(instructions, /Do not treat every transcript update as worthy of a visible response\./);
  assert.match(instructions, /Default to the no-op object unless the newest information is materially new, timely, and useful/);
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
  assert.match(prompt, /Return the required Buddy no-op JSON object only\./);
  assert.doesNotMatch(prompt, /Standing context:/);
  assert.doesNotMatch(prompt, /Meeting brief:/);
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
