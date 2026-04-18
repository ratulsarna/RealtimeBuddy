# RealtimeBuddy Hackathon Agent Briefs

These briefs are meant for coding agents. They are intentionally direct and execution-oriented.

Read [hackathon-demo-spec.md](/Users/ratulsarna/Developer/Projects/RealtimeBuddy/docs/hackathon-demo-spec.md) first.

## Agent 1: Codex Session Contract

### Mission

Define and implement the app-to-Codex contract that makes proactive Buddy behavior possible.

### What to build

- Generate `developerInstructions` dynamically per meeting session.
- Combine stable Buddy instructions with:
  - static user seed
  - dynamic meeting seed
  - strict Buddy output schema
- Define the exact structured output Buddy must return.
- Add parser and fallback handling for malformed output.

### Important

Do not treat this as prompt-writing only. This is a protocol boundary between the app and Codex.

### Deliverable

A working Codex session contract where the app can:
- inject per-meeting context
- parse Buddy output safely
- distinguish visible Buddy cards from no-op replies

## Agent 2: Transcript Feed Loop

### Mission

Feed live transcript into the same Codex session continuously without interrupting work already in progress.

### What to build

- Queue transcript updates into the active Codex session.
- Preserve ordering.
- Avoid interrupting in-flight Buddy work.
- Keep the loop simple and hackathon-fast.

### Important

Use queue semantics, not steer semantics.

### Deliverable

A continuous transcript-to-Codex loop that lets Buddy stay aware of the meeting over time.

## Agent 3: UI / UX

### Mission

Turn the current app into a Buddy-first demo surface.

Today, the app still reads like capture + transcript + Q&A. For the hackathon, it needs to read like an AI co-chair that is present in the meeting with Ratul.

### Context

Relevant current files:
- [meeting-buddy-app.tsx](/Users/ratulsarna/Developer/Projects/RealtimeBuddy/apps/web/src/components/meeting-buddy-app.tsx)
- [workspace-header.tsx](/Users/ratulsarna/Developer/Projects/RealtimeBuddy/apps/web/src/components/meeting-buddy/workspace-header.tsx)
- [transcript-panel.tsx](/Users/ratulsarna/Developer/Projects/RealtimeBuddy/apps/web/src/components/meeting-buddy/transcript-panel.tsx)
- [live-qa-panel.tsx](/Users/ratulsarna/Developer/Projects/RealtimeBuddy/apps/web/src/components/meeting-buddy/live-qa-panel.tsx)
- [note-panel.tsx](/Users/ratulsarna/Developer/Projects/RealtimeBuddy/apps/web/src/components/meeting-buddy/note-panel.tsx)

### What to build

- Create a dedicated Buddy lane that is visually primary.
- Demote transcript from hero to supporting panel.
- Replace or repurpose the current Q&A-heavy surface so it feels like live Buddy participation.
- Add a lightweight pre-meeting brief UI near session start.
- Make the UI communicate state even when Buddy is quiet.

### Constraints

- Optimize for demo clarity, not architecture purity.
- Reuse existing components where possible.
- Do not redesign the whole app from scratch.
- Avoid over-dense dashboards.
- Keep the experience clean on laptop presentation size.

### Good outcome

When someone glances at the screen, they should think:
"This is an assistant actively helping during the meeting."

Not:
"This is a transcript app with some extra panels."

### Deliverable

A polished Buddy-first meeting screen with:
- pre-meeting brief area
- live Buddy lane
- supporting transcript
- wrap-up-friendly lower-priority note area

## Agent 4: Prompt / Behavior

### Mission

Define how Buddy behaves during the meeting.

### What to produce

Write or update the prompt / behavior logic so Buddy acts like a concise co-chair on Ratul's side.

Use the hackathon contract:
- mostly listen
- surface only useful, timely nudges
- keep outputs short
- avoid full-meeting narration

### Allowed intervention types

Only optimize for these four:
1. Ask this
2. Cover this
3. Needs owner
4. Important signal

### Output style

Buddy interventions should be:
- short title
- one or two short lines
- optional suggested question

### Avoid

- long summaries
- verbose rationales
- over-triggering
- trying to be comprehensive

### Deliverable

A prompt and supporting logic that make Buddy feel restrained, useful, and live.

## Agent 5: App Orchestration

### Mission

Wire the existing live session data into a Buddy-first interaction loop.

### What to build

- Add the minimum data model needed for live Buddy cards.
- Ensure Buddy can consume live transcript context plus static and dynamic seed context.
- Keep the flow responsive enough for a live demo.
- Make the end-of-meeting state produce a small wrap-up view.

### Important

Do not spend time making this production-robust.

Priorities are:
1. live feel
2. clear state transitions
3. presentable output

### Avoid

- deep queueing systems unless already easy
- large refactors
- generalized frameworks for future modes

### Deliverable

A working end-to-end demo loop where:
- meeting brief is captured
- live transcript feeds Buddy context
- Buddy cards appear during the meeting
- wrap-up appears at the end

## Agent 6: Rehearsal / Validation

### Mission

Use the real meeting audio fixture for private rehearsal and tuning.

### What to do

- Validate that the app can run against the existing meeting audio file.
- Check whether Buddy surfaces too much, too little, or the wrong kind of intervention.
- Identify presentational issues that would hurt the live demo.
- Focus on tuning and smoke-testing, not exhaustive QA.

### Important

The audio fixture is not the public demo flow.

It is only for:
- regression checking
- timing checks
- rehearsal

### Deliverable

A short report with:
- what looked strong
- what felt noisy or weak
- what should be adjusted before demoing live

## Suggested sequencing

1. Agent 1 first, because the Codex contract is the prerequisite.
2. Agent 2 next, because continuous transcript feeding depends on that contract.
3. Agent 4 can happen in parallel once Agent 1 is clear.
4. Agent 3 and Agent 5 should follow once the backend contract is real.
5. Agent 6 after there is something demoable.

## Copy-paste kickoff prompt

Use this with any coding agent as a starting point:

```text
You are implementing the RealtimeBuddy hackathon pivot.

Read these docs first:
- /Users/ratulsarna/Developer/Projects/RealtimeBuddy/docs/hackathon-demo-spec.md
- /Users/ratulsarna/Developer/Projects/RealtimeBuddy/docs/hackathon-agent-briefs.md

Product framing:
RealtimeBuddy is an AI co-chair on Ratul's side of the meeting.

Important constraints:
- optimize for demo quality, speed, and presentation
- do not overbuild for robustness
- the primary demo is a live conversation, not a deterministic scripted flow
- the real meeting audio file in the repo is for rehearsal/testing only
- implement the Codex session contract before polishing the UI

Your job:
- complete the assigned slice cleanly
- preserve the Buddy-first framing
- keep transcript and notes as supporting elements, not the star

Before coding, briefly restate your assignment, then inspect the relevant files and implement the smallest strong version that improves the demo.
```
