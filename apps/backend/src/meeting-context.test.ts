import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBuddyTurnContext,
  buildQuestionTurnContext,
  type SharedMeetingSnapshot,
} from "./meeting-context";

function createSharedSnapshot(
  overrides: Partial<SharedMeetingSnapshot> = {}
): SharedMeetingSnapshot {
  return {
    meetingTitle: "Design Sync",
    markdown: "# Design Sync\n\n## Buddy Q&A\nNo Buddy Q&A yet.\n",
    transcriptEntries: [{ text: "We need a rollout owner.", committedAt: "10:00:00" }],
    provisionalEntries: [{ id: "p1", text: "maybe Priya", provisionalAt: "10:00:05" }],
    buddyEvents: [
      {
        id: "b1",
        type: "needs_owner",
        title: "Assign the rollout owner",
        body: "Nobody has explicitly taken ownership yet.",
        suggestedQuestion: "Who owns rollout readiness?",
        createdAt: "10:00:10",
        source: "transcript",
      },
    ],
    questionAnswers: [
      {
        question: "What changed?",
        answer: "The team still needs an owner.",
        askedAt: "10:00:30",
      },
    ],
    ...overrides,
  };
}

test("Question turn context carries meeting title, surfaced Buddy cards, and prior Q&A without replaying the meeting brief", () => {
  const context = buildQuestionTurnContext(createSharedSnapshot());

  assert.match(context, /Meeting title: Design Sync/);
  assert.match(context, /Current live note:/);
  assert.match(context, /Surfaced Buddy cards visible to the user:/);
  assert.match(context, /Assign the rollout owner/);
  assert.match(context, /Recent completed Q&A:/);
  assert.match(context, /What changed\?/);
  assert.doesNotMatch(context, /Land on a rollout owner\./);
});

test("Buddy turn context keeps meeting identity without replaying the meeting brief", () => {
  const context = buildBuddyTurnContext(createSharedSnapshot());

  assert.match(context, /Meeting title: Design Sync/);
  assert.match(context, /Recent committed transcript context:/);
  assert.match(context, /Recently surfaced Buddy cards:/);
  assert.doesNotMatch(context, /Land on a rollout owner\./);
});
