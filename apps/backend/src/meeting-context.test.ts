import assert from "node:assert/strict";
import test from "node:test";

import {
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
        id: "startup",
        type: "primed",
        title: "Primed for rollout ownership",
        body: "Meeting focus: Land on a rollout owner.",
        suggestedQuestion: null,
        createdAt: "09:59:59",
        source: "startup",
      },
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
  assert.doesNotMatch(context, /Primed for rollout ownership/);
  assert.match(context, /Recent completed Q&A:/);
  assert.match(context, /What changed\?/);
  assert.doesNotMatch(context, /Land on a rollout owner\./);
});
