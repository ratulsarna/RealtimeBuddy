import assert from "node:assert/strict";
import test from "node:test";

import {
  appendPersistentContext,
  buildPersistentContext,
} from "./persistent-context";

test("buildPersistentContext merges standing context and meeting brief with stable labels", () => {
  const context = buildPersistentContext({
    meetingBrief: "Land on a rollout owner.",
    standingContext: "Prefer concise prompts.",
  });

  assert.match(context, /^Standing context:/);
  assert.match(context, /Prefer concise prompts\./);
  assert.match(context, /Meeting brief:/);
  assert.match(context, /Land on a rollout owner\./);
});

test("buildPersistentContext uses placeholder text when values are blank", () => {
  const context = buildPersistentContext({
    meetingBrief: "   ",
    standingContext: "",
  });

  assert.match(context, /Standing context:\nNone provided\./);
  assert.match(context, /Meeting brief:\nNone provided\./);
});

test("appendPersistentContext appends the merged context to lane instructions", () => {
  const instructions = appendPersistentContext(
    "You are RealtimeBuddy.",
    buildPersistentContext({
      meetingBrief: "Land on a rollout owner.",
      standingContext: "Prefer concise prompts.",
    })
  );

  assert.match(instructions, /^You are RealtimeBuddy\./);
  assert.match(instructions, /Standing context:/);
  assert.match(instructions, /Meeting brief:/);
});
