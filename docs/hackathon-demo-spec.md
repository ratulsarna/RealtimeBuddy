# RealtimeBuddy Hackathon Demo Spec

## Product framing

RealtimeBuddy is an AI co-chair on Ratul's side of the meeting.

For the hackathon, the goal is not to prove that the model can classify meeting mistakes. The goal is to make Buddy feel present, useful, and alive during a real conversation.

This should feel like:
- a live meeting companion
- a quiet assistant on your shoulder
- something that helps in the moment, not just after the fact

This should not feel like:
- a transcript bot
- a note-taking utility with a nicer skin
- a canned demo that waits to hit predetermined beats

## Demo principle

The primary demo should be a live conversation with organizers or judges.

The bundled meeting audio file is for private rehearsal and regression testing only. It helps us tune timing and UX, but it should not define the public demo story.

Success condition:
- Buddy feels believable as a participant on Ratul's side
- Buddy occasionally helps at the right time
- the UI communicates presence even when Buddy is quiet

## Demo storage model

For the hackathon demo, `CODEX_VAULT_PATH` is the single source of truth.

- Codex context reads from `CODEX_VAULT_PATH`
- meeting notes are written under `CODEX_VAULT_PATH/Notes/`
- the persisted note artifact is Buddy Q&A only, not a transcript-heavy meeting dump

## Build order

Do not start with UI.

For the hackathon, the first milestone is the Codex session contract:
- dynamic per-meeting developer instructions
- seed prompt support
- strict parseable Buddy output schema
- continuous queued transcript feeding into the same Codex session
- parser and fallback handling in the app

Only after that should the UI be reshaped around Buddy.

## Hackathon product behavior contract

### Buddy's job

Buddy helps Ratul in the moment during a meeting.

Buddy listens to the live conversation, keeps track of Ratul's stated goal, and only surfaces short interventions when they are likely to be useful right now.

### What Buddy is allowed to do

Buddy can surface short cards that do one of the following:

1. Suggest a question Ratul may want to ask.
2. Remind Ratul about something he said he wanted covered.
3. Flag that a decision is forming without a clear owner or next step.
4. Highlight that something sounds important, inconsistent, or off-track.

### What Buddy should not do

Buddy should not:
- narrate the whole meeting
- constantly summarize what was just said
- emit long paragraphs
- explain its chain of reasoning
- interrupt too often
- confidently claim facts it has not grounded in the conversation or seeded context

### Speaking threshold

Buddy should usually stay quiet.

Buddy should surface something only when:
- it is actionable
- it is timely
- it is easy to understand in under 3 seconds

Target cadence for the demo:
- quiet most of the time
- brief nudges when useful
- no flood of cards

### Voice and format

Buddy should sound:
- concise
- calm
- competent
- slightly proactive, not bossy

Each live intervention should be:
- one short title
- one or two short lines of body copy
- optionally one direct suggested question

## Seed UX

The setup before a meeting must be lightweight enough that Ratul would actually use it.

### Minimum viable version

A single freeform text field is enough for hackathon v1.

That field should be able to capture:
- meeting type
- desired outcome
- what Buddy should watch for
- relevant tools and context sources
- vault path or other persistent user context when needed

### Two seed layers

Buddy should support:
- static user seed
- dynamic meeting seed

The static user seed is for durable preferences or context that usually stays true.

Examples:
- preferred vault path
- default context sources
- standing personal preferences

The dynamic meeting seed is for this specific meeting.

### UX constraints

- setup should take less than 20 seconds
- it should feel like a pre-meeting brief, not a form
- good defaults matter more than flexibility

## Codex session contract

### Dynamic developer instructions

The app should generate `developerInstructions` dynamically for each meeting session.

That instruction block should combine:
- stable Buddy identity and behavior rules
- strict output schema requirements
- static user seed
- dynamic meeting seed

### Buddy output schema

Buddy must not return unstructured freeform chat.

It should return a strict parseable object that lets the app decide whether something should surface in the UI.

Minimum requirements:
- a field that says whether this should surface
- a card type
- a short title
- a short body
- optional suggested question

### Surface vs no-op behavior

If Buddy has nothing timely and useful to say, it should return a no-op response instead of generating visible filler.

This is necessary because transcript chunks will be fed continuously and Codex may otherwise respond to every turn.

### Parser and fallback

The app must safely parse Buddy output.

If output is malformed:
- ignore it safely
- do not break the meeting session
- log enough to debug later

### Transcript feed loop

Transcript should be fed continuously into the same Codex session.

Requirements:
- queue, not steer
- preserve ordering
- do not interrupt in-flight work
- keep Buddy aware of the live conversation over time

## UI direction

The current app already has transcript, notes, and Q&A surfaces. For the hackathon, the UI should be reframed so Buddy is the hero.

### Primary UX idea

Buddy gets its own dedicated live lane.

That lane should visually communicate:
- `Listening`
- `Noticing`
- `Nudging`
- `Wrap-up`

### Relative visual priority

1. Buddy lane
2. Session state / live status
3. Transcript as supporting evidence
4. Notes / wrap-up

Transcript is still useful, but it should stop being the star of the screen.

### Buddy lane content

Buddy cards should be short and scannable. Good card types:
- `Ask this`
- `Cover this`
- `Needs owner`
- `Important signal`

Cards should feel live:
- timestamped or ordered in a clear live stack
- newest near the top
- subtle motion or transition is good if cheap

### Wrap-up state

At the end of the meeting, Buddy should leave behind a clean closeout view:
- decisions
- open questions
- follow-ups

## Scope cuts for the hackathon

Do not overbuild:
- no deep intervention ontology
- no complex confidence model
- no heavy retrieval architecture
- no mascot work unless the core demo already feels strong
- no attempt to prove robustness beyond what the demo needs

## Acceptance criteria

We are done enough for the hackathon if all of this is true:

1. Ratul can start a live session with mic or system audio.
2. The app generates dynamic per-meeting Buddy developer instructions.
3. The app supports both static user seed and dynamic meeting seed.
4. Transcript is fed continuously into the same Codex session using a queued flow.
5. Buddy returns strict parseable output that the app can either surface or ignore.
6. The interface clearly presents Buddy as an active sidecar, not a transcript utility.
7. During a live conversation, Buddy occasionally surfaces short, believable interventions.
8. The meeting audio file can be used to rehearse and tune the experience privately.
