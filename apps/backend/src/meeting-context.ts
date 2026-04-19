import type { BuddyEvent } from "@realtimebuddy/shared/protocol";

export type TranscriptSegment = {
  text: string;
  committedAt: string;
};

export type ProvisionalSegment = {
  id: string;
  text: string;
  provisionalAt: string;
};

export type QuestionAnswer = {
  question: string;
  answer: string;
  askedAt: string;
};

export type SurfacedBuddyEvent = BuddyEvent;

export type SharedMeetingSnapshot = {
  meetingTitle: string;
  markdown: string;
  transcriptEntries: TranscriptSegment[];
  provisionalEntries: ProvisionalSegment[];
  buddyEvents: SurfacedBuddyEvent[];
  questionAnswers: QuestionAnswer[];
};

const MAX_TURN_TRANSCRIPT_ENTRIES = 24;
const MAX_TURN_PROVISIONAL_ENTRIES = 8;
const MAX_TURN_BUDDY_EVENTS = 4;
const MAX_TURN_QA_ENTRIES = 6;

export function buildBuddyTurnContext(snapshot: SharedMeetingSnapshot) {
  const transcriptContext = snapshot.transcriptEntries
    .slice(-MAX_TURN_TRANSCRIPT_ENTRIES)
    .map((segment) => `- [${segment.committedAt}] ${segment.text}`)
    .join("\n");
  const buddyEventContext = snapshot.buddyEvents
    .slice(0, MAX_TURN_BUDDY_EVENTS)
    .map(
      (event) =>
        `- [${event.createdAt}] ${event.type}: ${event.title}${event.body ? ` — ${event.body}` : ""}`
    )
    .join("\n");

  return [
    `Meeting title: ${snapshot.meetingTitle}`,
    "",
    "Recent committed transcript context:",
    transcriptContext || "- No committed transcript yet.",
    "",
    "Recently surfaced Buddy cards:",
    buddyEventContext || "- None yet.",
  ].join("\n");
}

export function buildQuestionTurnContext(snapshot: SharedMeetingSnapshot) {
  const transcriptContext = snapshot.transcriptEntries
    .slice(-MAX_TURN_TRANSCRIPT_ENTRIES)
    .map((segment) => `- [${segment.committedAt}] ${segment.text}`)
    .join("\n");
  const provisionalContext = snapshot.provisionalEntries
    .slice(-MAX_TURN_PROVISIONAL_ENTRIES)
    .map((segment) => `- [pending ${segment.provisionalAt}] ${segment.text}`)
    .join("\n");
  const buddyEventContext = snapshot.buddyEvents
    .slice(0, MAX_TURN_BUDDY_EVENTS)
    .map(
      (event) =>
        `- [${event.createdAt}] ${event.type}: ${event.title}${event.body ? ` — ${event.body}` : ""}`
    )
    .join("\n");
  const questionHistory = snapshot.questionAnswers
    .slice(0, MAX_TURN_QA_ENTRIES)
    .map(
      (entry) =>
        `- [${entry.askedAt}] Q: ${entry.question}${entry.answer ? `\n  A: ${entry.answer.trim()}` : ""}`
    )
    .join("\n");

  return [
    `Meeting title: ${snapshot.meetingTitle}`,
    "",
    "Current live note:",
    snapshot.markdown,
    "",
    "Recent committed transcript context:",
    transcriptContext || "- No committed transcript yet.",
    "",
    "Current provisional transcript:",
    provisionalContext || "- None.",
    "",
    "Surfaced Buddy cards visible to the user:",
    buddyEventContext || "- None yet.",
    "",
    "Recent completed Q&A:",
    questionHistory || "- None yet.",
  ].join("\n");
}
