import assert from "node:assert/strict";
import test from "node:test";

import { buildMeetingNote } from "./note-builder";

test("buildMeetingNote renders only the Buddy Q&A section", () => {
  const markdown = buildMeetingNote({
    title: "Demo sync",
    questionAnswers: [
      {
        question: "Who owns the pilot?",
        answer: "Sam will own the pilot and share an update tomorrow.",
        askedAt: "10:15:00",
      },
      {
        question: "What did we decide?",
        answer: "We agreed to start with a two-week trial.",
        askedAt: "10:18:00",
      },
    ],
  });

  assert.match(markdown, /^# Demo sync/m);
  assert.match(markdown, /^## Buddy Q&A/m);
  assert.match(markdown, /### 10:15:00/);
  assert.match(markdown, /Question: Who owns the pilot\?/);
  assert.match(markdown, /Answer:\nSam will own the pilot and share an update tomorrow\./);
  assert.doesNotMatch(markdown, /Live Notes|Live Speech|Transcript|Started at|Audio sources/);
});

test("buildMeetingNote shows an empty Buddy Q&A state", () => {
  const markdown = buildMeetingNote({
    title: "Empty demo",
    questionAnswers: [],
  });

  assert.match(markdown, /^# Empty demo/m);
  assert.match(markdown, /^## Buddy Q&A/m);
  assert.match(markdown, /No Buddy Q&A yet\./);
});
