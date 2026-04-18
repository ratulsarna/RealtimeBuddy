# RealtimeBuddy — Hackathon plan for today

## Goal

Make RealtimeBuddy feel like an actual meeting co-chair for Ratul, not just a transcript or note helper.

The primary demo is a live conversation. The real meeting audio file in the repo is for rehearsal and testing, not the public story.

## What needs to happen first

Before UI polish, we need the Codex session contract to exist.

### 1. Dynamic developer instructions

Generate `developerInstructions` per meeting session instead of using a static prompt.

That dynamic instruction block should combine:
- stable Buddy behavior rules
- app-level output contract
- static user seed prompt
- dynamic per-meeting seed prompt

### 2. Seed prompt support

Add support for two seed layers:
- static user seed
- dynamic meeting seed

For hackathon v1, the meeting seed can just be a single text field.

The seed should be able to include things like:
- what kind of meeting this is
- what Ratul wants from it
- what Buddy should watch for
- where Buddy may look for context
- which tools or sources are relevant
- vault path and other user-specific context

### 3. Buddy output schema

Define a strict, parseable response schema for Buddy.

The app should be able to tell the difference between:
- a Buddy card that should be shown in the UI
- a no-op / acknowledgement that should not be shown

This schema belongs in the app-level Buddy instructions.

### 4. Continuous transcript feed loop

Feed transcript chunks into the same Codex session continuously.

Desired behavior:
- queue, not steer
- preserve ordering
- do not interrupt in-flight work
- allow Buddy to stay aware of the meeting without resetting context

### 5. Parser and fallback handling

The app needs to safely parse Buddy output.

If Codex returns malformed output, the app should:
- ignore it safely
- not break the session
- optionally log it for debugging

## After that

Once the above foundation exists, move to product presentation.

### 6. Buddy output UI

Design and implement the Buddy side of the interface.

Needs to support:
- live Buddy cards
- quiet/listening state
- suggested questions
- important signals
- follow-up / wrap-up state

### 7. Seed UX

Keep this intentionally lightweight for the hackathon.

Minimum viable version:
- one text field
- freeform prompt for context and goals

Nice-to-have later:
- structured fields for meeting type, goal, and watch-fors

### 8. Demo path

The demo should be live and unscripted.

What matters:
- Buddy feels present
- Buddy does not spam
- Buddy occasionally says something genuinely useful

### 9. Product framing

Use one sharp line consistently:

RealtimeBuddy is an AI co-chair on your side of the meeting.

Not:
- a note taker
- a transcript bot
- a generic meeting summarizer

## If time remains

- better wrap-up structure
- stronger retrieval heuristics for related context
- better rehearsal flow using the real meeting audio file
- mascot / visual identity only if the core demo is already strong
